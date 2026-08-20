import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { promisify } from 'node:util';
import { normalizeState } from '../shared/defaults';
import { cloudDataFrom, cloudDifference, type CloudSaveData } from '../shared/cloud-save';
import type { AppState, CloudSaveStatus, CloudSaveSyncResult, GitRepository } from '../shared/models';
import { checkRemoteRepository } from './git-integration/GitService';
import type { JsonStore } from './store';

const runFile = promisify(execFile);
const CLOUD_BRANCH = 'mar-helper-cloud';
const CLOUD_FILE = 'mar_helper/mar-helper-data.json';
const POLL_INTERVAL = 8_000;

interface CloudPayload {
  format: 'mar-helper-cloud-save';
  version: 1;
  updatedAt: string;
  data: CloudSaveData;
}

const canonical = (value: unknown) => JSON.stringify(value);

export class CloudSaveService {
  private state: AppState | null = null;
  private lastRemoteCommit = '';
  private pendingRemote: CloudPayload | null = null;
  private pendingStatus: Extract<CloudSaveStatus, { state: 'conflict' }> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pushTimer: NodeJS.Timeout | null = null;
  private running: Promise<CloudSaveSyncResult> | null = null;
  private lastError = '';

  constructor(
    private readonly store: JsonStore,
    private readonly onStatus: (status: CloudSaveStatus) => void,
    private readonly onState: (state: AppState) => void
  ) {}

  configure(state: AppState, syncImmediately = false): void {
    this.state = state;
    if (!this.configured(state)) { this.stop(); this.onStatus({ state: 'idle' }); return; }
    if (!this.timer) this.timer = setInterval(() => { void this.sync(false); }, POLL_INTERVAL);
    if (syncImmediately) void this.sync(false);
  }

  schedule(state: AppState): void {
    this.configure(state);
    if (!this.configured(state)) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => { this.pushTimer = null; void this.sync(true); }, 1_200);
  }

  async syncNow(): Promise<CloudSaveSyncResult> { return this.sync(true); }

  async resolveConflict(useRemote: boolean): Promise<CloudSaveSyncResult> {
    if (!this.state || !this.pendingRemote) return { state: 'error', message: 'Es liegt kein Cloud-Konflikt mehr vor.' };
    const pending = this.pendingRemote;
    this.pendingRemote = null;
    this.pendingStatus = null;
    const result = useRemote ? await this.applyRemote(pending) : await this.upload(this.state, true);
    if (this.state) this.configure(this.state);
    return result;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.timer = null;
    this.pushTimer = null;
    this.pendingRemote = null;
    this.pendingStatus = null;
  }

  private configured(state: AppState): boolean {
    return state.settings.betaFeatures.cloudSave && state.settings.cloudSave.enabled && Boolean(state.settings.cloudSave.repositoryId);
  }

  private repository(): GitRepository | null {
    if (!this.state) return null;
    return this.state.settings.gitIntegration.repositories.find((item) => item.id === this.state?.settings.cloudSave.repositoryId) ?? null;
  }

  private async sync(pushLocal: boolean): Promise<CloudSaveSyncResult> {
    if (this.pendingStatus) return this.pendingStatus;
    if (this.running) return this.running;
    this.running = this.performSync(pushLocal).finally(() => { this.running = null; });
    return this.running;
  }

  private async performSync(pushLocal: boolean): Promise<CloudSaveSyncResult> {
    const repository = this.repository();
    if (!this.state || !repository) return { state: 'error', message: 'Das konfigurierte Cloud-Repository ist nicht mehr verfügbar.' };
    if (pushLocal) this.onStatus({ state: 'syncing' });
    const remoteCheck = await checkRemoteRepository(repository.path);
    if (!remoteCheck.ok) return this.fail(remoteCheck.message);
    try {
      const remote = await this.readRemote(repository.path);
      if (remote && remote.commit !== this.lastRemoteCommit && canonical(remote.payload.data) !== canonical(cloudDataFrom(this.state))) {
        this.lastRemoteCommit = remote.commit;
        const difference = cloudDifference(this.state, remote.payload.data);
        if (difference.extreme) {
          this.pendingRemote = remote.payload;
          const status = { state: 'conflict' as const, localEntries: this.entryCount(cloudDataFrom(this.state)), remoteEntries: this.entryCount(remote.payload.data), changedEntries: difference.changedEntries };
          this.pendingStatus = status;
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          this.onStatus(status);
          return status;
        }
        return this.applyRemote(remote.payload);
      }
      if (remote) this.lastRemoteCommit = remote.commit;
      if (pushLocal && (!remote || canonical(remote.payload.data) !== canonical(cloudDataFrom(this.state)))) return this.upload(this.state);
      return this.success();
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : 'Cloud Save konnte nicht synchronisiert werden.');
    }
  }

  private async readRemote(repositoryPath: string): Promise<{ commit: string; payload: CloudPayload } | null> {
    const refs = (await this.git(repositoryPath, ['ls-remote', '--heads', 'origin', `refs/heads/${CLOUD_BRANCH}`])).trim();
    if (!refs) return null;
    await this.git(repositoryPath, ['fetch', '--quiet', 'origin', `+refs/heads/${CLOUD_BRANCH}:refs/remotes/origin/${CLOUD_BRANCH}`]);
    const commit = (await this.git(repositoryPath, ['rev-parse', `refs/remotes/origin/${CLOUD_BRANCH}`])).trim();
    const raw = await this.git(repositoryPath, ['show', `${commit}:${CLOUD_FILE}`], 50 * 1024 * 1024);
    const payload = JSON.parse(raw) as CloudPayload;
    if (payload.format !== 'mar-helper-cloud-save' || payload.version !== 1 || !payload.data) throw new Error('Das Cloud-Savefile besitzt ein nicht unterstütztes Format.');
    const localFile = path.join(repositoryPath, ...CLOUD_FILE.split('/'));
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, raw, 'utf8');
    return { commit, payload };
  }

  private async upload(state: AppState, force = false): Promise<CloudSaveSyncResult> {
    const repository = this.repository();
    if (!repository) return this.fail('Das Cloud-Repository ist nicht mehr verfügbar.');
    const payload: CloudPayload = { format: 'mar-helper-cloud-save', version: 1, updatedAt: new Date().toISOString(), data: cloudDataFrom(state) };
    const filePath = path.join(repository.path, ...CLOUD_FILE.split('/'));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    const parent = force ? await this.remoteCommit(repository.path) : this.lastRemoteCommit || await this.remoteCommit(repository.path);
    const blob = (await this.git(repository.path, ['hash-object', '-w', filePath])).trim();
    const indexPath = path.join(app.getPath('temp'), `mar-helper-cloud-index-${randomUUID()}`);
    const env = { GIT_INDEX_FILE: indexPath, GIT_AUTHOR_NAME: 'MAR Helper', GIT_AUTHOR_EMAIL: 'cloud@mar-helper.local', GIT_COMMITTER_NAME: 'MAR Helper', GIT_COMMITTER_EMAIL: 'cloud@mar-helper.local' };
    try {
      await this.git(repository.path, ['read-tree', '--empty'], undefined, env);
      await this.git(repository.path, ['update-index', '--add', '--cacheinfo', `100644,${blob},${CLOUD_FILE}`], undefined, env);
      const tree = (await this.git(repository.path, ['write-tree'], undefined, env)).trim();
      const args = ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'chore(mar-helper): sync cloud save'];
      const commit = (await this.git(repository.path, args, undefined, env)).trim();
      await this.git(repository.path, ['push', '--quiet', 'origin', `${commit}:refs/heads/${CLOUD_BRANCH}`]);
      this.lastRemoteCommit = commit;
    } finally {
      await fs.unlink(indexPath).catch(() => undefined);
    }
    return this.success();
  }

  private async remoteCommit(repositoryPath: string): Promise<string> {
    const output = (await this.git(repositoryPath, ['ls-remote', '--heads', 'origin', `refs/heads/${CLOUD_BRANCH}`])).trim();
    return output.split(/\s+/)[0] ?? '';
  }

  private async applyRemote(payload: CloudPayload): Promise<CloudSaveSyncResult> {
    if (!this.state) return this.fail('Der lokale Stand konnte nicht geladen werden.');
    const merged = normalizeState({ ...this.state, ...payload.data, settings: this.state.settings });
    const persisted = await this.store.replaceFromCloud(merged);
    this.state = persisted;
    this.onState(persisted);
    return this.success();
  }

  private entryCount(data: CloudPayload['data']): number {
    return data.journalEntries.length + data.promptEntries.length + data.plannerTasks.length;
  }

  private success(): CloudSaveSyncResult {
    this.lastError = '';
    const status = { state: 'success' as const, syncedAt: new Date().toISOString() };
    this.onStatus(status);
    return status;
  }

  private fail(message: string): CloudSaveSyncResult {
    const status = { state: 'error' as const, message };
    if (message !== this.lastError) this.onStatus(status);
    this.lastError = message;
    return status;
  }

  private async git(repositoryPath: string, args: string[], maxBuffer = 25 * 1024 * 1024, extraEnv: Record<string, string> = {}): Promise<string> {
    const { stdout } = await runFile('git', ['-C', repositoryPath, ...args], {
      encoding: 'utf8', windowsHide: true, maxBuffer,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv }
    });
    return stdout.replace(/\r\n/g, '\n');
  }
}
