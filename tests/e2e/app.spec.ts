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
  await expect(page.locator('h1')).toContainText('从一个链接');
  const security = await page.evaluate(() => ({
    node: typeof (globalThis as unknown as { require?: unknown }).require,
    pathReader: 'readFile' in window.desktop,
    keyReader: 'getApiKey' in window.desktop,
  }));
  expect(security).toEqual({ node: 'undefined', pathReader: false, keyReader: false });

  await selectFile(videoPath);
  await page.getByRole('button', { name: /视频文件/ }).click();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '媒体库', exact: true }).click();
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

  await page.getByRole('button', { name: '工作区', exact: true }).click();
  await page.getByLabel('导入方式', { exact: true }).selectOption('copy');
  await page.getByRole('button', { name: '剧本与报告', exact: true }).click();
  await selectFile(documentPath);
  await page.getByRole('button', { name: '导入文档', exact: true }).click();
  await page.getByRole('button', { name: '剧本与报告', exact: true }).click();
  await expect(page.getByRole('button', { name: /剧本 中文.txt/ })).toBeVisible({ timeout: 30000 });
  await rm(documentPath);
  await page.getByRole('button', { name: /剧本 中文.txt/ }).click();
  await expect(page.locator('.document-preview')).toContainText('今天的故事从这里开始');
  await page.getByRole('button', { name: '设置', exact: true }).click();
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
  await page.getByRole('button', { name: '媒体库', exact: true }).click();
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
  await page.getByRole('button', { name: '剧本与报告', exact: true }).click();
  await expect(page.getByRole('button', { name: /剧本 中文.txt/ })).toBeVisible();
});
