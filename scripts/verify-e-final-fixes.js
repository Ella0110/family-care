const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyE1RecordsExportLayout() {
  const exporterJs = read('utils/records-export-helpers.js');

  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_TITLE_FONT_SIZE = 36;/,
    'records export should define the larger title font size as a named constant',
  );
  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_SUBTITLE_FONT_SIZE = 24;/,
    'records export should define the larger subtitle font size as a named constant',
  );
  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_SUBTITLE_Y = EXPORT_IMAGE_TITLE_Y \+ \(EXPORT_IMAGE_TITLE_FONT_SIZE \/ 2\) \+ 16 \+ \(EXPORT_IMAGE_SUBTITLE_FONT_SIZE \/ 2\);/,
    'records export subtitle position should be derived from title size plus the required 16px gap',
  );
  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_HEADER_TOP = EXPORT_IMAGE_SUBTITLE_Y \+ \(EXPORT_IMAGE_SUBTITLE_FONT_SIZE \/ 2\) \+ 24;/,
    'records export header should start after the subtitle size plus the required 24px gap',
  );
  assert.match(
    exporterJs,
    /Math\.max\(0,\s*Number\(recordCount\)\s*\|\|\s*0\) \* EXPORT_IMAGE_ROW_HEIGHT/,
    'records export height should only count actual data rows',
  );
  assert.doesNotMatch(
    exporterJs,
    /暂无数据|Math\.max\(1,\s*Number\(recordCount\)\s*\|\|\s*0\)/,
    'records export should not fabricate empty placeholder rows',
  );
}

function verifyE2RelationshipDefaults() {
  const permissionsJs = read('cloudfunctions/_shared/permissions.js');
  const acceptInvitationJs = read('cloudfunctions/acceptInvitation/handler.js');
  const profileHomeJs = read('pages/profile-home/profile-home.js');
  const profileCrudVerify = read('scripts/verify-profile-crud.js');

  assert.match(
    permissionsJs,
    /owner:\s*false,[\s\S]*collaborator:\s*false,[\s\S]*viewer:\s*false,/,
    'relationship subscribeAlerts defaults should be false for every role',
  );
  assert.match(
    acceptInvitationJs,
    /subscribeAlerts:\s*roleDefaults\.subscribeAlerts,/,
    'acceptInvitation should use the shared role default subscribeAlerts value',
  );
  assert.doesNotMatch(
    profileHomeJs,
    /relationship \? relationship\.subscribeAlerts : true/,
    'profile-home should no longer fall back to true for alert toggles',
  );
  assert.match(
    profileCrudVerify,
    /assert\.strictEqual\(created\.relationship\.subscribeAlerts,\s*false,/,
    'profile CRUD verification should assert owner alert subscriptions default to off',
  );
}

function verifyE4AndroidDialogCompatibility() {
  const wxss = read('pages/records-list/records-list.wxss');

  assert.match(
    wxss,
    /\.records-dialog-layer__mask[\s\S]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.5\);/i,
    'records delete dialog should rely on a plain rgba mask instead of blur',
  );
  assert.match(
    wxss,
    /\.records-dialog-layer__card[\s\S]*border-radius:\s*32rpx;[\s\S]*border:\s*1rpx solid #e2e8f0;/i,
    'records delete dialog card should use a 32rpx radius and visible border for Android compatibility',
  );
  assert.match(
    wxss,
    /\.records-dialog-layer__title[\s\S]*font-weight:\s*700;/i,
    'records delete dialog title should use font-weight 700',
  );
  assert.match(
    wxss,
    /\.records-dialog-layer__confirm[\s\S]*font-weight:\s*700;/i,
    'records delete dialog confirm button should use font-weight 700',
  );
}

function verifyE5OwnerOnlyDangerSection() {
  const wxml = read('pages/profile-home/profile-home.wxml');

  assert.match(
    wxml,
    /<block wx:if="\{\{canManageCurrentProfile\}\}">[\s\S]*<view class="profile-home__section-head">[\s\S]*<view class="profile-home__section-title">其他<\/view>[\s\S]*<view class="card profile-home__danger"/,
    'profile-home should render the entire "其他" section only for owners/managers',
  );
}

function main() {
  verifyE1RecordsExportLayout();
  verifyE2RelationshipDefaults();
  verifyE4AndroidDialogCompatibility();
  verifyE5OwnerOnlyDangerSection();
  console.log('verify-e-final-fixes: ok');
}

main();
