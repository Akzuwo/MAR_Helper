const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const packageVersion = require(path.join(projectRoot, 'package.json')).version;
const changelogPath = path.join(projectRoot, 'changelog.json');
const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
const release = changelog[packageVersion];

if (!release || typeof release !== 'object' || Array.isArray(release)) {
  throw new Error(`changelog.json enthält keinen Eintrag für Version ${packageVersion}.`);
}

for (const category of ['fix', 'new']) {
  if (!Array.isArray(release[category]) || release[category].some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`changelog.json: ${packageVersion}.${category} muss eine Liste mit gültigen Texten sein.`);
  }
}

if (release.fix.length + release.new.length === 0) {
  throw new Error(`changelog.json enthält für Version ${packageVersion} keine Änderungen.`);
}

console.log(`Changelog für Version ${packageVersion} geprüft (${release.fix.length} Fixes, ${release.new.length} neue Funktionen).`);
