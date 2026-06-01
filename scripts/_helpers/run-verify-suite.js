const { execFileSync } = require('child_process');
const path = require('path');

function runVerifySuite(files) {
  (Array.isArray(files) ? files : []).forEach((file) => {
    execFileSync(process.execPath, [path.join(__dirname, '..', file)], {
      stdio: 'inherit',
    });
  });
}

module.exports = {
  runVerifySuite,
};
