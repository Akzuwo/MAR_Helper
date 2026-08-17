import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createDefaultState, normalizeState } from '../shared/defaults';
import type { AppState } from '../shared/models';

export class JsonStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'mar-helper-data.json');
  }

  async load(): Promise<AppState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return normalizeState(JSON.parse(raw) as Partial<AppState>);
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
    const write = () => this.writeState(state);
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
      await this.writeState(result);
    };
    this.writeQueue = this.writeQueue.then(run, run);
    await this.writeQueue;
    if (!result) throw new Error('Die lokale Datenbank konnte nicht aktualisiert werden.');
    return result;
  }

  private async writeState(state: AppState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
    try {
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }
}
