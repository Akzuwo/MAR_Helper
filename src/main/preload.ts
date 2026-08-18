import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, MarHelperApi, SaveFileRequest, UpdateStatus } from '../shared/models';

const api: MarHelperApi = {
  loadState: () => ipcRenderer.invoke('state:load') as Promise<AppState>,
  saveState: (state) => ipcRenderer.invoke('state:save', state) as Promise<AppState>,
  saveExport: (request: SaveFileRequest) => ipcRenderer.invoke('export:save', request),
  openImport: () => ipcRenderer.invoke('import:open'),
  previewRawImport: (content) => ipcRenderer.invoke('import:preview-raw', content),
  commitImport: (sessionId, mode) => ipcRenderer.invoke('import:commit', sessionId, mode),
  checkGit: () => ipcRenderer.invoke('git:check'),
  selectGitRepository: () => ipcRenderer.invoke('git:select-repository'),
  verifyGitRepository: (repositoryPath) => ipcRenderer.invoke('git:verify-repository', repositoryPath),
  listGitCommits: (repositoryPath, skip, limit) => ipcRenderer.invoke('git:list-commits', repositoryPath, skip, limit),
  readGitCommit: (repositoryPath, commitHash) => ipcRenderer.invoke('git:read-commit', repositoryPath, commitHash),
  openGitDownload: () => ipcRenderer.invoke('git:open-download'),
  downloadAndInstallUpdate: () => ipcRenderer.invoke('update:download-and-install'),
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  }
};

contextBridge.exposeInMainWorld('marHelper', api);
