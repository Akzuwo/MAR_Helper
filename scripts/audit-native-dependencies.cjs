const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const rootManifest = require(path.join(projectRoot, 'package.json'));
const visited = new Set();
const nativePackages = [];

function resolveManifest(name, searchFrom) {
  let directory = searchFrom;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Produktionsabhängigkeit '${name}' ist nicht installiert.`);
}

function hasNativeFiles(packageDirectory) {
  const pending = [packageDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.name === 'binding.gyp' || entry.name.endsWith('.node')) return true;
    }
  }
  return false;
}

function visit(name, searchFrom) {
  const manifestPath = resolveManifest(name, searchFrom);
  const packageDirectory = path.dirname(manifestPath);
  const realPath = fs.realpathSync(packageDirectory);
  if (visited.has(realPath)) return;
  visited.add(realPath);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lifecycleScripts = ['preinstall', 'install', 'postinstall']
    .map((script) => manifest.scripts?.[script])
    .filter((script) => typeof script === 'string')
    .join(' ');
  const nativeLifecycle = /node-gyp|node-pre-gyp|prebuild|cmake-js|\.node(?:\s|$)/i.test(lifecycleScripts);

  if (manifest.gypfile || manifest.binary || nativeLifecycle || hasNativeFiles(packageDirectory)) {
    nativePackages.push(`${manifest.name}@${manifest.version}`);
  }

  const runtimeDependencies = {
    ...(manifest.dependencies || {}),
    ...(manifest.optionalDependencies || {})
  };
  for (const dependency of Object.keys(runtimeDependencies)) {
    visit(dependency, packageDirectory);
  }
}

const rootRuntimeDependencies = {
  ...(rootManifest.dependencies || {}),
  ...(rootManifest.optionalDependencies || {})
};
for (const dependency of Object.keys(rootRuntimeDependencies)) {
  visit(dependency, projectRoot);
}

if (nativePackages.length > 0) {
  throw new Error(
    `Native Produktionsabhängigkeiten benötigen eine explizite Windows-ARM64-Prüfung: ${nativePackages.join(', ')}`
  );
}

console.log(`ARM64-Audit erfolgreich: ${visited.size} Produktionspakete geprüft; keine nativen Add-ons gefunden.`);
