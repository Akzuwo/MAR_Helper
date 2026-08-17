export type ModuleId = 'journal' | 'prompts' | 'planner';

export interface ModuleSettings {
  journal: boolean;
  prompts: boolean;
  planner: boolean;
}

export interface AppSettings {
  modules: ModuleSettings;
}

export interface JournalEntry {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string;
  workingTimeMs: number;
  pausedTimeMs: number;
  linkedTaskId?: string;
}

export type TimerStatus = 'running' | 'paused';

export interface ActiveTimer {
  id: string;
  title: string;
  startedAt: string;
  status: TimerStatus;
  pausedAt?: string;
  accumulatedPausedMs: number;
  linkedTaskId?: string;
}

export interface PromptModel {
  id: string;
  name: string;
  createdAt: string;
}

export interface PromptEntry {
  id: string;
  modelId?: string;
  modelName: string;
  prompt: string;
  response: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PlannerTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AppState {
  version: number;
  settings: AppSettings;
  journalEntries: JournalEntry[];
  activeTimer: ActiveTimer | null;
  promptModels: PromptModel[];
  promptEntries: PromptEntry[];
  plannerTasks: PlannerTask[];
}

export interface SaveFileRequest {
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
  content: string;
}

export interface SaveFileResult {
  canceled: boolean;
  filePath?: string;
}

export interface MarHelperApi {
  loadState: () => Promise<AppState>;
  saveState: (state: AppState) => Promise<AppState>;
  saveExport: (request: SaveFileRequest) => Promise<SaveFileResult>;
}
