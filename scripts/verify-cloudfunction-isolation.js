require('./_helpers/ensure-cloudfunctions-built');

const fs = require("fs");
const os = require("os");
const path = require("path");

const FUNCTION_NAMES = [
  "login",
  "createProfile",
  "updateProfile",
  "deleteProfile",
  "updateProfileSettings",
  "saveRecord",
  "listMedications",
  "saveMedication",
  "deleteMedication",
  "getRecords",
  "updateRecord",
  "deleteRecord",
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

function verifyFunctionLoadsInIsolation(functionName) {
  const repoRoot = path.resolve(__dirname, "..");
  const sourceDir = path.join(repoRoot, "cloudfunctions", functionName);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "family-care-cf-"));
  const isolatedDir = path.join(tempRoot, functionName);

  copyDirectory(sourceDir, isolatedDir);

  // Requiring only the copied function directory simulates the cloud upload unit.
  require(path.join(isolatedDir, "index.js"));
}

function main() {
  const failures = [];

  for (const functionName of FUNCTION_NAMES) {
    try {
      verifyFunctionLoadsInIsolation(functionName);
      console.log(`[verify-cloudfunction-isolation] ok: ${functionName}`);
    } catch (error) {
      failures.push({
        functionName,
        message: error && error.message ? error.message : String(error),
      });
      console.error(
        `[verify-cloudfunction-isolation] fail: ${functionName}: ${error.message}`,
      );
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
