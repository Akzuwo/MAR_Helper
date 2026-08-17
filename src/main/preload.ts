import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, MarHelperApi, SaveFileRequest } from '../shared/models';

const api: MarHelperApi = {
  loadState: () => ipcRenderer.invoke('state:load') as Promise<AppState>,
  saveState: (state) => ipcRenderer.invoke('state:save', state) as Promise<AppState>,
  saveExport: (request: SaveFileRequest) => ipcRenderer.invoke('export:save', request)
};

contextBridge.exposeInMainWorld('marHelper', api);
