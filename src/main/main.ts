import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppState, SaveFileRequest } from '../shared/models';
import { JsonStore } from './store';
import { configureAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let store: JsonStore;

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
    const stats = await fs.stat(filePath);
    if (stats.size > 50 * 1024 * 1024) throw new Error('Die Importdatei ist grösser als 50 MB.');
    return { canceled: false, fileName: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
  });
  createWindow();
  configureAutoUpdater(() => mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
