const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const port = 9328;
const artifactDir = path.join(process.cwd(), '.smoke-artifacts');
mkdirSync(artifactDir, { recursive: true });

const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(artifactDir, 'profile')}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  env: electronEnv
});

let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPage() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((item) => item.type === 'page' && item.url.includes('index.html'));
      if (page) return page;
    } catch {}
    await delay(200);
  }
  throw new Error('Renderer did not become available');
}

async function run() {
  const page = await findPage();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const call = (method, params = {}) => new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, resolve);
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  await call('Page.enable');
  await delay(1200);
  const result = await call('Runtime.evaluate', { expression: `({ title: document.title, text: document.body.innerText.slice(0, 500), hasApi: Boolean(window.marHelper), errors: document.querySelector('.error-screen')?.innerText || '' })`, returnByValue: true });
  const snapshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(artifactDir, 'app.png'), Buffer.from(snapshot.result.data, 'base64'));
  const value = result.result.result.value;
  if (!value.hasApi || value.errors || !value.text.includes('MAR Helper')) throw new Error(`Runtime smoke check failed: ${JSON.stringify(value)}`);
  process.stdout.write(JSON.stringify(value, null, 2));
  socket.close();
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n${stderr}`);
  process.exitCode = 1;
}).finally(() => {
  child.kill();
  setTimeout(() => process.exit(), 250);
});
