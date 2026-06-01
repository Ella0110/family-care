const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-d-final-ui-polish.js',
  'verify-e-final-fixes.js',
  'verify-f-import-and-chart-export.js',
  'verify-g-round-fixes.js',
  'verify-h1-font-scale-pages.js',
  'verify-h1-font-scale-styles.js',
  'verify-h3-profile-selector.js',
]);

console.log('verify-t4.2a: ok');
