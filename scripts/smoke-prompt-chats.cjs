const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');

const port = 9331;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(process.cwd(), '.smoke-artifacts', `prompt-chat-profile-${Date.now()}`)}`], {
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  let page;
  for (let attempt = 0; attempt < 50 && !page; attempt += 1) {
    try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())).find((item) => item.type === 'page'); } catch {}
    if (!page) await delay(200);
  }
  if (!page) throw new Error('Renderer wurde nicht verfügbar.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
  const call = (method, params = {}) => new Promise((resolve) => { const callId = ++id; pending.set(callId, resolve); socket.send(JSON.stringify({ id: callId, method, params })); });
  const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result.value;
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 40; attempt += 1) { if (await evaluate(expression)) return; await delay(150); }
    throw new Error(`UI-Zustand nicht erreicht: ${expression}`);
  };
  const clickText = (text) => evaluate(`(() => { const node = [...document.querySelectorAll('button,a')].find((item) => item.textContent.includes(${JSON.stringify(text)})); if (!node) throw new Error('Element fehlt: ' + ${JSON.stringify(text)}); node.click(); return true; })()`);
  const setInput = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  await call('Page.enable');
  await delay(900);
  await clickText('Promptprotokoll');
  await waitFor(`document.body.innerText.includes('Neuer Chat')`);
  await clickText('Neuer Chat');
  await waitFor(`document.querySelector('input[placeholder*="Kapitel 3"]') !== null`);
  await setInput('input[placeholder*="Kapitel 3"]', 'Smoke-Test Chat');
  await clickText('Chat erstellen');
  await waitFor(`document.body.innerText.includes('Chat #1') && document.body.innerText.includes('Smoke-Test Chat') && document.body.innerText.includes('in diesem Chat')`);
  await clickText('Prompt hinzufügen');
  await waitFor(`document.querySelector('input[type="datetime-local"]')?.value.length > 0`);
  await evaluate(`document.querySelector('.select-trigger').click()`);
  await waitFor(`document.querySelector('.custom-select--open .select-menu') !== null`);
  await clickText('Codex');
  await setInput('textarea[placeholder*="verwendeten Prompt"]', 'Testprompt');
  await setInput('textarea[placeholder*="erhaltene Antwort"]', 'Testantwort');
  await clickText('Prompt speichern');
  await waitFor(`document.body.innerText.includes('#1.1') && document.body.innerText.includes('Testprompt')`);
  await clickText('Zurück zum Promptprotokoll');
  await waitFor(`document.body.innerText.includes('Prompt hinzufügen')`);
  await clickText('Prompt hinzufügen');
  await waitFor(`document.querySelector('.select-trigger')?.innerText.includes('Codex')`);
  await evaluate(`document.querySelector('.select-trigger').click()`);
  await waitFor(`document.querySelector('.custom-select--open .select-menu') !== null`);
  const layering = await evaluate(`(() => {
    const select = document.querySelector('.custom-select--open');
    const menu = select?.querySelector('.select-menu');
    const card = document.querySelector('.prompt-card');
    if (!select || !menu || !card) return false;
    const numericZIndex = (element) => getComputedStyle(element).zIndex === 'auto' ? 0 : Number.parseInt(getComputedStyle(element).zIndex, 10);
    return numericZIndex(select) > numericZIndex(card)
      && getComputedStyle(menu).pointerEvents === 'auto';
  })()`);
  if (!layering) throw new Error('Modell-Dropdown liegt nicht über der Prompt-Card.');
  await clickText('Zurück zum Promptprotokoll');
  await waitFor(`document.querySelector('.prompt-toolbar .select-trigger') !== null`);
  await evaluate(`document.querySelector('.prompt-toolbar .select-trigger').click()`);
  await waitFor(`document.querySelector('.prompt-toolbar .custom-select--open .select-menu') !== null`);
  const filterLayering = await evaluate(`(() => {
    const toolbar = document.querySelector('.prompt-toolbar');
    const menu = toolbar?.querySelector('.select-menu');
    const card = document.querySelector('.prompt-card');
    if (!toolbar || !menu || !card) return false;
    const numericZIndex = (element) => getComputedStyle(element).zIndex === 'auto' ? 0 : Number.parseInt(getComputedStyle(element).zIndex, 10);
    return numericZIndex(toolbar) > numericZIndex(card) && getComputedStyle(menu).pointerEvents === 'auto';
  })()`);
  if (!filterLayering) throw new Error('Modellfilter liegt nicht über der Prompt-Card.');
  process.stdout.write('Prompt-Chat UI smoke test passed\n');
  socket.close();
}

run().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }).finally(() => { child.kill(); setTimeout(() => process.exit(), 250); });
