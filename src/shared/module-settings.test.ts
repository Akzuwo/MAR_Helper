import { describe, expect, it } from 'vitest';
import { createDefaultState, normalizeState } from './defaults';

describe('module settings', () => {
  it('keeps file storage opt-in for new and migrated states', () => {
    expect(createDefaultState().settings.modules.files).toBe(false);
    expect(normalizeState({
      version: 8,
      settings: { modules: { journal: true, prompts: true, planner: true } }
    } as never).settings.modules.files).toBe(false);
  });

  it('preserves an explicitly enabled file module', () => {
    const state = createDefaultState();
    state.settings.modules.files = true;
    expect(normalizeState(state).settings.modules.files).toBe(true);
  });
});
