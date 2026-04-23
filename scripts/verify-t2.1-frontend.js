const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertContains(file, pattern, message) {
  const content = read(file);
  assert.match(content, pattern, `${file}: ${message}`);
}

[
  'components/empty-state/empty-state.js',
  'components/empty-state/empty-state.json',
  'components/empty-state/empty-state.wxml',
  'components/empty-state/empty-state.wxss',
  'services/profile-service.js',
].forEach((file) => {
  assert.ok(exists(file), `${file} should exist`);
});

const homeJson = JSON.parse(read('pages/home/home.json'));
assert.strictEqual(
  homeJson.usingComponents['empty-state'],
  '/components/empty-state/empty-state',
  'home should register empty-state component',
);

assertContains('services/profile-service.js', /require\('\.\/request'\)/, 'profile service should use request layer');
assertContains('services/profile-service.js', /call\('createProfile'/, 'profile service should call createProfile');
assert.doesNotMatch(read('services/profile-service.js'), /wx\.cloud\.callFunction/, 'profile service must not call wx.cloud directly');

assertContains('app.js', /currentProfileId:\s*null/, 'login normalization should keep currentProfileId null in T2.1');

assertContains('pages/home/home.js', /store\.subscribe/, 'home should subscribe to store changes');
assertContains('pages/home/home.js', /onShow\(\)/, 'home should refresh from store in onShow');
assertContains('pages/home/home.js', /profile-edit\?mode=create/, 'home should navigate to create profile mode');
assertContains('pages/home/home.wxml', /记录家人的血压，从第一条开始/, 'home should show zero-profile title');
assertContains('pages/home/home.wxml', /血压录入功能将在 T2\.2 上线/, 'home should show T2.2 placeholder after profile creation');
assertContains('pages/home/home.wxml', /bind:buttontap="handleCreateProfile"/, 'home should handle empty-state button tap');

assertContains('pages/profile-edit/profile-edit.js', /createProfile/, 'profile edit should call profile service');
assertContains('pages/profile-edit/profile-edit.js', /validateForm/, 'profile edit should validate form before submit');
assertContains('pages/profile-edit/profile-edit.js', /请填写姓名/, 'profile edit should handle missing name');
assertContains('pages/profile-edit/profile-edit.js', /姓名不能超过 20 个字/, 'profile edit should handle long name');
assertContains('pages/profile-edit/profile-edit.wxml', /姓名/, 'profile edit should render name field');
assertContains('pages/profile-edit/profile-edit.wxml', /与你的关系/, 'profile edit should render relation picker');
assertContains('pages/profile-edit/profile-edit.wxml', /出生日期/, 'profile edit should render birth date picker');

[
  'pages/home/home.js',
  'pages/profile-edit/profile-edit.js',
  'services/profile-service.js',
].forEach((file) => {
  assert.doesNotMatch(read(file), /cloudfunctions\/_shared/, `${file} must not import cloudfunctions shared code`);
  assert.doesNotMatch(read(file), /wx\.cloud\.callFunction/, `${file} must not call cloud functions directly`);
});

console.log('[verify-t2.1-frontend] pass');
