import { createHash } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, mkdtemp, open, rename, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { AssistantSetupPlan, AssistantStatus } from '../shared/models';
import { selectAssistantModel } from '../shared/assistant-models';

export const OLLAMA_URL = 'http://127.0.0.1:11434';
export function executableCandidates(root: string, platform = process.platform, env = process.env): string[] {
  const executable = platform === 'win32' ? 'ollama.exe' : 'ollama';
  const paths = [path.join(root, 'runtime', executable)];
  if (platform === 'win32' && env.LOCALAPPDATA) paths.push(path.join(env.LOCALAPPDATA, 'Programs', 'Ollama', executable));
  if (platform === 'darwin') paths.push('/Applications/Ollama.app/Contents/Resources/ollama');
  for (const directory of (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':')) {
    if (directory.trim()) paths.push(path.join(directory.replace(/^"|"$/g, ''), executable));
  }
  if (platform !== 'win32') paths.push('/usr/local/bin/ollama', '/usr/bin/ollama');
  return [...new Set(paths)];
}
export async function findOllama(root: string): Promise<string | undefined> {
  for (const executable of executableCandidates(root)) { try { await access(executable); return executable; } catch {} }
  return undefined;
}

export function runHidden(executable: string, args: string[], signal: AbortSignal, env = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, signal, env, timeout: 300_000, maxBuffer: 2 * 1024 ** 2 }, (error) => error ? reject(error) : resolve());
  });
}

export interface RuntimeAsset { name: string; size: number; digest: string; browser_download_url: string }
export function selectRuntimeAsset(assets: RuntimeAsset[], arch: string): RuntimeAsset {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Diese Prozessorarchitektur wird von der automatischen Ollama-Installation nicht unterstützt.');
  const name = `ollama-windows-${arch === 'x64' ? 'amd64' : 'arm64'}.zip`;
  const asset = assets.find((asset) => asset.name === name);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '') || !asset.browser_download_url.startsWith('https://github.com/ollama/ollama/releases/download/')) throw new Error('Das offizielle Ollama-Paket konnte nicht sicher geprüft werden. Bitte später erneut versuchen.');
  return asset;
}

/** Installs only the portable official CLI bundle inside MAR Helper's private directory. */
export async function installOllamaRuntime(root: string, arch: string, signal: AbortSignal, notify: (status: AssistantStatus) => void, request: typeof fetch = fetch): Promise<string> {
  await mkdir(root, { recursive: true });
  const response = await request('https://api.github.com/repos/ollama/ollama/releases/latest', {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MAR-Helper' }
  });
  if (!response.ok) throw new Error(`Ollama-Download nicht verfügbar (HTTP ${response.status}). Bitte Internetverbindung prüfen und erneut versuchen.`);
  const release = await response.json() as { assets: RuntimeAsset[]; tag_name: string };
  const asset = selectRuntimeAsset(release.assets, arch);
  const space = await statfs(root);
  if (space.bavail * space.bsize < asset.size * 3 + 1024 ** 3) throw new Error('Für die Ollama-Installation ist zu wenig Speicherplatz frei. Bitte mindestens 6 GB freigeben.');
  const staging = await mkdtemp(path.join(root, 'setup-'));
  const archive = path.join(staging, 'ollama.zip');
  const payload = path.join(staging, 'payload');
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const idle = new AbortController();
  const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idle.abort(new Error('Der Ollama-Download antwortet nicht mehr. Bitte erneut versuchen.')), 120_000); };
  try {
    touch();
    const download = await request(asset.browser_download_url, { signal: AbortSignal.any([signal, idle.signal]) });
    if (!download.ok || !download.body) throw new Error('Das Ollama-Paket konnte nicht heruntergeladen werden. Bitte erneut versuchen.');
    const hash = createHash('sha256');
    const file = await open(archive, 'w');
    let received = 0;
    let lastPercent = -1;
    try {
      for await (const chunk of download.body as unknown as AsyncIterable<Uint8Array>) {
        signal.throwIfAborted(); touch();
        received += chunk.length;
        if (received > asset.size) throw new Error('Das Ollama-Paket hat eine unerwartete Grösse.');
        hash.update(chunk);
        let written = 0;
        while (written < chunk.length) written += (await file.write(chunk, written, chunk.length - written)).bytesWritten;
        const percent = Math.floor(received / asset.size * 100);
        if (percent !== lastPercent) { lastPercent = percent; notify({ phase: 'downloading-runtime', message: 'Ollama wird heruntergeladen …', percent }); }
      }
    } finally { await file.close(); clearTimeout(idleTimer); }
    if (received !== asset.size || `sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('Die Prüfsumme des Ollama-Pakets stimmt nicht. Bitte erneut herunterladen.');
    notify({ phase: 'installing-runtime', message: 'Ollama wird lokal eingerichtet …' });
    // Paths pass as environment variables, never as shell text. Validate archive traversal before extraction.
    const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($env:MAR_ASSISTANT_ARCHIVE)
$destination = [System.IO.Path]::GetFullPath($env:MAR_ASSISTANT_DESTINATION) + [System.IO.Path]::DirectorySeparatorChar
try { foreach ($entry in $archive.Entries) {
  $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($destination, $entry.FullName))
  if (-not $target.StartsWith($destination, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid archive path' }
} } finally { $archive.Dispose() }
[System.IO.Compression.ZipFile]::ExtractToDirectory($env:MAR_ASSISTANT_ARCHIVE, $env:MAR_ASSISTANT_DESTINATION)`;
    await runHidden('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], signal,
      { ...process.env, MAR_ASSISTANT_ARCHIVE: archive, MAR_ASSISTANT_DESTINATION: payload });
    signal.throwIfAborted();
    await access(path.join(payload, 'ollama.exe'));
    await writeFile(path.join(payload, 'mar-helper-runtime.json'), JSON.stringify({ version: release.tag_name, sha256: asset.digest }));
    const destination = path.join(root, 'runtime');
    // The destination and staging are fixed descendants of this service's private root.
    if (path.dirname(path.resolve(destination)) !== path.resolve(root)) throw new Error('Ungültiger Installationspfad.');
    await rm(destination, { recursive: true, force: true });
    // Windows scanners can briefly hold freshly extracted DLLs/executables open.
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try { await rename(payload, destination); break; }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt >= 20) throw new Error('Ollama-Dateien sind noch durch Windows oder den Virenschutz gesperrt. Bitte kurz warten und die Einrichtung erneut versuchen.');
        await delay(500, undefined, { signal });
      }
    }
    return path.join(destination, 'ollama.exe');
  } finally {
    clearTimeout(idleTimer);
    if (path.dirname(path.resolve(staging)) === path.resolve(root)) await rm(staging, { recursive: true, force: true });
  }
}

export interface AssistantRuntimeDependencies {
  fetch: typeof fetch; baseUrl: string; platform: string; arch: string; memoryBytes: number;
  find: () => Promise<string | undefined>;
  install: (signal: AbortSignal, notify: (status: AssistantStatus) => void) => Promise<string>;
  launch: (executable: string) => ChildProcess;
  wait: (signal: AbortSignal) => Promise<void>;
}
export function runtimeDependencies(root: string): AssistantRuntimeDependencies {
  return {
    fetch: (...args) => fetch(...args), baseUrl: OLLAMA_URL, platform: process.platform, arch: process.arch, memoryBytes: os.totalmem(),
    find: () => findOllama(root), install: (signal, notify) => installOllamaRuntime(root, process.arch, signal, notify),
    launch: (executable) => spawn(executable, ['serve'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1' } }),
    wait: (signal) => new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 750);
      signal.addEventListener('abort', abort, { once: true });
    })
  };
}

export async function setupPlan(deps: AssistantRuntimeDependencies): Promise<AssistantSetupPlan> {
  const selection = selectAssistantModel(deps.memoryBytes);
  let runtimeInstalled = !!await deps.find();
  if (!runtimeInstalled) {
    try { const response = await deps.fetch(`${deps.baseUrl}/api/version`, { signal: AbortSignal.timeout(1500) }); runtimeInstalled = response.ok && typeof (await response.json() as { version?: unknown }).version === 'string'; } catch {}
  }
  const supported = (deps.platform === 'win32' && ['x64', 'arm64'].includes(deps.arch) || runtimeInstalled) && deps.memoryBytes >= 8 * 1024 ** 3;
  return { ...selection, platform: deps.platform, arch: deps.arch, memoryGb: Math.round(deps.memoryBytes / 1024 ** 3), runtimeInstalled, supported,
    reason: deps.memoryBytes < 8 * 1024 ** 3 ? 'Für den lokalen Assistenten werden mindestens 8 GB RAM benötigt.' : !supported ? 'Installiere Ollama auf diesem Betriebssystem zuerst manuell. Danach übernimmt MAR Helper das Modell und den Hintergrundstart.' : selection.reason };
}
