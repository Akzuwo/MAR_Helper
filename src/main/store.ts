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
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
      await fs.rename(tempPath, this.filePath).catch(async () => {
        await fs.copyFile(tempPath, this.filePath);
        await fs.unlink(tempPath).catch(() => undefined);
      });
    });
    await this.writeQueue;
    return state;
  }
}
