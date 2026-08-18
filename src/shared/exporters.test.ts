import { describe, expect, it } from 'vitest';
import { createDefaultState } from './defaults';
import { exportJournalCsv, exportModuleJson, exportPromptsMarkdown } from './exporters';
import type { JournalEntry, PromptEntry } from './models';

const entries: PromptEntry[] = [
  { id: 'with-title', number: 42, title: 'Git-Integration für Promptprotokoll', modelName: 'Codex', prompt: 'Prompt mit Titel', response: 'Antwort', createdAt: '2026-08-18T12:25:00.000Z' },
  { id: 'without-title', number: 43, modelName: 'Codex', prompt: 'Prompt ohne Titel', response: 'Antwort', createdAt: '2026-08-18T12:31:00.000Z' }
];

describe('prompt exports', () => {
  it('exports persistent numbers and optional titles to JSON', () => {
    const exported = JSON.parse(exportModuleJson('prompts', entries));
    expect(exported.formatVersion).toBe(2);
    expect(exported.data[0]).toMatchObject({ number: 42, title: 'Git-Integration für Promptprotokoll' });
    expect(exported.data[1].number).toBe(43);
    expect(exported.data[1]).not.toHaveProperty('title');

    const state = createDefaultState();
    state.promptEntries = entries;
    state.nextPromptNumber = 44;
    expect(state.nextPromptNumber).toBe(44);
  });

  it('uses number and optional title as Markdown headings and includes metadata', () => {
    const markdown = exportPromptsMarkdown(entries);
    expect(markdown).toContain('## #42 – Git-Integration für Promptprotokoll');
    expect(markdown).toContain('## #43\n');
    expect(markdown).toContain('**Modell:** Codex  \n**Zeitpunkt:**');
  });
});

describe('journal exports', () => {
  it('includes optional notes in CSV and JSON exports', () => {
    const journal: JournalEntry[] = [{
      id: 'journal-1', title: 'Recherche', notes: 'Kapitel 3 zusammengefasst',
      startedAt: '2026-08-18T08:00:00.000Z', endedAt: '2026-08-18T09:00:00.000Z',
      workingTimeMs: 3_600_000, pausedTimeMs: 0
    }];
    expect(exportJournalCsv(journal)).toContain('"Notizen"');
    expect(exportJournalCsv(journal)).toContain('"Kapitel 3 zusammengefasst"');
    expect(JSON.parse(exportModuleJson('journal', journal)).data[0].notes).toBe('Kapitel 3 zusammengefasst');
  });
});
