import { describe, expect, it } from 'vitest';
import { cloudDataFrom, cloudDifference } from './cloud-save';
import { createDefaultState } from './defaults';

describe('cloud save change protection', () => {
  it('allows small remote updates without an extreme-change warning', () => {
    const local = createDefaultState();
    const remote = cloudDataFrom(local);
    remote.plannerTasks = [{ id: 'task-1', title: 'Neu', completed: false, createdAt: '2026-08-20T10:00:00.000Z' }];
    expect(cloudDifference(local, remote)).toEqual({ changedEntries: 1, extreme: false });
  });

  it('warns when a large share of entries changes', () => {
    const local = createDefaultState();
    local.plannerTasks = Array.from({ length: 12 }, (_, index) => ({ id: `local-${index}`, title: `Lokal ${index}`, completed: false, createdAt: '2026-08-20T10:00:00.000Z' }));
    const remote = cloudDataFrom(createDefaultState());
    remote.plannerTasks = Array.from({ length: 12 }, (_, index) => ({ id: `remote-${index}`, title: `Cloud ${index}`, completed: false, createdAt: '2026-08-20T10:00:00.000Z' }));
    expect(cloudDifference(local, remote)).toEqual({ changedEntries: 24, extreme: true });
  });
});
