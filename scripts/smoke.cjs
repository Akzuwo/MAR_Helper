const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const port = 9328;
const artifactDir = path.join(process.cwd(), '.smoke-artifacts');
mkdirSync(artifactDir, { recursive: true });

const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const executable = packaged ? path.join(process.cwd(), 'release', 'win-unpacked', 'MAR Helper.exe') : electron;
const launchArgs = packaged
  ? [`--remote-debugging-port=${port}`, `--user-data-dir=${path.join(artifactDir, 'packaged-profile')}`]
  : ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(artifactDir, 'profile')}`];
const child = spawn(executable, launchArgs, {
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
  const result = await call('Runtime.evaluate', { expression: `({ title: document.title, text: document.body.innerText.slice(0, 2500), hasApi: Boolean(window.marHelper), errors: document.querySelector('.error-screen')?.innerText || '' })`, returnByValue: true });
  await call('Runtime.evaluate', {
    expression: `document.querySelector('.terms-consent input')?.click()`
  });
  await delay(100);
  await call('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Zustimmen und fortfahren'))?.click()`
  });
  await delay(500);
  await call('Runtime.evaluate', {
    expression: `(async () => {
      const state = await window.marHelper.loadState();
      await window.marHelper.saveState({ ...state, settings: { ...state.settings, visualEffects: { ...state.settings.visualEffects, scrollEffects: true } } });
    })()`,
    awaitPromise: true
  });
  await call('Runtime.evaluate', {
    expression: `window.localStorage.removeItem('mar-helper:last-seen-changelog-version')`
  });
  await call('Page.reload');
  await delay(1800);
  const changelogDialogResult = await call('Runtime.evaluate', {
    expression: `(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.textContent?.includes('Alle Änderungen von MAR Helper'));
      return { dialogText: dialog?.textContent || '' };
    })()`,
    returnByValue: true
  });
  const snapshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(artifactDir, 'app.png'), Buffer.from(snapshot.result.data, 'base64'));
  await call('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Verstanden')?.click()`
  });
  await delay(300);
  await call('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Einstellungen')?.click()`
  });
  await delay(500);
  const settingsLinksResult = await call('Runtime.evaluate', {
    expression: `(() => {
      const buttons = [...document.querySelectorAll('.settings-footer-links button')];
      const terms = buttons.find((item) => item.textContent?.trim() === 'Nutzungsbedingungen');
      const changelog = buttons.find((item) => item.textContent?.trim() === 'Changelog');
      const footer = document.querySelector('.settings-footer-links');
      terms?.click();
      return {
        hasTerms: Boolean(terms),
        hasChangelog: Boolean(changelog),
        hasIcons: buttons.some((item) => item.querySelector('svg')),
        opacity: footer ? getComputedStyle(footer).opacity : '0',
        alignment: footer ? getComputedStyle(footer).justifyContent : ''
      };
    })()`,
    returnByValue: true
  });
  await delay(300);
  const termsDialogResult = await call('Runtime.evaluate', {
    expression: `Boolean([...document.querySelectorAll('[role="dialog"]')].find((item) => item.textContent?.includes('Benutzungsbedingungen')))` ,
    returnByValue: true
  });
  const value = result.result.result.value;
  if (!value.hasApi || value.errors || !value.text.includes('MAR Helper')) throw new Error(`Runtime smoke check failed: ${JSON.stringify(value)}`);
  const changelogValue = changelogDialogResult.result.result.value;
  if (!changelogValue.dialogText.includes('1.5.0') || !changelogValue.dialogText.includes('ARM64-Unterstützung') || !changelogValue.dialogText.includes('Verstanden')) {
    throw new Error(`Automatic changelog smoke check failed: ${JSON.stringify(changelogValue)}`);
  }
  const settingsLinks = settingsLinksResult.result.result.value;
  if (!settingsLinks.hasTerms || !settingsLinks.hasChangelog || settingsLinks.hasIcons || settingsLinks.opacity !== '1' || settingsLinks.alignment !== 'center' || !termsDialogResult.result.result.value) {
    throw new Error(`Settings footer links smoke check failed: ${JSON.stringify({ ...settingsLinks, termsDialog: termsDialogResult.result.result.value })}`);
  }
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
