const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const panelJs = read('components/profile-edit-panel/profile-edit-panel.js');
const panelWxml = read('components/profile-edit-panel/profile-edit-panel.wxml');
const panelWxss = read('components/profile-edit-panel/profile-edit-panel.wxss');
const reportWxml = read('pages/report/report.wxml');
const reportWxss = read('pages/report/report.wxss');
const profileHomeWxss = read('pages/profile-home/profile-home.wxss');

assert.doesNotMatch(
  panelWxml,
  /与你的关系|profile-edit-panel__relation-row|showCustomRelationInput/,
  'profile-edit-panel should remove the relation field entirely in Round 3',
);

assert.doesNotMatch(
  panelJs,
  /RELATION_OPTIONS|normalizeRelationState|onRelationOptionTap|onRelationCustomInput|relationCustom/,
  'profile-edit-panel logic should remove relation-specific state and handlers',
);

assert.doesNotMatch(
  panelWxss,
  /profile-edit-panel__relation-pill|profile-edit-panel__relation-row|profile-edit-panel__input--custom-relation/,
  'profile-edit-panel styles should remove relation-pill rules',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__title[\s\S]*font-size:\s*34rpx;[\s\S]*font-weight:\s*700;/,
  'panel title should be 34rpx bold',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__label[\s\S]*color:\s*#334155;[\s\S]*font-size:\s*28rpx;[\s\S]*font-weight:\s*700;/i,
  'field labels should use the tuned color and weight',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__input[\s\S]*min-height:\s*88rpx;[\s\S]*border-radius:\s*16rpx;[\s\S]*background:\s*#f8fafc;[\s\S]*font-size:\s*30rpx;/i,
  'panel inputs should use the tuned filled-input style',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__field \+ \.profile-edit-panel__field[\s\S]*margin-top:\s*36rpx;/,
  'panel fields should keep a unified 36rpx vertical rhythm',
);

assert.doesNotMatch(
  panelWxml,
  /scroll-view/,
  'profile-edit-panel should drop scroll-view after removing the relation field',
);

assert.doesNotMatch(
  panelWxss,
  /profile-edit-panel__content-inner|box-shadow:\s*0 -4rpx 12rpx rgba\(0,\s*0,\s*0,\s*0\.03\)/i,
  'profile-edit-panel should not keep the old scroll-footer compensation styles',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__save[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*text-align:\s*center;/,
  'save button text should stay centered in both axes',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__gender-option[\s\S]*min-height:\s*80rpx;[\s\S]*border-radius:\s*16rpx;[\s\S]*background:\s*#f1f5f9;[\s\S]*color:\s*#475569;/i,
  'gender buttons should keep the unified neutral visual style',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__header[\s\S]*padding-bottom:\s*40rpx;/,
  'title should keep a 40rpx gap before the first field',
);

assert.match(
  panelWxss,
  /\.profile-edit-panel__footer[\s\S]*margin-top:\s*48rpx;/,
  'save button area should keep 48rpx spacing below the last field in non-scroll layout',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__topbar[\s\S]*padding-top:\s*24rpx;/,
  'profile-home topbar should gain breathing room below the native navbar',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__section-title[\s\S]*margin-top:\s*32rpx;/,
  'section titles should keep a tighter 32rpx top spacing',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__members\.card[\s\S]*margin-top:\s*16rpx;/,
  'members card should sit 16rpx below its section title',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__shortcut-grid[\s\S]*margin-top:\s*16rpx;/,
  'shortcut grid should sit 16rpx below its section title',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__shortcut \+ \.profile-home__shortcut[\s\S]*margin-top:\s*16rpx;/,
  'stacked shortcut cards should keep a 16rpx gap',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__settings-stack[\s\S]*margin-top:\s*16rpx;/,
  'settings stack should sit 16rpx below its section title',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__settings-card \+ \.profile-home__settings-card[\s\S]*margin-top:\s*16rpx;/,
  'settings cards should keep a 16rpx gap',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__danger[\s\S]*margin-top:\s*16rpx;/,
  'danger card should sit 16rpx below its section title',
);

console.log('verify-b-ui-tuning: ok');
