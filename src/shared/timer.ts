import type { ActiveTimer } from './models';

export function getPausedTimeMs(timer: ActiveTimer, at = Date.now()): number {
  if (timer.status !== 'paused' || !timer.pausedAt) return timer.accumulatedPausedMs;
  return timer.accumulatedPausedMs + Math.max(0, at - Date.parse(timer.pausedAt));
}

export function getWorkingTimeMs(timer: ActiveTimer, at = Date.now()): number {
  const total = Math.max(0, at - Date.parse(timer.startedAt));
  return Math.max(0, total - getPausedTimeMs(timer, at));
}

export function pauseTimer(timer: ActiveTimer, at = new Date()): ActiveTimer {
  if (timer.status === 'paused') return timer;
  return { ...timer, status: 'paused', pausedAt: at.toISOString() };
}

export function resumeTimer(timer: ActiveTimer, at = new Date()): ActiveTimer {
  if (timer.status === 'running' || !timer.pausedAt) return timer;
  return {
    ...timer,
    status: 'running',
    accumulatedPausedMs:
      timer.accumulatedPausedMs + Math.max(0, at.getTime() - Date.parse(timer.pausedAt)),
    pausedAt: undefined
  };
}

export function formatDuration(ms: number, compact = false): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (compact) {
    if (hours > 0) return `${hours} h ${minutes} min`;
    return `${minutes} min`;
  }
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}
