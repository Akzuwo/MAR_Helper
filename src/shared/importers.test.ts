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
    expect(() => parseImport(JSON.stringify([{ id: 'x' }]))).toThrow('kein gültiger MAR-Helper-Export');
    expect(() => parseImport(JSON.stringify({ format: 'mar-helper-export', formatVersion: 99, data: {} }))).toThrow('noch nicht unterstützt');
  });

  it('keeps different records with the same ID and replaces an individual module', () => {
    const state = createDefaultState();
    state.plannerTasks = [{ ...task, title: 'Alter Titel' }];
    const bundle = parseImport(JSON.stringify({ module: 'planner', data: [task] }));
    const merged = applyImport(state, bundle, 'merge').plannerTasks;
    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe('Alter Titel');
    expect(merged[1].title).toBe(task.title);
    expect(merged[1].id).not.toBe(task.id);
    const empty = parseImport(JSON.stringify({ module: 'planner', data: [] }));
    expect(applyImport(state, empty, 'replace').plannerTasks).toEqual([]);
  });

  it('skips identical IDs and preserves locally disabled modules for a full restore', () => {
    const state = createDefaultState();
    state.settings.modules.prompts = false;
    state.plannerTasks = [task];
    const incoming = createDefaultState();
    incoming.plannerTasks = [task];
    incoming.settings.modules.prompts = true;
    const bundle = parseImport(JSON.stringify({
      format: 'mar-helper-export', formatVersion: 1, appVersion: '1.0.0', exportedAt: new Date().toISOString(), data: incoming
    }));
    const merged = applyImport(state, bundle, 'merge');
    expect(merged.plannerTasks).toEqual([task]);
    expect(merged.settings.modules.prompts).toBe(false);
  });

  it('numbers legacy prompt imports chronologically without colliding with existing entries', () => {
    const state = createDefaultState();
    state.promptEntries = [{
      id: 'existing', number: 1, modelName: 'Codex', prompt: 'Bestehend', response: 'Antwort', createdAt: '2026-08-15T10:00:00.000Z'
    }];
    state.nextPromptNumber = 2;
    const bundle = parseImport(JSON.stringify({ module: 'prompts', data: [
      { id: 'legacy-new', modelName: 'Codex', prompt: 'Neuer', response: 'Antwort', createdAt: '2026-08-18T10:00:00.000Z' },
      { id: 'legacy-old', modelName: 'Codex', prompt: 'Älter', response: 'Antwort', createdAt: '2026-08-17T10:00:00.000Z' }
    ] }));

    const imported = applyImport(state, bundle, 'merge');
    expect(imported.promptEntries.map((entry) => [entry.id, entry.number])).toEqual([
      ['existing', 1], ['legacy-new', 3], ['legacy-old', 2]
    ]);
    expect(imported.nextPromptNumber).toBe(4);
  });

  it('preserves free imported numbers and reassigns collisions during merge', () => {
    const state = createDefaultState();
    state.promptEntries = [{
      id: 'existing', number: 2, title: 'Bestehend', modelName: 'Codex', prompt: 'P', response: 'A', createdAt: '2026-08-15T10:00:00.000Z'
    }];
    state.nextPromptNumber = 3;
    const bundle = parseImport(JSON.stringify({ format: 'mar-helper-export', formatVersion: 2, module: 'prompts', data: [
      { id: 'collision', number: 2, title: 'Kollision', modelName: 'Codex', prompt: 'P2', response: 'A2', createdAt: '2026-08-16T10:00:00.000Z' },
      { id: 'free', number: 7, title: 'Freie Nummer', modelName: 'Codex', prompt: 'P7', response: 'A7', createdAt: '2026-08-17T10:00:00.000Z' },
      { id: 'unnumbered', modelName: 'Codex', prompt: 'P8', response: 'A8', createdAt: '2026-08-18T10:00:00.000Z' }
    ] }));

    const imported = applyImport(state, bundle, 'merge');
    expect(imported.promptEntries.map((entry) => [entry.id, entry.number])).toEqual([
      ['existing', 2], ['collision', 8], ['free', 7], ['unnumbered', 9]
    ]);
    expect(imported.promptEntries.find((entry) => entry.id === 'free')?.title).toBe('Freie Nummer');
    expect(imported.nextPromptNumber).toBe(10);
  });
});
