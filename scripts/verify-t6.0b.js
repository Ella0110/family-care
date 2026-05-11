const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const profileHomeJs = read('pages/profile-home/profile-home.js');
const profileHomeWxml = read('pages/profile-home/profile-home.wxml');
const profileHomeJson = JSON.parse(read('pages/profile-home/profile-home.json'));
const dataJs = read('pages/data/data.js');
const profileMembersJs = read('pages/profile-members/profile-members.js');

assert.ok(profileHomeJson.usingComponents, 'profile-home should declare components');
assert.strictEqual(
  profileHomeJson.usingComponents['profile-switcher'],
  '/components/profile-switcher/profile-switcher',
  'profile-home should reuse profile-switcher',
);

assert.match(profileHomeJs, /pageReady:\s*false/, 'profile-home should gate rendering behind pageReady');
assert.match(profileHomeJs, /getAppLoginStatus/, 'profile-home should reuse shared login status helper');
assert.match(profileHomeJs, /requestAlertSubscription/, 'profile-home should reuse shared alert subscription helper');
assert.match(profileHomeJs, /memberService\.listProfileMembers/, 'profile-home should load member list through memberService');
assert.match(profileHomeJs, /recordService\.(loadLatestRecord|fetchLatestRecord)/, 'profile-home should load latest record');
assert.match(profileHomeJs, /medicationService\.(loadMedications|fetchMedications)/, 'profile-home should load medications');
assert.match(profileHomeJs, /profileService\.deleteProfile/, 'profile-home should support deleting a profile');
assert.match(profileHomeJs, /handleToggleSubscribeAlerts/, 'profile-home should expose subscribe toggle handler');
assert.match(profileHomeJs, /handleDeleteProfile/, 'profile-home should expose delete action');
assert.match(profileHomeJs, /handleSelectProfile/, 'profile-home should react to profile switcher selection');
assert.match(profileHomeJs, /handleOpenReport/, 'profile-home should expose report entry');

assert.match(profileHomeWxml, /设置/, 'profile-home should expose settings entry');
assert.match(profileHomeWxml, /成员管理/, 'profile-home should render members section');
assert.match(profileHomeWxml, /生成就诊报告/, 'profile-home should render report shortcut');
assert.match(profileHomeWxml, /药物管理/, 'profile-home should render medication shortcut');
assert.match(profileHomeWxml, /异常血压通知/, 'profile-home should render alerts toggle');
assert.match(profileHomeWxml, /删除档案/, 'profile-home should render delete action');
assert.match(profileHomeWxml, /查看全部档案/, 'profile-home should render bottom switcher entry');
assert.match(profileHomeWxml, /<switch\b/, 'profile-home should use native switch for alerts toggle');
assert.match(profileHomeWxml, /profile-switcher/, 'profile-home should render profile-switcher component');

assert.match(dataJs, /pageReady:\s*false/, 'data page should keep loading gate behavior after T6.0b work');
assert.match(profileMembersJs, /ensureProfileAccess/, 'profile-members should allow profile viewers to enter read-only member page');
assert.doesNotMatch(profileMembersJs, /只有管理员可以查看/, 'profile-members should no longer block non-owner viewers from opening member list');
