const fs = require('fs');
const path = require('path');

const FUNCTION_NAMES = [
  'login',
  'createProfile',
  'updateProfile',
  'deleteProfile',
  'updateProfileSettings',
  'saveRecord',
  'getRecords',
  'updateRecord',
  'deleteRecord',
];

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
  const cloudfunctionsDir = path.join(repoRoot, 'cloudfunctions');
  const sourceSharedDir = path.join(cloudfunctionsDir, '_shared');

  for (const functionName of FUNCTION_NAMES) {
    const targetSharedDir = path.join(cloudfunctionsDir, functionName, '_shared');
    fs.rmSync(targetSharedDir, { recursive: true, force: true });
    copyDirectory(sourceSharedDir, targetSharedDir);
    console.log(`[build-cloudfunctions] copied _shared -> ${functionName}/_shared`);
  }
}

main();
