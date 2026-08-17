import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { applyImport, ImportValidationError, parseImport, type ImportBundle } from '../shared/importers';
import type { AppState, ImportMode, ImportSummary, SaveFileRequest } from '../shared/models';
import { JsonStore } from './store';
import { configureAutoUpdater } from './updater';
import { checkGit, listCommits, readCommit, resolveRepository } from './git-integration/GitService';

let mainWindow: BrowserWindow | null = null;
let store: JsonStore;
const importSessions = new Map<string, { bundle: ImportBundle; createdAt: number }>();
const IMPORT_SESSION_TTL = 15 * 60 * 1000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#f8f9fa',
    icon: path.join(app.getAppPath(), 'references', 'logo', 'screen.png'),
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
  ipcMain.handle('state:load', () => store.load());
  ipcMain.handle('state:save', (_event, state: AppState) => store.save(state));
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
      const now = Date.now();
      for (const [id, session] of importSessions) if (now - session.createdAt > IMPORT_SESSION_TTL) importSessions.delete(id);
      const sessionId = randomUUID();
      importSessions.set(sessionId, { bundle, createdAt: now });
      return { canceled: false, preview: {
        sessionId, fileName: path.basename(filePath), kind: bundle.kind,
        formatVersion: bundle.formatVersion, legacy: bundle.legacy, counts: bundle.counts
      } };
    } catch (error) {
      if (error instanceof ImportValidationError) return {
        canceled: false,
        error: {
          code: error.code,
          title: error.code === 'INVALID_JSON' ? 'Import nicht möglich' : 'Nicht unterstützte Datei',
          message: error.message
        }
      };
      return { canceled: false, error: { code: 'READ_FAILED', title: 'Import nicht möglich', message: 'Die ausgewählte Datei konnte nicht sicher gelesen werden.' } };
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
  if (process.platform !== 'darwin') app.quit();
});
