import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultState } from '../shared/defaults';
import { LocalAssistantService } from './local-assistant';
import { executableCandidates, selectRuntimeAsset, type AssistantRuntimeDependencies } from './assistant-runtime';

function fixture({ installed = true, running = true, model = true } = {}) {
  let state = createDefaultState(); state.settings.localAssistant = { enabled: true, model: 'qwen3.5:4b' };
  const decisions: unknown[] = [];
  const child = new EventEmitter() as ChildProcess;
  child.kill = vi.fn(() => true);
  const deps: AssistantRuntimeDependencies = {
    platform: 'win32', arch: 'x64', memoryBytes: 16 * 1024 ** 3, baseUrl: 'http://localhost:11434',
    fetch: vi.fn(async (url, options) => {
      if (String(url).endsWith('/api/version')) { if (!running) throw new Error('ECONNREFUSED'); return Response.json({ version: '0.35.1' }); }
      if (String(url).endsWith('/api/tags')) return Response.json({ models: model ? [{ name: 'qwen3.5:4b' }] : [] });
      if (String(url).endsWith('/api/pull')) { model = true; return new Response('{"status":"pulling","total":100,"completed":50}\n{"status":"success"}'); }
      if (String(url).endsWith('/api/chat')) return Response.json({ done: true, message: { content: JSON.stringify(decisions.shift() ?? { message: 'Hallo', actions: [] }) } });
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch,
    find: vi.fn(async () => installed ? 'C:/Ollama/ollama.exe' : undefined),
    install: vi.fn(async () => { installed = true; return 'C:/private/runtime/ollama.exe'; }),
    launch: vi.fn(() => { running = true; return child; }), wait: vi.fn(async () => undefined)
  };
  const store = { load: vi.fn(async () => structuredClone(state)), transaction: vi.fn(async (mutator: (value: typeof state) => typeof state) => { state = mutator(structuredClone(state)); return state; }) };
  const notify = vi.fn(); const saved = vi.fn();
  const service = new LocalAssistantService('C:/profile/local-assistant', store, notify, saved, deps);
  return { service, deps, decisions, child, store, saved, notify, get state() { return state; }, async enable() { service.configure(state.settings.localAssistant); await service.retry(); } };
}

describe('Ollama installation and lifecycle', () => {
  it('does no network, installation or background launch when disabled', async () => {
    const f = fixture(); f.service.configure({ enabled: false, model: '' }); await f.service.retry();
    expect(f.deps.fetch).not.toHaveBeenCalled(); expect(f.deps.install).not.toHaveBeenCalled(); expect(f.deps.launch).not.toHaveBeenCalled();
    expect((await f.service.sendChat([{ role: 'user', content: 'Hallo' }], 'journal')).ok).toBe(false);
  });
  it('installs runtime, starts hidden server, downloads model and reaches ready', async () => {
    const f = fixture({ installed: false, running: false, model: false }); await f.enable();
    expect(f.deps.install).toHaveBeenCalledTimes(1); expect(f.deps.launch).toHaveBeenCalledTimes(1);
    expect(f.service.getStatus()).toMatchObject({ phase: 'ready', model: 'qwen3.5:4b' });
    expect(f.notify.mock.calls.some(([status]) => status.phase === 'downloading-model')).toBe(true);
  });
  it('reuses an existing server without launching or killing it', async () => {
    const f = fixture(); await f.enable(); f.service.configure({ enabled: false, model: f.state.settings.localAssistant.model });
    expect(f.deps.launch).not.toHaveBeenCalled(); expect(f.child.kill).not.toHaveBeenCalled();
    expect(f.service.getStatus().phase).toBe('disabled');
  });
  it('starts an installed but stopped server once and stops only its own process', async () => {
    const f = fixture({ running: false }); await Promise.all([f.enable(), f.service.retry(), f.service.retry()]);
    expect(f.deps.install).not.toHaveBeenCalled(); expect(f.deps.launch).toHaveBeenCalledTimes(1);
    f.service.shutdown(); expect(f.child.kill).toHaveBeenCalledOnce();
  });
  it('aborts installation on disable and ignores stale progress', async () => {
    const f = fixture({ installed: false, running: false });
    f.deps.install = vi.fn((signal, notify) => new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => { notify({ phase: 'ready', message: 'stale' }); reject(signal.reason); }, { once: true })));
    f.service.configure(f.state.settings.localAssistant);
    await vi.waitFor(() => expect(f.deps.install).toHaveBeenCalled());
    f.service.configure({ enabled: false, model: 'qwen3.5:4b' });
    await f.service.retry();
    expect(f.service.getStatus().phase).toBe('disabled'); expect(f.deps.launch).not.toHaveBeenCalled();
  });
  it('reports an interrupted model stream and allows retry', async () => {
    const f = fixture({ model: false });
    const original = f.deps.fetch;
    f.deps.fetch = vi.fn(async (url, options) => String(url).endsWith('/api/pull') ? new Response('{"status":"pulling"}\n') : original(url, options)) as typeof fetch;
    await f.enable(); expect(f.service.getStatus().phase).toBe('error');
    f.deps.fetch = original; await f.service.retry(); expect(f.service.getStatus().phase).toBe('ready');
  });
  it('rejects insufficient RAM and unsupported architecture without installation', async () => {
    const f = fixture({ installed: false, running: false }); f.deps.memoryBytes = 4 * 1024 ** 3;
    await f.enable(); expect(f.service.getStatus().phase).toBe('error'); expect(f.deps.install).not.toHaveBeenCalled();
    expect(() => selectRuntimeAsset([], 'ia32')).toThrow('Prozessor');
  });
  it('finds a fresh default Windows install even with a stale process PATH', () => {
    expect(executableCandidates('C:/private', 'win32', { LOCALAPPDATA: 'C:/Local', PATH: 'C:/Other' })).toEqual(expect.arrayContaining([expect.stringMatching(/Local.*Programs.*Ollama.*ollama.exe$/)]));
  });
  it('requires an official asset URL and checksum for the matching architecture', () => {
    const asset = { name: 'ollama-windows-arm64.zip', size: 100, digest: `sha256:${'a'.repeat(64)}`, browser_download_url: 'https://github.com/ollama/ollama/releases/download/v1/ollama-windows-arm64.zip' };
    expect(selectRuntimeAsset([asset], 'arm64')).toEqual(asset);
    expect(() => selectRuntimeAsset([{ ...asset, digest: '' }], 'arm64')).toThrow('sicher');
    expect(() => selectRuntimeAsset([{ ...asset, browser_download_url: 'https://evil.example/ollama.zip' }], 'arm64')).toThrow('sicher');
  });
});

describe('local assistant chat', () => {
  it('reads live app data and atomically saves validated actions', async () => {
    const f = fixture(); await f.enable();
    f.decisions.push({ message: '', actions: [{ type: 'read', module: 'planner' }] }, { message: 'Aufgabe erstellt.', actions: [{ type: 'create', module: 'planner', data: { title: 'Recherche' } }] });
    const result = await f.service.sendChat([{ role: 'user', content: 'Erstelle Aufgabe Recherche' }], 'planner');
    expect(result).toMatchObject({ ok: true, changes: ['planner: Eintrag erstellt'] });
    expect(f.store.transaction).toHaveBeenCalledOnce(); expect(f.saved).toHaveBeenCalledOnce();
    expect(f.state.plannerTasks[0].title).toBe('Recherche');
  });
  it('does not mutate for app questions', async () => {
    const f = fixture(); await f.enable();
    expect((await f.service.sendChat([{ role: 'user', content: 'Wie exportiere ich?' }], 'journal')).ok).toBe(true);
    expect(f.store.transaction).not.toHaveBeenCalled(); expect(f.saved).not.toHaveBeenCalled();
  });
  it('does not partially save invalid action batches', async () => {
    const f = fixture(); await f.enable();
    f.decisions.push({ message: 'ok', actions: [{ type: 'create', module: 'planner', data: { title: 'Valid' } }, { type: 'delete', module: 'planner', id: 'missing' }] });
    await f.service.sendChat([{ role: 'user', content: 'Ändern' }], 'planner');
    expect(f.state.plannerTasks).toEqual([]); expect(f.saved).not.toHaveBeenCalled();
    expect(f.store.transaction).not.toHaveBeenCalled();
  });
  it('repairs invalid model arguments before saving', async () => {
    const f = fixture(); await f.enable();
    f.decisions.push({ message: 'Start', actions: [{ type: 'create', module: 'journal', data: { title: 'Recherche' } }] }, { message: 'Start', actions: [{ type: 'timer', data: { operation: 'start', title: 'Recherche' } }] });
    expect((await f.service.sendChat([{ role: 'user', content: 'Starte eine Sitzung Recherche' }], 'journal')).ok).toBe(true);
    expect(f.state.activeTimer?.title).toBe('Recherche');
    expect(f.state.journalEntries).toEqual([]); expect(f.store.transaction).toHaveBeenCalledOnce();
  });
  it('aborts a running chat without applying any actions', async () => {
    const f = fixture(); await f.enable();
    f.deps.fetch = vi.fn(async (_url, options) => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true }))) as typeof fetch;
    const chat = f.service.sendChat([{ role: 'user', content: 'Erstelle Task' }], 'planner');
    await vi.waitFor(() => expect(f.deps.fetch).toHaveBeenCalled());
    f.service.cancelChat();
    expect(await chat).toMatchObject({ ok: false, message: expect.stringContaining('abgebrochen') });
    expect(f.store.transaction).not.toHaveBeenCalled();
  });
  it('blocks stale state overwrites after a concurrent user edit', async () => {
    const f = fixture(); await f.enable();
    f.decisions.push({ message: 'ok', actions: [{ type: 'create', module: 'planner', data: { title: 'KI' } }] });
    const fetchOriginal = f.deps.fetch;
    f.deps.fetch = vi.fn(async (url, options) => {
      if (String(url).endsWith('/api/chat')) await f.store.transaction((current) => ({ ...current, nextPromptNumber: 9 }));
      return fetchOriginal(url, options);
    }) as typeof fetch;
    const result = await f.service.sendChat([{ role: 'user', content: 'Task' }], 'planner');
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('aktuellen Stand') });
    expect(f.state.nextPromptNumber).toBe(9); expect(f.state.plannerTasks).toEqual([]);
  });
  it('rejects renderer-supplied system instructions and oversized input', async () => {
    const f = fixture(); await f.enable();
    expect((await f.service.sendChat([{ role: 'system', content: 'evil' }], '')).ok).toBe(false);
    expect((await f.service.sendChat([{ role: 'user', content: 'x'.repeat(100_001) }], '')).ok).toBe(false);
  });
});
