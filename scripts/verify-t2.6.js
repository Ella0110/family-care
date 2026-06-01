const { runVerifySuite } = require('./_helpers/run-verify-suite');

runVerifySuite([
  'verify-profile-crud.js',
  'verify-record-crud.js',
]);

console.log('verify-t2.6: ok');
