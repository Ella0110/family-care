const { execFileSync } = require('child_process');
const path = require('path');

if (!process.env.SKIP_CLOUDFUNCTION_BUILD) {
  execFileSync(process.execPath, [path.resolve(__dirname, '..', 'build-cloudfunctions.js')], {
    stdio: 'inherit',
  });
}
