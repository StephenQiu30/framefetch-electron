import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { playableFixture } from './fixture';

const project = path.resolve(__dirname, '../..');
const executable = process.env.FRAMEFETCH_E2E_EXECUTABLE;
let profile: string;
let videoPath: string;
let documentPath: string;
let application: ElectronApplication;
let page: Page;

async function launch() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  delete environment.ELECTRON_RUN_AS_NODE;
  if (executable) environment.PATH = '';
  else {
    environment.FRAMEFETCH_USER_DATA_DIR = profile;
    environment.FRAMEFETCH_RESOURCE_DIR = path.join(
      project,
      'resources/runtime',
      `${process.platform}-${process.arch}`,
    );
  }
  application = await _electron.launch({
    ...(executable
      ? { executablePath: executable, args: [`--user-data-dir=${profile}`] }
      : { args: [project] }),
    env: environment,
    timeout: 30000,
  });
  page = await application.firstWindow();
  await expect(page.getByText('本地工作站已就绪', { exact: true })).toBeVisible({ timeout: 30000 });
}

async function manage(name: string) {
  await page.getByRole('button', { name: '管理', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function selectFile(filePath: string) {
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  }, filePath);
}

test.beforeAll(async () => {
  profile = await mkdtemp(path.join(tmpdir(), 'framefetch-e2e-'));
  const fixtures = path.join(profile, 'fixtures');
  await mkdir(fixtures);
  documentPath = path.join(fixtures, '剧本 中文.txt');
  await writeFile(documentPath, '第一场：海边\n人物：小明\n小明：今天的故事从这里开始。\n');
  videoPath = process.env.FRAMEFETCH_E2E_VIDEO_FILE
    ? path.resolve(process.env.FRAMEFETCH_E2E_VIDEO_FILE)
    : path.join(fixtures, '演示 空格.mp4');
  if (!process.env.FRAMEFETCH_E2E_VIDEO_FILE) await writeFile(videoPath, playableFixture());
  await stat(videoPath); // A real playable H264/AAC fixture is required; no success based on skipped playback.
});

test.afterAll(async () => {
  if (application) await application.close();
});

test('native import, constrained playback, document reading and restart persistence', async () => {
  await launch();
  await expect(page.locator('h1')).toContainText('把素材，带回本地。');
  const security = await page.evaluate(() => ({
    node: typeof (globalThis as unknown as { require?: unknown }).require,
    pathReader: 'readFile' in window.desktop,
    keyReader: 'getApiKey' in window.desktop,
  }));
  expect(security).toEqual({ node: 'undefined', pathReader: false, keyReader: false });

  await page.getByRole('tab', { name: '本地视频', exact: true }).click();
  await selectFile(videoPath);
  await page.getByRole('button', { name: '导入视频', exact: true }).click();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible({ timeout: 30000 });
  await manage('文件管理');
  await page.getByRole('button', { name: /演示 空格.mp4/ }).click();
  const player = page.locator('video');
  await expect(player).toBeVisible();
  await expect
    .poll(() =>
      player.evaluate((element) => {
        const video = element as HTMLVideoElement;
        return { ready: video.readyState, width: video.videoWidth, duration: video.duration };
      }),
    )
    .toMatchObject({ width: 320, duration: 2 });
  await player.evaluate(async (element) => {
    const video = element as HTMLVideoElement;
    await video.play();
  });
  await expect
    .poll(() => player.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await player.evaluate((element) => {
    const video = element as HTMLVideoElement;
    video.pause();
    video.currentTime = 1.5;
  });
  await expect
    .poll(() => player.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1);
  await expect(player).toHaveAttribute('src', /^framefetch-media:\/\//);

  await page.getByRole('button', { name: '首页', exact: true }).click();
  await page.getByRole('tab', { name: '剧本文档', exact: true }).click();
  await page.getByLabel('导入方式', { exact: true }).click();
  await page.getByRole('option', { name: '复制到文件目录', exact: true }).click();
  await page.getByRole('button', { name: '剧本文档', exact: true }).click();
  await selectFile(documentPath);
  await page.getByRole('button', { name: '导入文档', exact: true }).click();
  await page.getByRole('button', { name: '剧本文档', exact: true }).click();
  await expect(page.getByRole('button', { name: /剧本 中文.txt/ })).toBeVisible({ timeout: 30000 });
  await rm(documentPath);
  await page.getByRole('button', { name: /剧本 中文.txt/ }).click();
  await expect(page.locator('.document-preview')).toContainText('今天的故事从这里开始');
  await manage('设置');
  await expect(page.getByText('未就绪', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: path.join(
      project,
      '.artifacts',
      executable ? 'packaged-settings.png' : 'desktop-settings.png',
    ),
  });

  const dataPath = await application.evaluate(({ app }) => app.getPath('userData'));
  expect(dataPath).toBe(profile);
  await application.close();
  await launch();
  await manage('文件管理');
  await expect(page.getByRole('button', { name: /演示 空格.mp4/ })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.thumbnail img')
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: path.join(
      project,
      '.artifacts',
      executable ? 'packaged-library.png' : 'desktop-library.png',
    ),
  });
  await page.getByRole('button', { name: '剧本文档', exact: true }).click();
  await expect(page.getByRole('button', { name: /剧本 中文.txt/ })).toBeVisible();
});

test('frontend brand, responsive layout, native controls, focus and local pagination', async () => {
  // An explicit desktop preference takes precedence over the legacy theme key.
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('framegrab-theme', 'light');
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '切换深色主题', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '把素材，带回本地。', exact: true }),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-design', 'borderless');
  await expect(page.getByLabel('视频链接', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '帧取首页' }).locator('img')).toHaveAttribute(
    'src',
    /logo-/,
  );
  await page.evaluate(() => document.fonts.ready);
  const fontFaces = await page.evaluate(() =>
    Array.from(document.fonts).map((face) => ({ family: face.family, status: face.status })),
  );
  expect(fontFaces.some((face) => face.family === 'Geist' && face.status === 'loaded')).toBe(true);
  const input = page.getByLabel('视频链接', { exact: true });
  expect(await input.evaluate((element) => element.getBoundingClientRect().height)).toBe(56);
  expect(
    await page
      .getByRole('button', { name: '解析媒体', exact: true })
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(56);

  await manage('AI 服务');
  const add = page.getByRole('button', { name: '新增 AI 服务', exact: true });
  await add.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('API Base URL', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(add).toBeFocused();

  // Import real isolated documents to exercise pagination without inventing product records.
  const files = await Promise.all(
    Array.from({ length: 11 }, async (_, index) => {
      const file = path.join(profile, 'fixtures', `分页剧本 ${index}.txt`);
      await writeFile(file, `第一场 海边\n人物 小明\n真实本地文档 ${index}`);
      return file;
    }),
  );
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected });
  }, files);
  await page.getByRole('button', { name: '剧本文档', exact: true }).click();
  await page.getByRole('button', { name: '导入文档', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            (await window.desktop.getAssets()).filter((asset) => asset.kind === 'document').length,
        ),
      { timeout: 30000 },
    )
    .toBe(12);
  await page.getByRole('button', { name: '剧本文档', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('剧本文档分页每页条数', { exact: true }).click();
  await page.getByRole('option', { name: '每页 20 条', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(12);
  expect(
    await page
      .locator('tbody tr')
      .first()
      .evaluate((element) => getComputedStyle(element).borderBottomWidth),
  ).toBe('0px');

  for (const width of [1260, 900, 390]) {
    await application.evaluate(({ BrowserWindow }, value) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setContentSize(value, 760);
    }, width);
    for (const dark of [false, true]) {
      const expected = dark ? '切换浅色主题' : '切换深色主题';
      if (!(await page.getByRole('button', { name: expected, exact: true }).count())) {
        await page
          .getByRole('button', { name: dark ? '切换深色主题' : '切换浅色主题', exact: true })
          .click();
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      if (width < 1024) {
        await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
        await page.getByRole('menuitem', { name: '首页', exact: true }).click();
      } else await page.getByRole('button', { name: '首页', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: '把素材，带回本地。', exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.getByRole('tab', { name: '链接解析', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '本地视频', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect
        .poll(() =>
          page.getByRole('tab', { name: '本地视频', exact: true }).evaluate((element) => {
            const style = getComputedStyle(element);
            return style.color === getComputedStyle(document.body).color;
          }),
        )
        .toBe(true);
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      ).toBe(dark ? 'dark' : 'light');
      await page.screenshot({
        path: path.join(
          project,
          '.artifacts',
          `aligned-home-${width}${dark ? '-dark.png' : '-light.png'}`,
        ),
      });
      await manage('AI 服务');
      await expect(page.getByRole('heading', { name: 'AI 服务', exact: true })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    }
  }
});
