// Real clean portable installation into an isolated test directory; keeps existing Ollama untouched.
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const { mkdir, mkdtemp, stat } = require('node:fs/promises');
const path = require('node:path');
const { installOllamaRuntime } = require('../dist-main/main/assistant-runtime');

async function run() {
  const artifacts = path.join(process.cwd(), '.smoke-artifacts');
  await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(path.join(artifacts, 'ollama-clean-'));
  const controller = new AbortController();
  let lastPhase; let lastPercent;
  const executable = await installOllamaRuntime(root, process.arch, controller.signal, (status) => {
    if (status.phase !== lastPhase || status.percent !== undefined && Math.floor(status.percent / 10) !== lastPercent) {
      lastPhase = status.phase; lastPercent = Math.floor(status.percent / 10);
      process.stdout.write(`${status.phase} ${status.percent ?? ''}\n`);
    }
  });
  assert.ok((await stat(executable)).size > 0);
  const env = { ...process.env, OLLAMA_HOST: '127.0.0.1:11439', OLLAMA_NO_CLOUD: '1', OLLAMA_MODELS: path.join(root, 'empty-models') };
  const child = spawn(executable, ['serve'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env });
  let errors = ''; child.stderr.on('data', (chunk) => { errors += chunk; });
  try {
    let version;
    for (let attempt = 0; attempt < 60 && !version; attempt++) {
      try { version = await fetch('http://127.0.0.1:11439/api/version', { signal: AbortSignal.timeout(1000) }).then((response) => response.json()); } catch {}
      if (!version) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(version?.version, errors);
    const tags = await fetch('http://127.0.0.1:11439/api/tags').then((response) => response.json());
    assert.deepEqual(tags.models, []);
    process.stdout.write(JSON.stringify({ cleanInstall: true, backgroundStart: true, version: version.version, root }) + '\n');
  } finally { child.kill(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
