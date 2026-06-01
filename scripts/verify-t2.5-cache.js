const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-login.js',
  'verify-permission.js',
]);

console.log('verify-t2.5-cache: ok');
