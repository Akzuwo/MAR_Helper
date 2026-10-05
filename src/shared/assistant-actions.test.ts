import { describe, expect, it } from 'vitest';
import { createDefaultState, normalizeState } from './defaults';
import { applyAssistantActions, parseAssistantDecision, readAssistantData } from './assistant-actions';
import { selectAssistantModel } from './assistant-models';
const at = new Date('2026-10-03T10:00:00Z');

describe('local assistant data actions', () => {
  it('is opt-in, including older backups and invalid settings', () => {
    expect(createDefaultState().settings.localAssistant.enabled).toBe(false);
    expect(normalizeState({ settings: {} } as never).settings.localAssistant).toEqual({ enabled: false, model: '' });
    expect(normalizeState({ settings: { localAssistant: { enabled: 'true', model: '../../evil' } } } as never).settings.localAssistant).toEqual({ enabled: false, model: '' });
  });
  it('chooses stronger Qwen 3.5 models while reserving RAM', () => {
    expect(selectAssistantModel(8 * 1024 ** 3).model).toBe('qwen3.5:2b');
    expect(selectAssistantModel(16 * 1024 ** 3).model).toBe('qwen3.5:4b');
    expect(selectAssistantModel(32 * 1024 ** 3).model).toBe('qwen3.5:9b');
  });
  it('rejects malformed decisions and unsupported operations', () => {
    expect(() => parseAssistantDecision({ message: 'ok', actions: [{ type: 'create', data: 'oops' }] })).toThrow();
    expect(() => applyAssistantActions(createDefaultState(), [{ type: 'run_shell', data: { command: 'bad' } }])).toThrow();
    expect(() => applyAssistantActions(createDefaultState(), [{ type: 'create', module: 'settings', data: { enabled: true } }])).toThrow();
  });
  it('accepts null optional fields without inventing missing required data', () => {
    const decision = parseAssistantDecision({ message: 'ok', actions: [{ type: 'create', module: 'planner', id: null, data: { title: 'Test', dueDate: null } }] });
    expect(applyAssistantActions(createDefaultState(), decision.actions).state.plannerTasks[0].dueDate).toBeUndefined();
    expect(() => applyAssistantActions(createDefaultState(), parseAssistantDecision({ message: 'ok', actions: [{ type: 'create', module: 'planner', data: { title: null } }] }).actions)).toThrow();
  });
  it('creates, reads, updates and deletes tasks without changing unrelated data', () => {
    const input = createDefaultState();
    let result = applyAssistantActions(input, [{ type: 'create', module: 'planner', data: { title: 'Recherche', dueDate: '2026-10-04' } }], at);
    const task = result.state.plannerTasks[0];
    expect(readAssistantData(result.state, { type: 'read', module: 'planner', data: { query: 'Recherche' } })).toMatchObject({ total: 1 });
    result = applyAssistantActions(result.state, [{ type: 'update', module: 'planner', id: task.id, data: { completed: true } }], at);
    expect(result.state.plannerTasks[0]).toMatchObject({ title: 'Recherche', completed: true, dueDate: '2026-10-04' });
    result = applyAssistantActions(result.state, [{ type: 'delete', module: 'planner', id: task.id }]);
    expect(result.state.plannerTasks).toEqual([]);
    expect(input.plannerTasks).toEqual([]);
    expect(result.state.promptModels).toEqual(input.promptModels);
  });
  it('rejects invalid dates, unknown IDs and string booleans atomically', () => {
    const input = createDefaultState();
    for (const data of [{ title: 'X', dueDate: '2026-02-30' }, { title: 'X', completed: 'true' }]) {
      expect(() => applyAssistantActions(input, [{ type: 'create', module: 'planner', data }])).toThrow();
    }
    expect(() => applyAssistantActions(input, [{ type: 'create', module: 'planner', data: { title: 'Valid' } }, { type: 'update', module: 'planner', id: 'missing' }])).toThrow();
    expect(input.plannerTasks).toEqual([]);
  });
  it('uses app numbering and model snapshots for prompts', () => {
    let result = applyAssistantActions(createDefaultState(), [{ type: 'create', module: 'prompts', data: { modelName: 'Qwen 3.5', prompt: 'Frage', response: 'Antwort' } }], at);
    expect(result.state.promptEntries[0]).toMatchObject({ number: 1, modelName: 'Qwen 3.5', prompt: 'Frage', response: 'Antwort' });
    expect(result.state.nextPromptNumber).toBe(2);
    result = applyAssistantActions(result.state, [{ type: 'update', module: 'prompts', id: result.state.promptEntries[0].id, data: { title: 'Umbenannt' } }], at);
    expect(result.state.promptEntries[0].response).toBe('Antwort');
    expect(() => applyAssistantActions(result.state, [{ type: 'create', module: 'prompts', data: { modelName: 'X', prompt: 'X', chatId: 'missing' } }])).toThrow();
  });
  it('keeps chat numbering and deletes associated prompts together', () => {
    let result = applyAssistantActions(createDefaultState(), [{ type: 'create', module: 'chats', data: { title: 'Chat' } }]);
    const chat = result.state.promptChats[0];
    result = applyAssistantActions(result.state, [{ type: 'create', module: 'prompts', data: { modelName: 'GPT-5', prompt: 'Hallo', chatId: chat.id } }]);
    expect(result.state.promptEntries[0]).toMatchObject({ chatId: chat.id, number: 1 });
    expect(result.state.promptChats[0].nextPromptNumber).toBe(2);
    result = applyAssistantActions(result.state, [{ type: 'delete', module: 'chats', id: chat.id }]);
    expect(result.state.promptEntries).toEqual([]);
  });
  it('starts, pauses, resumes and saves a session through existing timer logic', () => {
    let state = applyAssistantActions(createDefaultState(), [{ type: 'timer', data: { operation: 'start', title: 'Recherche' } }], at).state;
    expect(() => applyAssistantActions(state, [{ type: 'timer', data: { operation: 'start', title: 'Second' } }])).toThrow('bereits');
    state = applyAssistantActions(state, [{ type: 'timer', data: { operation: 'pause' } }], new Date(at.getTime() + 60_000)).state;
    state = applyAssistantActions(state, [{ type: 'timer', data: { operation: 'resume' } }], new Date(at.getTime() + 120_000)).state;
    state = applyAssistantActions(state, [{ type: 'timer', data: { operation: 'stop' } }], new Date(at.getTime() + 180_000)).state;
    expect(state.activeTimer).toBeNull();
    expect(state.journalEntries[0]).toMatchObject({ workingTimeMs: 120_000, pausedTimeMs: 60_000 });
    expect(state.journalEntries[0].timeSegments).toHaveLength(3);
  });
  it('preserves journal blocks for metadata changes and validates time corrections', () => {
    let state = applyAssistantActions(createDefaultState(), [{ type: 'create', module: 'journal', data: { title: 'Recherche', startedAt: at.toISOString(), endedAt: '2026-10-03T11:00:00Z', timeSegments: [{ type: 'work', startedAt: at.toISOString(), endedAt: '2026-10-03T11:00:00Z' }] } }]).state;
    const entry = state.journalEntries[0];
    state = applyAssistantActions(state, [{ type: 'update', module: 'journal', id: entry.id, data: { notes: 'Neu' } }]).state;
    expect(state.journalEntries[0].timeSegments).toEqual(entry.timeSegments);
    expect(() => applyAssistantActions(state, [{ type: 'update', module: 'journal', id: entry.id, data: { endedAt: '2026-10-03T12:00:00Z' } }])).toThrow('Zeitachse');
    expect(() => applyAssistantActions(state, [{ type: 'create', module: 'journal', data: { title: 'X', startedAt: at.toISOString(), endedAt: '2026-10-03T09:00:00Z' } }])).toThrow();
    expect(() => applyAssistantActions(state, [{ type: 'create', module: 'journal', data: { title: 'X', startedAt: '2026-02-30T10:00:00Z', endedAt: '2026-03-03T10:00:00Z' } }])).toThrow('gültigen');
  });
  it('imports raw journal and prompt tables through the existing parser', () => {
    const journal = 'Titel;Start;Ende\nRecherche;03.10.2026 10:00;03.10.2026 11:00';
    const prompt = 'Modell;Prompt;Antwort;Datum\nGPT-5;Hallo;Welt;03.10.2026';
    let state = applyAssistantActions(createDefaultState(), [{ type: 'import_raw', module: 'journal', data: { text: journal } }]).state;
    expect(state.journalEntries).toHaveLength(1);
    state = applyAssistantActions(state, [{ type: 'import_raw', module: 'prompts', data: { text: prompt } }]).state;
    expect(state.promptEntries).toHaveLength(1);
    expect(() => applyAssistantActions(state, [{ type: 'import_raw', module: 'prompts', data: { text: journal } }])).toThrow('Modul');
  });
  it('searches old entries with bounded pagination rather than hiding them', () => {
    const state = createDefaultState();
    state.plannerTasks = Array.from({ length: 55 }, (_, index) => ({ id: `${index}`, title: `Task ${index}`, completed: false, createdAt: at.toISOString() }));
    expect(readAssistantData(state, { type: 'read', module: 'planner', data: { offset: 40, limit: 20 } })).toMatchObject({ total: 55, offset: 40, hasMore: false });
    expect(readAssistantData(state, { type: 'read', module: 'planner', id: '0' })).toMatchObject({ total: 1, items: [{ id: '0' }] });
  });
});
