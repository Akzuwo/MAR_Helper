import type { ActiveTimer, AppState, BetaFeatureSettings, JournalEntry, JournalTimeSegment, PromptChat } from './models';
import { normalizePromptEntries, type PromptEntryInput } from './prompt-entries';

const now = new Date().toISOString();

export const createDefaultState = (): AppState => ({
  version: 8,
  settings: {
    modules: { journal: true, prompts: true, planner: true, files: false },
    visualEffects: { scrollEffects: false },
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
  promptChats: [],
  lastPromptModelId: undefined,
  nextPromptNumber: 1,
  plannerTasks: [],
  files: []
});

export function normalizeState(input: Partial<AppState> | undefined): AppState {
  const defaults = createDefaultState();
  if (!input) return defaults;
  const rawChats = ((Array.isArray(input.promptChats) ? input.promptChats : []) as PromptChat[])
    .filter((chat) => chat && typeof chat.id === 'string' && typeof chat.title === 'string')
    .map((chat) => ({ ...chat, title: chat.title.trim() }));
  const chatIds = new Set(rawChats.map((chat) => chat.id));
  const rawPrompts = (Array.isArray(input.promptEntries) ? input.promptEntries : []) as PromptEntryInput[];
  const standalone = rawPrompts.filter((entry) => !entry.chatId || !chatIds.has(entry.chatId)).map((entry) => ({ ...entry, chatId: undefined }));
  const topLevel = [
    ...rawChats.map((chat, index) => ({ kind: 'chat' as const, index, number: chat.number, createdAt: chat.createdAt })),
    ...standalone.map((entry, index) => ({ kind: 'prompt' as const, index, number: entry.number, createdAt: entry.createdAt }))
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.index - b.index);
  const used = new Set<number>();
  const assigned = new Map<string, number>();
  const pending: typeof topLevel = [];
  topLevel.forEach((item) => {
    if (Number.isInteger(item.number) && Number(item.number) > 0 && !used.has(Number(item.number))) {
      used.add(Number(item.number)); assigned.set(`${item.kind}-${item.index}`, Number(item.number));
    } else pending.push(item);
  });
  let nextTopLevel = Math.max(input.nextPromptNumber ?? 1, used.size ? Math.max(...used) + 1 : 1);
  pending.forEach((item) => { while (used.has(nextTopLevel)) nextTopLevel += 1; assigned.set(`${item.kind}-${item.index}`, nextTopLevel); used.add(nextTopLevel); nextTopLevel += 1; });
  const numberedChats = rawChats.map((chat, index) => ({ ...chat, number: assigned.get(`chat-${index}`)! }));
  const topLevelPrompts = standalone.map((entry, index) => ({ ...entry, number: assigned.get(`prompt-${index}`)! })) as ReturnType<typeof normalizePromptEntries>['entries'];
  const chatResults = numberedChats.map((chat) => ({ chat, normalized: normalizePromptEntries(rawPrompts.filter((entry) => entry.chatId === chat.id), [], chat.nextPromptNumber ?? 1) }));
  const promptChats = chatResults.map(({ chat, normalized }) => ({ ...chat, nextPromptNumber: normalized.nextPromptNumber }));
  const chatPrompts = chatResults.flatMap(({ normalized }) => normalized.entries);
  const highestTopLevel = Math.max(0, ...promptChats.map((chat) => chat.number), ...topLevelPrompts.map((entry) => entry.number));
  const autoExportDirectory = typeof input.settings?.autoExport?.directory === 'string' && input.settings.autoExport.directory.trim()
    ? input.settings.autoExport.directory
    : undefined;
  const legacyBeta = input.settings?.betaFeatures as Partial<BetaFeatureSettings> & { autoExport?: boolean } | undefined;
  const pdfName = (value: unknown, fallback: string) => {
    const name = typeof value === 'string' ? value.trim().replace(/[\\/:*?"<>|]/g, '-') : '';
    if (!name) return fallback;
    return name.toLocaleLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
  };
  const validSegment = (segment: JournalTimeSegment) => segment
    && (segment.type === 'work' || segment.type === 'pause')
    && typeof segment.startedAt === 'string' && !Number.isNaN(Date.parse(segment.startedAt))
    && typeof segment.endedAt === 'string' && !Number.isNaN(Date.parse(segment.endedAt))
    && Date.parse(segment.endedAt) >= Date.parse(segment.startedAt);
  const journalEntries = (Array.isArray(input.journalEntries) ? input.journalEntries : []).map((entry: JournalEntry) => ({
    ...entry,
    timeSegments: Array.isArray(entry.timeSegments) && entry.timeSegments.every(validSegment) ? entry.timeSegments : undefined
  }));
  const rawTimer = input.activeTimer as ActiveTimer | null | undefined;
  const activeTimer = rawTimer ? {
    ...rawTimer,
    timeSegments: Array.isArray(rawTimer.timeSegments) && rawTimer.timeSegments.every(validSegment) ? rawTimer.timeSegments : undefined,
    currentSegmentStartedAt: typeof rawTimer.currentSegmentStartedAt === 'string' && !Number.isNaN(Date.parse(rawTimer.currentSegmentStartedAt))
      ? rawTimer.currentSegmentStartedAt : undefined
  } : null;
  const files = (Array.isArray(input.files) ? input.files : []).filter((file, index, all) => file
    && typeof file.id === 'string' && /^[0-9a-f-]{36}$/i.test(file.id)
    && all.findIndex((candidate) => candidate?.id === file.id) === index
    && typeof file.name === 'string' && file.name.trim().length > 0
    && typeof file.storedName === 'string' && pathSafeStoredName(file.storedName)
    && typeof file.size === 'number' && file.size >= 0
    && typeof file.mimeType === 'string' && typeof file.createdAt === 'string' && !Number.isNaN(Date.parse(file.createdAt)));
  const fileIds = new Set(files.map((file) => file.id));
  const normalizeFileIds = (value: unknown) => Array.isArray(value)
    ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && fileIds.has(id))))
    : undefined;
  return {
    ...defaults,
    ...input,
    version: 8,
    settings: {
      ...defaults.settings,
      ...input.settings,
      modules: { ...defaults.settings.modules, ...input.settings?.modules },
      visualEffects: {
        ...defaults.settings.visualEffects,
        ...input.settings?.visualEffects,
        scrollEffects: input.settings?.visualEffects?.scrollEffects === true
      },
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
      },
      termsAcceptedAt: typeof input.settings?.termsAcceptedAt === 'string' && !Number.isNaN(Date.parse(input.settings.termsAcceptedAt))
        ? input.settings.termsAcceptedAt
        : undefined
    },
    journalEntries,
    activeTimer,
    promptModels: Array.isArray(input.promptModels) ? input.promptModels : defaults.promptModels,
    lastPromptModelId: typeof input.lastPromptModelId === 'string' && (Array.isArray(input.promptModels) ? input.promptModels : defaults.promptModels).some((model) => model.id === input.lastPromptModelId) ? input.lastPromptModelId : undefined,
    promptEntries: [...topLevelPrompts, ...chatPrompts].map((entry) => ({
      ...entry,
      promptFileIds: normalizeFileIds(entry.promptFileIds),
      responseFileIds: normalizeFileIds(entry.responseFileIds)
    })),
    promptChats,
    nextPromptNumber: Math.max(nextTopLevel, highestTopLevel + 1, input.nextPromptNumber ?? 1),
    plannerTasks: Array.isArray(input.plannerTasks) ? input.plannerTasks : [],
    files
  };
}

function pathSafeStoredName(value: string): boolean {
  return value.length > 0 && value.length <= 180 && !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..';
}
