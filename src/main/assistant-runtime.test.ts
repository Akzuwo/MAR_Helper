import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { installOllamaRuntime } from './assistant-runtime';

describe('portable runtime download integrity', () => {
  it('rejects a corrupt archive before extraction and removes the staged download', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mar-assistant-integrity-'));
    try {
      const asset = { name: 'ollama-windows-amd64.zip', size: 3, digest: `sha256:${'a'.repeat(64)}`, browser_download_url: 'https://github.com/ollama/ollama/releases/download/v1/ollama-windows-amd64.zip' };
      const request = vi.fn(async (url) => String(url).includes('api.github.com') ? Response.json({ assets: [asset], tag_name: 'v1' }) : new Response('bad')) as typeof fetch;
      await expect(installOllamaRuntime(root, 'x64', new AbortController().signal, () => undefined, request)).rejects.toThrow('Prüfsumme');
      expect(await readdir(root)).toEqual([]);
    } finally {
      if (path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('mar-assistant-integrity-')) await rm(root, { recursive: true, force: true });
    }
  });
});
