const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(file, pattern, message) {
  assert.match(read(file), pattern, `${file}: ${message}`);
}

assertContains('store/index.js', /setCurrentProfileId/, 'store should expose setCurrentProfileId');
assertContains('pages/home/home.js', /loadLatestRecordsForProfiles/, 'home should load latest records for all profiles');
assertContains('pages/home/home.js', /loadLatestRecord/, 'home should load multi-profile latest records independently');
assertContains('pages/home/home.js', /setCurrentProfileId/, 'home should switch current profile through store');
assertContains('pages/home/home.wxml', /关注的家人/, 'home should render multi-profile list title');
assertContains('pages/home/home.wxml', /返回档案列表/, 'home should render return-to-list entry in single profile view');
assertContains('pages/home/home.wxml', /profile-card/, 'home should render profile cards');
assertContains('pages/profile-edit/profile-edit.js', /state\.profiles\.length === 1/, 'creating a second profile should preserve the original single-profile view');

let homeConfig = null;
global.Page = (config) => {
  homeConfig = config;
};
global.getApp = () => ({ globalData: { loginReady: true, loginError: null } });
global.wx = {
  showToast() {},
  navigateTo() {},
};

delete require.cache[require.resolve('../pages/home/home')];
require('../pages/home/home');

assert.ok(homeConfig, 'home page should register Page config');
assert.strictEqual(typeof homeConfig.resolveHomeView, 'function');

const emptyView = homeConfig.resolveHomeView({
  profiles: [],
  currentProfileId: null,
});
assert.strictEqual(emptyView.viewState, 'empty');

const singleView = homeConfig.resolveHomeView({
  profiles: [{ _id: 'p1', name: '爸爸' }],
  currentProfileId: null,
});
assert.strictEqual(singleView.viewState, 'single');
assert.strictEqual(singleView.activeProfile._id, 'p1');
assert.strictEqual(singleView.canReturnToProfileList, false);

const listView = homeConfig.resolveHomeView({
  profiles: [
    { _id: 'p1', name: '爸爸' },
    { _id: 'p2', name: '妈妈' },
  ],
  currentProfileId: null,
});
assert.strictEqual(listView.viewState, 'multi');
assert.strictEqual(listView.activeProfile, null);

const selectedView = homeConfig.resolveHomeView({
  profiles: [
    { _id: 'p1', name: '爸爸' },
    { _id: 'p2', name: '妈妈' },
  ],
  currentProfileId: 'p2',
});
assert.strictEqual(selectedView.viewState, 'single');
assert.strictEqual(selectedView.activeProfile._id, 'p2');
assert.strictEqual(selectedView.canReturnToProfileList, true);

console.log('[verify-t2.4-frontend] pass');
