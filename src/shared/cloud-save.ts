import type { AppState } from './models';

export type CloudSaveData = Pick<AppState, 'journalEntries' | 'activeTimer' | 'promptModels' | 'promptEntries' | 'nextPromptNumber' | 'plannerTasks'>;

const canonical = (value: unknown) => JSON.stringify(value);

export const cloudDataFrom = (state: AppState): CloudSaveData => ({
  journalEntries: state.journalEntries,
  activeTimer: state.activeTimer,
  promptModels: state.promptModels,
  promptEntries: state.promptEntries,
  nextPromptNumber: state.nextPromptNumber,
  plannerTasks: state.plannerTasks
});

export function cloudDifference(local: AppState, remote: CloudSaveData) {
  const collections: Array<[Array<{ id: string }>, Array<{ id: string }>]> = [
    [local.journalEntries, remote.journalEntries], [local.promptEntries, remote.promptEntries],
    [local.plannerTasks, remote.plannerTasks], [local.promptModels, remote.promptModels]
  ];
  let changedEntries = 0;
  let largestSize = 0;
  collections.forEach(([left, right]) => {
    largestSize += Math.max(left.length, right.length);
    const leftMap = new Map(left.map((entry) => [entry.id, canonical(entry)]));
    const rightMap = new Map(right.map((entry) => [entry.id, canonical(entry)]));
    const ids = new Set([...leftMap.keys(), ...rightMap.keys()]);
    ids.forEach((id) => { if (leftMap.get(id) !== rightMap.get(id)) changedEntries += 1; });
  });
  if (canonical(local.activeTimer) !== canonical(remote.activeTimer)) changedEntries += 1;
  const total = Math.max(1, largestSize + (local.activeTimer || remote.activeTimer ? 1 : 0));
  const ratio = changedEntries / total;
  return { changedEntries, extreme: (changedEntries >= 5 && ratio >= 0.6) || (changedEntries >= 10 && ratio >= 0.35) };
}
