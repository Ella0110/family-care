const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-b-ui-tuning.js',
  'verify-b1-profile-edit-panel.js',
]);

console.log('verify-t2.3-frontend: ok');
