import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell } from 'electron';
import { isAppNavigation, isExternalLink, resolveBackendUrl } from './connection';
import { profileDirectory } from './startup';
import { createDesktopHandler } from './transport';

app.enableSandbox();
const profile = profileDirectory(process.argv);
if (profile) {
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath('userData', profile);
}
let window: BrowserWindow | null = null;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void bootstrap().catch(() => {
    dialog.showErrorBox(
      '帧取启动失败',
      '请检查 Backend 地址和应用配置文件。远端地址须使用 HTTPS。',
    );
    app.quit();
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  const icon = join(app.getAppPath(), 'resources/icons/icon-512.png');
  if (!app.isPackaged && process.platform === 'darwin')
    app.dock?.setIcon(nativeImage.createFromPath(icon));
  const dataDir = app.getPath('userData');
  const configPath = join(dataDir, 'connection.json');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  let saved: string | undefined;
  try {
    const config: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    if (
      !config ||
      typeof config !== 'object' ||
      !('backend_url' in config) ||
      typeof config.backend_url !== 'string' ||
      Object.keys(config).length !== 1
    )
      throw new Error('连接配置无效');
    saved = config.backend_url;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const backend = resolveBackendUrl(process.argv, saved, process.env.FRAMEFETCH_BACKEND_URL);
  const temporary = `${configPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ backend_url: backend }, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, configPath);
  const partition = `persist:backend-${createHash('sha256').update(new URL(backend).origin).digest('hex').slice(0, 16)}`;
  const browserSession = session.fromPartition(partition);

  const handle = createDesktopHandler(
    browserSession,
    backend,
    join(app.getAppPath(), 'out/renderer'),
  );
  browserSession.protocol.handle('http', handle);
  browserSession.protocol.handle('https', handle);

  // Page permissions stay limited to the configured first-party document.
  const permitted = (permission: string, requestingUrl: string, mainFrame: boolean) => {
    if (!mainFrame || !isAppNavigation(requestingUrl, backend)) return false;
    if (permission === 'clipboard-sanitized-write' || permission === 'fullscreen') return true;
    return (
      new URL(backend).protocol === 'http:' &&
      ['local-network', 'local-network-access', 'loopback-network'].includes(permission)
    );
  };
  browserSession.setPermissionCheckHandler((_contents, permission, origin, details) =>
    permitted(permission, details.requestingUrl ?? origin, details.isMainFrame),
  );
  browserSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permitted(permission, details.requestingUrl, details.isMainFrame));
  });
  browserSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: '保存文件',
      defaultPath: join(app.getPath('downloads'), basename(item.getFilename())),
    });
  });

  const load = () => {
    if (window && !window.isDestroyed()) void window.loadURL(backend).catch(() => {});
  };
  const createWindow = () => {
    const current = new BrowserWindow({
      width: 1260,
      height: 840,
      minWidth: 390,
      minHeight: 560,
      show: false,
      title: '帧取 · Framefetch',
      backgroundColor: '#ffffff',
      icon: app.isPackaged ? undefined : icon,
      webPreferences: {
        session: browserSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      },
    });
    window = current;
    let showingFailure = false;
    current.once('ready-to-show', () => current.show());
    current.on('closed', () => {
      if (window === current) window = null;
    });
    current.webContents.on('will-attach-webview', (event) => event.preventDefault());
    current.webContents.on('will-navigate', (event, target) => {
      if (!isAppNavigation(target, backend)) event.preventDefault();
    });
    current.webContents.on('will-redirect', (event, target, _inPlace, mainFrame) => {
      if (mainFrame && !isAppNavigation(target, backend)) event.preventDefault();
    });
    current.webContents.on('will-frame-navigate', (event) => {
      if (event.isMainFrame && !isAppNavigation(event.url, backend)) event.preventDefault();
    });
    current.webContents.setWindowOpenHandler(({ url }) => {
      if (isAppNavigation(url, backend)) void current.loadURL(url).catch(() => {});
      else if (isExternalLink(url)) void shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    current.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (!mainFrame || code === -3 || showingFailure || current.isDestroyed()) return;
      showingFailure = true;
      current.show();
      void dialog
        .showMessageBox(current, {
          type: 'error',
          title: '无法加载帧取',
          message: '桌面页面暂时无法加载',
          detail: '请确认应用安装完整后重新打开。如问题持续，请重新安装桌面客户端。',
          buttons: ['重新连接', '退出'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          showingFailure = false;
          if (response === 0 && !current.isDestroyed()) load();
          else app.quit();
        });
    });
    load();
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      {
        label: '文件',
        submenu: [
          { id: 'home', label: '返回首页', click: load },
          {
            id: 'open-in-browser',
            label: '后端 Swagger 文档',
            click: () => {
              void shell.openExternal(new URL('/docs', backend).href);
            },
          },
          { type: 'separator' },
          { role: 'close' },
        ],
      },
      { role: 'editMenu', label: '编辑' },
      {
        label: '视图',
        submenu: [
          {
            id: 'reconnect',
            label: '重新连接',
            accelerator: 'CmdOrCtrl+R',
            click: () => window?.webContents.reload(),
          },
          {
            id: 'back',
            label: '后退',
            accelerator: 'Alt+Left',
            click: () => {
              if (window?.webContents.navigationHistory.canGoBack())
                window.webContents.navigationHistory.goBack();
            },
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const }] : []),
        ],
      },
      { role: 'windowMenu', label: '窗口' },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (!window) createWindow();
    else window.show();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
