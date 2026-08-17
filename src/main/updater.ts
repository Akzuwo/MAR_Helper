import { app, BrowserWindow, ipcMain } from 'electron';
import * as electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../shared/models';

const { autoUpdater } = electronUpdater;
let updateVersion = '';
let configured = false;

const normalizeReleaseNotes = (notes: unknown): string | undefined => {
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    const text = notes.map((note) => {
      if (typeof note === 'string') return note;
      if (typeof note === 'object' && note !== null && 'note' in note && typeof note.note === 'string') return note.note;
      return '';
    }).filter(Boolean).join('\n\n');
    return text || undefined;
  }
  return undefined;
};

export function configureAutoUpdater(getWindow: () => BrowserWindow | null) {
  if (configured) return;
  configured = true;
  const send = (status: UpdateStatus) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('update:status', status);
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    updateVersion = info.version;
    send({
      state: 'available',
      version: info.version,
      releaseName: info.releaseName ?? undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    });
  });
  autoUpdater.on('update-not-available', () => send({ state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) => send({
    state: 'downloading',
    version: updateVersion,
    percent: Math.max(0, Math.min(100, progress.percent)),
    transferred: progress.transferred,
    total: progress.total
  }));
  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'downloaded', version: info.version });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 650);
  });
  autoUpdater.on('error', (error) => send({ state: 'error', message: error.message || 'Das Update konnte nicht verarbeitet werden.' }));

  ipcMain.handle('update:download-and-install', async () => {
    if (!updateVersion) throw new Error('Es ist kein Update zum Herunterladen verfügbar.');
    await autoUpdater.downloadUpdate();
  });

  if (app.isPackaged) {
    setTimeout(() => { void autoUpdater.checkForUpdates(); }, 1800);
  }
}
