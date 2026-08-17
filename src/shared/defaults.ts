import type { AppState } from './models';

const now = new Date().toISOString();

export const createDefaultState = (): AppState => ({
  version: 1,
  settings: {
    modules: { journal: true, prompts: true, planner: true }
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
    settings: {
      ...defaults.settings,
      ...input.settings,
      modules: { ...defaults.settings.modules, ...input.settings?.modules }
    },
    journalEntries: Array.isArray(input.journalEntries) ? input.journalEntries : [],
    activeTimer: input.activeTimer ?? null,
    promptModels: Array.isArray(input.promptModels) ? input.promptModels : defaults.promptModels,
    promptEntries: Array.isArray(input.promptEntries) ? input.promptEntries : [],
    plannerTasks: Array.isArray(input.plannerTasks) ? input.plannerTasks : []
  };
}
