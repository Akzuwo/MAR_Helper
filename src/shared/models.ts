export type ModuleId = 'journal' | 'prompts' | 'planner';

export interface ModuleSettings {
  journal: boolean;
  prompts: boolean;
  planner: boolean;
}

export interface AppSettings {
  modules: ModuleSettings;
  gitIntegration: GitIntegrationSettings;
}

export interface GitRepository {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface GitIntegrationSettings {
  enabled: boolean;
  repositories: GitRepository[];
}

export interface PromptGitFile {
  path: string;
  additions?: number;
  deletions?: number;
  binary?: boolean;
}

export interface PromptGitSnapshot {
  repositoryName: string;
  commitHash: string;
  shortCommitHash: string;
  commitMessage: string;
  committedAt: string;
  author?: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  files: PromptGitFile[];
  diff: string;
  diffTruncated?: boolean;
}

export interface GitCommitSummary {
  commitHash: string;
  shortCommitHash: string;
  commitMessage: string;
  committedAt: string;
  author: string;
}

export type GitResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

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
  gitSnapshot?: PromptGitSnapshot;
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

export type ImportKind = 'backup' | 'journal' | 'prompts' | 'planner';
export type ImportMode = 'merge' | 'replace';
export interface ImportCounts { journal?: number; prompts?: number; planner?: number; models?: number; repositories?: number; gitSnapshots?: number; activeTimer?: number }
export interface ImportPreview { sessionId: string; fileName: string; kind: ImportKind; formatVersion: number; legacy: boolean; counts: ImportCounts }
export type ImportSelectResult = { canceled: true } | { canceled: false; preview: ImportPreview } | { canceled: false; error: { code: 'INVALID_JSON'|'UNSUPPORTED_FILE'|'UNSUPPORTED_VERSION'|'READ_FAILED'; title: string; message: string } };
export interface ImportSummary { imported: ImportCounts; skipped: number; conflicts: number }
export type ImportCommitResult = { ok: true; state: AppState; summary: ImportSummary } | { ok: false; message: string };

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseName?: string; releaseNotes?: string }
  | { state: 'not-available' }
  | { state: 'downloading'; version: string; percent: number; transferred: number; total: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

export interface MarHelperApi {
  loadState: () => Promise<AppState>;
  saveState: (state: AppState) => Promise<AppState>;
  saveExport: (request: SaveFileRequest) => Promise<SaveFileResult>;
  openImport: () => Promise<ImportSelectResult>;
  commitImport: (sessionId: string, mode: ImportMode) => Promise<ImportCommitResult>;
  checkGit: () => Promise<GitResult<{ version: string }>>;
  selectGitRepository: () => Promise<GitResult<{ canceled: boolean; path?: string; name?: string }>>;
  verifyGitRepository: (repositoryPath: string) => Promise<GitResult<{ path: string; name: string }>>;
  listGitCommits: (repositoryPath: string, skip?: number, limit?: number) => Promise<GitResult<GitCommitSummary[]>>;
  readGitCommit: (repositoryPath: string, commitHash: string) => Promise<GitResult<PromptGitSnapshot>>;
  openGitDownload: () => Promise<void>;
  downloadAndInstallUpdate: () => Promise<void>;
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => () => void;
}
