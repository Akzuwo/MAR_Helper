import { describe, expect, it } from 'vitest';
import { createDefaultState, normalizeState } from './defaults';
import { AUTO_EXPORT_FILE_NAME, createAutoExportHtml, createPdfHeaderTemplate, PDF_FOOTER_TEMPLATE } from './pdf-export';

describe('automatic PDF export document', () => {
  it('migrates the beta and export settings disabled by default', () => {
    const migrated = normalizeState({ version: 4, settings: { modules: { journal: true, prompts: true, planner: true } } } as never);
    expect(migrated.version).toBe(7);
    expect(migrated.settings.betaFeatures.cloudSave).toBe(false);
    expect(migrated.settings.autoExport).toEqual({
      enabled: false, fileName: 'MAR-Helper-Protokolle.pdf', separateDocuments: false,
      journalFileName: 'MAR-Helper-Arbeitsjournal.pdf', promptsFileName: 'MAR-Helper-Promptprotokoll.pdf'
    });
    expect(AUTO_EXPORT_FILE_NAME).toBe('MAR-Helper-Protokolle.pdf');
  });

  it('only enables automatic PDF export with a target directory', () => {
    const missingDirectory = createDefaultState();
    missingDirectory.settings.autoExport.enabled = true;

    const normalizedWithoutDirectory = normalizeState(missingDirectory);
    expect(normalizedWithoutDirectory.settings.autoExport.enabled).toBe(false);

    const configured = createDefaultState();
    configured.settings.autoExport = { ...configured.settings.autoExport, enabled: true, directory: 'C:\\Exports' };

    const normalizedWithDirectory = normalizeState(configured);
    expect(normalizedWithDirectory.settings.autoExport).toEqual(configured.settings.autoExport);
  });

  it('migrates the former Auto Export beta setting into the regular feature', () => {
    const migrated = normalizeState({
      version: 5,
      settings: {
        modules: { journal: true, prompts: true, planner: true },
        betaFeatures: { rawTextImport: false, autoExport: true },
        autoExport: { enabled: true, directory: 'C:\\Exports' }
      }
    } as never);
    expect(migrated.settings.autoExport.enabled).toBe(true);
    expect(migrated.settings.autoExport.directory).toBe('C:\\Exports');
    expect(migrated.settings.autoExport.fileName).toBe('MAR-Helper-Protokolle.pdf');
  });

  it('renders every protocol with a print layout and escapes user content', () => {
    const state = createDefaultState();
    state.journalEntries = [{
      id: 'journal-1', title: 'Recherche & Auswertung', notes: '<script>alert(1)</script>',
      startedAt: '2026-08-18T08:00:00.000Z', endedAt: '2026-08-18T09:30:00.000Z', workingTimeMs: 5_400_000, pausedTimeMs: 0
    }];
    state.promptEntries = [{
      id: 'prompt-1', number: 12, title: 'PDF-Konzept', modelName: 'Codex', prompt: 'Erstelle <ein> PDF.', response: 'Erledigt.', createdAt: '2026-08-18T10:00:00.000Z'
    }];
    state.plannerTasks = [{
      id: 'task-1', title: 'Export prüfen', description: 'PDF öffnen', dueDate: '2026-08-20', completed: true, createdAt: '2026-08-18T11:00:00.000Z'
    }];

    const html = createAutoExportHtml(state, new Date('2026-08-19T12:00:00.000Z'));
    expect(html).toContain('@page { size: A4');
    expect(createPdfHeaderTemplate('data:image/png;base64,bWFy')).toContain('src="data:image/png;base64,bWFy"');
    expect(PDF_FOOTER_TEMPLATE).toContain('class="pageNumber"');
    expect(PDF_FOOTER_TEMPLATE).toContain('class="totalPages"');
    expect(html).toContain('<h2>Arbeitsjournal</h2>');
    expect(html).toContain('<h2>Promptprotokoll</h2>');
    expect(html).toContain('<h2>Zeitplan</h2>');
    expect(html).toContain('#12');
    expect(html).toContain('PDF-Konzept');
    expect(html).toContain('Recherche &amp; Auswertung');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders imported journal notes without inventing a title', () => {
    const state = createDefaultState();
    state.journalEntries = [{
      id: 'journal-untitled', title: '', notes: 'Nur tatsächlicher Inhalt',
      startedAt: '2026-08-18T08:00:00.000Z', endedAt: '2026-08-18T09:00:00.000Z', workingTimeMs: 3_600_000, pausedTimeMs: 0
    }];
    const html = createAutoExportHtml(state);
    expect(html).toContain('Nur tatsächlicher Inhalt');
    expect(html).not.toContain('<h3>Nur tatsächlicher Inhalt</h3>');
  });

  it('can render journal and prompt protocol as separate documents', () => {
    const state = createDefaultState();
    const journal = createAutoExportHtml(state, new Date(), 'journal');
    const prompts = createAutoExportHtml(state, new Date(), 'prompts');
    expect(journal).toContain('<h2>Arbeitsjournal</h2>');
    expect(journal).not.toContain('<h2>Promptprotokoll</h2>');
    expect(journal).not.toContain('<h2>Zeitplan</h2>');
    expect(prompts).toContain('<h2>Promptprotokoll</h2>');
    expect(prompts).not.toContain('<h2>Arbeitsjournal</h2>');
  });
});
