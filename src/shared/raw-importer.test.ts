import { describe, expect, it } from 'vitest';
import { parseRawTextImport } from './raw-importer';
import { exportPromptsMarkdown } from './exporters';

describe('raw text import recognition', () => {
  it('recognizes a copied journal table and derives working time', () => {
    const parsed = parseRawTextImport([
      'Aktivität\tStart\tEnde\tPause',
      'Recherche\t18.08.2026 08:00\t18.08.2026 09:30\t15'
    ].join('\n'));
    expect(parsed.bundle.kind).toBe('journal');
    expect(parsed.bundle.journalEntries?.[0]).toMatchObject({
      title: 'Recherche', workingTimeMs: 75 * 60 * 1000, pausedTimeMs: 15 * 60 * 1000
    });
  });

  it('imports journal notes from copied tables', () => {
    const parsed = parseRawTextImport('Aktivität;Notizen;Start;Ende\nSchreiben;Fazit überarbeiten;2026-08-18T08:00:00Z;2026-08-18T09:00:00Z');
    expect(parsed.bundle.journalEntries?.[0].notes).toBe('Fazit überarbeiten');
  });

  it('recognizes prompt CSV with quoted multiline cells', () => {
    const parsed = parseRawTextImport([
      'Titel,Modell,Prompt,Antwort,Zeitpunkt',
      'Recherche,GPT-5,"Erkläre, warum Quellen wichtig sind.","Sie schaffen\nNachvollziehbarkeit.",2026-08-18T10:00:00.000Z'
    ].join('\n'));
    expect(parsed.bundle.kind).toBe('prompts');
    expect(parsed.bundle.promptEntries?.[0]).toMatchObject({
      title: 'Recherche', modelName: 'GPT-5', response: 'Sie schaffen\nNachvollziehbarkeit.'
    });
  });

  it('recognizes planner rows and status values', () => {
    const parsed = parseRawTextImport([
      'Titel;Beschreibung;Fällig am;Status',
      'Gliederung;Kapitel ordnen;31.08.2026;Erledigt',
      'Fazit;Entwurf schreiben;2026-09-05;Offen'
    ].join('\n'));
    expect(parsed.bundle.kind).toBe('planner');
    expect(parsed.bundle.plannerTasks).toHaveLength(2);
    expect(parsed.bundle.plannerTasks?.map((task) => [task.completed, task.dueDate])).toEqual([
      [true, '2026-08-31'], [false, '2026-09-05']
    ]);
  });

  it('recognizes labeled prompt blocks and markdown tasks', () => {
    const prompts = parseRawTextImport('Titel: Quellencheck\nModell: Codex\nPrompt: Prüfe die Quellen.\nAntwort: Zwei Angaben fehlen.');
    expect(prompts.bundle.promptEntries?.[0]).toMatchObject({ title: 'Quellencheck', modelName: 'Codex', prompt: 'Prüfe die Quellen.', response: 'Zwei Angaben fehlen.' });

    const tasks = parseRawTextImport('- [ ] Recherche | 2026-08-31\n- [x] Thema festlegen');
    expect(tasks.bundle.plannerTasks?.map((task) => [task.title, task.completed])).toEqual([
      ['Recherche', false], ['Thema festlegen', true]
    ]);
  });

  it('accepts MAR Helper JSON and rejects ambiguous prose', () => {
    const json = parseRawTextImport(JSON.stringify({ module: 'planner', data: [] }));
    expect(json.detectedFormat).toBe('MAR-Helper-JSON');
    expect(() => parseRawTextImport('Heute habe ich ein wenig an meiner Arbeit geschrieben.')).toThrow('nicht eindeutig erkannt');
  });

  it('recognizes an exported prompt Markdown document', () => {
    const markdown = exportPromptsMarkdown([{
      id: 'prompt-1', number: 1, title: 'Quellencheck', modelName: 'Codex',
      prompt: 'Prüfe die Quellen.', response: 'Zwei Angaben fehlen.', createdAt: '2026-08-18T10:00:00.000Z'
    }]);
    const parsed = parseRawTextImport(markdown);
    expect(parsed.bundle.promptEntries?.[0]).toMatchObject({ title: 'Quellencheck', modelName: 'Codex', prompt: 'Prüfe die Quellen.', response: 'Zwei Angaben fehlen.' });
  });
});
