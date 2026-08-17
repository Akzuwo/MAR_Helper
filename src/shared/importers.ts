import { normalizeState } from './defaults';
import type { AppState, GitRepository, ImportCounts, JournalEntry, PlannerTask, PromptEntry, PromptGitSnapshot, PromptModel } from './models';

export type ImportKind = 'backup' | 'journal' | 'prompts' | 'planner';
export const EXPORT_FORMAT = 'mar-helper-export';
export const EXPORT_FORMAT_VERSION = 1;

export class ImportValidationError extends Error {
  constructor(public readonly code: 'INVALID_JSON' | 'UNSUPPORTED_FILE' | 'UNSUPPORTED_VERSION', message: string) { super(message); this.name = 'ImportValidationError'; }
}

export interface ImportBundle {
  kind: ImportKind;
  state?: AppState;
  journalEntries?: JournalEntry[];
  promptEntries?: PromptEntry[];
  plannerTasks?: PlannerTask[];
  counts: ImportCounts;
  formatVersion: number;
  legacy: boolean;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isDate = (value: unknown): value is string => isString(value) && !Number.isNaN(Date.parse(value));
const isNonNegativeNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isPromptGitSnapshot = (value: unknown): value is PromptGitSnapshot => isRecord(value)
  && isString(value.repositoryName) && /^[0-9a-f]{40}$/i.test(String(value.commitHash))
  && isString(value.shortCommitHash) && typeof value.commitMessage === 'string' && isDate(value.committedAt)
  && isNonNegativeNumber(value.filesChanged) && isNonNegativeNumber(value.additions) && isNonNegativeNumber(value.deletions)
  && typeof value.diff === 'string' && Array.isArray(value.files)
  && value.files.every((file) => isRecord(file) && isString(file.path)
    && (file.additions === undefined || isNonNegativeNumber(file.additions))
    && (file.deletions === undefined || isNonNegativeNumber(file.deletions))
    && (file.binary === undefined || typeof file.binary === 'boolean'));

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
  && (value.gitSnapshot === undefined || isPromptGitSnapshot(value.gitSnapshot))
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

const isRepository = (value: unknown): value is GitRepository => isRecord(value)
  && isString(value.id) && isString(value.name) && isString(value.path) && isDate(value.addedAt);

function assertArray<T>(value: unknown, guard: (item: unknown) => item is T, label: string): T[] {
  if (!Array.isArray(value) || !value.every(guard)) throw new ImportValidationError('UNSUPPORTED_FILE', `${label} enthält ungültige oder unvollständige Einträge.`);
  return value;
}

function parseBackup(value: unknown): AppState | null {
  const candidate = isRecord(value) && isRecord(value.data)
    && (value.application === 'MAR Helper' || value.format === EXPORT_FORMAT) ? value.data : value;
  if (!isRecord(candidate) || !isRecord(candidate.settings) || !isRecord(candidate.settings.modules)) return null;
  const modules = candidate.settings.modules;
  if (typeof modules.journal !== 'boolean' || typeof modules.prompts !== 'boolean' || typeof modules.planner !== 'boolean') return null;
  const journalEntries = assertArray(candidate.journalEntries, isJournalEntry, 'Das Arbeitsjournal');
  const promptEntries = assertArray(candidate.promptEntries, isPromptEntry, 'Das Promptprotokoll');
  const plannerTasks = assertArray(candidate.plannerTasks, isPlannerTask, 'Der Zeitplan');
  const promptModels = assertArray(candidate.promptModels, isPromptModel, 'Die Modellliste');
  const gitIntegration = candidate.settings.gitIntegration;
  if (gitIntegration !== undefined && (!isRecord(gitIntegration) || typeof gitIntegration.enabled !== 'boolean'
    || !Array.isArray(gitIntegration.repositories) || !gitIntegration.repositories.every(isRepository))) {
    throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Datei enthält ungültige Git-Einstellungen.');
  }
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
  catch { throw new ImportValidationError('INVALID_JSON', 'Die ausgewählte Datei enthält kein gültiges JSON.'); }

  const record = isRecord(parsed) ? parsed : null;
  const currentEnvelope = record?.format === EXPORT_FORMAT;
  const legacyEnvelope = record?.format === 'mar-helper' && record.version === 1;
  if (currentEnvelope && (!Number.isInteger(record.formatVersion) || Number(record.formatVersion) < 1)) {
    throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Datei enthält keine gültige Exportversion.');
  }
  if (currentEnvelope && Number(record.formatVersion) > EXPORT_FORMAT_VERSION) {
    throw new ImportValidationError('UNSUPPORTED_VERSION', `Exportformat ${String(record.formatVersion)} wird von dieser MAR-Helper-Version noch nicht unterstützt.`);
  }
  if (isRecord(parsed) && typeof parsed.format === 'string' && !currentEnvelope && !legacyEnvelope) {
    throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Datei scheint kein gültiger MAR-Helper-Export zu sein.');
  }
  const formatVersion = currentEnvelope ? Number(record.formatVersion) : legacyEnvelope ? 1 : 0;
  const legacy = !currentEnvelope;

  const backup = parseBackup(parsed);
  if (backup) return {
    kind: 'backup', state: backup,
    counts: {
      journal: backup.journalEntries.length,
      prompts: backup.promptEntries.length,
      planner: backup.plannerTasks.length,
      models: backup.promptModels.length,
      repositories: backup.settings.gitIntegration.repositories.length,
      gitSnapshots: backup.promptEntries.filter((entry) => entry.gitSnapshot).length,
      ...(backup.activeTimer ? { activeTimer: 1 } : {})
    }, formatVersion, legacy
  };

  const envelope = isRecord(parsed) && typeof parsed.module === 'string' && Array.isArray(parsed.data) ? parsed : null;
  const source = envelope?.data ?? parsed;
  const requestedKind = envelope?.module;
  if (!Array.isArray(source)) throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Datei scheint kein gültiger MAR-Helper-Export zu sein.');
  if (source.length === 0 && !requestedKind) throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Datei scheint kein gültiger MAR-Helper-Export zu sein.');

  if (requestedKind === 'journal' || (source.length > 0 && source.every(isJournalEntry))) {
    const entries = assertArray(source, isJournalEntry, 'Das Arbeitsjournal');
    return { kind: 'journal', journalEntries: entries, counts: { journal: entries.length }, formatVersion, legacy };
  }
  if (requestedKind === 'prompts' || (source.length > 0 && source.every(isPromptEntry))) {
    const entries = assertArray(source, isPromptEntry, 'Das Promptprotokoll');
    return { kind: 'prompts', promptEntries: entries, counts: { prompts: entries.length, gitSnapshots: entries.filter((entry) => entry.gitSnapshot).length }, formatVersion, legacy };
  }
  if (requestedKind === 'planner' || (source.length > 0 && source.every(isPlannerTask))) {
    const entries = assertArray(source, isPlannerTask, 'Der Zeitplan');
    return { kind: 'planner', plannerTasks: entries, counts: { planner: entries.length }, formatVersion, legacy };
  }
  throw new ImportValidationError('UNSUPPORTED_FILE', 'Die Datei scheint kein gültiger MAR-Helper-Export zu sein.');
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
};

const mergeWithIdMap = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const result = [...current];
  const idMap = new Map<string, string>();
  incoming.forEach((item) => {
    const existing = result.find((candidate) => candidate.id === item.id);
    if (!existing) { result.push(item); idMap.set(item.id, item.id); }
    else if (canonical(existing) === canonical(item)) idMap.set(item.id, existing.id);
    else {
      const changed = { ...item, id: crypto.randomUUID() };
      result.push(changed); idMap.set(item.id, changed.id);
    }
  });
  return { items: result, idMap };
};

const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => mergeWithIdMap(current, incoming).items;

const mergeModels = (current: PromptModel[], incoming: PromptModel[]) => {
  const result = [...current];
  const idMap = new Map<string, string>();
  incoming.forEach((model) => {
    const index = result.findIndex((item) => item.id === model.id || item.name.toLocaleLowerCase('de') === model.name.toLocaleLowerCase('de'));
    if (index < 0) { result.push(model); idMap.set(model.id, model.id); }
    else if (result[index].id !== model.id || canonical(result[index]) === canonical(model)) idMap.set(model.id, result[index].id);
    else {
      const changed = { ...model, id: crypto.randomUUID() };
      result.push(changed); idMap.set(model.id, changed.id);
    }
  });
  return { items: result, idMap };
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
    if (mode === 'replace') return normalizeState({
      ...bundle.state,
      settings: { ...bundle.state.settings, modules: current.settings.modules }
    });
    const tasks = mergeWithIdMap(current.plannerTasks, bundle.state.plannerTasks);
    const models = mergeModels(modelsForEntries(current.promptModels, bundle.state.promptEntries), bundle.state.promptModels);
    return {
      ...current,
      settings: {
        ...bundle.state.settings,
        modules: current.settings.modules,
        gitIntegration: {
          ...bundle.state.settings.gitIntegration,
          repositories: mergeById(current.settings.gitIntegration.repositories, bundle.state.settings.gitIntegration.repositories)
        }
      },
      journalEntries: mergeById(current.journalEntries, bundle.state.journalEntries.map((entry) => ({
        ...entry,
        linkedTaskId: entry.linkedTaskId ? (tasks.idMap.get(entry.linkedTaskId) ?? entry.linkedTaskId) : undefined
      }))),
      activeTimer: current.activeTimer ?? bundle.state.activeTimer,
      promptEntries: mergeById(current.promptEntries, bundle.state.promptEntries.map((entry) => ({
        ...entry,
        modelId: entry.modelId ? (models.idMap.get(entry.modelId) ?? entry.modelId) : undefined
      }))),
      plannerTasks: tasks.items,
      promptModels: models.items
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
