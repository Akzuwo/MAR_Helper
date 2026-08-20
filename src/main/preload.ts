import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, AutoExportStatus, CloudSaveStatus, MarHelperApi, SaveFileRequest, UpdateStatus } from '../shared/models';

const api: MarHelperApi = {
  loadState: () => ipcRenderer.invoke('state:load') as Promise<AppState>,
  saveState: (state) => ipcRenderer.invoke('state:save', state) as Promise<AppState>,
  getHistoryStatus: () => ipcRenderer.invoke('history:status'),
  undoState: () => ipcRenderer.invoke('history:undo'),
  redoState: () => ipcRenderer.invoke('history:redo'),
  saveExport: (request: SaveFileRequest) => ipcRenderer.invoke('export:save', request),
  selectAutoExportFolder: () => ipcRenderer.invoke('auto-export:select-folder'),
  runAutoExport: () => ipcRenderer.invoke('auto-export:run'),
  onAutoExportStatus: (listener: (status: AutoExportStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: AutoExportStatus) => listener(status);
    ipcRenderer.on('auto-export:status', handler);
    return () => ipcRenderer.removeListener('auto-export:status', handler);
  },
  checkCloudRepository: (repositoryPath) => ipcRenderer.invoke('cloud-save:check-repository', repositoryPath),
  syncCloudSave: () => ipcRenderer.invoke('cloud-save:sync'),
  resolveCloudConflict: (useRemote) => ipcRenderer.invoke('cloud-save:resolve-conflict', useRemote),
  onCloudSaveStatus: (listener: (status: CloudSaveStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: CloudSaveStatus) => listener(status);
    ipcRenderer.on('cloud-save:status', handler);
    return () => ipcRenderer.removeListener('cloud-save:status', handler);
  },
  onCloudStateUpdated: (listener: (state: AppState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('cloud-save:state-updated', handler);
    return () => ipcRenderer.removeListener('cloud-save:state-updated', handler);
  },
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
