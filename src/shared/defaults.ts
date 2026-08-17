import type { AppState } from './models';

const now = new Date().toISOString();

export const createDefaultState = (): AppState => ({
  version: 2,
  settings: {
    modules: { journal: true, prompts: true, planner: true },
    gitIntegration: { enabled: false, repositories: [] }
  },
  journalEntries: [],
  activeTimer: null,
  promptModels: [
    { id: 'model-gpt-5', name: 'GPT-5', createdAt: now },
    { id: 'model-claude-sonnet', name: 'Claude Sonnet', createdAt: now },
    { id: 'model-gemini', name: 'Gemini', createdAt: now },
    { id: 'model-codex', name: 'Codex', createdAt: now }
  ],
  promptEntries: [],
  plannerTasks: []
});

export function normalizeState(input: Partial<AppState> | undefined): AppState {
  const defaults = createDefaultState();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    version: 2,
    settings: {
      ...defaults.settings,
      ...input.settings,
      modules: { ...defaults.settings.modules, ...input.settings?.modules },
      gitIntegration: {
        ...defaults.settings.gitIntegration,
        ...input.settings?.gitIntegration,
        repositories: Array.isArray(input.settings?.gitIntegration?.repositories) ? input.settings.gitIntegration.repositories : []
      }
    },
    journalEntries: Array.isArray(input.journalEntries) ? input.journalEntries : [],
    activeTimer: input.activeTimer ?? null,
    promptModels: Array.isArray(input.promptModels) ? input.promptModels : defaults.promptModels,
    promptEntries: Array.isArray(input.promptEntries) ? input.promptEntries : [],
    plannerTasks: Array.isArray(input.plannerTasks) ? input.plannerTasks : []
  };
}
