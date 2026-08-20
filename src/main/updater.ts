import { app, BrowserWindow, ipcMain, net } from 'electron';
import * as electronUpdater from 'electron-updater';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { UpdateInstallationResult, UpdatePostponeRequest, UpdateStatus } from '../shared/models';
import { normalizeReleaseNotes, normalizeReminderDays } from '../shared/update-utils';

const { autoUpdater } = electronUpdater;
const RELEASE_API = 'https://api.github.com/repos/Akzuwo/MAR_Helper/releases/tags/';
const MAX_TIMER_DELAY = 2_147_000_000;

interface PendingInstallation {
  version: string;
  mode: 'now' | 'on-quit';
  downloaded: boolean;
  attemptedAt?: string;
}

interface UpdaterPreferences {
  reminder?: { version: string; remindAt: string };
  pendingInstallation?: PendingInstallation;
  installationResult?: UpdateInstallationResult;
}

interface AvailableUpdate {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
}

let configured = false;
let preferences: UpdaterPreferences = {};
let preferencesPath = '';
let preferencesReady: Promise<void> = Promise.resolve();
let updateVersion = '';
let availableUpdate: AvailableUpdate | null = null;
let downloadMode: 'now' | 'on-quit' | null = null;
let downloadInProgress = false;
let updateDownloaded = false;
let quitRequested = false;
let installerQuit = false;
let reminderTimer: NodeJS.Timeout | null = null;
let preferenceWriteQueue: Promise<void> = Promise.resolve();
let backgroundQuitFailureInProgress = false;

const safeMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

async function writePreferences() {
  const content = JSON.stringify(preferences, null, 2);
  const write = async () => {
    const temporaryPath = `${preferencesPath}.tmp`;
    await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
    await fs.writeFile(temporaryPath, content, 'utf8');
    await fs.rename(temporaryPath, preferencesPath);
  };
  preferenceWriteQueue = preferenceWriteQueue.then(write, write);
  await preferenceWriteQueue;
}

async function loadPreferences() {
  preferencesPath = path.join(app.getPath('userData'), 'mar-helper-updater.json');
  try {
    const parsed = JSON.parse(await fs.readFile(preferencesPath, 'utf8')) as UpdaterPreferences;
    preferences = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    preferences = {};
  }

  const pending = preferences.pendingInstallation;
  if (pending?.attemptedAt) {
    preferences.installationResult = app.getVersion() === pending.version
      ? { state: 'success', version: pending.version }
      : { state: 'error', version: pending.version, message: `MAR Helper ${pending.version} konnte nicht installiert werden. Die bisherige Version ist weiterhin verfügbar.` };
    delete preferences.pendingInstallation;
    await writePreferences();
  } else if (pending?.mode === 'on-quit') {
    downloadMode = 'on-quit';
    updateDownloaded = pending.downloaded;
  }
}

async function fetchGitHubRelease(version: string): Promise<{ name?: string; notes?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await net.fetch(`${RELEASE_API}${encodeURIComponent(`v${version}`)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MAR-Helper-Updater' },
      signal: controller.signal
    });
    if (!response.ok) return {};
    const release = await response.json() as { name?: unknown; body?: unknown };
    return {
      name: typeof release.name === 'string' && release.name.trim() ? release.name.trim() : undefined,
      notes: typeof release.body === 'string' && release.body.trim() ? release.body.trim() : undefined
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

export function configureAutoUpdater(getWindow: () => BrowserWindow | null) {
  if (configured) return;
  configured = true;
  preferencesReady = loadPreferences();

  const send = (status: UpdateStatus) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('update:status', status);
  };

  const scheduleReminder = () => {
    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = null;
    const reminder = preferences.reminder;
    if (!reminder || !availableUpdate || reminder.version !== availableUpdate.version) return;
    const remaining = new Date(reminder.remindAt).getTime() - Date.now();
    if (remaining <= 0) {
      delete preferences.reminder;
      void writePreferences();
      send({ state: 'available', ...availableUpdate });
      return;
    }
    reminderTimer = setTimeout(scheduleReminder, Math.min(remaining, MAX_TIMER_DELAY));
  };

  const failBackgroundQuit = async (message: string) => {
    if (backgroundQuitFailureInProgress) return;
    backgroundQuitFailureInProgress = true;
    const version = preferences.pendingInstallation?.version || updateVersion;
    preferences.installationResult = { state: 'error', version, message };
    delete preferences.pendingInstallation;
    await writePreferences();
    installerQuit = true;
    app.quit();
  };

  const launchInstaller = async (runAfter: boolean) => {
    const pending = preferences.pendingInstallation ?? { version: updateVersion, mode: runAfter ? 'now' : 'on-quit', downloaded: true };
    preferences.pendingInstallation = { ...pending, downloaded: true, attemptedAt: new Date().toISOString() };
    await writePreferences();
    installerQuit = true;
    autoUpdater.quitAndInstall(true, runAfter);
  };

  const startDownload = async (mode: 'now' | 'on-quit') => {
    if (downloadInProgress || updateDownloaded) return;
    if (!updateVersion) throw new Error('Es ist kein Update zum Herunterladen verfügbar.');
    downloadMode = mode;
    downloadInProgress = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      downloadInProgress = false;
      const message = safeMessage(error, 'Das Update konnte nicht heruntergeladen werden.');
      if (quitRequested && mode === 'on-quit') await failBackgroundQuit(message);
      else send({ state: 'error', message, operation: 'download' });
    }
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    void (async () => {
      updateVersion = info.version;
      const release = await fetchGitHubRelease(info.version);
      availableUpdate = {
        version: info.version,
        releaseName: release.name ?? info.releaseName ?? undefined,
        releaseNotes: release.notes ?? normalizeReleaseNotes(info.releaseNotes, info.version)
      };
      await preferencesReady;

      if (preferences.reminder && preferences.reminder.version !== info.version) delete preferences.reminder;
      const pending = preferences.pendingInstallation;
      if (pending?.version === info.version && pending.mode === 'on-quit' && !pending.attemptedAt) {
        downloadMode = 'on-quit';
        updateDownloaded = pending.downloaded;
        if (!updateDownloaded) void startDownload('on-quit');
        return;
      }
      if (pending?.mode === 'now' && !pending.attemptedAt) {
        delete preferences.pendingInstallation;
        await writePreferences();
      }

      const reminder = preferences.reminder;
      if (reminder?.version === info.version && new Date(reminder.remindAt).getTime() > Date.now()) {
        scheduleReminder();
        return;
      }
      if (reminder) {
        delete preferences.reminder;
        await writePreferences();
      }
      send({ state: 'available', ...availableUpdate });
    })().catch((error) => send({ state: 'error', message: safeMessage(error, 'Die Updateinformationen konnten nicht verarbeitet werden.'), operation: 'check' }));
  });
  autoUpdater.on('update-not-available', () => {
    if (quitRequested && preferences.pendingInstallation) {
      void failBackgroundQuit('Das vorgemerkte Update ist nicht mehr verfügbar.');
      return;
    }
    send({ state: 'not-available' });
  });
  autoUpdater.on('download-progress', (progress) => send({
    state: 'downloading',
    version: updateVersion,
    percent: Math.max(0, Math.min(100, progress.percent)),
    transferred: progress.transferred,
    total: progress.total,
    background: downloadMode === 'on-quit'
  }));
  autoUpdater.on('update-downloaded', (info) => {
    void (async () => {
      downloadInProgress = false;
      updateDownloaded = true;
      const installOnQuit = downloadMode === 'on-quit';
      if (preferences.pendingInstallation?.version === info.version) {
        preferences.pendingInstallation.downloaded = true;
        await writePreferences();
      }
      send({ state: 'downloaded', version: info.version, installOnQuit });
      if (installOnQuit) {
        if (quitRequested) await launchInstaller(false);
      } else {
        setTimeout(() => { void launchInstaller(true); }, 650);
      }
    })().catch((error) => send({ state: 'error', message: safeMessage(error, 'Die Installation konnte nicht gestartet werden.'), operation: 'install' }));
  });
  autoUpdater.on('error', (error) => {
    const message = error.message || 'Das Update konnte nicht verarbeitet werden.';
    downloadInProgress = false;
    if (quitRequested && downloadMode === 'on-quit') void failBackgroundQuit(message);
    else send({ state: 'error', message, operation: downloadMode ? 'download' : 'check' });
  });

  ipcMain.handle('update:download-and-install', async () => {
    await preferencesReady;
    if (!updateVersion) throw new Error('Es ist kein Update zum Herunterladen verfügbar.');
    delete preferences.reminder;
    preferences.pendingInstallation = { version: updateVersion, mode: 'now', downloaded: false };
    await writePreferences();
    await startDownload('now');
  });

  ipcMain.handle('update:postpone', async (_event, request: UpdatePostponeRequest) => {
    await preferencesReady;
    if (!request || request.version !== updateVersion) return { ok: false, message: 'Dieses Update ist nicht mehr aktuell.' };
    if (request.action === 'remind') {
      const days = normalizeReminderDays(request.days);
      if (days === null) return { ok: false, message: 'Bitte wähle zwischen 1 und 365 Tagen.' };
      preferences.reminder = { version: request.version, remindAt: new Date(Date.now() + days * 86_400_000).toISOString() };
      delete preferences.pendingInstallation;
      downloadMode = null;
      await writePreferences();
      scheduleReminder();
      return { ok: true };
    }
    if (request.action === 'install-on-quit') {
      delete preferences.reminder;
      preferences.pendingInstallation = { version: request.version, mode: 'on-quit', downloaded: false };
      await writePreferences();
      void startDownload('on-quit');
      return { ok: true };
    }
    return { ok: false, message: 'Die ausgewählte Update-Aktion ist ungültig.' };
  });

  ipcMain.handle('update:consume-installation-result', async () => {
    await preferencesReady;
    const result = preferences.installationResult ?? null;
    if (result) {
      delete preferences.installationResult;
      await writePreferences();
    }
    return result;
  });

  app.on('before-quit', (event) => {
    if (installerQuit || preferences.pendingInstallation?.mode !== 'on-quit') return;
    event.preventDefault();
    if (quitRequested) return;
    quitRequested = true;
    BrowserWindow.getAllWindows().forEach((window) => window.hide());
    if (updateDownloaded || preferences.pendingInstallation.downloaded) {
      void launchInstaller(false);
    } else if (updateVersion === preferences.pendingInstallation.version) {
      void startDownload('on-quit');
    } else {
      void autoUpdater.checkForUpdates().catch((error) => failBackgroundQuit(safeMessage(error, 'Das Update konnte beim Beenden nicht geladen werden.')));
    }
  });

  if (app.isPackaged) setTimeout(() => { void autoUpdater.checkForUpdates(); }, 1800);
}
