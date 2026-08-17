import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, MarHelperApi, SaveFileRequest, UpdateStatus } from '../shared/models';

const api: MarHelperApi = {
  loadState: () => ipcRenderer.invoke('state:load') as Promise<AppState>,
  saveState: (state) => ipcRenderer.invoke('state:save', state) as Promise<AppState>,
  saveExport: (request: SaveFileRequest) => ipcRenderer.invoke('export:save', request),
  openImport: () => ipcRenderer.invoke('import:open'),
  downloadAndInstallUpdate: () => ipcRenderer.invoke('update:download-and-install'),
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  }
};

contextBridge.exposeInMainWorld('marHelper', api);
