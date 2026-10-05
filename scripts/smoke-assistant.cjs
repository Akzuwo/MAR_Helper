const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { createDefaultState } = require('../dist-main/shared/defaults');
const artifacts = path.join(process.cwd(), '.smoke-artifacts'); mkdirSync(artifacts, { recursive: true });
const profile = mkdtempSync(path.join(artifacts, 'assistant-profile-'));
const state = createDefaultState(); state.settings.termsAcceptedAt = new Date().toISOString();
writeFileSync(path.join(profile, 'mar-helper-data.json'), JSON.stringify(state));
const port = 9345;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const query = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
let child; let socket;

async function launch() {
  child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { windowsHide: true, stdio: 'ignore', env });
  let page;
  for (let attempt = 0; attempt < 80 && !page; attempt++) {
    try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())).find((page) => page.type === 'page' && page.url.includes('index.html')); } catch {}
    if (!page) await delay(150);
  }
  assert.ok(page, 'Renderer unavailable');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let id = 0;
  socket.addEventListener('message', ({ data }) => { const message = JSON.parse(data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
  const call = (method, params = {}) => new Promise((resolve) => { const callId = ++id; pending.set(callId, resolve); socket.send(JSON.stringify({ id: callId, method, params })); });
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.error || response.result.exceptionDetails) throw new Error(JSON.stringify(response));
    return response.result.result.value;
  };
  const waitFor = async (expression, timeout = 15_000) => { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timeout: ${expression}`); };
  const click = (label) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button ${label}'); button.click(); })()`);
  await waitFor('!!document.querySelector(".sidebar")');
  await evaluate("localStorage.setItem('mar-helper:last-seen-changelog-version', '1.5.2')");
  await delay(1500);
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Verstanden')?.click()");
  await waitFor('!document.querySelector("[role=dialog]")');
  return { call, evaluate, waitFor, click };
}
async function stop() { socket?.close(); const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited; await delay(300); }

async function run() {
  let ui = await launch();
  assert.equal(await ui.evaluate('!!document.querySelector(".assistant-fab")'), false);
  assert.equal((await ui.evaluate('window.marHelper.getAssistantStatus()')).phase, 'disabled');
  await ui.click('Einstellungen');
  await ui.waitFor(`!!${query('button[aria-label="Lokalen KI-Assistenten aktivieren"]')}`);
  await ui.evaluate(`${query('button[aria-label="Lokalen KI-Assistenten aktivieren"]')}.click()`);
  await ui.waitFor(`!!${query('[role=dialog] button.button--primary')} && !${query('[role=dialog] button.button--primary')}.disabled`);
  const explanation = await ui.evaluate('document.querySelector("[role=dialog]").innerText');
  for (const text of ['Qwen', 'Hintergrund', 'Rückgängig', 'Internetverbindung', 'Abbrechen']) assert.ok(explanation.includes(text), `Missing explanation: ${text}`);
  assert.equal((await ui.evaluate('window.marHelper.loadState()')).settings.localAssistant.enabled, false);
  await delay(400);
  writeFileSync(path.join(artifacts, 'assistant-setup.png'), Buffer.from((await ui.call('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  await ui.click('Aktivieren & installieren');
  await ui.waitFor('(async () => (await window.marHelper.getAssistantStatus()).phase === "ready")()');
  await ui.waitFor('!!document.querySelector(".assistant-fab") && !document.querySelector("[role=dialog]")');
  await ui.evaluate('document.querySelector(".assistant-fab").click()');
  await ui.waitFor('!!document.querySelector(".assistant-chat__form textarea")');
  assert.equal(await ui.evaluate('document.querySelector(".assistant-chat__form textarea").disabled'), false);
  assert.ok(await ui.evaluate('document.querySelector(".assistant-chat__welcome").innerText.includes("Sitzungen")'));
  const composer = await ui.evaluate(`(() => { const box = document.querySelector('.assistant-chat__composer').getBoundingClientRect(); const send = document.querySelector('.assistant-chat__composer button').getBoundingClientRect(); return { height: box.height, inside: send.left >= box.left && send.right <= box.right && send.top >= box.top && send.bottom <= box.bottom }; })()`);
  assert.ok(composer.inside && composer.height <= 56, 'Send button inside compact composer');
  await ui.evaluate(`(() => { const input = document.querySelector('.assistant-chat__form textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Zeile eins\\nZeile zwei\\nZeile drei'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ui.waitFor(`document.querySelector('.assistant-chat__form textarea').getBoundingClientRect().height > 70`);
  await ui.evaluate(`(() => { const input = document.querySelector('.assistant-chat__form textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Erstelle im Zeitplan eine Aufgabe UI-KI-Test.'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ui.waitFor(`!${query('.assistant-chat__form button[type=submit]')}.disabled`);
  await ui.evaluate(`${query('.assistant-chat__composer button[aria-label="Senden"]')}.click()`);
  await ui.waitFor(`!!${query('.assistant-chat__thinking canvas')}`);
  await delay(350);
  const thinking = await ui.evaluate(`(() => { const canvas = document.querySelector('.assistant-chat__thinking canvas'); const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; return { painted: pixels.some((value,index) => index % 4 === 3 && value > 0), stop: !!document.querySelector('.assistant-chat__composer button[aria-label="Anfrage abbrechen"]'), height: document.querySelector('.assistant-chat__message--user').getBoundingClientRect().height, padding: getComputedStyle(document.querySelector('.assistant-chat__message .markdown-content')).padding }; })()`);
  assert.ok(thinking.painted && thinking.stop, 'Thinking Orb paints while working and composer shows stop button');
  assert.ok(thinking.height <= 54 && thinking.padding === '0px', 'Compact message without inherited Markdown padding');
  const pulse = await ui.evaluate(`(() => { const label = document.querySelector('.assistant-chat__thinking > span'); const orb = document.querySelector('.assistant-chat__thinking canvas'); const style = getComputedStyle(label); return { name: style.animationName, color: style.color, beforeOrb: label.getBoundingClientRect().right <= orb.getBoundingClientRect().left }; })()`);
  assert.equal(pulse.name, 'assistant-thinking-pulse');
  assert.ok(pulse.beforeOrb, 'Pulsing label sits to the left of the Orb');
  await delay(160);
  assert.notEqual(await ui.evaluate(`getComputedStyle(document.querySelector('.assistant-chat__thinking > span')).color`), pulse.color, 'Thinking label changes brightness');
  writeFileSync(path.join(artifacts, 'assistant-thinking.png'), Buffer.from((await ui.call('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  await ui.waitFor(`!!document.querySelector('.assistant-chat__message--assistant[aria-busy="true"]')`, 120_000);
  const firstText = await ui.evaluate(`document.querySelector('.assistant-chat__message--assistant').innerText`);
  assert.equal(await ui.evaluate(`!!document.querySelector('.assistant-chat__changes')`), false, 'Change summary waits for text reveal');
  assert.ok(await ui.evaluate(`!!document.querySelector('button[aria-label="Antwort vollständig anzeigen"]')`), 'Reveal can be skipped');
  await delay(160);
  const nextText = await ui.evaluate(`document.querySelector('.assistant-chat__message--assistant').innerText`);
  assert.ok(nextText.length > firstText.length, 'Answer appears progressively instead of all at once');
  await ui.waitFor('(async () => (await window.marHelper.loadState()).plannerTasks.some(task => task.title === "UI-KI-Test"))()', 120_000);
  await ui.waitFor(`!!${query('.assistant-chat__changes')}`);
  await ui.waitFor(`!${query('.assistant-chat__form textarea')}.disabled`);
  assert.equal(await ui.evaluate(`!!document.querySelector('.assistant-chat__thinking')`), false, 'Thinking Orb disappears after response');
  assert.ok(await ui.evaluate(`document.querySelector('.assistant-chat__changes').innerText.includes('erstellt')`));
  await ui.click('Letzte App-Änderung rückgängig');
  await ui.waitFor('(async () => (await window.marHelper.loadState()).plannerTasks.length === 0)()');
  const bounds = await ui.evaluate('(() => { const modal = document.querySelector("[role=dialog]").getBoundingClientRect(); return {top:modal.top,bottom:modal.bottom,height:innerHeight}; })()');
  assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height, JSON.stringify(bounds));
  await delay(400);
  writeFileSync(path.join(artifacts, 'assistant-chat.png'), Buffer.from((await ui.call('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  await stop();
  ui = await launch();
  await ui.waitFor('(async () => (await window.marHelper.getAssistantStatus()).phase === "ready")()');
  assert.equal(await ui.evaluate('!!document.querySelector(".assistant-fab")'), true, 'Assistant available after app restart');
  await ui.click('Einstellungen');
  await ui.waitFor(`!!${query('button[aria-label="Lokalen KI-Assistenten deaktivieren"]')}`);
  await ui.evaluate(`${query('button[aria-label="Lokalen KI-Assistenten deaktivieren"]')}.click()`);
  await ui.waitFor('!document.querySelector(".assistant-fab")');
  await ui.waitFor('(async () => (await window.marHelper.getAssistantStatus()).phase === "disabled")()');
  assert.equal((await ui.evaluate('window.marHelper.getAssistantStatus()')).phase, 'disabled');
  assert.ok((await fetch('http://127.0.0.1:11434/api/version').then((response) => response.json())).version, 'Existing Ollama stays running');
  console.log(JSON.stringify({ activation: true, consent: true, chat: true, appRestart: true, disabled: true, profile }));
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (child?.exitCode === null) await stop(); });
