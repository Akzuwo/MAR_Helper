import type { AppState } from './models';
import { normalizePromptEntries, type PromptEntryInput } from './prompt-entries';

const now = new Date().toISOString();

export const createDefaultState = (): AppState => ({
  version: 5,
  settings: {
    modules: { journal: true, prompts: true, planner: true },
    gitIntegration: { enabled: false, repositories: [] },
    betaFeatures: { rawTextImport: false, autoExport: false },
    autoExport: { enabled: false }
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
  nextPromptNumber: 1,
  plannerTasks: []
});

export function normalizeState(input: Partial<AppState> | undefined): AppState {
  const defaults = createDefaultState();
  if (!input) return defaults;
  const prompts = normalizePromptEntries(
    (Array.isArray(input.promptEntries) ? input.promptEntries : []) as PromptEntryInput[],
    [],
    input.nextPromptNumber ?? 1
  );
  const autoExportDirectory = typeof input.settings?.autoExport?.directory === 'string' && input.settings.autoExport.directory.trim()
    ? input.settings.autoExport.directory
    : undefined;
  return {
    ...defaults,
    ...input,
    version: 5,
    settings: {
      ...defaults.settings,
      ...input.settings,
      modules: { ...defaults.settings.modules, ...input.settings?.modules },
      gitIntegration: {
        ...defaults.settings.gitIntegration,
        ...input.settings?.gitIntegration,
        repositories: Array.isArray(input.settings?.gitIntegration?.repositories) ? input.settings.gitIntegration.repositories : []
      },
      betaFeatures: {
        ...defaults.settings.betaFeatures,
        ...input.settings?.betaFeatures,
        autoExport: input.settings?.betaFeatures?.autoExport === true && Boolean(autoExportDirectory)
      },
      autoExport: {
        ...defaults.settings.autoExport,
        ...input.settings?.autoExport,
        enabled: input.settings?.betaFeatures?.autoExport === true && input.settings?.autoExport?.enabled === true && Boolean(autoExportDirectory),
        directory: autoExportDirectory
      }
    },
    journalEntries: Array.isArray(input.journalEntries) ? input.journalEntries : [],
    activeTimer: input.activeTimer ?? null,
    promptModels: Array.isArray(input.promptModels) ? input.promptModels : defaults.promptModels,
    promptEntries: prompts.entries,
    nextPromptNumber: prompts.nextPromptNumber,
    plannerTasks: Array.isArray(input.plannerTasks) ? input.plannerTasks : []
  };
}
