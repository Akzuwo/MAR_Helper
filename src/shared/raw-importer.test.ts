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

  it('recognizes foreign journal JSON with entry sessions without losing work time', () => {
    const parsed = parseRawTextImport(JSON.stringify({
      entries: [{
        id: 'external-1', date: '2026-05-19', title: 'Zeitplan überarbeiten', description: 'Aufgaben neu verteilt',
        sessions: [
          { start: '2026-05-19T08:00:00.000Z', end: '2026-05-19T08:30:00.000Z' },
          { start: '2026-05-19T09:00:00.000Z', end: '2026-05-19T10:00:00.000Z' }
        ],
        createdAt: '2026-07-01T17:28:01.233Z'
      }],
      activeTimer: null
    }));
    expect(parsed.detectedFormat).toBe('Strukturiertes JSON mit Einträgen · Arbeitsjournal');
    expect(parsed.bundle.journalEntries?.[0]).toMatchObject({
      id: 'external-1', title: 'Zeitplan überarbeiten', notes: 'Aufgaben neu verteilt',
      startedAt: '2026-05-19T08:00:00.000Z', endedAt: '2026-05-19T10:00:00.000Z',
      workingTimeMs: 90 * 60 * 1000, pausedTimeMs: 30 * 60 * 1000
    });
  });

  it('recognizes fenced JSON prompt aliases and JSON chat messages', () => {
    const aliased = parseRawTextImport(`\`\`\`json
{"items":[{"uuid":"p-1","name":"Quellen","llm":"GPT-5","input":"Prüfe diese Quelle.","output":"Die Quelle ist belastbar.","timestamp":"2026-08-18T10:00:00Z"}]}
\`\`\``);
    expect(aliased.bundle.promptEntries?.[0]).toMatchObject({ id: 'p-1', title: 'Quellen', modelName: 'GPT-5', prompt: 'Prüfe diese Quelle.', response: 'Die Quelle ist belastbar.' });

    const transcript = parseRawTextImport(JSON.stringify({ model: 'Codex', messages: [
      { role: 'user', content: 'Erstelle einen Test.' },
      { role: 'assistant', content: 'Der Test wurde erstellt.' }
    ] }));
    expect(transcript.detectedFormat).toBe('Chat-Nachrichten (JSON) · Promptprotokoll');
    expect(transcript.bundle.promptEntries?.[0]).toMatchObject({ modelName: 'Codex', prompt: 'Erstelle einen Test.', response: 'Der Test wurde erstellt.' });
  });

  it('recognizes Markdown pipe tables, chat transcripts, timeline rows and symbolic tasks', () => {
    const table = parseRawTextImport('| Aktivität | Start | Ende | Dauer |\n|---|---|---|---|\n| Recherche | 18.08.2026 08:00 | 18.08.2026 09:30 | 1h 15min |');
    expect(table.detectedFormat).toBe('Markdown-Tabelle · Arbeitsjournal');
    expect(table.bundle.journalEntries?.[0].workingTimeMs).toBe(75 * 60 * 1000);

    const chat = parseRawTextImport('User: Erkläre Little’s Law.\nCodex: Little’s Law verbindet Bestand, Durchsatz und Zeit.');
    expect(chat.bundle.promptEntries?.[0]).toMatchObject({ modelName: 'Codex', prompt: 'Erkläre Little’s Law.', response: 'Little’s Law verbindet Bestand, Durchsatz und Zeit.' });

    const timeline = parseRawTextImport('18.08.2026 08:00–09:30 | Literatur prüfen | Kapitel 2\n2026-08-19 10:00-10:45 – Fazit schreiben');
    expect(timeline.bundle.journalEntries?.map((entry) => [entry.title, entry.workingTimeMs])).toEqual([
      ['Literatur prüfen', 90 * 60 * 1000], ['Fazit schreiben', 45 * 60 * 1000]
    ]);

    const tasks = parseRawTextImport('☐ Recherche (fällig: 31.08.2026)\n☑ Thema festlegen');
    expect(tasks.bundle.plannerTasks?.map((task) => [task.title, task.completed, task.dueDate])).toEqual([
      ['Recherche', false, '2026-08-31'], ['Thema festlegen', true, undefined]
    ]);
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
    expect(parsed.bundle.journalEntries?.map((entry) => entry.title)).toEqual(['', '', '', '']);
    expect(parsed.bundle.journalEntries?.[0].notes).toBe("**Handlung:** Erste Recherche, Little's Law aufgefunden.");
    expect(parsed.bundle.journalEntries?.[1].notes).toBe('**Handlung:** Brainstorming Projektanforderungen.\n\n**Erkenntnisse:**\n\n- Warnung bei nicht 100%-Effizienz in die Soll-Kategorie.\n\n- In-Game-Modeler ist kompliziert, aber möglich.');
    expect(parsed.bundle.journalEntries?.[2].notes).toBe('Schreiben an der MAR: Vorwort, Einleitung.');
    expect(parsed.bundle.journalEntries?.[3]).toMatchObject({
      notes: '**Handlung:**\n\n- Abbildung zur Referenz hinzugefügt\n\n- Grober Plan für Indikatoren erstellt', workingTimeMs: 0, pausedTimeMs: 0
    });
    for (const [index, date] of ['2026-02-17', '2026-04-04', '2026-05-12', '2026-06-05'].entries()) {
      const startedAt = new Date(parsed.bundle.journalEntries?.[index].startedAt ?? '');
      expect([startedAt.getFullYear(), startedAt.getMonth() + 1, startedAt.getDate()].join('-')).toBe(date.replace(/-0/g, '-'));
      expect(parsed.bundle.journalEntries?.[index].endedAt).toBe(parsed.bundle.journalEntries?.[index].startedAt);
    }
  });

  it('uses only an explicit Markdown title label as a journal title', () => {
    const parsed = parseRawTextImport('## 18.08.2026\nTitel: Quellenarbeit\nDie Literatur wurde überprüft.');
    expect(parsed.bundle.journalEntries?.[0]).toMatchObject({ title: 'Quellenarbeit', notes: 'Die Literatur wurde überprüft.' });
  });
});
