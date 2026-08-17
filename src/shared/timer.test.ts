import { describe, expect, it } from 'vitest';
import type { ActiveTimer } from './models';
import { getPausedTimeMs, getWorkingTimeMs, pauseTimer, resumeTimer } from './timer';

const start = new Date('2026-08-17T10:00:00.000Z');

describe('persistent timer calculations', () => {
  it('reconstructs a running timer after a restart', () => {
    const timer: ActiveTimer = { id: '1', title: 'Arbeit', startedAt: start.toISOString(), status: 'running', accumulatedPausedMs: 0 };
    expect(getWorkingTimeMs(timer, new Date('2026-08-17T11:15:30.000Z').getTime())).toBe(4_530_000);
  });

  it('does not count an active pause as working time', () => {
    const timer: ActiveTimer = { id: '1', title: 'Arbeit', startedAt: start.toISOString(), status: 'paused', pausedAt: '2026-08-17T10:45:00.000Z', accumulatedPausedMs: 300_000 };
    const now = new Date('2026-08-17T11:30:00.000Z').getTime();
    expect(getPausedTimeMs(timer, now)).toBe(3_000_000);
    expect(getWorkingTimeMs(timer, now)).toBe(2_400_000);
  });

  it('accumulates multiple pauses without double counting', () => {
    const timer: ActiveTimer = { id: '1', title: 'Arbeit', startedAt: start.toISOString(), status: 'running', accumulatedPausedMs: 0 };
    const paused = pauseTimer(timer, new Date('2026-08-17T10:20:00.000Z'));
    const resumed = resumeTimer(paused, new Date('2026-08-17T10:30:00.000Z'));
    const pausedAgain = pauseTimer(resumed, new Date('2026-08-17T10:50:00.000Z'));
    const resumedAgain = resumeTimer(pausedAgain, new Date('2026-08-17T11:00:00.000Z'));
    expect(resumedAgain.accumulatedPausedMs).toBe(1_200_000);
    expect(getWorkingTimeMs(resumedAgain, new Date('2026-08-17T11:10:00.000Z').getTime())).toBe(3_000_000);
  });

  it('makes pause and resume idempotent', () => {
    const timer: ActiveTimer = { id: '1', title: 'Arbeit', startedAt: start.toISOString(), status: 'running', accumulatedPausedMs: 0 };
    const paused = pauseTimer(timer, new Date('2026-08-17T10:20:00.000Z'));
    expect(pauseTimer(paused, new Date('2026-08-17T10:25:00.000Z'))).toBe(paused);
    const resumed = resumeTimer(paused, new Date('2026-08-17T10:30:00.000Z'));
    expect(resumeTimer(resumed, new Date('2026-08-17T10:35:00.000Z'))).toBe(resumed);
  });
});
