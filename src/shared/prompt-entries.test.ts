import { describe, expect, it } from 'vitest';
import { normalizeState } from './defaults';
import type { PromptEntry } from './models';
import { createPromptChat, matchesPromptSearch, movePromptToChat, promptDisplayNumber, upsertPromptEntry } from './prompt-entries';

const prompt = (id: string, createdAt: string, number = 0, title?: string): PromptEntry => ({
  id, number, title, modelName: 'Codex', prompt: `Prompt ${id}`, response: `Antwort ${id}`, createdAt
});

describe('persistent prompt numbering', () => {
  it('migrates unnumbered entries chronologically exactly once without changing their order or content', () => {
    const state = normalizeState({ promptEntries: [
      { ...prompt('newest', '2026-08-18T12:00:00.000Z'), number: undefined },
      { ...prompt('oldest', '2026-08-16T12:00:00.000Z'), number: undefined },
      { ...prompt('middle', '2026-08-17T12:00:00.000Z'), number: undefined }
    ] } as never);

    expect(state.promptEntries.map((entry) => [entry.id, entry.number])).toEqual([
      ['newest', 3], ['oldest', 1], ['middle', 2]
    ]);
    expect(state.promptEntries.map((entry) => entry.prompt)).toEqual(['Prompt newest', 'Prompt oldest', 'Prompt middle']);
    expect(state.nextPromptNumber).toBe(4);
    expect(normalizeState(state).promptEntries.map((entry) => entry.number)).toEqual([3, 1, 2]);
  });

  it('never reuses numbers after deletion and preserves numbers while editing titles', () => {
    let state = normalizeState({
      promptEntries: [
        prompt('one', '2026-08-16T12:00:00.000Z', 1),
        prompt('two', '2026-08-17T12:00:00.000Z', 2),
        prompt('three', '2026-08-18T12:00:00.000Z', 3)
      ],
      nextPromptNumber: 4
    } as never);
    state = { ...state, promptEntries: state.promptEntries.filter((entry) => entry.number !== 2) };
    state = upsertPromptEntry(state, prompt('four', '2026-08-19T12:00:00.000Z'));
    expect(state.promptEntries.map((entry) => entry.number)).toEqual([1, 3, 4]);

    state = { ...state, promptEntries: state.promptEntries.filter((entry) => entry.number !== 4) };
    state = upsertPromptEntry(state, prompt('five', '2026-08-20T12:00:00.000Z'));
    expect(state.promptEntries.at(-1)?.number).toBe(5);
    expect(state.nextPromptNumber).toBe(6);

    state = upsertPromptEntry(state, { ...state.promptEntries[0], title: '  Neuer Titel  ' });
    expect(state.promptEntries[0]).toMatchObject({ number: 1, title: 'Neuer Titel' });
    state = upsertPromptEntry(state, { ...state.promptEntries[0], title: '   ' });
    expect(state.promptEntries[0].title).toBeUndefined();
  });

  it('searches by title, model, content and both number formats', () => {
    const entry = { ...prompt('search', '2026-08-18T12:00:00.000Z', 12, 'Git-Integration'), modelName: 'GPT-5.6 Codex' };
    expect(matchesPromptSearch(entry, '12')).toBe(true);
    expect(matchesPromptSearch(entry, '#12')).toBe(true);
    expect(matchesPromptSearch(entry, 'git-integration')).toBe(true);
    expect(matchesPromptSearch(entry, 'gpt-5.6')).toBe(true);
    expect(matchesPromptSearch(entry, 'Antwort search')).toBe(true);
    expect(matchesPromptSearch(entry, '#13')).toBe(false);
  });

  it('numbers chats on the top level and never reuses local prompt numbers', () => {
    let state = normalizeState(undefined);
    const created = createPromptChat(state, 'Kapitel überarbeiten', '2026-09-09T08:00:00.000Z');
    state = created.state;
    expect(created.chat.number).toBe(1);

    state = upsertPromptEntry(state, { ...prompt('chat-one', '2026-09-09T08:01:00.000Z'), chatId: created.chat.id });
    state = upsertPromptEntry(state, { ...prompt('chat-two', '2026-09-09T08:02:00.000Z'), chatId: created.chat.id });
    expect(state.promptEntries.map((entry) => promptDisplayNumber(entry, state.promptChats))).toEqual(['1.1', '1.2']);

    state = { ...state, promptEntries: state.promptEntries.filter((entry) => entry.id !== 'chat-two') };
    state = upsertPromptEntry(state, { ...prompt('chat-three', '2026-09-09T08:03:00.000Z'), chatId: created.chat.id });
    expect(promptDisplayNumber(state.promptEntries.at(-1)!, state.promptChats)).toBe('1.3');

    state = upsertPromptEntry(state, prompt('standalone', '2026-09-09T08:04:00.000Z'));
    expect(state.promptEntries.at(-1)?.number).toBe(2);
  });

  it('moves a standalone prompt into a chat and remembers its model', () => {
    let state = normalizeState(undefined);
    const created = createPromptChat(state, 'Zielchat');
    state = created.state;
    state = upsertPromptEntry(state, { ...prompt('standalone', '2026-09-09T08:00:00.000Z'), modelId: 'model-gemini' });
    expect(state.lastPromptModelId).toBe('model-gemini');

    state = movePromptToChat(state, 'standalone', created.chat.id);
    expect(state.promptEntries[0]).toMatchObject({ chatId: created.chat.id, number: 1 });
    expect(state.promptChats[0].nextPromptNumber).toBe(2);
    expect(state.nextPromptNumber).toBe(3);
  });
});
