const fs = require('fs');
const path = require('path');
const {
  getCloudfunctionsDir,
  getCloudfunctionDirectories,
  readJsonIfExists,
  buildFunctionPackageManifest,
  writeJsonFile,
} = require('./_helpers/cloudfunction-packaging');
const { verifyCloudfunctionManifests } = require('./verify-cloudfunction-manifests');

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const cloudfunctionsDir = getCloudfunctionsDir(repoRoot);
  const sourceSharedDir = path.join(cloudfunctionsDir, '_shared');

  for (const { name, dir } of getCloudfunctionDirectories(cloudfunctionsDir)) {
    const targetSharedDir = path.join(dir, '_shared');
    fs.rmSync(targetSharedDir, { recursive: true, force: true });
    copyDirectory(sourceSharedDir, targetSharedDir);
    console.log(`[build-cloudfunctions] copied _shared -> ${name}/_shared`);

    const manifestPath = path.join(dir, 'package.json');
    const nextManifest = buildFunctionPackageManifest(name, readJsonIfExists(manifestPath));
    writeJsonFile(manifestPath, nextManifest);
    console.log(`[build-cloudfunctions] ensured package.json -> ${name}/package.json`);
  }

  verifyCloudfunctionManifests({ cloudfunctionsDir });
}

main();
