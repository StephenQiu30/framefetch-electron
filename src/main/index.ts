import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';
import type { AppSettings, DesktopEvent, ImportMode } from '../shared/api';
import type { Asset, Task } from '../shared/generated';
import { CredentialVault } from './credentials';
import { FileAuthority, within } from './files';
import { type ResolvedMedia, serveMedia } from './media';
import { ProviderService } from './providers';
import { EngineSupervisor, type WindowsJob } from './runtime';
import { profileDirectory } from './startup';
import {
  assertSender,
  format,
  httpUrl,
  id,
  kind,
  mode,
  text,
  validateAnalysis,
  validateDownload,
} from './validation';
import { AsyncGate } from './work-queue';

app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'framefetch-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
const profile =
  profileDirectory(process.argv) ??
  (!app.isPackaged && process.env.FRAMEFETCH_USER_DATA_DIR
    ? resolve(process.env.FRAMEFETCH_USER_DATA_DIR)
    : null);
if (profile) {
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath('userData', profile);
}
if (!app.requestSingleInstanceLock()) app.quit();
else
  void bootstrap().catch(() => {
    dialog.showErrorBox('帧取启动失败', '本地工作区无法初始化，请检查应用数据目录的读写权限。');
    app.quit();
  });

async function bootstrap(): Promise<void> {
  await app.whenReady();
  if (!app.isPackaged && process.platform === 'darwin')
    app.dock?.setIcon(
      nativeImage.createFromPath(join(app.getAppPath(), 'resources/icons/icon-512.png')),
    );
  const dataDir = app.getPath('userData');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const settingsFile = join(dataDir, 'settings.json');
  let libraryDir = join(dataDir, 'library');
  try {
    const saved: unknown = JSON.parse(await readFile(settingsFile, 'utf8'));
    if (
      saved &&
      typeof saved === 'object' &&
      'library_dir' in saved &&
      typeof saved.library_dir === 'string' &&
      isAbsolute(saved.library_dir)
    )
      libraryDir = saved.library_dir;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('设置文件损坏');
  }
  const resourceDir = app.isPackaged
    ? join(process.resourcesPath, 'runtime')
    : resolve(
        process.env.FRAMEFETCH_RESOURCE_DIR ??
          join(app.getAppPath(), 'resources', 'runtime', `${process.platform}-${process.arch}`),
      );
  let authority = new FileAuthority(libraryDir, join(dataDir, 'file-grants.json'));
  await authority.load();
  const vault = new CredentialVault(join(dataDir, 'credentials'), safeStorage);
  const createSupervisor = (): EngineSupervisor => {
    return new EngineSupervisor({
      command: app.isPackaged
        ? join(
            resourceDir,
            'engine',
            `framefetch-engine${process.platform === 'win32' ? '.exe' : ''}`,
          )
        : 'uv',
      args: app.isPackaged
        ? []
        : [
            'run',
            '--project',
            join(app.getAppPath(), 'engine'),
            'python',
            '-m',
            'framefetch_desktop',
          ],
      dataDir,
      libraryDir,
      resourceDir,
      packaged: app.isPackaged,
      dev: !app.isPackaged,
      loadJob:
        process.platform === 'win32'
          ? () =>
              createRequire(join(__dirname, 'index.js'))(
                join(resourceDir, 'native', 'job.node'),
              ) as WindowsJob
          : undefined,
    });
  };
  let engine = createSupervisor();
  const providerService = new ProviderService(
    {
      request<T>(method: string, params: unknown): Promise<T> {
        return engine.request<T>(method, params);
      },
    },
    vault,
  );
  const rendererFile = join(__dirname, '../renderer/index.html');
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const expectedUrl = devUrl ?? pathToFileURL(rendererFile).toString();
  const isUi = (raw: string): boolean => {
    try {
      const url = new URL(raw);
      url.hash = '';
      const expected = new URL(expectedUrl);
      expected.hash = '';
      return url.toString() === expected.toString();
    } catch {
      return false;
    }
  };
  const window = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 390,
    minHeight: 560,
    show: false,
    title: '帧取 · FrameFetch',
    backgroundColor: '#ffffff',
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'resources/icons/icon-512.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  window.once('ready-to-show', () => window.show());
  app.on('second-instance', () => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isUi(url)) event.preventDefault();
  });
  window.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame || !isUi(details.url)) details.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  const devOrigin = devUrl ? new URL(devUrl).origin : null;
  const devHost = devUrl ? new URL(devUrl).host : null;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allow = false;
    try {
      const url = new URL(details.url);
      allow =
        url.protocol === 'framefetch-media:' ||
        (devOrigin !== null &&
          (url.origin === devOrigin || (url.protocol === 'ws:' && url.host === devHost))) ||
        (url.protocol === 'file:' &&
          within(resolve(dirname(rendererFile)), resolve(fileURLToPath(url))));
    } catch {}
    callback({ cancel: !allow });
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = `default-src 'self'; script-src 'self'${devUrl ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: framefetch-media:; media-src framefetch-media:; connect-src 'self'${devUrl ? ` ${devOrigin} ws://${new URL(devUrl).host}` : ''}; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
  const send = (event: DesktopEvent): void => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('desktop:event', event);
  };
  const watch = (supervisor: EngineSupervisor): void => {
    supervisor.on('state', (runtime) => send({ type: 'runtime.changed', runtime }));
    supervisor.on('notification', send);
  };
  watch(engine);
  const settings = (): AppSettings => ({
    library_dir: libraryDir,
    data_dir: dataDir,
    app_version: app.getVersion(),
  });
  const mediaReads = new AsyncGate(4);
  const resolveAsset = (
    assetId: string,
    mediaKind: 'original' | 'thumbnail',
  ): Promise<ResolvedMedia> =>
    mediaReads.run(() =>
      engine.request('assets.resolve', { asset_id: assetId, kind: mediaKind }, 300000),
    );
  const authorizedAsset = async (assetId: string): Promise<string> =>
    authority.authorizedPath((await resolveAsset(assetId, 'original')).path);
  const importPaths = async (paths: readonly string[], importMode: ImportMode): Promise<Task[]> => {
    const authorized = await authority.grant(paths);
    const tasks: Task[] = [];
    for (const path of authorized)
      tasks.push(
        await engine.request('imports.create', {
          source_path: path,
          mode: importMode,
          operation_id: randomUUID(),
        }),
      );
    return tasks;
  };
  let changingLibrary = false;
  let pendingNative = 0;
  const arity: Record<string, number> = {
    getRuntime: 0,
    getSettings: 0,
    chooseLibrary: 0,
    getAssets: 0,
    getTasks: 0,
    getProviders: 0,
    getReports: 0,
    chooseAndImport: 2,
    importDropped: 2,
    mediaUrl: 2,
    exportReport: 2,
  };
  const handle = (name: string, run: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(`desktop:${name}`, async (event, ...args: unknown[]) => {
      assertSender(event, window.webContents, isUi);
      if (args.length !== (arity[name] ?? 1)) throw new Error('参数数量无效');
      if (changingLibrary && !name.startsWith('get')) throw new Error('正在切换媒体库，请稍后再试');
      if (name === 'chooseLibrary' && pendingNative > 0)
        throw new Error('还有原生文件操作未完成，请稍后切换媒体库');
      const native = !name.startsWith('get');
      if (native) pendingNative++;
      try {
        return await run(...args);
      } finally {
        if (native) pendingNative--;
      }
    });
  };
  handle('getRuntime', () => engine.state);
  handle('getSettings', () => settings());
  handle('chooseLibrary', async () => {
    changingLibrary = true;
    try {
      const [assets, tasks] = await Promise.all([
        engine.request<Asset[]>('assets.list', {}),
        engine.request<Task[]>('tasks.list', {}),
      ]);
      if (
        assets.length > 0 ||
        tasks.some((task) => ['queued', 'running', 'cancelling', 'paused'].includes(task.status))
      )
        throw new Error(
          '已有资产或活动任务，当前不能切换媒体库。库迁移尚未开放，请在首次导入前选择目录。',
        );
      const result = await dialog.showOpenDialog(window, {
        title: '选择媒体库目录',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const selected = await realpath(result.filePaths[0]);
      await engine.stop();
      libraryDir = selected;
      authority = new FileAuthority(libraryDir, join(dataDir, 'file-grants.json'));
      await authority.load();
      const temp = `${settingsFile}.tmp`;
      await writeFile(temp, JSON.stringify({ library_dir: libraryDir }), { mode: 0o600 });
      await rename(temp, settingsFile);
      engine = createSupervisor();
      watch(engine);
      await engine.start();
      return settings();
    } finally {
      changingLibrary = false;
    }
  });
  handle('chooseAndImport', async (value, selectedKind) => {
    const importMode = mode(value);
    if (selectedKind !== undefined && selectedKind !== 'video' && selectedKind !== 'document')
      throw new Error('导入类型无效');
    const extensions =
      selectedKind === 'video'
        ? ['mp4']
        : selectedKind === 'document'
          ? ['txt', 'md', 'fountain', 'docx', 'pdf']
          : ['mp4', 'txt', 'md', 'fountain', 'docx', 'pdf'];
    const selected = await dialog.showOpenDialog(window, {
      title:
        selectedKind === 'video'
          ? '导入本地视频'
          : selectedKind === 'document'
            ? '导入剧本文档'
            : '导入视频或文档',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name:
            selectedKind === 'video'
              ? '本地视频'
              : selectedKind === 'document'
                ? '剧本文档'
                : '视频和文档',
          extensions,
        },
      ],
    });
    return selected.canceled ? [] : importPaths(selected.filePaths, importMode);
  });
  handle('importDropped', async (value, modeValue) => {
    if (!Array.isArray(value) || !value.length || value.length > 100)
      throw new Error('拖放文件无效');
    return importPaths(
      value.map((path) => text(path, 32768)),
      mode(modeValue),
    );
  });
  handle('getAssets', () => engine.request('assets.list', {}));
  handle('getTasks', () => engine.request('tasks.list', {}));
  handle('cancelTask', (value) => engine.request('tasks.cancel', { task_id: id(value) }));
  handle('retryTask', (value) => engine.request('tasks.retry', { task_id: id(value) }));
  handle('inspect', (value) => engine.request('media.inspect', { url: httpUrl(value) }, 60000));
  handle('download', (value) => engine.request('downloads.create', validateDownload(value)));
  handle('mediaUrl', (value, kindValue) => {
    const assetId = id(value);
    const mediaKind = kind(kindValue);
    // Native authorization and availability checks happen when the scheme serves bytes.
    return `framefetch-media://asset/${encodeURIComponent(assetId)}/${mediaKind}`;
  });
  handle('openAsset', async (value) => {
    const result = await shell.openPath(await authorizedAsset(id(value)));
    if (result) throw new Error('系统无法打开此文件');
  });
  handle('revealAsset', async (value) => {
    shell.showItemInFolder(await authorizedAsset(id(value)));
  });
  handle('getDocumentText', async (value) => {
    const assetId = id(value);
    await authorizedAsset(assetId);
    return engine.request('assets.text', { asset_id: assetId });
  });
  handle('getProviders', () => providerService.list());
  handle('saveProvider', async (value) => {
    const { provider, storage } = await providerService.save(value);
    if (storage === 'session')
      void dialog.showMessageBox(window, {
        type: 'info',
        title: 'API Key 仅用于本次会话',
        message: '系统加密存储当前不可用。此 API Key 只保存在应用内存中，退出后需要重新输入。',
        buttons: ['知道了'],
      });
    return provider;
  });
  handle('deleteProvider', async (value) => {
    await providerService.remove(id(value));
  });
  handle('analyze', async (value) => {
    const input = validateAnalysis(value);
    await authorizedAsset(input.asset_id);
    return providerService.analyze(input);
  });
  handle('getReports', () => engine.request('reports.list', {}));
  handle('getReport', (value) => engine.request('reports.get', { report_id: id(value) }));
  handle('exportReport', async (value, formatValue) => {
    const reportId = id(value);
    const reportFormat = format(formatValue);
    const selected = await dialog.showSaveDialog(window, {
      title: '导出分析报告',
      defaultPath: `帧取报告-${reportId}.${reportFormat}`,
      filters: [
        { name: reportFormat === 'md' ? 'Markdown' : 'Word 文档', extensions: [reportFormat] },
      ],
    });
    if (selected.canceled || !selected.filePath) return false;
    let task = await engine.request<Task>('reports.export', {
      report_id: reportId,
      format: reportFormat,
      destination_path: selected.filePath,
      operation_id: randomUUID(),
    });
    const deadline = Date.now() + 60000;
    while (['queued', 'running', 'cancelling'].includes(task.status) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 200));
      task = await engine.request<Task>('tasks.get', { task_id: task.id });
    }
    if (task.status !== 'succeeded')
      throw new Error(
        task.status === 'failed'
          ? '报告导出失败，请检查任务详情'
          : '报告导出尚未完成，请检查任务列表',
      );
    return true;
  });
  protocol.handle('framefetch-media', (request) => serveMedia(request, authority, resolveAsset));
  let quitting = false;
  let confirming = false;
  const quit = async (): Promise<void> => {
    if (quitting || confirming) return;
    confirming = true;
    try {
      if (engine.state.state === 'ready') {
        const tasks = await engine.request<Task[]>('tasks.list', {}, 1000).catch(() => null);
        if (
          tasks === null ||
          tasks.some((task) => ['queued', 'running', 'cancelling'].includes(task.status))
        ) {
          const result = await dialog.showMessageBox(window, {
            type: 'question',
            title: '退出帧取',
            message:
              tasks === null
                ? '当前任务状态尚未确认。退出会停止本地引擎，下次启动将检查恢复状态。'
                : '还有任务在执行。退出会停止本地任务，下次启动将检查恢复状态。',
            buttons: ['继续使用', '停止并退出'],
            defaultId: 0,
            cancelId: 0,
          });
          if (result.response !== 1) return;
        }
      }
      quitting = true;
      await engine.stop();
      vault.clearSession();
      app.quit();
    } finally {
      confirming = false;
    }
  };
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit();
    }
  });
  app.on('before-quit', (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit();
    }
  });
  app.on('window-all-closed', () => app.quit());
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(rendererFile);
  void engine.start().catch(() => {});
}
