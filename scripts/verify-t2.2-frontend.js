const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-a2-refresh.js',
  'verify-a4-empty-guide.js',
]);

console.log('verify-t2.2-frontend: ok');
