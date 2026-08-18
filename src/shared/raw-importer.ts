import { ImportValidationError, parseImport, type ImportBundle } from './importers';
import type { JournalEntry, PlannerTask } from './models';
import type { PromptEntryInput } from './prompt-entries';

export interface RawImportResult {
  bundle: ImportBundle;
  detectedFormat: string;
}

type Row = Record<string, string>;

const headerAliases = {
  id: ['id'],
  title: ['titel', 'title', 'aktivitaet', 'aktivitat', 'aufgabe', 'task'],
  description: ['beschreibung', 'description', 'details', 'notizen', 'notes'],
  notes: ['notizen', 'notes', 'bemerkungen', 'kommentar'],
  start: ['start', 'beginn', 'startzeit', 'gestartet'],
  end: ['ende', 'end', 'endzeit', 'beendet'],
  work: ['arbeitszeit', 'arbeitszeitms', 'dauer', 'duration', 'dauerinminuten', 'minuten'],
  pause: ['pausenzeit', 'pausenzeitms', 'pause', 'break'],
  due: ['faelligam', 'falligam', 'faellig', 'fallig', 'duedate', 'deadline', 'termin'],
  status: ['status', 'erledigt', 'completed', 'done'],
  created: ['erstellt', 'created', 'createdat', 'datum', 'zeitpunkt', 'date'],
  model: ['modell', 'model', 'kimodell', 'aimodel'],
  prompt: ['prompt', 'eingabe', 'anfrage', 'frage'],
  response: ['antwort', 'response', 'ausgabe', 'ergebnis'],
  number: ['nummer', 'number', 'nr']
} as const;

const normalize = (value: string) => value.trim().toLocaleLowerCase('de')
  .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
  .replace(/[^a-z0-9]/g, '');

const valueFor = (row: Row, aliases: readonly string[]) => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined) return value.trim();
  }
  return '';
};

function parseDelimited(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function tableRows(content: string): { rows: Row[]; delimiterName: string } | null {
  const options = [
    { delimiter: '\t', name: 'Tabellenwerte (TSV)' },
    { delimiter: ';', name: 'Tabelle mit Semikolon' },
    { delimiter: ',', name: 'Tabelle mit Komma (CSV)' }
  ].map((option) => ({ ...option, parsed: parseDelimited(content, option.delimiter) }))
    .filter((option) => option.parsed.length >= 2 && option.parsed[0].length >= 2)
    .sort((a, b) => b.parsed[0].length - a.parsed[0].length);
  const best = options[0];
  if (!best) return null;
  const headers = best.parsed[0].map(normalize);
  if (new Set(headers).size !== headers.length) return null;
  return {
    delimiterName: best.name,
    rows: best.parsed.slice(1).filter((cells) => cells.some((cell) => cell.trim())).map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
  };
}

function parseDate(value: string, label: string): string {
  const trimmed = value.trim();
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/.exec(trimmed);
  const candidate = swiss
    ? new Date(Number(swiss[3]), Number(swiss[2]) - 1, Number(swiss[1]), Number(swiss[4] ?? 0), Number(swiss[5] ?? 0))
    : new Date(trimmed);
  if (Number.isNaN(candidate.getTime())) throw new ImportValidationError('UNSUPPORTED_FILE', `${label} „${value}“ ist kein gültiges Datum.`);
  return candidate.toISOString();
}

function parseDueDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : swiss ? [Number(swiss[3]), Number(swiss[2]), Number(swiss[1])] : null;
  if (!parts) return parseDate(trimmed, 'Das Fälligkeitsdatum').slice(0, 10);
  const [year, month, day] = parts;
  const checked = new Date(Date.UTC(year, month - 1, day));
  if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) {
    throw new ImportValidationError('UNSUPPORTED_FILE', `Das Fälligkeitsdatum „${value}“ ist ungültig.`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDuration(value: string, header: string): number | undefined {
  if (!value.trim()) return undefined;
  const plain = value.trim().replace(',', '.');
  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(plain);
  if (clock) return ((Number(clock[1]) * 60 + Number(clock[2])) * 60 + Number(clock[3] ?? 0)) * 1000;
  const amount = Number.parseFloat(plain);
  if (!Number.isFinite(amount) || amount < 0) throw new ImportValidationError('UNSUPPORTED_FILE', `Die Dauer „${value}“ konnte nicht gelesen werden.`);
  if (header.includes('ms')) return amount;
  if (/\b(?:h|std|stunde)/i.test(value)) return amount * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

const importedId = (value: string) => value.trim() || crypto.randomUUID();
const timestampFor = (value: string, index: number) => value ? parseDate(value, 'Das Erstellungsdatum') : new Date(Date.now() + index).toISOString();

function parseCompleted(value: string): boolean {
  return /^(?:1|ja|true|x|done|erledigt|abgeschlossen)$/i.test(value.trim());
}

function recognizeTable(content: string): RawImportResult | null {
  const table = tableRows(content);
  if (!table || table.rows.length === 0) return null;
  const headers = Object.keys(table.rows[0]);
  const has = (aliases: readonly string[]) => aliases.some((alias) => headers.includes(alias));

  if (has(headerAliases.prompt) && (has(headerAliases.response) || has(headerAliases.model))) {
    const entries: PromptEntryInput[] = table.rows.map((row, index) => {
      const prompt = valueFor(row, headerAliases.prompt);
      if (!prompt) throw new ImportValidationError('UNSUPPORTED_FILE', `In Zeile ${index + 2} fehlt der Prompt.`);
      const numberValue = Number(valueFor(row, headerAliases.number));
      return {
        id: importedId(valueFor(row, headerAliases.id)),
        ...(Number.isInteger(numberValue) && numberValue > 0 ? { number: numberValue } : {}),
        title: valueFor(row, headerAliases.title) || undefined,
        modelName: valueFor(row, headerAliases.model) || 'Unbekannt',
        prompt,
        response: valueFor(row, headerAliases.response),
        createdAt: timestampFor(valueFor(row, headerAliases.created), index)
      };
    });
    return { detectedFormat: `${table.delimiterName} · Promptprotokoll`, bundle: { kind: 'prompts', promptEntries: entries, counts: { prompts: entries.length }, formatVersion: 0, legacy: true } };
  }

  if (has(headerAliases.start) && (has(headerAliases.end) || has(headerAliases.work)) && has(headerAliases.title)) {
    const workHeader = headers.find((header) => headerAliases.work.includes(header as never)) ?? '';
    const pauseHeader = headers.find((header) => headerAliases.pause.includes(header as never)) ?? '';
    const entries: JournalEntry[] = table.rows.map((row, index) => {
      const title = valueFor(row, headerAliases.title);
      const startedAt = parseDate(valueFor(row, headerAliases.start), `Der Start in Zeile ${index + 2}`);
      const pause = parseDuration(valueFor(row, headerAliases.pause), pauseHeader) ?? 0;
      const givenWork = parseDuration(valueFor(row, headerAliases.work), workHeader);
      const endValue = valueFor(row, headerAliases.end);
      const endedAt = endValue ? parseDate(endValue, `Das Ende in Zeile ${index + 2}`) : new Date(Date.parse(startedAt) + (givenWork ?? 0) + pause).toISOString();
      if (!title || Date.parse(endedAt) < Date.parse(startedAt)) throw new ImportValidationError('UNSUPPORTED_FILE', `Der Journaleintrag in Zeile ${index + 2} ist unvollständig.`);
      return { id: importedId(valueFor(row, headerAliases.id)), title, notes: valueFor(row, headerAliases.notes) || undefined, startedAt, endedAt, workingTimeMs: givenWork ?? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt) - pause), pausedTimeMs: pause };
    });
    return { detectedFormat: `${table.delimiterName} · Arbeitsjournal`, bundle: { kind: 'journal', journalEntries: entries, counts: { journal: entries.length }, formatVersion: 0, legacy: true } };
  }

  if (has(headerAliases.title) && (has(headerAliases.due) || has(headerAliases.status) || has(headerAliases.description))) {
    const tasks: PlannerTask[] = table.rows.map((row, index) => {
      const title = valueFor(row, headerAliases.title);
      if (!title) throw new ImportValidationError('UNSUPPORTED_FILE', `In Zeile ${index + 2} fehlt der Titel.`);
      return {
        id: importedId(valueFor(row, headerAliases.id)), title,
        description: valueFor(row, headerAliases.description) || undefined,
        dueDate: parseDueDate(valueFor(row, headerAliases.due)),
        completed: parseCompleted(valueFor(row, headerAliases.status)),
        createdAt: timestampFor(valueFor(row, headerAliases.created), index)
      };
    });
    return { detectedFormat: `${table.delimiterName} · Zeitplan`, bundle: { kind: 'planner', plannerTasks: tasks, counts: { planner: tasks.length }, formatVersion: 0, legacy: true } };
  }
  return null;
}

function recognizePromptBlocks(content: string): RawImportResult | null {
  const lines = content.split(/\r?\n/);
  const entries: PromptEntryInput[] = [];
  let current: Partial<PromptEntryInput> | null = null;
  let active: 'prompt' | 'response' | null = null;
  let pendingTitle = '';
  const finish = () => {
    if (!current?.prompt?.trim()) return;
    entries.push({
      id: crypto.randomUUID(), title: current.title?.trim() || pendingTitle || undefined,
      modelName: current.modelName?.trim() || 'Unbekannt', prompt: current.prompt.trim(), response: current.response?.trim() ?? '',
      createdAt: current.createdAt ?? new Date(Date.now() + entries.length).toISOString()
    });
    current = null; active = null; pendingTitle = '';
  };
  for (const line of lines) {
    if (/^---+$/.test(line.trim())) { finish(); continue; }
    const heading = /^#{1,3}\s+#?\d+(?:\s*[–-]\s*(.+))?\s*$/.exec(line.trim());
    if (heading) { finish(); pendingTitle = heading[1]?.trim() ?? ''; continue; }
    if (/^#{1,4}\s+(?:codeänderungen|dateien|diff)\s*$/i.test(line.trim())) { active = null; continue; }
    const label = /^(?:#{1,4}\s*)?(?:\*\*)?(prompt|eingabe|anfrage|antwort|response|ausgabe|modell|model|titel|title|zeitpunkt|datum)(?:\s*:\s*(?:\*\*)?\s*(.*)|\s*(?:\*\*)?\s*)$/i.exec(line.trim());
    if (label) {
      const key = normalize(label[1]);
      const rest = (label[2] ?? '').replace(/\s{2,}$/, '').trim();
      if (key === 'prompt' || key === 'eingabe' || key === 'anfrage') {
        if (current?.prompt) finish();
        current ??= {}; current.prompt = rest; active = 'prompt';
      } else if (key === 'antwort' || key === 'response' || key === 'ausgabe') {
        current ??= {}; current.response = rest; active = 'response';
      } else {
        current ??= {};
        if (key === 'modell' || key === 'model') current.modelName = rest;
        else if (key === 'titel' || key === 'title') current.title = rest;
        else if (rest) current.createdAt = parseDate(rest, 'Der Zeitpunkt');
        active = null;
      }
    } else if (current && active) {
      current[active] = `${current[active] ?? ''}${current[active] ? '\n' : ''}${line}`;
    }
  }
  finish();
  if (entries.length === 0) return null;
  return { detectedFormat: 'Beschrifteter Text · Promptprotokoll', bundle: { kind: 'prompts', promptEntries: entries, counts: { prompts: entries.length }, formatVersion: 0, legacy: true } };
}

const normalizeJournalMarkdown = (content: string) => content
  .replace(/(?:&#x20;|&#32;|&nbsp;)/gi, ' ')
  .replace(/\\([#*_.-])/g, '$1')
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .join('\n');

function journalDateTimestamp(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ImportValidationError('UNSUPPORTED_FILE', `Das Journaldatum „${value}“ ist ungültig.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ImportValidationError('UNSUPPORTED_FILE', `Das Journaldatum „${value}“ ist ungültig.`);
  }
  return date.toISOString();
}

const journalLabel = (line: string) => /^\s*(?:\*\*)?\s*([^*:]+?)\s*:\s*(?:\*\*)?\s*(.*)$/.exec(line.trim());
const isJournalSectionLabel = (line: string) => {
  const label = journalLabel(line);
  return !!label && /^(?:handlung|erkenntnisse|merke|ziel|naechsteschritte)/.test(normalize(label[1]));
};
const cleanJournalTitle = (line: string) => line.trim()
  .replace(/^[-*+]\s+/, '')
  .replace(/^\d+\.\s+/, '')
  .replace(/\*\*/g, '')
  .trim();

function recognizeJournalDateBlocks(content: string): RawImportResult | null {
  const lines = normalizeJournalMarkdown(content).split('\n');
  const sections: Array<{ date: string; lines: string[] }> = [];
  let current: { date: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = /^\s*#{1,6}\s+(\d{4}-\d{2}-\d{2})\s*:?\s*$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { date: heading[1], lines: [] };
    } else if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  if (sections.length === 0) return null;

  const entries = sections.map((section): JournalEntry => {
    const contentLines = [...section.lines];
    let title = '';
    let titleLine = -1;
    const actionLine = contentLines.findIndex((line) => {
      const label = journalLabel(line);
      return !!label && normalize(label[1]).startsWith('handlung');
    });

    if (actionLine >= 0) {
      const inlineAction = journalLabel(contentLines[actionLine])?.[2] ?? '';
      title = cleanJournalTitle(inlineAction);
      titleLine = actionLine;
      if (!title) {
        titleLine = contentLines.findIndex((line, index) => index > actionLine && !!cleanJournalTitle(line) && !isJournalSectionLabel(line));
        if (titleLine >= 0) title = cleanJournalTitle(contentLines[titleLine]);
      }
    }
    if (!title) {
      titleLine = contentLines.findIndex((line) => !!cleanJournalTitle(line) && !isJournalSectionLabel(line));
      if (titleLine >= 0) title = cleanJournalTitle(contentLines[titleLine]);
    }
    if (!title) title = `Arbeitsjournal ${section.date}`;

    const notes = contentLines
      .filter((_line, index) => index !== titleLine && index !== actionLine)
      .join('\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\n{3,}/g, '\n\n');
    const timestamp = journalDateTimestamp(section.date);
    return {
      id: crypto.randomUUID(),
      title,
      notes: notes || undefined,
      startedAt: timestamp,
      endedAt: timestamp,
      workingTimeMs: 0,
      pausedTimeMs: 0
    };
  });

  return {
    detectedFormat: 'Markdown-Datumsblöcke · Arbeitsjournal',
    bundle: { kind: 'journal', journalEntries: entries, counts: { journal: entries.length }, formatVersion: 0, legacy: true }
  };
}

function recognizeTaskList(content: string): RawImportResult | null {
  const matches = [...content.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/gm)];
  if (matches.length === 0) return null;
  const tasks = matches.map((match, index): PlannerTask => {
    const parts = match[2].split(/\s+\|\s+/);
    return {
      id: crypto.randomUUID(), title: parts[0].trim(), dueDate: parts[1] ? parseDueDate(parts[1]) : undefined,
      completed: match[1].toLocaleLowerCase() === 'x', createdAt: new Date(Date.now() + index).toISOString()
    };
  });
  return { detectedFormat: 'Markdown-Aufgabenliste · Zeitplan', bundle: { kind: 'planner', plannerTasks: tasks, counts: { planner: tasks.length }, formatVersion: 0, legacy: true } };
}

export function parseRawTextImport(content: string): RawImportResult {
  const text = content.replace(/^\uFEFF/, '').trim();
  if (!text) throw new ImportValidationError('UNSUPPORTED_FILE', 'Füge zuerst Daten in das Textfeld ein.');
  if (text.startsWith('{') || text.startsWith('[')) {
    try { return { bundle: parseImport(text), detectedFormat: 'MAR-Helper-JSON' }; }
    catch (error) {
      if (error instanceof ImportValidationError && error.code !== 'INVALID_JSON') throw error;
    }
  }
  const result = recognizeTable(text) ?? recognizeJournalDateBlocks(text) ?? recognizePromptBlocks(text) ?? recognizeTaskList(text);
  if (result) return result;
  throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Daten konnten nicht eindeutig erkannt werden. Nutze eine Tabelle mit Überschriften, datierte Journal-Blöcke, beschriftete Prompt-/Antwort-Blöcke oder eine Markdown-Aufgabenliste.');
}
