import type { AppState, PromptChat, PromptEntry } from './models';

export type PromptEntryInput = Omit<PromptEntry, 'number'> & { number?: number };

const validNumber = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
const chronological = (left: { entry: PromptEntryInput; index: number }, right: { entry: PromptEntryInput; index: number }) => {
  const delta = Date.parse(left.entry.createdAt) - Date.parse(right.entry.createdAt);
  return delta || left.index - right.index;
};

export function normalizePromptEntries(
  entries: PromptEntryInput[],
  reservedNumbers: Iterable<number> = [],
  requestedNextNumber = 1
): { entries: PromptEntry[]; nextPromptNumber: number } {
  const used = new Set(Array.from(reservedNumbers).filter(validNumber));
  const assigned = new Map<number, number>();
  const pending: Array<{ entry: PromptEntryInput; index: number }> = [];
  const ordered = entries.map((entry, index) => ({ entry, index })).sort(chronological);

  ordered.forEach((item) => {
    if (validNumber(item.entry.number) && !used.has(item.entry.number)) {
      used.add(item.entry.number);
      assigned.set(item.index, item.entry.number);
    } else pending.push(item);
  });

  const highestUsed = used.size ? Math.max(...used) : 0;
  let nextPromptNumber = Math.max(validNumber(requestedNextNumber) ? requestedNextNumber : 1, highestUsed + 1);
  pending.forEach((item) => {
    while (used.has(nextPromptNumber)) nextPromptNumber += 1;
    assigned.set(item.index, nextPromptNumber);
    used.add(nextPromptNumber);
    nextPromptNumber += 1;
  });

  if (used.size) nextPromptNumber = Math.max(nextPromptNumber, Math.max(...used) + 1);
  return {
    entries: entries.map((entry, index) => ({
      ...entry,
      number: assigned.get(index)!,
      title: entry.title?.trim() || undefined
    })),
    nextPromptNumber
  };
}

export function upsertPromptEntry(state: AppState, entry: PromptEntry): AppState {
  const index = state.promptEntries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    const promptEntries = [...state.promptEntries];
    promptEntries[index] = { ...entry, number: promptEntries[index].number, title: entry.title?.trim() || undefined };
    return { ...state, promptEntries, lastPromptModelId: entry.modelId ?? state.lastPromptModelId };
  }

  if (entry.chatId) {
    const chat = state.promptChats.find((item) => item.id === entry.chatId);
    if (!chat) return upsertPromptEntry(state, { ...entry, chatId: undefined });
    const number = chat.nextPromptNumber;
    return {
      ...state,
      promptEntries: [...state.promptEntries, { ...entry, number, title: entry.title?.trim() || undefined }],
      promptChats: state.promptChats.map((item) => item.id === chat.id ? { ...item, nextPromptNumber: number + 1 } : item),
      lastPromptModelId: entry.modelId ?? state.lastPromptModelId
    };
  }

  const highestNumber = [
    ...state.promptEntries.filter((item) => !item.chatId).map((item) => item.number),
    ...state.promptChats.map((chat) => chat.number)
  ].reduce((highest, number) => Math.max(highest, number), 0);
  const number = Math.max(state.nextPromptNumber, highestNumber + 1);
  return {
    ...state,
    promptEntries: [...state.promptEntries, { ...entry, number, title: entry.title?.trim() || undefined }],
    lastPromptModelId: entry.modelId ?? state.lastPromptModelId,
    nextPromptNumber: number + 1
  };
}

export function movePromptToChat(state: AppState, entryId: string, chatId: string): AppState {
  const chat = state.promptChats.find((item) => item.id === chatId);
  const entry = state.promptEntries.find((item) => item.id === entryId);
  if (!chat || !entry || entry.chatId) return state;
  return {
    ...state,
    promptEntries: state.promptEntries.map((item) => item.id === entryId ? { ...item, chatId, number: chat.nextPromptNumber, updatedAt: new Date().toISOString() } : item),
    promptChats: state.promptChats.map((item) => item.id === chatId ? { ...item, nextPromptNumber: item.nextPromptNumber + 1, updatedAt: new Date().toISOString() } : item)
  };
}

export function createPromptChat(state: AppState, title: string, createdAt = new Date().toISOString()): { state: AppState; chat: PromptChat } {
  const highestNumber = [
    ...state.promptEntries.filter((entry) => !entry.chatId).map((entry) => entry.number),
    ...state.promptChats.map((chat) => chat.number)
  ].reduce((highest, number) => Math.max(highest, number), 0);
  const number = Math.max(state.nextPromptNumber, highestNumber + 1);
  const chat: PromptChat = { id: crypto.randomUUID(), number, title: title.trim(), createdAt, nextPromptNumber: 1 };
  return { state: { ...state, promptChats: [...state.promptChats, chat], nextPromptNumber: number + 1 }, chat };
}

export const promptDisplayNumber = (entry: PromptEntry, chats: PromptChat[]): string => {
  const chat = entry.chatId ? chats.find((item) => item.id === entry.chatId) : undefined;
  return chat ? `${chat.number}.${entry.number}` : String(entry.number);
};

export function matchesPromptSearch(entry: PromptEntry, search: string, chats: PromptChat[] = []): boolean {
  const query = search.trim().toLocaleLowerCase('de');
  if (!query) return true;
  const chat = entry.chatId ? chats.find((item) => item.id === entry.chatId) : undefined;
  const number = promptDisplayNumber(entry, chats);
  return `#${number} ${number} ${chat?.title ?? ''} ${entry.title ?? ''} ${entry.modelName} ${entry.reasoningLevel ?? ''} ${entry.prompt} ${entry.response}`
    .toLocaleLowerCase('de')
    .includes(query);
}
