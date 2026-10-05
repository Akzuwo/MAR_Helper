import { describe, expect, it } from 'vitest';
import type { JournalEntry } from './models';
import { updateJournalTimeline } from './journal';

const entry: JournalEntry = {
  id: 'session', title: 'Recherche', notes: 'Quellen', linkedTaskId: 'task',
  startedAt: '2026-10-03T08:00:00.123Z', endedAt: '2026-10-03T12:00:00.456Z',
  workingTimeMs: 13_500_333, pausedTimeMs: 900_000,
  timeSegments: [
    { type: 'work', startedAt: '2026-10-03T08:00:00.123Z', endedAt: '2026-10-03T09:00:00.123Z' },
    { type: 'pause', startedAt: '2026-10-03T09:00:00.123Z', endedAt: '2026-10-03T09:15:00.123Z' },
    { type: 'work', startedAt: '2026-10-03T09:15:00.123Z', endedAt: '2026-10-03T12:00:00.456Z' }
  ]
};

describe('journal block corrections', () => {
  it('removes a runaway work block and updates the bounds and totals', () => {
    const updated = updateJournalTimeline(entry, entry.timeSegments!.slice(0, 2));
    expect(updated).toMatchObject({ endedAt: '2026-10-03T09:15:00.123Z', workingTimeMs: 3_600_000, pausedTimeMs: 900_000, notes: 'Quellen', linkedTaskId: 'task' });
    expect(entry.timeSegments).toHaveLength(3);
  });

  it('leaves a deleted internal pause uncounted instead of turning it into work', () => {
    const updated = updateJournalTimeline(entry, entry.timeSegments!.filter((segment) => segment.type === 'work'));
    expect(updated.workingTimeMs).toBe(entry.workingTimeMs);
    expect(updated.pausedTimeMs).toBe(0);
  });

  it('recalculates edited times and types while retaining exact timestamps', () => {
    const segments = entry.timeSegments!.map((segment) => ({ ...segment }));
    segments[2].endedAt = '2026-10-03T09:45:00.123Z';
    segments[1].type = 'work';
    expect(updateJournalTimeline(entry, segments.reverse())).toMatchObject({
      startedAt: entry.startedAt, endedAt: '2026-10-03T09:45:00.123Z', workingTimeMs: 6_300_000, pausedTimeMs: 0
    });
  });

  it('rejects overlapping blocks, reversed times and invalid dates', () => {
    expect(() => updateJournalTimeline(entry, [...entry.timeSegments!, entry.timeSegments![0]])).toThrow('überschneiden');
    expect(() => updateJournalTimeline(entry, [{ type: 'work', startedAt: entry.endedAt, endedAt: entry.startedAt }])).toThrow('vor der Startzeit');
    expect(() => updateJournalTimeline(entry, [{ type: 'pause', startedAt: '', endedAt: entry.endedAt }])).toThrow('gültige Zeitpunkte');
  });

  it('allows deleting every block without recreating work time', () => {
    expect(updateJournalTimeline(entry, [])).toMatchObject({ timeSegments: [], startedAt: entry.startedAt, endedAt: entry.startedAt, workingTimeMs: 0, pausedTimeMs: 0 });
  });
});
