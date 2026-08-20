import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { applyImport, ImportValidationError, parseImport, type ImportBundle } from '../shared/importers';
import { parseRawTextImport } from '../shared/raw-importer';
import type { AppState, AutoExportStatus, CloudSaveStatus, ImportMode, ImportSummary, SaveFileRequest } from '../shared/models';
import { AutoExportService } from './auto-export';
import { CloudSaveService } from './cloud-save';
import { JsonStore } from './store';
import { configureAutoUpdater } from './updater';
import { checkGit, checkRemoteRepository, listCommits, readCommit, resolveRepository } from './git-integration/GitService';

let mainWindow: BrowserWindow | null = null;
let store: JsonStore;
let autoExporter: AutoExportService;
let cloudSaver: CloudSaveService;
const importSessions = new Map<string, { bundle: ImportBundle; createdAt: number }>();
const IMPORT_SESSION_TTL = 15 * 60 * 1000;

function createImportPreview(bundle: ImportBundle, fileName: string, source: 'file' | 'rawText', detectedFormat?: string) {
  const now = Date.now();
  for (const [id, session] of importSessions) if (now - session.createdAt > IMPORT_SESSION_TTL) importSessions.delete(id);
  const sessionId = randomUUID();
  importSessions.set(sessionId, { bundle, createdAt: now });
  return {
    canceled: false as const,
    preview: { sessionId, fileName, kind: bundle.kind, formatVersion: bundle.formatVersion, legacy: bundle.legacy, counts: bundle.counts, source, detectedFormat }
  };
}

function importError(error: unknown, rawText = false) {
  if (error instanceof ImportValidationError) return {
    canceled: false as const,
    error: {
      code: error.code,
      title: rawText ? 'Rohtext nicht erkannt' : error.code === 'INVALID_JSON' ? 'Import nicht möglich' : 'Nicht unterstützte Datei',
      message: error.message
    }
  };
  return {
    canceled: false as const,
    error: { code: 'READ_FAILED' as const, title: 'Import nicht möglich', message: rawText ? 'Der Rohtext konnte nicht analysiert werden.' : 'Die ausgewählte Datei konnte nicht sicher gelesen werden.' }
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#f8f9fa',
    icon: path.join(app.getAppPath(), 'references', 'logo', 'taskbar-icon.png'),
    title: 'MAR Helper',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && url !== currentUrl) event.preventDefault();
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void mainWindow.loadURL(devServer);
  else void mainWindow.loadFile(path.join(app.getAppPath(), 'dist-renderer', 'index.html'));
}

app.whenReady().then(() => {
  store = new JsonStore();
  autoExporter = new AutoExportService((status: AutoExportStatus) => mainWindow?.webContents.send('auto-export:status', status));
  cloudSaver = new CloudSaveService(
    store,
    (status: CloudSaveStatus) => mainWindow?.webContents.send('cloud-save:status', status),
    (state: AppState) => { autoExporter.schedule(state); mainWindow?.webContents.send('cloud-save:state-updated', state); }
  );
  ipcMain.handle('state:load', async () => { const state = await store.load(); cloudSaver.configure(state, true); return state; });
  ipcMain.handle('history:status', () => store.historyStatus());
  ipcMain.handle('history:undo', async () => {
    const result = await store.undo();
    if (result.ok) { autoExporter.schedule(result.state); cloudSaver.schedule(result.state); }
    return result;
  });
  ipcMain.handle('history:redo', async () => {
    const result = await store.redo();
    if (result.ok) { autoExporter.schedule(result.state); cloudSaver.schedule(result.state); }
    return result;
  });
  ipcMain.handle('state:save', async (_event, state: AppState) => {
    const persisted = await store.save(state);
    autoExporter.schedule(persisted);
    cloudSaver.schedule(persisted);
    return persisted;
  });
  ipcMain.handle('export:save', async (_event, request: SaveFileRequest) => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export speichern',
      defaultPath: request.defaultPath,
      filters: request.filters
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, request.content, 'utf8');
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle('auto-export:select-folder', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Auto-Export-Ordner auswählen',
      buttonLabel: 'Diesen Ordner verwenden',
      properties: ['openDirectory', 'createDirectory']
    });
    const directory = result.filePaths[0];
    return result.canceled || !directory ? { canceled: true } : { canceled: false, directory };
  });
  ipcMain.handle('auto-export:run', async () => autoExporter.runNow(await store.load()));
  ipcMain.handle('cloud-save:check-repository', (_event, repositoryPath: string) => checkRemoteRepository(repositoryPath));
  ipcMain.handle('cloud-save:sync', () => cloudSaver.syncNow());
  ipcMain.handle('cloud-save:resolve-conflict', (_event, useRemote: boolean) => cloudSaver.resolveConflict(useRemote === true));
  ipcMain.handle('import:open', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'MAR-Helper-Daten importieren',
      properties: ['openFile'],
      filters: [{ name: 'MAR Helper JSON', extensions: ['json'] }]
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { canceled: true };
    try {
      if (path.extname(filePath).toLocaleLowerCase() !== '.json') {
        return { canceled: false, error: { code: 'UNSUPPORTED_FILE', title: 'Nicht unterstützte Datei', message: 'Bitte wähle eine JSON-Datei aus.' } };
      }
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size > 50 * 1024 * 1024) {
        return { canceled: false, error: { code: 'READ_FAILED', title: 'Import nicht möglich', message: 'Die ausgewählte Datei kann nicht importiert werden oder ist grösser als 50 MB.' } };
      }
      const bundle = parseImport(await fs.readFile(filePath, 'utf8'));
      return createImportPreview(bundle, path.basename(filePath), 'file');
    } catch (error) {
      return importError(error);
    }
  });
  ipcMain.handle('import:preview-raw', (_event, content: unknown) => {
    if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) {
      return { canceled: false, error: { code: 'READ_FAILED', title: 'Rohtext nicht erkannt', message: 'Der Rohtext ist ungültig oder grösser als 5 MB.' } };
    }
    try {
      const parsed = parseRawTextImport(content);
      return createImportPreview(parsed.bundle, 'Eingefügter Rohtext', 'rawText', parsed.detectedFormat);
    } catch (error) {
      return importError(error, true);
    }
  });
  ipcMain.handle('import:commit', async (_event, sessionId: unknown, mode: unknown) => {
    if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId) || (mode !== 'merge' && mode !== 'replace')) {
      return { ok: false, message: 'Die Importanfrage ist ungültig.' };
    }
    const session = importSessions.get(sessionId);
    if (!session || Date.now() - session.createdAt > IMPORT_SESSION_TTL) {
      importSessions.delete(sessionId);
      return { ok: false, message: 'Die Importvorschau ist abgelaufen. Bitte wähle die Datei erneut aus.' };
    }
    try {
      let summary: ImportSummary = { imported: {}, skipped: 0, conflicts: 0 };
      const state = await store.transaction((current) => {
        const applied = applyImport(current, session.bundle, mode as ImportMode);
        summary = { imported: session.bundle.counts, skipped: 0, conflicts: 0 };
        return applied;
      });
      autoExporter.schedule(state);
      cloudSaver.schedule(state);
      importSessions.delete(sessionId);
      return { ok: true, state, summary };
    } catch {
      return { ok: false, message: 'Der Import konnte nicht abgeschlossen werden. Deine bestehenden Daten wurden nicht verändert.' };
    }
  });
  ipcMain.handle('git:check', () => checkGit());
  ipcMain.handle('git:verify-repository', (_event, repositoryPath: string) => resolveRepository(repositoryPath));
  ipcMain.handle('git:list-commits', (_event, repositoryPath: string, skip?: number, limit?: number) => listCommits(repositoryPath, skip, limit));
  ipcMain.handle('git:read-commit', (_event, repositoryPath: string, commitHash: string) => readCommit(repositoryPath, commitHash));
  ipcMain.handle('git:select-repository', async () => {
    if (!mainWindow) return { ok: false, code: 'WINDOW_UNAVAILABLE', message: 'Der Ordnerdialog ist momentan nicht verfügbar.' };
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Git-Repository auswählen', properties: ['openDirectory'] });
    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) return { ok: true, data: { canceled: true } };
    const repository = await resolveRepository(selectedPath);
    if (!repository.ok) return repository;
    return { ok: true, data: { canceled: false, ...repository.data } };
  });
  ipcMain.handle('git:open-download', () => shell.openExternal('https://git-scm.com/downloads'));
  createWindow();
  configureAutoUpdater(() => mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  cloudSaver?.stop();
  if (process.platform !== 'darwin') app.quit();
});
