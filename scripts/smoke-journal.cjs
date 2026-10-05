const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { createDefaultState } = require('../dist-main/shared/defaults');

const artifacts = path.join(process.cwd(), '.smoke-artifacts');
const profile = path.join(artifacts, `journal-profile-${Date.now()}`);
mkdirSync(profile, { recursive: true });
const state = createDefaultState();
state.settings.termsAcceptedAt = new Date().toISOString();
state.journalEntries = [{
  id: 'test-session', title: 'Journal smoke test', notes: 'Unverändert',
  startedAt: '2026-10-03T08:00:00.123Z', endedAt: '2026-10-03T12:00:00.456Z',
  workingTimeMs: 13_500_333, pausedTimeMs: 900_000,
  timeSegments: [
    { type: 'work', startedAt: '2026-10-03T08:00:00.123Z', endedAt: '2026-10-03T09:00:00.123Z' },
    { type: 'pause', startedAt: '2026-10-03T09:00:00.123Z', endedAt: '2026-10-03T09:15:00.123Z' },
    { type: 'work', startedAt: '2026-10-03T09:15:00.123Z', endedAt: '2026-10-03T12:00:00.456Z' }
  ]
}];
const dataFile = path.join(profile, 'mar-helper-data.json');
writeFileSync(dataFile, JSON.stringify(state));
const port = 9334;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });
const exited = new Promise((resolve) => child.once('exit', resolve));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;

async function run() {
  let page;
  for (let attempt = 0; attempt < 50 && !page; attempt++) {
    try { page = (await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())).find((item) => item.type === 'page' && item.url.includes('index.html')); } catch {}
    if (!page) await delay(200);
  }
  assert.ok(page, 'Renderer unavailable');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
  const call = (method, params = {}) => new Promise((resolve) => { const callId = ++id; pending.set(callId, resolve); socket.send(JSON.stringify({ id: callId, method, params })); });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.error || result.result.exceptionDetails) throw new Error(JSON.stringify(result));
    return result.result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 60; attempt++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`UI state unavailable: ${expression}`);
  };
  const clickText = (text) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw new Error('Missing button'); button.click(); })()`);
  const setInput = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const loadState = () => evaluate('window.marHelper.loadState()');
  const localInput = (iso) => { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const openEntry = async () => { await evaluate("document.querySelector('button.journal-row').click()"); await waitFor("document.querySelectorAll('.journal-timeline__editor').length === 3"); };
  await waitFor("document.readyState === 'complete' && typeof window.marHelper !== 'undefined' && location.protocol === 'file:'");
  await evaluate("localStorage.setItem('mar-helper:last-seen-changelog-version', '1.5.2')");
  await waitFor("document.querySelector('button.journal-row') !== null");
  await openEntry();
  await setInput('.modal input[placeholder*="Optionaler Titel"]', 'Korrigierte Sitzung');
  await clickText('Speichern');
  await waitFor("!document.querySelector('[role=dialog]')");
  assert.deepEqual((await loadState()).journalEntries[0].timeSegments, state.journalEntries[0].timeSegments, 'Metadata edits must preserve exact timestamps');
  await openEntry();
  await setInput('.journal-timeline__editor:nth-child(3) .field:last-child input', localInput('2026-10-03T08:30:00.000Z'));
  await clickText('Speichern');
  await waitFor("document.querySelector('.inline-error')?.textContent.includes('vor der Startzeit')");
  await setInput('.journal-timeline__editor:nth-child(3) .field:last-child input', localInput('2026-10-03T10:00:00.000Z'));
  await clickText('Speichern');
  await waitFor("!document.querySelector('[role=dialog]')");
  const edited = (await loadState()).journalEntries[0];
  assert.equal(edited.endedAt, '2026-10-03T10:00:00.000Z');
  assert.equal(edited.workingTimeMs, 6_299_877);
  assert.equal(edited.pausedTimeMs, 900_000);
  await openEntry();
  await evaluate("document.querySelector('[aria-label=\"Block 3 löschen\"]').click()");
  await clickText('Abbrechen');
  await waitFor("!document.querySelector('[role=dialog]')");
  assert.equal((await loadState()).journalEntries[0].timeSegments.length, 3, 'Cancel must discard deletion');
  await openEntry();
  await evaluate("document.querySelector('[aria-label=\"Block 3 löschen\"]').click()");
  await waitFor("document.querySelectorAll('.journal-timeline__editor').length === 2");
  await delay(350);
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(artifacts, 'journal-edit.png'), Buffer.from(screenshot.result.data, 'base64'));
  await clickText('Speichern');
  await waitFor("!document.querySelector('[role=dialog]')");
  const corrected = (await loadState()).journalEntries[0];
  assert.equal(corrected.workingTimeMs, 3_600_000);
  assert.equal(corrected.pausedTimeMs, 900_000);
  assert.equal(corrected.endedAt, '2026-10-03T09:15:00.123Z');

  await setInput('#activity-input', 'Beim Schliessen beenden');
  await clickText('Timer starten');
  await waitFor("document.body.innerText.includes('Pausieren')");
  await delay(1100);
  const closedAt = Date.now();
  // Electron owns this window; window.close exercises its native close handler.
  await evaluate('window.close()');
  const exitResult = await Promise.race([exited.then(() => true), delay(10_000).then(() => false)]);
  assert.equal(exitResult, true, 'App did not finish closing');
  const persisted = JSON.parse(readFileSync(dataFile, 'utf8'));
  assert.equal(persisted.activeTimer, null);
  const completed = persisted.journalEntries.find((entry) => entry.title === 'Beim Schliessen beenden');
  assert.ok(completed, 'Closing must save the active session');
  assert.ok(Math.abs(Date.parse(completed.endedAt) - closedAt) < 2000, 'Session must end at window close');
  assert.equal(persisted.journalEntries.length, 2);
  process.stdout.write('Journal smoke passed: exact timestamps, time edits, invalid time validation, cancelled deletion, block deletion, totals, native window close and persisted session.\n');
}

run().catch((error) => { process.stderr.write(`${error.stack}\n${stderr}`); process.exitCode = 1; }).finally(() => { socket?.close(); if (child.exitCode === null) child.kill(); setTimeout(() => process.exit(process.exitCode ?? 0), 250); });
