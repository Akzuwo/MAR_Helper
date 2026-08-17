import { normalizeState } from './defaults';
import type { AppState, JournalEntry, PlannerTask, PromptEntry, PromptModel } from './models';

export type ImportKind = 'backup' | 'journal' | 'prompts' | 'planner';

export interface ImportBundle {
  kind: ImportKind;
  state?: AppState;
  journalEntries?: JournalEntry[];
  promptEntries?: PromptEntry[];
  plannerTasks?: PlannerTask[];
  counts: { journal: number; prompts: number; planner: number };
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isDate = (value: unknown): value is string => isString(value) && !Number.isNaN(Date.parse(value));
const isNonNegativeNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isJournalEntry = (value: unknown): value is JournalEntry => isRecord(value)
  && isString(value.id)
  && isString(value.title)
  && isDate(value.startedAt)
  && isDate(value.endedAt)
  && Date.parse(value.endedAt) >= Date.parse(value.startedAt)
  && isNonNegativeNumber(value.workingTimeMs)
  && isNonNegativeNumber(value.pausedTimeMs)
  && isOptionalString(value.linkedTaskId);

const isPromptEntry = (value: unknown): value is PromptEntry => isRecord(value)
  && isString(value.id)
  && isString(value.modelName)
  && typeof value.prompt === 'string'
  && typeof value.response === 'string'
  && isDate(value.createdAt)
  && isOptionalString(value.modelId)
  && (value.updatedAt === undefined || isDate(value.updatedAt));

const isPlannerTask = (value: unknown): value is PlannerTask => isRecord(value)
  && isString(value.id)
  && isString(value.title)
  && typeof value.completed === 'boolean'
  && isDate(value.createdAt)
  && isOptionalString(value.description)
  && (value.dueDate === undefined || (typeof value.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)))
  && (value.updatedAt === undefined || isDate(value.updatedAt));

const isPromptModel = (value: unknown): value is PromptModel => isRecord(value)
  && isString(value.id)
  && isString(value.name)
  && isDate(value.createdAt);

function assertArray<T>(value: unknown, guard: (item: unknown) => item is T, label: string): T[] {
  if (!Array.isArray(value) || !value.every(guard)) throw new Error(`${label} enthält ungültige oder unvollständige Einträge.`);
  return value;
}

function parseBackup(value: unknown): AppState | null {
  const candidate = isRecord(value) && value.application === 'MAR Helper' && isRecord(value.data) ? value.data : value;
  if (!isRecord(candidate) || !isRecord(candidate.settings) || !isRecord(candidate.settings.modules)) return null;
  const modules = candidate.settings.modules;
  if (typeof modules.journal !== 'boolean' || typeof modules.prompts !== 'boolean' || typeof modules.planner !== 'boolean') return null;
  const journalEntries = assertArray(candidate.journalEntries, isJournalEntry, 'Das Arbeitsjournal');
  const promptEntries = assertArray(candidate.promptEntries, isPromptEntry, 'Das Promptprotokoll');
  const plannerTasks = assertArray(candidate.plannerTasks, isPlannerTask, 'Der Zeitplan');
  const promptModels = assertArray(candidate.promptModels, isPromptModel, 'Die Modellliste');
  if (candidate.activeTimer !== null && candidate.activeTimer !== undefined) {
    const timer = candidate.activeTimer;
    if (!isRecord(timer) || !isString(timer.id) || !isString(timer.title) || !isDate(timer.startedAt)
      || (timer.status !== 'running' && timer.status !== 'paused') || !isNonNegativeNumber(timer.accumulatedPausedMs)
      || (timer.pausedAt !== undefined && !isDate(timer.pausedAt))) {
      throw new Error('Der gespeicherte Timerzustand ist ungültig.');
    }
  }
  return normalizeState({ ...candidate, journalEntries, promptEntries, plannerTasks, promptModels } as Partial<AppState>);
}

export function parseImport(content: string): ImportBundle {
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error('Die Datei ist kein gültiges JSON-Dokument.'); }

  const backup = parseBackup(parsed);
  if (backup) return {
    kind: 'backup', state: backup,
    counts: { journal: backup.journalEntries.length, prompts: backup.promptEntries.length, planner: backup.plannerTasks.length }
  };

  const envelope = isRecord(parsed) && typeof parsed.module === 'string' && Array.isArray(parsed.data) ? parsed : null;
  const source = envelope?.data ?? parsed;
  const requestedKind = envelope?.module;
  if (!Array.isArray(source)) throw new Error('Das Importformat wird nicht erkannt. Erwartet wird ein MAR-Helper-Backup oder ein Modul-Export.');
  if (source.length === 0 && !requestedKind) throw new Error('Ein leerer Array-Export benötigt ein Modul-Formatobjekt. Siehe README unter „Importformat“.');

  if (requestedKind === 'journal' || (source.length > 0 && source.every(isJournalEntry))) {
    const entries = assertArray(source, isJournalEntry, 'Das Arbeitsjournal');
    return { kind: 'journal', journalEntries: entries, counts: { journal: entries.length, prompts: 0, planner: 0 } };
  }
  if (requestedKind === 'prompts' || (source.length > 0 && source.every(isPromptEntry))) {
    const entries = assertArray(source, isPromptEntry, 'Das Promptprotokoll');
    return { kind: 'prompts', promptEntries: entries, counts: { journal: 0, prompts: entries.length, planner: 0 } };
  }
  if (requestedKind === 'planner' || (source.length > 0 && source.every(isPlannerTask))) {
    const entries = assertArray(source, isPlannerTask, 'Der Zeitplan');
    return { kind: 'planner', plannerTasks: entries, counts: { journal: 0, prompts: 0, planner: entries.length } };
  }
  throw new Error('Die Datei enthält gemischte oder ungültige Einträge und kann nicht importiert werden.');
}

const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
};

const mergeModels = (current: PromptModel[], incoming: PromptModel[]) => {
  const result = [...current];
  incoming.forEach((model) => {
    const index = result.findIndex((item) => item.id === model.id || item.name.toLocaleLowerCase('de') === model.name.toLocaleLowerCase('de'));
    if (index >= 0) result[index] = model;
    else result.push(model);
  });
  return result;
};

function modelsForEntries(current: PromptModel[], entries: PromptEntry[]): PromptModel[] {
  const result = [...current];
  const names = new Set(result.map((model) => model.name.toLocaleLowerCase('de')));
  entries.forEach((entry) => {
    if (!names.has(entry.modelName.toLocaleLowerCase('de'))) {
      result.push({ id: crypto.randomUUID(), name: entry.modelName, createdAt: new Date().toISOString() });
      names.add(entry.modelName.toLocaleLowerCase('de'));
    }
  });
  return result;
}

export function applyImport(current: AppState, bundle: ImportBundle, mode: 'merge' | 'replace'): AppState {
  if (bundle.kind === 'backup' && bundle.state) {
    if (mode === 'replace') return bundle.state;
    return {
      ...current,
      journalEntries: mergeById(current.journalEntries, bundle.state.journalEntries),
      promptEntries: mergeById(current.promptEntries, bundle.state.promptEntries),
      plannerTasks: mergeById(current.plannerTasks, bundle.state.plannerTasks),
      promptModels: mergeModels(modelsForEntries(current.promptModels, bundle.state.promptEntries), bundle.state.promptModels)
    };
  }
  if (bundle.kind === 'journal') return { ...current, journalEntries: mode === 'replace' ? bundle.journalEntries! : mergeById(current.journalEntries, bundle.journalEntries!) };
  if (bundle.kind === 'planner') return { ...current, plannerTasks: mode === 'replace' ? bundle.plannerTasks! : mergeById(current.plannerTasks, bundle.plannerTasks!) };
  const entries = bundle.promptEntries!;
  return {
    ...current,
    promptEntries: mode === 'replace' ? entries : mergeById(current.promptEntries, entries),
    promptModels: modelsForEntries(current.promptModels, entries)
  };
}
