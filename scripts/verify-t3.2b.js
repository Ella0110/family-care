const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-c2-medication-runtime.js',
  'verify-medication-crud.js',
]);

console.log('verify-t3.2b: ok');
