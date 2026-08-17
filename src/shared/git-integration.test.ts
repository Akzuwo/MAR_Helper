import { describe, expect, it } from 'vitest';
import { normalizeState } from './defaults';
import { exportAllJson, exportPromptsMarkdown } from './exporters';

describe('Git snapshot persistence and export', () => {
  it('migrates legacy state with Git disabled by default', () => {
    const state = normalizeState({ version: 1, settings: { modules: { journal: true, prompts: true, planner: true } } } as never);
    expect(state.settings.gitIntegration).toEqual({ enabled: false, repositories: [] });
  });

  it('persists multiple repositories while activation stays optional', () => {
    const state = normalizeState({ settings: { modules: { journal: true, prompts: true, planner: true }, gitIntegration: { enabled: false, repositories: [
      { id: 'one', name: 'MAR Helper', path: 'C:\\Projects\\MAR', addedAt: '2026-08-17T12:00:00.000Z' },
      { id: 'two', name: 'ArchViz', path: 'C:\\Projects\\ArchViz', addedAt: '2026-08-17T12:01:00.000Z' }
    ] } } } as never);
    expect(state.settings.gitIntegration.enabled).toBe(false);
    expect(state.settings.gitIntegration.repositories).toHaveLength(2);
  });

  it('exports metadata, files and a fence safe diff', () => {
    const markdown = exportPromptsMarkdown([{
      id: 'prompt-1', modelName: 'Codex', prompt: 'Ändere den Code', response: 'Erledigt', createdAt: '2026-08-17T15:20:00.000Z',
      gitSnapshot: {
        repositoryName: 'MAR Helper', commitHash: 'a'.repeat(40), shortCommitHash: 'aaaaaaa', commitMessage: 'Git integration',
        committedAt: '2026-08-17T15:25:00.000Z', filesChanged: 1, additions: 1, deletions: 0,
        files: [{ path: 'src/example.ts', additions: 1, deletions: 0 }], diff: '+const markdown = "```";'
      }
    }]);
    expect(markdown).toContain('**Repository:** MAR Helper');
    expect(markdown).toContain('`src/example.ts` +1 -0');
    expect(markdown).toContain('````diff');
    const state = normalizeState(undefined);
    state.promptEntries = [{ id: 'prompt-1', modelName: 'Codex', prompt: 'P', response: 'A', createdAt: '2026-08-17T15:20:00.000Z', gitSnapshot: {
      repositoryName: 'Deleted repository', commitHash: 'b'.repeat(40), shortCommitHash: 'bbbbbbb', commitMessage: 'Portable', committedAt: '2026-08-17T15:25:00.000Z', filesChanged: 0, additions: 0, deletions: 0, files: [], diff: 'offline diff'
    } }];
    state.settings.gitIntegration.repositories = [];
    expect(exportAllJson(state)).toContain('offline diff');
  });
});
