import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopAPI, DesktopEvent } from '../shared/api';

const invoke = <T>(method: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(`desktop:${method}`, ...args) as Promise<T>;
const desktop: DesktopAPI = {
  getRuntime: () => invoke('getRuntime'),
  getSettings: () => invoke('getSettings'),
  chooseLibrary: () => invoke('chooseLibrary'),
  chooseAndImport: (mode, kind) => invoke('chooseAndImport', mode, kind),
  importDropped: (files, mode) => {
    if (!Array.isArray(files) || !files.length || files.length > 100)
      return Promise.reject(new Error('拖放文件无效'));
    const paths = files.map((file) => webUtils.getPathForFile(file));
    if (paths.some((path) => !path))
      return Promise.reject(new Error('只能导入系统选择或拖放的本地文件'));
    return invoke('importDropped', paths, mode);
  },
  getAssets: () => invoke('getAssets'),
  getTasks: () => invoke('getTasks'),
  cancelTask: (taskId) => invoke('cancelTask', taskId),
  retryTask: (taskId) => invoke('retryTask', taskId),
  inspect: (url) => invoke('inspect', url),
  download: (input) => invoke('download', input),
  mediaUrl: (assetId, kind) => invoke('mediaUrl', assetId, kind),
  openAsset: (assetId) => invoke('openAsset', assetId),
  revealAsset: (assetId) => invoke('revealAsset', assetId),
  getDocumentText: (assetId) => invoke('getDocumentText', assetId),
  getProviders: () => invoke('getProviders'),
  saveProvider: (input) => invoke('saveProvider', input),
  deleteProvider: (providerId) => invoke('deleteProvider', providerId),
  analyze: (input) => invoke('analyze', input),
  getReports: () => invoke('getReports'),
  getReport: (reportId) => invoke('getReport', reportId),
  exportReport: (reportId, format) => invoke('exportReport', reportId, format),
  subscribe: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, event: DesktopEvent): void =>
      listener(event);
    ipcRenderer.on('desktop:event', receive);
    return () => ipcRenderer.removeListener('desktop:event', receive);
  },
};
if (process.isMainFrame) contextBridge.exposeInMainWorld('desktop', desktop);
