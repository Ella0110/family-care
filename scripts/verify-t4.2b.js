const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-h2-invite-ui.js',
  'verify-round-i-ui.js',
  'verify-t5.5.js',
  'verify-t6.0a.js',
  'verify-t6.0b.js',
  'verify-t6.1.js',
]);

console.log('verify-t4.2b: ok');
