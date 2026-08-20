import type { AppState, BetaFeatureSettings } from './models';
import { normalizePromptEntries, type PromptEntryInput } from './prompt-entries';

const now = new Date().toISOString();

export const createDefaultState = (): AppState => ({
  version: 6,
  settings: {
    modules: { journal: true, prompts: true, planner: true },
    gitIntegration: { enabled: false, repositories: [] },
    betaFeatures: { rawTextImport: false, cloudSave: false },
    autoExport: {
      enabled: false,
      fileName: 'MAR-Helper-Protokolle.pdf',
      separateDocuments: false,
      journalFileName: 'MAR-Helper-Arbeitsjournal.pdf',
      promptsFileName: 'MAR-Helper-Promptprotokoll.pdf'
    },
    cloudSave: { enabled: false }
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
  const legacyBeta = input.settings?.betaFeatures as Partial<BetaFeatureSettings> & { autoExport?: boolean } | undefined;
  const pdfName = (value: unknown, fallback: string) => {
    const name = typeof value === 'string' ? value.trim().replace(/[\\/:*?"<>|]/g, '-') : '';
    if (!name) return fallback;
    return name.toLocaleLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
  };
  return {
    ...defaults,
    ...input,
    version: 6,
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
        cloudSave: input.settings?.betaFeatures?.cloudSave === true
      },
      autoExport: {
        ...defaults.settings.autoExport,
        ...input.settings?.autoExport,
        enabled: input.settings?.autoExport?.enabled === true && Boolean(autoExportDirectory)
          && (legacyBeta?.autoExport !== false || input.version === undefined || input.version >= 6),
        directory: autoExportDirectory,
        fileName: pdfName(input.settings?.autoExport?.fileName, defaults.settings.autoExport.fileName),
        separateDocuments: input.settings?.autoExport?.separateDocuments === true,
        journalFileName: pdfName(input.settings?.autoExport?.journalFileName, defaults.settings.autoExport.journalFileName),
        promptsFileName: pdfName(input.settings?.autoExport?.promptsFileName, defaults.settings.autoExport.promptsFileName)
      },
      cloudSave: {
        ...defaults.settings.cloudSave,
        ...input.settings?.cloudSave,
        enabled: input.settings?.betaFeatures?.cloudSave === true && input.settings?.cloudSave?.enabled === true
          && typeof input.settings.cloudSave.repositoryId === 'string',
        repositoryId: typeof input.settings?.cloudSave?.repositoryId === 'string' ? input.settings.cloudSave.repositoryId : undefined
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
