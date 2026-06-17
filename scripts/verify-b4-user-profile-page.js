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
  '编辑个人资料',
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
  wxml,
  /X\/20|nickNameCount|nicknameCount|\{\{form\.nickname\.length\}\}\/20|\{\{nicknameCount\}\}\/20/,
  'nickname section should show a live 20-character counter',
);

assert.doesNotMatch(
  wxml,
  /用于家人协作时识别你的身份|最多 20 个字，用于展示给家人|选择头像/,
  'user-profile-edit should remove the legacy helper copy and link-style avatar action text',
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
  /\.page-root\s*\{[\s\S]*background:\s*#f4f5f7;/i,
  'page root should align to the new warm gray background',
);

assert.match(
  wxml,
  /class="profile-edit-card"/,
  'user-profile-edit should group avatar and nickname content inside a white card container',
);

assert.match(
  wxss,
  /\.profile-edit-card\s*\{[\s\S]*background:\s*#ffffff;[\s\S]*border-radius:\s*48rpx;[\s\S]*border:\s*1rpx solid rgba\(0,\s*0,\s*0,\s*0\.06\);[\s\S]*padding:\s*64rpx;[\s\S]*margin:\s*\d+rpx \d+rpx 0;/i,
  'user-profile-edit should use the new white card treatment for the top content block',
);

assert.match(
  wxss,
  /\.profile-edit-shell\s*\{[\s\S]*padding:\s*0;/i,
  'user-profile-edit shell should hand spacing control to the card container',
);

assert.match(
  wxss,
  /\.profile-edit-avatar\s*\{[\s\S]*width:\s*(176|192)rpx;[\s\S]*height:\s*(176|192)rpx;[\s\S]*border:\s*4rpx solid #ffffff[\s\S]*box-shadow:/i,
  'avatar area should render the larger white-outlined avatar with a soft shadow',
);

assert.match(
  wxml,
  /更换头像/,
  'avatar area should expose the new text-link avatar action',
);

assert.match(
  wxss,
  /\.profile-edit-input\s*\{[\s\S]*background:\s*#f2f2f7;[\s\S]*border-radius:\s*(20|24)rpx;[\s\S]*border:\s*2rpx solid transparent;/i,
  'nickname input should use the redesigned filled style with a transparent resting border',
);

assert.match(
  wxss,
  /\.profile-edit-input:focus[\s\S]*border:\s*2rpx solid #007aff/i,
  'nickname input should gain a blue border when focused',
);

assert.match(
  wxss,
  /\.profile-edit-save-bar\s*\{[\s\S]*margin:\s*40rpx \d+rpx 0;[\s\S]*padding:\s*0 0 env\(safe-area-inset-bottom\)/i,
  'save action container should sit below the card with safe-area breathing room',
);

assert.match(
  wxss,
  /\.profile-edit-save\s*\{[\s\S]*border-radius:\s*28rpx;[\s\S]*background:\s*#007aff/i,
  'save button should keep the updated blue capsule style',
);

assert.doesNotMatch(
  wxml,
  /profile-edit-cancel|>[\s\r\n]*取消[\s\r\n]*</,
  'user-profile-edit should remove the cancel button',
);

console.log('verify-b4-user-profile-page: ok');
