import { describe, expect, it } from 'vitest';
import { normalizeState } from './defaults';

describe('stored prompt files', () => {
  it('keeps valid internal files and removes invalid links', () => {
    const fileId = '11111111-1111-4111-8111-111111111111';
    const state = normalizeState({
      files: [{ id: fileId, name: 'Bild.png', storedName: `${fileId}.png`, size: 42, mimeType: 'image/png', createdAt: '2026-09-10T12:00:00.000Z' }],
      promptEntries: [{ id: 'prompt', number: 1, modelName: 'GPT-5', prompt: 'P', response: 'A', createdAt: '2026-09-10T12:00:00.000Z', promptFileIds: [fileId, 'missing'] }]
    });
    expect(state.files).toHaveLength(1);
    expect(state.promptEntries[0].promptFileIds).toEqual([fileId]);
  });

  it('rejects paths instead of accepting them as stored names', () => {
    const state = normalizeState({ files: [{ id: '11111111-1111-4111-8111-111111111111', name: 'x', storedName: '../x', size: 1, mimeType: 'text/plain', createdAt: '2026-09-10T12:00:00.000Z' }] });
    expect(state.files).toEqual([]);
  });
});
