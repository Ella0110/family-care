const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-c3-member-avatar-refresh.js',
  'verify-c4-export-preview-shell.js',
  'verify-member-panel.js',
]);

console.log('verify-t3.3: ok');
