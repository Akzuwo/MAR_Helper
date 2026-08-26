import { describe, expect, it } from 'vitest';
import { BackgroundWork } from './background-work';

describe('background work lifecycle', () => {
  it('stays busy until every tracked operation has settled', async () => {
    const work = new BackgroundWork();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = work.track(new Promise<void>((resolve) => { finishFirst = resolve; }));
    const second = work.track(new Promise<void>((resolve) => { finishSecond = resolve; }));
    let becameIdle = false;
    const idle = work.waitForIdle().then(() => { becameIdle = true; });

    expect(work.isBusy()).toBe(true);
    finishFirst();
    await first;
    expect(becameIdle).toBe(false);
    finishSecond();
    await Promise.all([second, idle]);
    expect(work.isBusy()).toBe(false);
    expect(becameIdle).toBe(true);
  });

  it('also becomes idle when an operation fails', async () => {
    const work = new BackgroundWork();
    await expect(work.track(Promise.reject(new Error('failed')))).rejects.toThrow('failed');
    await expect(work.waitForIdle()).resolves.toBeUndefined();
    expect(work.isBusy()).toBe(false);
  });
});
