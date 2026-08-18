import type { AppState, PromptEntry } from './models';

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
    return { ...state, promptEntries };
  }

  const highestNumber = state.promptEntries.reduce((highest, item) => Math.max(highest, item.number), 0);
  const number = Math.max(state.nextPromptNumber, highestNumber + 1);
  return {
    ...state,
    promptEntries: [...state.promptEntries, { ...entry, number, title: entry.title?.trim() || undefined }],
    nextPromptNumber: number + 1
  };
}

export function matchesPromptSearch(entry: PromptEntry, search: string): boolean {
  const query = search.trim().toLocaleLowerCase('de');
  if (!query) return true;
  return `#${entry.number} ${entry.number} ${entry.title ?? ''} ${entry.modelName} ${entry.prompt} ${entry.response}`
    .toLocaleLowerCase('de')
    .includes(query);
}
