const assert = require('assert');
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(
  path.join(__dirname, '..', 'utils/alert-subscription.js'),
  'utf8',
);

assert.doesNotMatch(
  content,
  /console\.(?:log|warn)\(/,
  'alert-subscription helper should not keep temporary requestSubscribeMessage diagnostics',
);

console.log('verify-alert-subscription-clean: ok');
