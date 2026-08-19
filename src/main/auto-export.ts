import { app, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppState, AutoExportResult, AutoExportStatus } from '../shared/models';
import { AUTO_EXPORT_FILE_NAME, createAutoExportHtml, createPdfHeaderTemplate, PDF_FOOTER_TEMPLATE } from '../shared/pdf-export';

type StatusListener = (status: AutoExportStatus) => void;

export class AutoExportService {
  private queuedState: AppState | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly onStatus: StatusListener) {}

  schedule(state: AppState): void {
    if (!this.configured(state)) { this.queuedState = null; return; }
    this.queuedState = state;
    if (!this.running) {
      this.running = this.drain().finally(() => { this.running = null; });
    }
  }

  async runNow(state: AppState): Promise<AutoExportResult> {
    if (!this.configured(state)) {
      const result = { state: 'error' as const, message: 'Wähle zuerst einen Zielordner und aktiviere den Auto-Export.' };
      this.onStatus(result);
      return result;
    }
    if (this.running) await this.running;
    return this.exportState(state);
  }

  private configured(state: AppState): boolean {
    return state.settings.betaFeatures.autoExport
      && state.settings.autoExport.enabled
      && Boolean(state.settings.autoExport.directory);
  }

  private async drain(): Promise<void> {
    while (this.queuedState) {
      const state = this.queuedState;
      this.queuedState = null;
      await this.exportState(state);
    }
  }

  private async exportState(state: AppState): Promise<AutoExportResult> {
    this.onStatus({ state: 'exporting' });
    let renderWindow: BrowserWindow | null = null;
    let tempDirectory = '';
    try {
      const directory = path.resolve(state.settings.autoExport.directory!);
      const directoryStats = await fs.stat(directory);
      if (!directoryStats.isDirectory()) throw new Error('NOT_A_DIRECTORY');

      tempDirectory = await fs.mkdtemp(path.join(app.getPath('temp'), 'mar-helper-pdf-'));
      const htmlPath = path.join(tempDirectory, 'protokolle.html');
      const icon = await fs.readFile(path.join(app.getAppPath(), 'references', 'logo', 'screen.png'));
      const iconDataUrl = `data:image/png;base64,${icon.toString('base64')}`;
      await fs.writeFile(htmlPath, createAutoExportHtml(state), 'utf8');

      renderWindow = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false }
      });
      await renderWindow.loadFile(htmlPath);
      const pdf = await renderWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        generateTaggedPDF: true,
        displayHeaderFooter: true,
        headerTemplate: createPdfHeaderTemplate(iconDataUrl),
        footerTemplate: PDF_FOOTER_TEMPLATE
      });

      const filePath = path.join(directory, AUTO_EXPORT_FILE_NAME);
      const temporaryPdf = path.join(directory, `.${AUTO_EXPORT_FILE_NAME}.${randomUUID()}.tmp`);
      await fs.writeFile(temporaryPdf, pdf);
      try {
        await fs.rename(temporaryPdf, filePath);
      } catch {
        try { await fs.copyFile(temporaryPdf, filePath); }
        finally { await fs.unlink(temporaryPdf).catch(() => undefined); }
      }

      const result = { state: 'success' as const, filePath, exportedAt: new Date().toISOString() };
      this.onStatus(result);
      return result;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const result = {
        state: 'error' as const,
        message: code === 'EACCES' || code === 'EPERM'
          ? 'Der Auto-Export hat keine Schreibberechtigung für den gewählten Ordner.'
          : 'Der Auto-Export konnte das PDF nicht aktualisieren. Prüfe, ob der Zielordner noch verfügbar ist.'
      };
      this.onStatus(result);
      return result;
    } finally {
      if (renderWindow && !renderWindow.isDestroyed()) renderWindow.destroy();
      if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
