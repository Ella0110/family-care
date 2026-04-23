const path = require('path');

const {
  getCloudfunctionsDir,
  getCloudfunctionDirectories,
  verifyCloudfunctionManifestFile,
} = require('./_helpers/cloudfunction-packaging');

function verifyCloudfunctionManifests(options = {}) {
  const cloudfunctionsDir = options.cloudfunctionsDir || getCloudfunctionsDir();
  const failures = [];

  for (const { name, dir } of getCloudfunctionDirectories(cloudfunctionsDir)) {
    const manifestPath = path.join(dir, 'package.json');

    try {
      verifyCloudfunctionManifestFile(manifestPath);
      console.log(`[verify-cloudfunction-manifests] ok: ${name}`);
    } catch (error) {
      failures.push(error.message);
      console.error(`[verify-cloudfunction-manifests] fail: ${name}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    const error = new Error(
      `cloudfunction package manifest verification failed (${failures.length} issue(s))`,
    );
    error.failures = failures;
    throw error;
  }
}

if (require.main === module) {
  try {
    verifyCloudfunctionManifests();
  } catch (error) {
    process.exitCode = 1;
  }
}

module.exports = {
  verifyCloudfunctionManifests,
};
