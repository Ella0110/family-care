const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const wxml = read('pages/user-settings/user-settings.wxml');
const js = read('pages/user-settings/user-settings.js');

assert.match(
  js,
  /showReferenceLineSettings:\s*false/,
  'user-settings should keep a flag for hiding reference line controls in V1',
);

assert.match(
  wxml,
  /wx:if="\{\{showReferenceLineSettings\}\}"[\s\S]*血压参考线（mmHg）/,
  'blood pressure reference line block should be hidden behind the dedicated flag',
);

assert.match(
  wxml,
  /wx:if="\{\{showReferenceLineSettings\}\}"[\s\S]*心率参考线（次\/分）/,
  'heart rate reference line block should be hidden behind the dedicated flag',
);

assert.match(
  js,
  /handleAdjustBloodPressureReference/,
  'blood pressure reference line logic should remain in JS for future reopening',
);

assert.match(
  js,
  /handleAdjustHeartRateReference/,
  'heart rate reference line logic should remain in JS for future reopening',
);

assert.match(
  js,
  /scheduleSettingsFlush\('referenceLines'\)/,
  'blood pressure reference line persistence logic should remain intact',
);

assert.match(
  js,
  /scheduleSettingsFlush\('hrReferenceLines'\)/,
  'heart rate reference line persistence logic should remain intact',
);

console.log('verify-b3-settings-reference-lines: ok');
