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

  it('recognizes escaped Markdown journal entries grouped by ISO date headings', () => {
    const parsed = parseRawTextImport(`# Arbeitsjournal MAR Joseph Stücklin

Datum im Format yyyy-mm-dd
&#x20;
\\## 2026-02-17:

\\*\\*Handlung:\\*\\* Erste Recherche, Little's Law aufgefunden.
&#x20;
\\## 2026-04-04:

\\*\\*Handlung:\\*\\* Brainstorming Projektanforderungen.
&#x20;
\\*\\*Erkenntnisse:\\*\\*

\\- Warnung bei nicht 100%-Effizienz in die Soll-Kategorie.

\\- In-Game-Modeler ist kompliziert, aber möglich.
&#x20;
\\## 2026-05-12:

Schreiben an der MAR: Vorwort, Einleitung.
&#x20;
\\## 2026-06-05

\\*\\*Handlung:\\*\\*&#x20;

\\- Abbildung zur Referenz hinzugefügt

\\- Grober Plan für Indikatoren erstellt`);

    expect(parsed.detectedFormat).toBe('Markdown-Datumsblöcke · Arbeitsjournal');
    expect(parsed.bundle.kind).toBe('journal');
    expect(parsed.bundle.counts.journal).toBe(4);
    expect(parsed.bundle.journalEntries?.map((entry) => entry.title)).toEqual([
      "Erste Recherche, Little's Law aufgefunden.",
      'Brainstorming Projektanforderungen.',
      'Schreiben an der MAR: Vorwort, Einleitung.',
      'Abbildung zur Referenz hinzugefügt'
    ]);
    expect(parsed.bundle.journalEntries?.[1].notes).toBe('**Erkenntnisse:**\n\n- Warnung bei nicht 100%-Effizienz in die Soll-Kategorie.\n\n- In-Game-Modeler ist kompliziert, aber möglich.');
    expect(parsed.bundle.journalEntries?.[2].notes).toBeUndefined();
    expect(parsed.bundle.journalEntries?.[3]).toMatchObject({
      notes: '- Grober Plan für Indikatoren erstellt', workingTimeMs: 0, pausedTimeMs: 0
    });
    for (const [index, date] of ['2026-02-17', '2026-04-04', '2026-05-12', '2026-06-05'].entries()) {
      const startedAt = new Date(parsed.bundle.journalEntries?.[index].startedAt ?? '');
      expect([startedAt.getFullYear(), startedAt.getMonth() + 1, startedAt.getDate()].join('-')).toBe(date.replace(/-0/g, '-'));
      expect(parsed.bundle.journalEntries?.[index].endedAt).toBe(parsed.bundle.journalEntries?.[index].startedAt);
    }
  });
});
