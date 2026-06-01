const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-b2-report-single-card.js',
  'verify-b2-export-chart-padding.js',
  'verify-b2-export-quality.js',
  'verify-b3-settings-reference-lines.js',
  'verify-b4-user-profile-page.js',
]);

console.log('verify-t2.4-frontend: ok');
