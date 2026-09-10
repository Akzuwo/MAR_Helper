import { describe, expect, it } from 'vitest';
import { createDefaultState, normalizeState } from './defaults';

describe('visual effect settings', () => {
  it('keeps the optional scroll effects disabled for new and migrated data', () => {
    expect(createDefaultState().settings.visualEffects.scrollEffects).toBe(false);
    const migrated = normalizeState({ version: 6, settings: { modules: { journal: true, prompts: true, planner: true } } } as never);
    expect(migrated.version).toBe(8);
    expect(migrated.settings.visualEffects.scrollEffects).toBe(false);
  });

  it('preserves an explicitly enabled scroll effect setting', () => {
    const state = createDefaultState();
    state.settings.visualEffects.scrollEffects = true;
    expect(normalizeState(state).settings.visualEffects.scrollEffects).toBe(true);
  });
});

describe('terms acceptance', () => {
  it('requires acceptance for old states and preserves a valid acceptance timestamp', () => {
    expect(normalizeState({ version: 8 } as never).settings.termsAcceptedAt).toBeUndefined();
    const acceptedAt = '2026-09-10T08:00:00.000Z';
    const state = createDefaultState();
    state.settings.termsAcceptedAt = acceptedAt;
    expect(normalizeState(state).settings.termsAcceptedAt).toBe(acceptedAt);
  });
});
