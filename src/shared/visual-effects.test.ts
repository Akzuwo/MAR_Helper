import { describe, expect, it } from 'vitest';
import { createDefaultState, normalizeState } from './defaults';

describe('visual effect settings', () => {
  it('keeps the optional scroll effects disabled for new and migrated data', () => {
    expect(createDefaultState().settings.visualEffects.scrollEffects).toBe(false);
    const migrated = normalizeState({ version: 6, settings: { modules: { journal: true, prompts: true, planner: true } } } as never);
    expect(migrated.version).toBe(7);
    expect(migrated.settings.visualEffects.scrollEffects).toBe(false);
  });

  it('preserves an explicitly enabled scroll effect setting', () => {
    const state = createDefaultState();
    state.settings.visualEffects.scrollEffects = true;
    expect(normalizeState(state).settings.visualEffects.scrollEffects).toBe(true);
  });
});
