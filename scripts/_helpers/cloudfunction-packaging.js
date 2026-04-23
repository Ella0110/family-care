const fs = require('fs');
const path = require('path');

const WX_SERVER_SDK_VERSION = '3.0.1';

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getCloudfunctionsDir(repoRoot = getRepoRoot()) {
  return path.join(repoRoot, 'cloudfunctions');
}

function getCloudfunctionDirectories(cloudfunctionsDir = getCloudfunctionsDir()) {
  return fs
    .readdirSync(cloudfunctionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared' && !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      dir: path.join(cloudfunctionsDir, entry.name),
    }))
    .filter(({ dir }) => fs.existsSync(path.join(dir, 'index.js')));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildFunctionPackageManifest(functionName, existingManifest = null) {
  const manifest = existingManifest && typeof existingManifest === 'object' ? existingManifest : {};
  const existingDependencies =
    manifest.dependencies && typeof manifest.dependencies === 'object' ? manifest.dependencies : {};

  return Object.assign({}, manifest, {
    name:
      typeof manifest.name === 'string' && manifest.name.trim()
        ? manifest.name
        : `family-care-cloudfunction-${functionName}`,
    version:
      typeof manifest.version === 'string' && manifest.version.trim()
        ? manifest.version
        : '1.0.0',
    private: true,
    main:
      typeof manifest.main === 'string' && manifest.main.trim()
        ? manifest.main
        : 'index.js',
    dependencies: Object.assign({}, existingDependencies, {
      'wx-server-sdk': WX_SERVER_SDK_VERSION,
    }),
  });
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function verifyCloudfunctionManifestFile(filePath) {
  const manifest = readJsonIfExists(filePath);

  if (!manifest) {
    throw new Error(`missing package.json: ${filePath}`);
  }

  const dependencies =
    manifest.dependencies && typeof manifest.dependencies === 'object' ? manifest.dependencies : {};
  const actualVersion = dependencies['wx-server-sdk'];

  if (actualVersion !== WX_SERVER_SDK_VERSION) {
    throw new Error(
      `package.json must declare wx-server-sdk@${WX_SERVER_SDK_VERSION}: ${filePath}`,
    );
  }
}

module.exports = {
  WX_SERVER_SDK_VERSION,
  getRepoRoot,
  getCloudfunctionsDir,
  getCloudfunctionDirectories,
  readJsonIfExists,
  buildFunctionPackageManifest,
  writeJsonFile,
  verifyCloudfunctionManifestFile,
};
