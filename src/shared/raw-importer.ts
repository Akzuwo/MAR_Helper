import { ImportValidationError, parseImport, type ImportBundle } from './importers';
import type { JournalEntry, PlannerTask } from './models';
import type { PromptEntryInput } from './prompt-entries';

export interface RawImportResult {
  bundle: ImportBundle;
  detectedFormat: string;
}

type Row = Record<string, string>;
type UnknownRecord = Record<string, unknown>;

const headerAliases = {
  id: ['id', 'uuid', 'kennung'],
  title: ['titel', 'title', 'aktivitaet', 'aktivitat', 'activity', 'handlung', 'aufgabe', 'task', 'todo', 'name', 'betreff', 'subject'],
  description: ['beschreibung', 'description', 'details', 'detail', 'notizen', 'notes', 'inhalt', 'content'],
  notes: ['notizen', 'notes', 'bemerkungen', 'bemerkung', 'kommentar', 'comment', 'beschreibung', 'description', 'details'],
  start: ['start', 'beginn', 'startzeit', 'gestartet', 'started', 'startedat', 'von', 'from'],
  end: ['ende', 'end', 'endzeit', 'beendet', 'ended', 'endedat', 'bis', 'to'],
  work: ['arbeitszeit', 'arbeitszeitms', 'worktime', 'worktimems', 'dauer', 'duration', 'durationms', 'dauerinminuten', 'minuten'],
  pause: ['pausenzeit', 'pausenzeitms', 'pause', 'break', 'breaktime', 'breaktimems'],
  due: ['faelligam', 'falligam', 'faellig', 'fallig', 'duedate', 'due', 'deadline', 'termin', 'zieldatum'],
  status: ['status', 'erledigt', 'completed', 'done', 'abgeschlossen', 'state'],
  created: ['erstellt', 'created', 'createdat', 'datum', 'zeitpunkt', 'date', 'timestamp', 'time'],
  model: ['modell', 'model', 'modellname', 'modelname', 'kimodell', 'aimodel', 'llm'],
  prompt: ['prompt', 'eingabe', 'input', 'anfrage', 'request', 'frage', 'question', 'anweisung', 'instruction', 'userprompt'],
  response: ['antwort', 'answer', 'response', 'ausgabe', 'output', 'ergebnis', 'completion'],
  number: ['nummer', 'number', 'nr', 'eintragsnummer']
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
  const pipeLines = content.split(/\r?\n/).filter((line) => line.trim());
  if (pipeLines.length >= 3 && /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(pipeLines[1])) {
    const splitPipe = (line: string) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
    const headers = splitPipe(pipeLines[0]).map(normalize);
    if (headers.length >= 2 && new Set(headers).size === headers.length) {
      return {
        delimiterName: 'Markdown-Tabelle',
        rows: pipeLines.slice(2).map(splitPipe).filter((cells) => cells.some(Boolean)).map((cells) =>
          Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
      };
    }
  }
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
  const local = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  const candidate = local
    ? new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]), Number(local[4] ?? 0), Number(local[5] ?? 0), Number(local[6] ?? 0))
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
  const units = [...plain.matchAll(/(\d+(?:\.\d+)?)\s*(?:d|tag(?:e)?|h|std\.?|stunde(?:n)?|m|min\.?|minute(?:n)?|s|sek\.?|sekunde(?:n)?)/gi)];
  if (units.length > 0) {
    return units.reduce((total, match) => {
      const amount = Number(match[1]);
      const unit = match[0].slice(match[1].length).trim().toLocaleLowerCase('de');
      if (/^(?:d|tag)/.test(unit)) return total + amount * 24 * 60 * 60 * 1000;
      if (/^(?:h|std|stunde)/.test(unit)) return total + amount * 60 * 60 * 1000;
      if (/^(?:s|sek)/.test(unit)) return total + amount * 1000;
      return total + amount * 60 * 1000;
    }, 0);
  }
  const amount = Number.parseFloat(plain);
  if (!Number.isFinite(amount) || amount < 0) throw new ImportValidationError('UNSUPPORTED_FILE', `Die Dauer „${value}“ konnte nicht gelesen werden.`);
  if (header.includes('ms')) return amount;
  if (/\b(?:h|std|stunde)/i.test(value)) return amount * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

const importedId = (value: string) => value.trim() || crypto.randomUUID();
const timestampFor = (value: string, index: number) => value ? parseDate(value, 'Das Erstellungsdatum') : new Date(Date.now() + index).toISOString();

function parseCompleted(value: string): boolean {
  return /^(?:1|ja|true|x|done|erledigt|abgeschlossen|fertig|completed|closed|✓|☑)$/i.test(value.trim());
}

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const normalizedRecord = (value: UnknownRecord): Record<string, unknown> => Object.fromEntries(
  Object.entries(value).map(([key, item]) => [normalize(key), item])
);
const unknownFor = (record: Record<string, unknown>, aliases: readonly string[]) => {
  for (const alias of aliases) if (record[alias] !== undefined && record[alias] !== null) return record[alias];
  return undefined;
};
const stringValue = (value: unknown): string => typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const jsonStringFor = (record: Record<string, unknown>, aliases: readonly string[]) => stringValue(unknownFor(record, aliases));

function timePoint(value: string, dateValue: string, label: string): string {
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim()) && dateValue) {
    const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateValue.trim());
    const localDate = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(dateValue.trim());
    const parts = isoDate
      ? [Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])]
      : localDate ? [Number(localDate[3]), Number(localDate[2]), Number(localDate[1])] : null;
    if (parts) {
      const time = value.trim().split(':').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2], time[0], time[1], time[2] ?? 0).toISOString();
    }
  }
  return parseDate(value || dateValue, label);
}

function jsonCollection(value: unknown): { records: UnknownRecord[]; hint: string } | null {
  if (Array.isArray(value) && value.length > 0 && value.every(isRecord)) return { records: value, hint: '' };
  if (!isRecord(value)) return null;
  const record = normalizedRecord(value);
  for (const key of ['journalentries', 'promptentries', 'plannertasks', 'entries', 'records', 'items', 'logs', 'data']) {
    const candidate = record[key];
    if (Array.isArray(candidate) && candidate.length > 0 && candidate.every(isRecord)) return { records: candidate, hint: key };
  }
  return null;
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';
  const record = normalizedRecord(value);
  const direct = stringValue(record.text ?? record.content ?? record.message);
  if (direct) return direct;
  const parts = isRecord(record.content) ? normalizedRecord(record.content).parts : record.parts;
  return Array.isArray(parts) ? parts.map((part) => stringValue(part)).filter(Boolean).join('\n') : '';
}

function recognizeJsonMessages(value: unknown): RawImportResult | null {
  const root = isRecord(value) ? normalizedRecord(value) : null;
  const candidates = Array.isArray(value) ? value : root && Array.isArray(root.messages) ? root.messages : null;
  if (!candidates || candidates.length < 2 || !candidates.every(isRecord)) return null;
  const messages = candidates.map((item) => normalizedRecord(item));
  if (!messages.every((message) => typeof message.role === 'string' || typeof message.author === 'string')) return null;
  const entries: PromptEntryInput[] = [];
  let pending: { prompt: string; createdAt?: string } | null = null;
  for (const [index, message] of messages.entries()) {
    const roleValue = isRecord(message.author) ? normalizedRecord(message.author).role : message.role ?? message.author;
    const role = normalize(stringValue(roleValue));
    const text = messageText(message);
    if (!text) continue;
    if (/^(?:user|human|nutzer|benutzer)$/.test(role)) {
      if (pending) entries.push({ id: crypto.randomUUID(), modelName: jsonStringFor(root ?? {}, headerAliases.model) || 'Unbekannt', prompt: pending.prompt, response: '', createdAt: pending.createdAt ?? new Date(Date.now() + index).toISOString() });
      const rawTime = stringValue(message.createdat ?? message.timestamp ?? message.time);
      pending = { prompt: text, createdAt: rawTime ? parseDate(rawTime, 'Der Nachrichtenzeitpunkt') : undefined };
    } else if (/^(?:assistant|ai|ki|chatgpt|claude|codex|model)$/.test(role) && pending) {
      entries.push({
        id: crypto.randomUUID(),
        modelName: jsonStringFor(message, headerAliases.model) || jsonStringFor(root ?? {}, headerAliases.model) || (/^(?:assistant|ai|ki|model)$/.test(role) ? 'Unbekannt' : stringValue(roleValue)),
        prompt: pending.prompt, response: text,
        createdAt: pending.createdAt ?? new Date(Date.now() + index).toISOString()
      });
      pending = null;
    }
  }
  if (pending) entries.push({ id: crypto.randomUUID(), modelName: jsonStringFor(root ?? {}, headerAliases.model) || 'Unbekannt', prompt: pending.prompt, response: '', createdAt: pending.createdAt ?? new Date().toISOString() });
  if (entries.length === 0) return null;
  return { detectedFormat: 'Chat-Nachrichten (JSON) · Promptprotokoll', bundle: { kind: 'prompts', promptEntries: entries, counts: { prompts: entries.length }, formatVersion: 0, legacy: true } };
}

function recognizeStructuredJson(value: unknown): RawImportResult | null {
  const messages = recognizeJsonMessages(value);
  if (messages) return messages;
  const collection = jsonCollection(value);
  if (!collection) return null;
  const rows = collection.records.map(normalizedRecord);
  const scores = rows.map((row) => {
    const has = (aliases: readonly string[]) => unknownFor(row, aliases) !== undefined;
    const sessions = unknownFor(row, ['sessions', 'sitzungen', 'intervals', 'periods', 'timeentries']);
    return {
      journal: (Array.isArray(sessions) ? 6 : 0) + (has(headerAliases.start) ? 3 : 0) + (has(headerAliases.end) ? 2 : 0) + (has(headerAliases.work) ? 2 : 0) + (has(headerAliases.created) && has(headerAliases.title) ? 1 : 0),
      prompts: (has(headerAliases.prompt) ? 6 : 0) + (has(headerAliases.response) ? 3 : 0) + (has(headerAliases.model) ? 1 : 0),
      planner: (has(headerAliases.due) ? 4 : 0) + (has(headerAliases.status) ? 4 : 0) + (has(headerAliases.title) ? 1 : 0)
    };
  });
  const totals = scores.reduce((sum, score) => ({ journal: sum.journal + score.journal, prompts: sum.prompts + score.prompts, planner: sum.planner + score.planner }), { journal: 0, prompts: 0, planner: 0 });
  const ranked = (Object.entries(totals) as Array<[keyof typeof totals, number]>).sort((a, b) => b[1] - a[1]);
  const kind = ranked[0][0];
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return null;

  if (kind === 'journal') {
    const entries = rows.map((row, index): JournalEntry => {
      const title = jsonStringFor(row, headerAliases.title);
      if (!title) throw new ImportValidationError('UNSUPPORTED_FILE', `Beim JSON-Journaleintrag ${index + 1} fehlt ein Titel.`);
      const dateValue = jsonStringFor(row, ['date', 'datum', 'day', 'tag']);
      const rawSessions = unknownFor(row, ['sessions', 'sitzungen', 'intervals', 'periods', 'timeentries']);
      const sessions = Array.isArray(rawSessions) ? rawSessions.filter(isRecord).map(normalizedRecord) : [];
      const periods = sessions.map((session, sessionIndex) => {
        const start = jsonStringFor(session, headerAliases.start);
        const end = jsonStringFor(session, headerAliases.end);
        if (!start || !end) throw new ImportValidationError('UNSUPPORTED_FILE', `Sitzung ${sessionIndex + 1} in JSON-Journaleintrag ${index + 1} hat keine vollständige Zeitspanne.`);
        const startedAt = timePoint(start, dateValue, 'Der Sitzungsstart');
        const endedAt = timePoint(end, dateValue, 'Das Sitzungsende');
        if (Date.parse(endedAt) < Date.parse(startedAt)) throw new ImportValidationError('UNSUPPORTED_FILE', `Sitzung ${sessionIndex + 1} endet vor ihrem Start.`);
        return { startedAt, endedAt };
      }).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
      const directStart = jsonStringFor(row, headerAliases.start);
      const directEnd = jsonStringFor(row, headerAliases.end);
      const workHeader = Object.keys(row).find((key) => headerAliases.work.includes(key as never)) ?? '';
      const pauseHeader = Object.keys(row).find((key) => headerAliases.pause.includes(key as never)) ?? '';
      const givenWork = parseDuration(jsonStringFor(row, headerAliases.work), workHeader);
      const givenPause = parseDuration(jsonStringFor(row, headerAliases.pause), pauseHeader);
      let startedAt = periods[0]?.startedAt ?? (directStart ? timePoint(directStart, dateValue, 'Der Start') : timePoint(dateValue, '', 'Das Journaldatum'));
      let endedAt = periods.at(-1)?.endedAt ?? (directEnd ? timePoint(directEnd, dateValue, 'Das Ende') : startedAt);
      const sessionWork = periods.reduce((total, period) => total + Date.parse(period.endedAt) - Date.parse(period.startedAt), 0);
      let workingTimeMs = givenWork ?? (periods.length > 0 ? sessionWork : Math.max(0, Date.parse(endedAt) - Date.parse(startedAt) - (givenPause ?? 0)));
      const pausedTimeMs = givenPause ?? (periods.length > 0 ? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt) - sessionWork) : 0);
      if (!directEnd && periods.length === 0 && givenWork !== undefined) endedAt = new Date(Date.parse(startedAt) + givenWork + pausedTimeMs).toISOString();
      if (Date.parse(endedAt) < Date.parse(startedAt)) throw new ImportValidationError('UNSUPPORTED_FILE', `JSON-Journaleintrag ${index + 1} endet vor seinem Start.`);
      workingTimeMs = Math.max(0, workingTimeMs);
      return { id: importedId(jsonStringFor(row, headerAliases.id)), title, notes: jsonStringFor(row, headerAliases.notes) || undefined, startedAt, endedAt, workingTimeMs, pausedTimeMs };
    });
    return { detectedFormat: `Strukturiertes JSON${collection.hint === 'entries' ? ' mit Einträgen' : ''} · Arbeitsjournal`, bundle: { kind: 'journal', journalEntries: entries, counts: { journal: entries.length }, formatVersion: 0, legacy: true } };
  }

  if (kind === 'prompts') {
    const entries = rows.map((row, index): PromptEntryInput => {
      const prompt = jsonStringFor(row, headerAliases.prompt);
      if (!prompt) throw new ImportValidationError('UNSUPPORTED_FILE', `Beim JSON-Prompt ${index + 1} fehlt die Eingabe.`);
      const number = Number(jsonStringFor(row, headerAliases.number));
      return {
        id: importedId(jsonStringFor(row, headerAliases.id)),
        ...(Number.isInteger(number) && number > 0 ? { number } : {}),
        title: jsonStringFor(row, headerAliases.title) || undefined,
        modelName: jsonStringFor(row, headerAliases.model) || 'Unbekannt', prompt,
        response: jsonStringFor(row, headerAliases.response),
        createdAt: timestampFor(jsonStringFor(row, headerAliases.created), index)
      };
    });
    return { detectedFormat: 'Strukturiertes JSON · Promptprotokoll', bundle: { kind: 'prompts', promptEntries: entries, counts: { prompts: entries.length }, formatVersion: 0, legacy: true } };
  }

  const tasks = rows.map((row, index): PlannerTask => {
    const title = jsonStringFor(row, headerAliases.title);
    if (!title) throw new ImportValidationError('UNSUPPORTED_FILE', `Beim JSON-Task ${index + 1} fehlt der Titel.`);
    const completed = unknownFor(row, headerAliases.status);
    return {
      id: importedId(jsonStringFor(row, headerAliases.id)), title,
      description: jsonStringFor(row, headerAliases.description) || undefined,
      dueDate: parseDueDate(jsonStringFor(row, headerAliases.due)),
      completed: typeof completed === 'boolean' ? completed : parseCompleted(stringValue(completed)),
      createdAt: timestampFor(jsonStringFor(row, headerAliases.created), index)
    };
  });
  return { detectedFormat: 'Strukturiertes JSON · Zeitplan', bundle: { kind: 'planner', plannerTasks: tasks, counts: { planner: tasks.length }, formatVersion: 0, legacy: true } };
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
    const label = /^(?:#{1,4}\s*)?(?:\*\*)?(prompt|eingabe|input|anfrage|request|frage|question|anweisung|instruction|user|nutzer|benutzer|human|antwort|answer|response|ausgabe|output|assistant|ki|chatgpt|claude|codex|modell|model|titel|title|zeitpunkt|datum|date|system)(?:\s*:\s*(?:\*\*)?\s*(.*)|\s*(?:\*\*)?\s*)$/i.exec(line.trim());
    if (label) {
      const key = normalize(label[1]);
      const rest = (label[2] ?? '').replace(/\s{2,}$/, '').trim();
      if (/^(?:prompt|eingabe|input|anfrage|request|frage|question|anweisung|instruction|user|nutzer|benutzer|human)$/.test(key)) {
        if (current?.prompt) finish();
        current ??= {}; current.prompt = rest; active = 'prompt';
      } else if (/^(?:antwort|answer|response|ausgabe|output|assistant|ki|chatgpt|claude|codex)$/.test(key)) {
        current ??= {}; current.response = rest; active = 'response';
        if (/^(?:chatgpt|claude|codex)$/.test(key) && !current.modelName) current.modelName = label[1];
      } else {
        current ??= {};
        if (key === 'modell' || key === 'model') current.modelName = rest;
        else if (key === 'titel' || key === 'title') current.title = rest;
        else if (/^(?:zeitpunkt|datum|date)$/.test(key) && rest) current.createdAt = parseDate(rest, 'Der Zeitpunkt');
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
  return parseDate(value, 'Das Journaldatum');
}

const journalLabel = (line: string) => /^\s*(?:\*\*)?\s*([^*:]+?)\s*:\s*(?:\*\*)?\s*(.*)$/.exec(line.trim());
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
    const heading = /^\s*#{1,6}\s+((?:\d{4}-\d{1,2}-\d{1,2})|(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}))\s*:?\s*$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { date: heading[1], lines: [] };
    } else if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  if (sections.length === 0) return null;

  const entries = sections.map((section): JournalEntry => {
    const contentLines = [...section.lines];
    const titleLine = contentLines.findIndex((line) => {
      const label = journalLabel(line);
      return !!label && /^(?:titel|title|aktivitaet|activity)$/.test(normalize(label[1]));
    });
    const title = titleLine >= 0 ? cleanJournalTitle(journalLabel(contentLines[titleLine])?.[2] ?? '') : '';

    const notes = contentLines
      .filter((_line, index) => index !== titleLine)
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
  const matches = [...content.matchAll(/^\s*(?:[-*+]\s+)?(?:\[([ xX])\]|([☐☑✓]))\s+(.+?)\s*$/gm)];
  if (matches.length === 0) return null;
  const tasks = matches.map((match, index): PlannerTask => {
    const raw = match[3].trim();
    const dueLabel = /(?:\s*[|·–-]\s*|\s*\((?:fällig|faellig|due)\s*:\s*)(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})\)?\s*$/i.exec(raw);
    const title = dueLabel ? raw.slice(0, dueLabel.index).trim() : raw;
    return {
      id: crypto.randomUUID(), title, dueDate: dueLabel ? parseDueDate(dueLabel[1]) : undefined,
      completed: (match[1] ?? match[2]).toLocaleLowerCase() !== ' ' && !/^(?:☐)$/.test(match[2] ?? ''), createdAt: new Date(Date.now() + index).toISOString()
    };
  });
  return { detectedFormat: 'Markdown-Aufgabenliste · Zeitplan', bundle: { kind: 'planner', plannerTasks: tasks, counts: { planner: tasks.length }, formatVersion: 0, legacy: true } };
}

function recognizeJournalTimeline(content: string): RawImportResult | null {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const pattern = /^(?:[-*]\s*)?\[?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})[,\s|]+(\d{1,2}:\d{2})(?:\s*(?:-|–|—|bis)\s*)(\d{1,2}:\d{2})\]?\s*(?:[|:;–—-]\s*)?(.+)$/i;
  const matches = lines.map((line) => pattern.exec(line));
  if (matches.length === 0 || matches.some((match) => !match)) return null;
  const entries = matches.map((match, index): JournalEntry => {
    const [, date, start, end, remainder] = match!;
    const parts = remainder.split(/\s+\|\s+/);
    const startedAt = timePoint(start, date, `Der Start in Zeile ${index + 1}`);
    const endedAt = timePoint(end, date, `Das Ende in Zeile ${index + 1}`);
    if (Date.parse(endedAt) < Date.parse(startedAt)) throw new ImportValidationError('UNSUPPORTED_FILE', `Die Zeitspanne in Zeile ${index + 1} ist ungültig.`);
    return {
      id: crypto.randomUUID(), title: parts[0].trim(), notes: parts.slice(1).join(' | ').trim() || undefined,
      startedAt, endedAt, workingTimeMs: Date.parse(endedAt) - Date.parse(startedAt), pausedTimeMs: 0
    };
  });
  return { detectedFormat: 'Datierte Zeitspannen · Arbeitsjournal', bundle: { kind: 'journal', journalEntries: entries, counts: { journal: entries.length }, formatVersion: 0, legacy: true } };
}

export function parseRawTextImport(content: string): RawImportResult {
  const text = content.replace(/^\uFEFF/, '').trim().replace(/^```(?:json|csv|tsv|text|markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  if (!text) throw new ImportValidationError('UNSUPPORTED_FILE', 'Füge zuerst Daten in das Textfeld ein.');
  if (text.startsWith('{') || text.startsWith('[')) {
    try { return { bundle: parseImport(text), detectedFormat: 'MAR-Helper-JSON' }; }
    catch (error) {
      if (error instanceof ImportValidationError && error.code === 'UNSUPPORTED_VERSION') throw error;
      try {
        const structured = recognizeStructuredJson(JSON.parse(text));
        if (structured) return structured;
      } catch (structuredError) {
        if (structuredError instanceof ImportValidationError) throw structuredError;
      }
    }
  }
  const result = recognizeTable(text) ?? recognizeJournalTimeline(text) ?? recognizeJournalDateBlocks(text) ?? recognizePromptBlocks(text) ?? recognizeTaskList(text);
  if (result) return result;
  throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Daten konnten nicht eindeutig erkannt werden. Unterstützt werden strukturierte JSON-Daten, Tabellen, datierte Journal- und Zeitblöcke, Chat-/Prompt-Verläufe sowie Aufgabenlisten.');
}
