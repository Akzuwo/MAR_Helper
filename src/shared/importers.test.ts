import { describe, expect, it } from 'vitest';
import { createDefaultState } from './defaults';
import { applyImport, parseImport } from './importers';

const task = {
  id: 'task-1', title: 'Gliederung schreiben', completed: false,
  createdAt: '2026-08-17T10:00:00.000Z'
};

describe('MAR Helper imports', () => {
  it('recognizes a module envelope including an empty export', () => {
    const bundle = parseImport(JSON.stringify({ format: 'mar-helper', version: 1, module: 'journal', data: [] }));
    expect(bundle.kind).toBe('journal');
    expect(bundle.counts.journal).toBe(0);
  });

  it('recognizes legacy non-empty array exports', () => {
    const bundle = parseImport(JSON.stringify([task]));
    expect(bundle.kind).toBe('planner');
    expect(bundle.plannerTasks).toEqual([task]);
  });

  it('rejects invalid and mixed content', () => {
    expect(() => parseImport('{broken')).toThrow('kein gültiges JSON');
    expect(() => parseImport(JSON.stringify([{ id: 'x' }]))).toThrow('gemischte oder ungültige');
  });

  it('merges by ID and replaces an individual module', () => {
    const state = createDefaultState();
    state.plannerTasks = [{ ...task, title: 'Alter Titel' }];
    const bundle = parseImport(JSON.stringify({ module: 'planner', data: [task] }));
    expect(applyImport(state, bundle, 'merge').plannerTasks).toEqual([task]);
    const empty = parseImport(JSON.stringify({ module: 'planner', data: [] }));
    expect(applyImport(state, empty, 'replace').plannerTasks).toEqual([]);
  });
});
