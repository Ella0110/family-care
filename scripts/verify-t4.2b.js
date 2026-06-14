const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-h2-invite-ui.js',
  'verify-launch-routing.js',
  'verify-round-i-ui.js',
  'verify-save-record-env-version.js',
  'verify-visibilitychange-boot.js',
  'verify-fixed-bp-display-thresholds.js',
  'verify-profile-deletion-retention.js',
  'verify-subscribe-auth-flow.js',
  'verify-t5.5.js',
  'verify-t6.0a.js',
  'verify-t6.0b.js',
  'verify-t6.1.js',
]);

console.log('verify-t4.2b: ok');
