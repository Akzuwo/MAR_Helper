const assert = require('node:assert/strict');
const { mkdir, mkdtemp, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { createDefaultState } = require('../dist-main/shared/defaults');
const { LocalAssistantService } = require('../dist-main/main/local-assistant');
const { runtimeDependencies } = require('../dist-main/main/assistant-runtime');

async function run() {
  const artifacts = path.join(process.cwd(), '.smoke-artifacts'); await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(path.join(artifacts, 'assistant-live-'));
  let state = createDefaultState(); state.settings.localAssistant = { enabled: true, model: 'qwen3.5:9b' };
  const history = [];
  const store = { load: async () => structuredClone(state), transaction: async (mutator) => {
    const updated = mutator(structuredClone(state)); history.push(structuredClone(state)); state = updated;
    await writeFile(path.join(root, 'data.json'), JSON.stringify(state, null, 2)); return state;
  } };
  const deps = runtimeDependencies(path.join(root, 'local-assistant'));
  const request = deps.fetch;
  deps.fetch = async (...args) => {
    const response = await request(...args);
    if (String(args[0]).endsWith('/api/chat')) console.log('MODEL', (await response.clone().json()).message?.content);
    return response;
  };
  const assistant = new LocalAssistantService(path.join(root, 'local-assistant'), store, (status) => console.log(status.phase), () => undefined, deps);
  const results = [];
  try {
    assistant.configure(state.settings.localAssistant); await assistant.retry();
    assert.equal(assistant.getStatus().phase, 'ready');
    const ask = async (content, check) => {
      const before = Date.now();
      const result = await assistant.sendChat([{ role: 'user', content }], 'journal');
      console.log(JSON.stringify({ content, ...result, state: undefined, seconds: Math.round((Date.now() - before) / 1000) }));
      results.push({ content, ...result, state: undefined }); assert.ok(result.ok, result.message); check(result);
    };
    await ask('Erstelle im Zeitplan eine offene Aufgabe mit dem Titel "KI Integration prüfen". Keine weiteren Änderungen.', () => assert.equal(state.plannerTasks[0]?.title, 'KI Integration prüfen'));
    await ask('Welche Aufgaben sind noch offen? Nimm keine Änderungen vor.', (result) => { assert.match(result.message, /KI Integration prüfen/i); assert.equal(result.changes.length, 0); });
    await ask('Markiere die Aufgabe "KI Integration prüfen" als erledigt.', () => assert.equal(state.plannerTasks[0]?.completed, true));
    await ask('Welche Aufgaben sind noch offen? Nimm keine Änderungen vor.', (result) => { assert.match(result.message, /keine|nicht|erledigt|abgeschlossen/i); assert.equal(result.changes.length, 0); });
    await ask('Starte jetzt eine neue Arbeitsjournal-Sitzung mit dem Titel "KI Live Test".', () => assert.equal(state.activeTimer?.title, 'KI Live Test'));
    await ask('Pausiere meine aktuelle Sitzung.', () => assert.equal(state.activeTimer?.status, 'paused'));
    await ask('Beende meine aktuelle Sitzung und speichere sie im Arbeitsjournal.', () => { assert.equal(state.activeTimer, null); assert.equal(state.journalEntries[0]?.title, 'KI Live Test'); });
    await ask('Importiere diesen Rohtext ins Promptprotokoll. Modell: GPT-5, Prompt: Was ist 2+2?, Antwort: 4. Verwende das heutige Datum.', () => assert.ok(state.promptEntries.some((entry) => entry.prompt.includes('2+2') && entry.response.includes('4'))));
    await ask('Ändere beim Prompt "Was ist 2+2?" den Titel zu "Mathematik-Test". Behalte die Antwort und den Rest unverändert.', () => assert.equal(state.promptEntries[0]?.title, 'Mathematik-Test'));
    await ask('Was war die Antwort auf den Prompt "Mathematik-Test"? Ändere nichts.', (result) => { assert.match(result.message, /4/); assert.equal(result.changes.length, 0); });
    await ask('Wie kann ich das Arbeitsjournal als PDF exportieren? Ändere nichts.', (result) => { assert.match(result.message, /Export|PDF/i); assert.equal(result.changes.length, 0); });
    assert.ok(history.length >= 7);
    console.log(JSON.stringify({ success: true, scenarios: results.length, root }));
  } finally { assistant.shutdown(); await writeFile(path.join(root, 'results.json'), JSON.stringify(results, null, 2)); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
