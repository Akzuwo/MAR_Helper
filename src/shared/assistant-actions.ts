import type { AppState, JournalEntry, JournalTimeSegment, ModuleId } from './models';
import { applyImport } from './importers';
import { parseRawTextImport } from './raw-importer';
import { normalizeState } from './defaults';
import { pauseTimer, resumeTimer, completeActiveTimer } from './timer';
import { updateJournalTimeline } from './journal';

type Data = Record<string, unknown>;
export interface AssistantAction { type: string; module?: string; id?: string; data?: Data }
export interface AssistantDecision { message: string; actions: AssistantAction[] }
const record = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, label: string, optional = false): string => {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > 100_000) throw new Error(`${label} fehlt oder ist ungültig.`);
  return value;
};
const date = (value: unknown, label: string) => {
  const raw = text(value, label);
  const calendarDate = raw.slice(0, 10);
  const calendarTime = Date.parse(`${calendarDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw)) || !Number.isFinite(calendarTime) || new Date(calendarTime).toISOString().slice(0, 10) !== calendarDate) throw new Error(`${label}: Bitte einen gültigen ISO-Zeitpunkt mit Zeitzone angeben.`);
  return new Date(raw).toISOString();
};

export function parseAssistantDecision(value: unknown): AssistantDecision {
  if (!record(value) || typeof value.message !== 'string' || value.message.length > 20_000 || !Array.isArray(value.actions) || value.actions.length > 50) throw new Error('Die KI hat keine gültige Antwort geliefert. Bitte formuliere die Anfrage erneut.');
  for (const action of value.actions) {
    if (!record(action) || typeof action.type !== 'string' || (action.data != null && !record(action.data)) || (action.id != null && typeof action.id !== 'string') || (action.module != null && typeof action.module !== 'string')) throw new Error('Die KI-Aktion ist ungültig.');
  }
  // Models sometimes represent omitted optional fields as null. Required fields still fail validation.
  return { message: value.message, actions: value.actions.map((action) => ({
    type: action.type, id: action.id ?? undefined, module: action.module ?? undefined,
    data: action.data ? Object.fromEntries(Object.entries(action.data).filter(([, value]) => value !== null)) : undefined
  })) };
}

function journalData(data: Data, original?: JournalEntry): JournalEntry {
  const title = data.title === undefined && original ? original.title : text(data.title, 'Titel').trim();
  const notes = data.notes === undefined ? original?.notes : text(data.notes, 'Notizen', true);
  const entry: JournalEntry = {
    id: original?.id ?? crypto.randomUUID(), title, notes,
    startedAt: data.startedAt === undefined && original ? original.startedAt : date(data.startedAt, 'Startzeit'),
    endedAt: data.endedAt === undefined && original ? original.endedAt : date(data.endedAt, 'Endzeit'),
    workingTimeMs: original?.workingTimeMs ?? 0, pausedTimeMs: original?.pausedTimeMs ?? 0,
    timeSegments: original?.timeSegments, linkedTaskId: original?.linkedTaskId
  };
  if (data.timeSegments !== undefined) {
    if (!Array.isArray(data.timeSegments) || data.timeSegments.length > 500) throw new Error('Ungültige Zeitblöcke.');
    const segments = data.timeSegments.map((item) => {
      if (!record(item) || (item.type !== 'work' && item.type !== 'pause')) throw new Error('Ungültiger Zeitblock.');
      return { type: item.type, startedAt: date(item.startedAt, 'Blockbeginn'), endedAt: date(item.endedAt, 'Blockende') } as JournalTimeSegment;
    });
    return updateJournalTimeline(entry, segments);
  }
  if (original && data.startedAt === undefined && data.endedAt === undefined && data.pausedTimeMs === undefined) return entry;
  if (original?.timeSegments?.length) throw new Error('Ändere bei diesem Eintrag die einzelnen timeSegments, damit die Zeitachse erhalten bleibt.');
  const duration = Date.parse(entry.endedAt) - Date.parse(entry.startedAt);
  const paused = data.pausedTimeMs ?? entry.pausedTimeMs;
  if (duration < 0 || typeof paused !== 'number' || !Number.isFinite(paused) || paused < 0 || paused > duration) throw new Error('Arbeits- oder Pausenzeit ist ungültig.');
  return { ...entry, timeSegments: undefined, workingTimeMs: duration - paused, pausedTimeMs: paused };
}

/** Applies the complete validated batch in memory; persistence happens once in a store transaction. */
export function applyAssistantActions(input: AppState, actions: AssistantAction[], at = new Date()): { state: AppState; changes: string[] } {
  let state = structuredClone(input);
  const changes: string[] = [];
  for (const action of actions) {
    const data = action.data ?? {};
    if (action.type === 'read') throw new Error('Leseaktionen können keine Daten verändern.');
    if (action.type === 'import_raw') {
      const parsed = parseRawTextImport(text(data.text, 'Importtext'));
      if (parsed.bundle.kind === 'backup') throw new Error('Vollständige Backups bitte über Import & Export importieren.');
      if (action.module && action.module !== parsed.bundle.kind) throw new Error('Der erkannte Import passt nicht zum gewünschten Modul.');
      state = applyImport(state, parsed.bundle, 'merge');
      changes.push(`Rohtext importiert: ${Object.values(parsed.bundle.counts).reduce((sum, count) => sum + (count ?? 0), 0)} Einträge (${parsed.bundle.kind})`);
      continue;
    }
    if (action.type === 'timer') {
      const operation = text(data.operation, 'Timer-Aktion');
      if (operation === 'start') {
        if (state.activeTimer) throw new Error('Es läuft bereits eine Sitzung. Beende sie zuerst.');
        const startedAt = at.toISOString();
        const linkedTaskId = data.linkedTaskId === undefined ? undefined : text(data.linkedTaskId, 'Aufgaben-ID');
        if (linkedTaskId && !state.plannerTasks.some((task) => task.id === linkedTaskId)) throw new Error('Die verknüpfte Aufgabe wurde nicht gefunden.');
        state.activeTimer = { id: crypto.randomUUID(), title: text(data.title, 'Aktivität').trim(), notes: text(data.notes, 'Notizen', true), startedAt, status: 'running', accumulatedPausedMs: 0, timeSegments: [], currentSegmentStartedAt: startedAt, linkedTaskId };
      } else {
        if (!state.activeTimer) throw new Error('Es läuft keine Sitzung.');
        if (operation === 'pause') state.activeTimer = pauseTimer(state.activeTimer, at);
        else if (operation === 'resume') state.activeTimer = resumeTimer(state.activeTimer, at);
        else if (operation === 'stop') state = completeActiveTimer(state, at);
        else if (operation === 'update') state.activeTimer = { ...state.activeTimer, title: data.title === undefined ? state.activeTimer.title : text(data.title, 'Aktivität'), notes: data.notes === undefined ? state.activeTimer.notes : text(data.notes, 'Notizen', true) };
        else throw new Error('Unbekannte Timer-Aktion.');
      }
      changes.push(`Sitzung: ${operation}`); continue;
    }
    if (action.type === 'set_module') {
      if (!['journal', 'prompts', 'planner', 'files'].includes(action.module ?? '') || typeof data.enabled !== 'boolean') throw new Error('Ungültige Modul-Einstellung.');
      state.settings.modules[action.module as ModuleId] = data.enabled;
      changes.push(`${action.module} ${data.enabled ? 'aktiviert' : 'deaktiviert'}`); continue;
    }
    if (!['create', 'update', 'delete'].includes(action.type) || !['journal', 'prompts', 'planner', 'chats', 'models'].includes(action.module ?? '')) throw new Error('Diese KI-Aktion wird nicht unterstützt.');
    const key = { journal: 'journalEntries', prompts: 'promptEntries', planner: 'plannerTasks', chats: 'promptChats', models: 'promptModels' }[action.module!] as 'journalEntries' | 'promptEntries' | 'plannerTasks' | 'promptChats' | 'promptModels';
    const items = state[key];
    const original = items.find((item) => item.id === action.id);
    if (action.type !== 'create' && !original) throw new Error(`Eintrag ${action.id ?? ''} wurde nicht gefunden. Es wurde nichts geändert.`);
    if (action.type === 'delete') {
      // Model deletion keeps snapshots; chat deletion also removes its contained prompts, like the UI.
      if (key === 'promptChats') state.promptEntries = state.promptEntries.filter((entry) => entry.chatId !== action.id);
      if (key === 'promptModels') state.lastPromptModelId = state.lastPromptModelId === action.id ? undefined : state.lastPromptModelId;
      (state[key] as Array<{ id: string }>) = items.filter((item) => item.id !== action.id);
      changes.push(`${action.module}: Eintrag gelöscht`); continue;
    }
    let item: unknown;
    const id = original?.id ?? crypto.randomUUID();
    if (key === 'journalEntries') item = journalData(data, original as JournalEntry | undefined);
    else if (key === 'plannerTasks') {
      const previous = original as AppState['plannerTasks'][number] | undefined;
      if (data.completed !== undefined && typeof data.completed !== 'boolean') throw new Error('Ungültiger Aufgabenstatus.');
      const dueDate = data.dueDate === undefined ? previous?.dueDate : data.dueDate === '' ? undefined : text(data.dueDate, 'Fälligkeitsdatum');
      if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new Error('Ungültiges Fälligkeitsdatum.');
      item = { id, title: data.title === undefined && previous ? previous.title : text(data.title, 'Titel'), description: data.description === undefined ? previous?.description : text(data.description, 'Beschreibung', true), dueDate, completed: data.completed ?? previous?.completed ?? false, createdAt: previous?.createdAt ?? at.toISOString(), updatedAt: at.toISOString() };
    } else if (key === 'promptEntries') {
      const previous = original as AppState['promptEntries'][number] | undefined;
      const chatId = data.chatId === undefined ? previous?.chatId : data.chatId === '' ? undefined : text(data.chatId, 'Chat-ID');
      const chat = chatId ? state.promptChats.find((chat) => chat.id === chatId) : undefined;
      if (chatId && !chat) throw new Error('Chat wurde nicht gefunden.');
      const modelName = data.modelName === undefined && previous ? previous.modelName : text(data.modelName, 'Modellname');
      let model = state.promptModels.find((model) => model.name.toLocaleLowerCase() === modelName.toLocaleLowerCase());
      if (!model) { model = { id: crypto.randomUUID(), name: modelName, createdAt: at.toISOString() }; state.promptModels.push(model); }
      const moved = !!previous && previous.chatId !== chatId;
      const number = previous && !moved ? previous.number : chat ? chat.nextPromptNumber++ : state.nextPromptNumber++;
      item = { ...previous, id, number, chatId, title: data.title === undefined ? previous?.title : text(data.title, 'Titel', true), modelId: model.id, modelName, prompt: data.prompt === undefined && previous ? previous.prompt : text(data.prompt, 'Prompt'), response: data.response === undefined && previous ? previous.response : text(data.response, 'Antwort', true), createdAt: data.createdAt === undefined ? previous?.createdAt ?? at.toISOString() : date(data.createdAt, 'Datum'), updatedAt: at.toISOString() };
    } else if (key === 'promptChats') {
      const previous = original as AppState['promptChats'][number] | undefined;
      item = { ...previous, id, number: previous?.number ?? state.nextPromptNumber++, title: data.title === undefined && previous ? previous.title : text(data.title, 'Chat-Titel'), nextPromptNumber: previous?.nextPromptNumber ?? 1, createdAt: previous?.createdAt ?? at.toISOString(), updatedAt: at.toISOString() };
    } else {
      const previous = original as AppState['promptModels'][number] | undefined;
      const name = data.name === undefined && previous ? previous.name : text(data.name, 'Modellname');
      if (state.promptModels.some((model) => model.id !== id && model.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Dieses Modell ist bereits vorhanden.');
      item = { id, name, createdAt: previous?.createdAt ?? at.toISOString() };
    }
    const destination = state[key] as unknown[];
    if (original) destination[destination.indexOf(original)] = item;
    else destination.push(item);
    changes.push(`${action.module}: Eintrag ${original ? 'bearbeitet' : 'erstellt'}`);
  }
  return { state: normalizeState(state), changes };
}

export function readAssistantData(state: AppState, action: AssistantAction): unknown {
  const data = action.data ?? {};
  if (action.module === 'settings') return state.settings;
  if (action.module === 'timer') return state.activeTimer;
  const items = { journal: state.journalEntries, prompts: state.promptEntries, planner: state.plannerTasks, chats: state.promptChats, models: state.promptModels, files: state.files }[action.module ?? ''];
  if (!items) throw new Error('Unbekanntes Lesemodul.');
  const query = typeof data.query === 'string' ? data.query.toLocaleLowerCase() : '';
  const matches = items.filter((item) => (!action.id || item.id === action.id) && (!query || JSON.stringify(item).toLocaleLowerCase().includes(query)));
  const offset = typeof data.offset === 'number' && Number.isInteger(data.offset) ? Math.max(0, data.offset) : 0;
  const limit = typeof data.limit === 'number' && Number.isInteger(data.limit) ? Math.max(1, Math.min(20, data.limit)) : 10;
  return { total: matches.length, offset, items: matches.slice(offset, offset + limit), hasMore: offset + limit < matches.length };
}
