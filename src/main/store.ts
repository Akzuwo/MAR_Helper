import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createDefaultState, normalizeState } from '../shared/defaults';
import type { AppState, HistoryResult, HistoryStatus } from '../shared/models';

interface HistoryData { past: AppState[]; future: AppState[] }
const HISTORY_LIMIT = 50;

export class JsonStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly historyPath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'mar-helper-data.json');
    this.historyPath = path.join(app.getPath('userData'), 'mar-helper-history.json');
  }

  async load(): Promise<AppState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const input = JSON.parse(raw) as Partial<AppState>;
      const state = normalizeState(input);
      if (JSON.stringify(input) !== JSON.stringify(state)) await this.writeState(state).catch(() => undefined);
      return state;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        await fs.copyFile(this.filePath, backup).catch(() => undefined);
      }
      const state = createDefaultState();
      await this.save(state);
      return state;
    }
  }

  async save(input: AppState): Promise<AppState> {
    const state = normalizeState(input);
    const write = async () => {
      const current = await this.readCurrent().catch(() => undefined);
      if (current && JSON.stringify(current) !== JSON.stringify(state)) {
        const history = await this.readHistory();
        history.past.push(current);
        history.past = history.past.slice(-HISTORY_LIMIT);
        history.future = [];
        await this.writeHistory(history);
      }
      await this.writeState(state);
    };
    this.writeQueue = this.writeQueue.then(write, write);
    await this.writeQueue;
    return state;
  }

  async transaction(mutator: (current: AppState) => AppState): Promise<AppState> {
    let result: AppState | undefined;
    const run = async () => {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const current = normalizeState(JSON.parse(raw) as Partial<AppState>);
      result = normalizeState(mutator(current));
      if (JSON.stringify(current) !== JSON.stringify(result)) {
        const history = await this.readHistory();
        history.past.push(current);
        history.past = history.past.slice(-HISTORY_LIMIT);
        history.future = [];
        await this.writeHistory(history);
      }
      await this.writeState(result);
    };
    this.writeQueue = this.writeQueue.then(run, run);
    await this.writeQueue;
    if (!result) throw new Error('Die lokale Datenbank konnte nicht aktualisiert werden.');
    return result;
  }

  async historyStatus(): Promise<HistoryStatus> {
    const history = await this.readHistory();
    return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
  }

  async undo(): Promise<HistoryResult> { return this.moveHistory('undo'); }
  async redo(): Promise<HistoryResult> { return this.moveHistory('redo'); }

  async replaceFromCloud(input: AppState): Promise<AppState> {
    return this.save(input);
  }

  private async moveHistory(direction: 'undo' | 'redo'): Promise<HistoryResult> {
    let result: HistoryResult | undefined;
    const run = async () => {
      const history = await this.readHistory();
      const source = direction === 'undo' ? history.past : history.future;
      if (source.length === 0) {
        result = { ok: false, message: direction === 'undo' ? 'Keine Änderung zum Rückgängigmachen vorhanden.' : 'Keine Änderung zum Wiederherstellen vorhanden.', status: { canUndo: history.past.length > 0, canRedo: history.future.length > 0 } };
        return;
      }
      const current = await this.readCurrent();
      const target = normalizeState(source.pop());
      const destination = direction === 'undo' ? history.future : history.past;
      destination.push(current);
      if (destination.length > HISTORY_LIMIT) destination.splice(0, destination.length - HISTORY_LIMIT);
      await this.writeState(target);
      await this.writeHistory(history);
      result = { ok: true, state: target, status: { canUndo: history.past.length > 0, canRedo: history.future.length > 0 } };
    };
    this.writeQueue = this.writeQueue.then(run, run);
    await this.writeQueue;
    if (!result) throw new Error('Die Änderungshistorie konnte nicht geladen werden.');
    return result;
  }

  private async readCurrent(): Promise<AppState> {
    return normalizeState(JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Partial<AppState>);
  }

  private async readHistory(): Promise<HistoryData> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.historyPath, 'utf8')) as Partial<HistoryData>;
      return {
        past: Array.isArray(parsed.past) ? parsed.past.map((state) => normalizeState(state)).slice(-HISTORY_LIMIT) : [],
        future: Array.isArray(parsed.future) ? parsed.future.map((state) => normalizeState(state)).slice(-HISTORY_LIMIT) : []
      };
    } catch { return { past: [], future: [] }; }
  }

  private async writeHistory(history: HistoryData): Promise<void> {
    await this.writeJson(this.historyPath, history);
  }

  private async writeState(state: AppState): Promise<void> {
    await this.writeJson(this.filePath, state);
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }
}
