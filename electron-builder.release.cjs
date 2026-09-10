const baseConfig = require('./package.json').build;

// Production releases use one multi-architecture NSIS installer. Keeping this
// separate from package.json deliberately leaves local builds unchanged.
module.exports = {
  ...baseConfig,
  artifactName: 'MAR-Helper-Setup-${version}.${ext}',
  win: {
    ...baseConfig.win,
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'arm64']
      }
    ]
  }
};
