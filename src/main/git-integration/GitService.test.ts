import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkGit, listCommits, readCommit, resolveRepository } from './GitService';

const run = promisify(execFile);
let repositoryPath = '';
const canonicalPath = async (value: string) => {
  const resolved = path.normalize(await realpath(value));
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
};

beforeEach(async () => {
  repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'mar-helper-git-test-'));
  await run('git', ['init', repositoryPath]);
  await run('git', ['-C', repositoryPath, 'config', 'user.name', 'MAR Helper Test']);
  await run('git', ['-C', repositoryPath, 'config', 'user.email', 'test@mar-helper.local']);
  await writeFile(path.join(repositoryPath, 'hello.ts'), 'export const value = 1;\n', 'utf8');
  await run('git', ['-C', repositoryPath, 'add', 'hello.ts']);
  await run('git', ['-C', repositoryPath, 'commit', '-m', 'Erster lokaler Commit']);
});

afterEach(async () => { if (repositoryPath) await rm(repositoryPath, { recursive: true, force: true }); });

describe('local Git service', () => {
  it('detects Git and resolves repository roots from subfolders', async () => {
    expect((await checkGit()).ok).toBe(true);
    const child = path.join(repositoryPath, 'src', 'nested');
    await mkdir(child, { recursive: true });
    const result = await resolveRepository(child);
    expect(result.ok && await canonicalPath(result.data.path)).toBe(await canonicalPath(repositoryPath));
  });

  it('lists commits and creates a complete portable snapshot', async () => {
    const listed = await listCommits(repositoryPath);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data[0].commitMessage).toBe('Erster lokaler Commit');
    const snapshot = await readCommit(repositoryPath, listed.data[0].commitHash);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.data.commitHash).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.data.files).toEqual([expect.objectContaining({ path: 'hello.ts', additions: 1, deletions: 0 })]);
    expect(snapshot.data.diff).toContain('+export const value = 1;');
  });

  it('rejects untrusted commit identifiers before invoking Git', async () => {
    const result = await readCommit(repositoryPath, 'HEAD; Remove-Item everything');
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'COMMIT_NOT_FOUND' }));
  });

  it('returns a friendly result for an invalid repository folder', async () => {
    const result = await resolveRepository(path.join(os.tmpdir(), `missing-mar-helper-${Date.now()}`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['REPOSITORY_NOT_FOUND', 'NOT_A_REPOSITORY']).toContain(result.code);
  });
});
