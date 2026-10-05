import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultState } from '../shared/defaults';
import { pauseTimer, resumeTimer } from '../shared/timer';
import { JsonStore } from './store';

const mocked = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => mocked.directory } }));

beforeEach(async () => { mocked.directory = await mkdtemp(path.join(os.tmpdir(), 'mar-helper-store-test-')); });
afterEach(async () => {
  const target = path.resolve(mocked.directory);
  if (target.startsWith(path.join(path.resolve(os.tmpdir()), 'mar-helper-store-test-'))) await rm(target, { recursive: true, force: true });
});

const runningState = () => ({
  ...createDefaultState(), activeTimer: {
    id: 'timer', title: 'Recherche', notes: 'Notizen', linkedTaskId: 'task',
    startedAt: '2026-10-03T08:00:00.000Z', status: 'running' as const, accumulatedPausedMs: 0,
    timeSegments: [], currentSegmentStartedAt: '2026-10-03T08:00:00.000Z'
  }
});
const closeTime = new Date('2026-10-03T09:00:00.000Z');

describe('journal shutdown persistence', () => {
  it('persists a finished session before restart, including a queued save', async () => {
    const store = new JsonStore();
    await store.load();
    const saving = store.save(runningState());
    const closing = store.prepareForShutdown(closeTime);
    await Promise.all([saving, closing]);
    const restarted = await new JsonStore().load();
    expect(restarted.activeTimer).toBeNull();
    expect(restarted.journalEntries).toHaveLength(1);
    expect(restarted.journalEntries[0]).toMatchObject({
      endedAt: closeTime.toISOString(), workingTimeMs: 3_600_000, pausedTimeMs: 0,
      notes: 'Notizen', linkedTaskId: 'task',
      timeSegments: [{ type: 'work', startedAt: '2026-10-03T08:00:00.000Z', endedAt: closeTime.toISOString() }]
    });
    expect(JSON.parse(await readFile(path.join(mocked.directory, 'mar-helper-data.json'), 'utf8')).activeTimer).toBeNull();
  });

  it('finishes an active pause and retains all previous blocks', async () => {
    const store = new JsonStore();
    const state = runningState();
    const paused = pauseTimer(state.activeTimer, new Date('2026-10-03T08:20:00.000Z'));
    const resumed = resumeTimer(paused, new Date('2026-10-03T08:30:00.000Z'));
    await store.save({ ...state, activeTimer: pauseTimer(resumed, new Date('2026-10-03T08:50:00.000Z')) });
    const closed = await store.prepareForShutdown(closeTime);
    expect(closed.journalEntries[0]).toMatchObject({ workingTimeMs: 2_400_000, pausedTimeMs: 1_200_000 });
    expect(closed.journalEntries[0].timeSegments).toHaveLength(4);
    expect(closed.journalEntries[0].timeSegments!.at(-1)?.type).toBe('pause');
  });

  it('cannot resurrect a timer through late renderer or cloud saves or history', async () => {
    const store = new JsonStore();
    await store.save(runningState());
    await store.prepareForShutdown(closeTime);
    await store.save(runningState());
    await store.replaceFromCloud(runningState());
    await store.prepareForShutdown(new Date('2026-10-04T09:00:00.000Z'));
    const undone = await store.undo();
    expect(undone.ok && undone.state.activeTimer).toBeNull();
    const state = await store.load();
    expect(state.activeTimer).toBeNull();
    expect(state.journalEntries).toHaveLength(1);
    expect(state.journalEntries[0].endedAt).toBe(closeTime.toISOString());
  });

  it('also finishes older timers without a detailed timeline', async () => {
    const store = new JsonStore();
    const state = runningState();
    await store.save({ ...state, activeTimer: { ...state.activeTimer, timeSegments: undefined, currentSegmentStartedAt: undefined, accumulatedPausedMs: 300_000 } });
    const closed = await store.prepareForShutdown(closeTime);
    expect(closed.journalEntries[0]).toMatchObject({ workingTimeMs: 3_300_000, pausedTimeMs: 300_000, timeSegments: undefined });
  });
});
