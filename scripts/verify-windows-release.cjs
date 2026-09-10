const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const [releaseDirectoryArgument = 'release', version] = process.argv.slice(2);
if (!version) throw new Error('Aufruf: node scripts/verify-windows-release.cjs <Release-Verzeichnis> <Version>');

const releaseDirectory = path.resolve(releaseDirectoryArgument);
const installerName = `MAR-Helper-Setup-${version}.exe`;
const installerPath = path.join(releaseDirectory, installerName);
const blockmapPath = `${installerPath}.blockmap`;
const updateMetadataPath = path.join(releaseDirectory, 'latest.yml');

for (const requiredFile of [installerPath, blockmapPath, updateMetadataPath]) {
  if (!fs.statSync(requiredFile, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Erwartetes Release-Asset fehlt: ${requiredFile}`);
  }
}

function readPeMachine(file) {
  const data = fs.readFileSync(file);
  if (data.length < 64 || data.readUInt16LE(0) !== 0x5a4d) throw new Error(`${file} ist keine PE-Datei.`);
  const peOffset = data.readUInt32LE(0x3c);
  if (data.readUInt32LE(peOffset) !== 0x00004550) throw new Error(`${file} enthält keinen gültigen PE-Header.`);
  return data.readUInt16LE(peOffset + 4);
}

const packagedApps = [
  { arch: 'x64', machine: 0x8664, file: path.join(releaseDirectory, 'win-unpacked', 'MAR Helper.exe') },
  { arch: 'arm64', machine: 0xaa64, file: path.join(releaseDirectory, 'win-arm64-unpacked', 'MAR Helper.exe') }
];
for (const app of packagedApps) {
  if (!fs.statSync(app.file, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Das entpackte ${app.arch}-App-Paket fehlt: ${app.file}`);
  }
  const actualMachine = readPeMachine(app.file);
  if (actualMachine !== app.machine) {
    throw new Error(`${app.arch}-App hat den falschen PE-Maschinentyp 0x${actualMachine.toString(16)}.`);
  }
}

const metadata = yaml.load(fs.readFileSync(updateMetadataPath, 'utf8'));
if (metadata?.version !== version) throw new Error(`latest.yml enthält Version '${metadata?.version}' statt '${version}'.`);
if (!Array.isArray(metadata.files) || metadata.files.length !== 1 || metadata.files[0]?.url !== installerName) {
  throw new Error(`latest.yml muss genau den universellen Installer '${installerName}' referenzieren.`);
}
if (metadata.path !== installerName) throw new Error(`latest.yml.path muss '${installerName}' sein.`);

const installerHash = crypto.createHash('sha512').update(fs.readFileSync(installerPath)).digest('base64');
if (metadata.sha512 !== installerHash || metadata.files[0].sha512 !== installerHash) {
  throw new Error('Die SHA-512-Prüfsumme des Installers stimmt nicht mit latest.yml überein.');
}

console.log(`Release geprüft: ein universeller NSIS-Installer für x64 und ARM64; Update-Metadaten sind konsistent.`);
