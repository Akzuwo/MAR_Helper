const fs = require('node:fs');
const path = require('node:path');

const [version, outputArgument] = process.argv.slice(2);
if (!version || !outputArgument) {
  throw new Error('Aufruf: node scripts/render-release-notes.cjs <Version> <Ausgabedatei>');
}

const projectRoot = path.resolve(__dirname, '..');
const changelog = JSON.parse(fs.readFileSync(path.join(projectRoot, 'changelog.json'), 'utf8'));
const release = changelog[version];
if (!release || !Array.isArray(release.fix) || !Array.isArray(release.new)) {
  throw new Error(`Kein gültiger Changelog für Version ${version} gefunden.`);
}

const section = (title, entries) => entries.length
  ? [`### ${title}`, '', ...entries.map((entry) => `- ${entry}`), '']
  : [];
const notes = [
  `## Änderungen in Version ${version}`,
  '',
  ...section('Fehlerbehebungen', release.fix),
  ...section('Neue Funktionen', release.new)
].join('\n').trimEnd() + '\n';

const outputPath = path.resolve(projectRoot, outputArgument);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, notes, 'utf8');
console.log(`Release-Text für Version ${version} erstellt: ${outputPath}`);
