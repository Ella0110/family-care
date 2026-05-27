const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const json = JSON.parse(read('pages/user-profile-edit/user-profile-edit.json'));
const wxml = read('pages/user-profile-edit/user-profile-edit.wxml');
const wxss = read('pages/user-profile-edit/user-profile-edit.wxss');
const js = read('pages/user-profile-edit/user-profile-edit.js');

assert.strictEqual(
  json.navigationBarTitleText,
  '个人资料',
  'user-profile-edit should use the native navigation bar title',
);

assert.ok(
  !Object.prototype.hasOwnProperty.call(json, 'navigationStyle') || json.navigationStyle !== 'custom',
  'user-profile-edit should not opt into a custom navigation bar',
);

assert.doesNotMatch(
  wxml,
  /profile-edit-header/,
  'custom header markup should be removed from user-profile-edit',
);

assert.match(
  wxml,
  /open-type="chooseAvatar"/,
  'avatar picker should remain available',
);

assert.match(
  wxml,
  /type="nickname"/,
  'nickname input should keep the native nickname type',
);

assert.match(
  js,
  /userService\.updateProfile/,
  'save flow should still call userService.updateProfile',
);

assert.match(
  js,
  /wx\.navigateBack/,
  'cancel or post-save flow should still navigate back',
);

assert.match(
  wxss,
  /\.page-root\s*\{[\s\S]*background:\s*#eef3fb;/i,
  'page root should align to the shared light-blue background',
);

assert.match(
  wxss,
  /\.profile-edit-card\s*\{[\s\S]*border-radius:\s*32rpx;/,
  'profile form should sit inside a 32rpx rounded white card',
);

assert.match(
  wxss,
  /\.profile-edit-input\s*\{[\s\S]*background:\s*#f8fafc;[\s\S]*border-radius:\s*16rpx;[\s\S]*border:\s*2rpx solid #e2e8f0;/i,
  'nickname input should use the shared filled-input style',
);

assert.match(
  wxss,
  /\.profile-edit-save\s*\{[\s\S]*width:\s*100%;[\s\S]*border-radius:\s*24rpx;/,
  'save button should span the card width with a 24rpx radius',
);

assert.match(
  wxss,
  /\.profile-edit-cancel\s*\{[\s\S]*margin-top:\s*24rpx;/,
  'cancel action should keep the required spacing below save',
);

console.log('verify-b4-user-profile-page: ok');
