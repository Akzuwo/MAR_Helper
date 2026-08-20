import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitCommitSummary, GitResult, PromptGitFile, PromptGitSnapshot } from '../../shared/models';

const runFile = promisify(execFile);
const MAX_OUTPUT = 25 * 1024 * 1024;
const HASH = /^[0-9a-f]{7,40}$/i;

type GitErrorCode = 'GIT_NOT_FOUND' | 'NOT_A_REPOSITORY' | 'REPOSITORY_NOT_FOUND' | 'REMOTE_NOT_FOUND' | 'COMMIT_NOT_FOUND' | 'REPOSITORY_UNREADABLE' | 'GIT_FAILED' | 'DIFF_TOO_LARGE';

const fail = <T>(code: GitErrorCode, message: string): GitResult<T> => ({ ok: false, code, message });

function friendlyError(error: unknown): { code: GitErrorCode; message: string } {
  const candidate = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
  const detail = String(candidate.stderr ?? candidate.message ?? '').toLocaleLowerCase();
  if (candidate.code === 'ENOENT') return { code: 'GIT_NOT_FOUND', message: 'Git wurde nicht gefunden. Installiere Git und prüfe danach erneut.' };
  if (candidate.code === 'ENOBUFS' || detail.includes('maxbuffer')) return { code: 'DIFF_TOO_LARGE', message: 'Dieser Commit ist zu gross, um den vollständigen Diff sicher zu laden.' };
  if (detail.includes('not a git repository')) return { code: 'NOT_A_REPOSITORY', message: 'Der ausgewählte Ordner gehört zu keinem lokalen Git-Repository.' };
  if (detail.includes('not a valid object') || detail.includes('unknown revision') || detail.includes('bad object')) return { code: 'COMMIT_NOT_FOUND', message: 'Dieser Commit ist im Repository nicht mehr vorhanden.' };
  if (candidate.code === 'ENOENT' || detail.includes('cannot change to')) return { code: 'REPOSITORY_NOT_FOUND', message: 'Das Repository wurde nicht gefunden. Wähle einen neuen Pfad aus.' };
  if (candidate.code === 'EACCES' || candidate.code === 'EPERM') return { code: 'REPOSITORY_UNREADABLE', message: 'Das Repository kann nicht gelesen werden. Prüfe die Zugriffsrechte.' };
  return { code: 'GIT_FAILED', message: 'Git konnte den Vorgang nicht abschliessen. Prüfe das Repository und versuche es erneut.' };
}

async function git(args: string[], maxBuffer = MAX_OUTPUT): Promise<string> {
  const { stdout } = await runFile('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return stdout.replace(/\r\n/g, '\n');
}

export async function checkGit(): Promise<GitResult<{ version: string }>> {
  try {
    const output = (await git(['--version'], 1024 * 1024)).trim();
    return { ok: true, data: { version: output.replace(/^git version\s+/i, 'Git ') } };
  } catch (error) {
    const value = friendlyError(error);
    return fail(value.code, value.message);
  }
}

export async function resolveRepository(folderPath: string): Promise<GitResult<{ path: string; name: string }>> {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return fail('REPOSITORY_NOT_FOUND', 'Der Repository-Pfad ist ungültig.');
  try {
    const root = path.normalize((await git(['-C', folderPath, 'rev-parse', '--show-toplevel'], 1024 * 1024)).trim());
    return { ok: true, data: { path: root, name: path.basename(root) || root } };
  } catch (error) {
    const value = friendlyError(error);
    return fail(value.code, value.message);
  }
}

export async function checkRemoteRepository(folderPath: string): Promise<GitResult<{ remoteUrl: string }>> {
  const repository = await resolveRepository(folderPath);
  if (!repository.ok) return repository;
  try {
    const remoteUrl = (await git(['-C', repository.data.path, 'remote', 'get-url', 'origin'], 1024 * 1024)).trim();
    if (!remoteUrl) return fail('REMOTE_NOT_FOUND', 'Das Repository besitzt keinen Remote „origin“.');
    await git(['-C', repository.data.path, 'ls-remote', 'origin', 'HEAD'], 2 * 1024 * 1024);
    return { ok: true, data: { remoteUrl } };
  } catch {
    return fail('REMOTE_NOT_FOUND', 'Cloud Save benötigt ein Remote-Repository mit dem Namen „origin“.');
  }
}

export async function listCommits(repositoryPath: string, skip = 0, limit = 30): Promise<GitResult<GitCommitSummary[]>> {
  const repository = await resolveRepository(repositoryPath);
  if (!repository.ok) return repository;
  const safeSkip = Math.max(0, Math.min(10000, Math.trunc(skip)));
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  try {
    const output = await git(['-C', repository.data.path, 'log', `--skip=${safeSkip}`, `--max-count=${safeLimit}`, '--date=iso-strict', '--pretty=format:%H%x1f%h%x1f%s%x1f%cI%x1f%an%x1e'], 5 * 1024 * 1024);
    const commits = output.split('\x1e').map((record) => record.trim()).filter(Boolean).map((record) => {
      const [commitHash, shortCommitHash, commitMessage, committedAt, author] = record.split('\x1f');
      return { commitHash, shortCommitHash, commitMessage, committedAt, author };
    }).filter((commit) => HASH.test(commit.commitHash) && commit.committedAt);
    return { ok: true, data: commits };
  } catch (error) {
    const value = friendlyError(error);
    return fail(value.code, value.message);
  }
}

function parseNumstat(output: string): PromptGitFile[] {
  return output.split('\n').filter(Boolean).map((line) => {
    const [added, deleted, ...pathParts] = line.split('\t');
    const filePath = pathParts.join('\t');
    const binary = added === '-' || deleted === '-';
    return {
      path: filePath,
      additions: binary ? undefined : Number(added),
      deletions: binary ? undefined : Number(deleted),
      binary
    };
  }).filter((file) => file.path);
}

export async function readCommit(repositoryPath: string, commitHash: string): Promise<GitResult<PromptGitSnapshot>> {
  if (!HASH.test(commitHash)) return fail('COMMIT_NOT_FOUND', 'Der ausgewählte Commit ist ungültig.');
  const repository = await resolveRepository(repositoryPath);
  if (!repository.ok) return repository;
  try {
    const verified = (await git(['-C', repository.data.path, 'rev-parse', '--verify', `${commitHash}^{commit}`], 1024 * 1024)).trim();
    if (!/^[0-9a-f]{40}$/i.test(verified)) return fail('COMMIT_NOT_FOUND', 'Dieser Commit ist im Repository nicht mehr vorhanden.');
    const metadata = (await git(['-C', repository.data.path, 'show', '-s', '--date=iso-strict', '--format=%H%x1f%h%x1f%s%x1f%cI%x1f%an', verified], 1024 * 1024)).trim().split('\x1f');
    const files = parseNumstat(await git(['-C', repository.data.path, 'show', '--format=', '--numstat', '--find-renames', verified], 10 * 1024 * 1024));
    let diff = '';
    let diffTruncated = false;
    try {
      diff = await git(['-C', repository.data.path, 'show', '--format=', '--patch', '--no-color', '--no-ext-diff', '--find-renames', verified]);
    } catch (error) {
      const value = friendlyError(error);
      if (value.code !== 'DIFF_TOO_LARGE') throw error;
      diffTruncated = true;
      diff = 'Der Text-Diff überschreitet das lokale Sicherheitslimit von 25 MB. Die Dateiliste und Änderungsstatistik wurden vollständig gespeichert.';
    }
    const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
    const deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
    return { ok: true, data: {
      repositoryName: repository.data.name,
      commitHash: metadata[0], shortCommitHash: metadata[1], commitMessage: metadata[2], committedAt: metadata[3], author: metadata[4],
      filesChanged: files.length, additions, deletions, files, diff, diffTruncated
    } };
  } catch (error) {
    const value = friendlyError(error);
    return fail(value.code, value.message);
  }
}
