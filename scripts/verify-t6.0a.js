const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(__dirname, '..', relativePath));
}

const appConfig = JSON.parse(read('app.json'));

assert.ok(Array.isArray(appConfig.pages), 'app.json should define pages');
assert.strictEqual(appConfig.pages[0], 'pages/data/data', 'data page should become the default launch page');
assert.ok(appConfig.pages.includes('pages/profile-home/profile-home'), 'profile-home page should be registered');
assert.ok(appConfig.pages.includes('pages/home/home'), 'legacy home page should stay registered');

assert.ok(appConfig.tabBar, 'app.json should define tabBar');
assert.deepStrictEqual(
  appConfig.tabBar.list.map((item) => item.pagePath),
  ['pages/data/data', 'pages/profile-home/profile-home'],
  'tabBar should include data and profile-home tabs in order',
);

[
  'pages/data/data.js',
  'pages/data/data.wxml',
  'pages/data/data.wxss',
  'pages/data/data.json',
  'pages/profile-home/profile-home.js',
  'pages/profile-home/profile-home.wxml',
  'pages/profile-home/profile-home.wxss',
  'pages/profile-home/profile-home.json',
  'components/profile-switcher/profile-switcher.js',
  'components/profile-switcher/profile-switcher.wxml',
  'components/profile-switcher/profile-switcher.wxss',
  'components/profile-switcher/profile-switcher.json',
  'components/record-panel/record-panel.js',
  'components/record-panel/record-panel.wxml',
  'components/record-panel/record-panel.wxss',
  'components/record-panel/record-panel.json',
  'utils/record-editor.js',
  'assets/tab-data.png',
  'assets/tab-data-active.png',
  'assets/tab-profile.png',
  'assets/tab-profile-active.png',
].forEach((file) => {
  assert.ok(exists(file), `${file} should exist`);
});

assert.match(read('pages/data/data.wxml'), /profile-switcher/, 'data page should render profile switcher component');
assert.match(read('pages/data/data.wxml'), /record-panel/, 'data page should render record panel component');
assert.match(read('pages/data/data.wxml'), /全部记录/, 'data page should expose records-list navigation');
assert.match(read('pages/data/data.wxml'), /长期用药/, 'data page should expose medication summary');
assert.match(read('pages/data/data.wxml'), /wx:if="\{\{hasMedicationSummary\}\}"/, 'medication summary should only render when medications exist');
assert.doesNotMatch(read('pages/data/data.wxml'), /bindtap="handleMedicationTap"/, 'medication summary should be read-only');
assert.match(read('pages/data/data.wxml'), /wx:if="\{\{pageReady\}\}"/, 'data page should gate content behind pageReady');
assert.match(read('pages/data/data.wxml'), /wx:else/, 'data page should render a loading placeholder when pageReady is false');

assert.match(read('components/profile-switcher/profile-switcher.js'), /triggerEvent\('select'/, 'profile-switcher should emit select event');
assert.match(read('components/profile-switcher/profile-switcher.js'), /triggerEvent\('close'/, 'profile-switcher should emit close event');
assert.match(read('components/record-panel/record-panel.js'), /triggerEvent\('success'/, 'record-panel should emit success event');
assert.match(read('components/record-panel/record-panel.js'), /triggerEvent\('delete'/, 'record-panel should emit delete event');
assert.match(read('components/record-panel/record-panel.js'), /wx\.showModal/, 'record-panel delete flow should use wx.showModal confirmation');
assert.doesNotMatch(read('components/record-panel/record-panel.wxml'), /textarea|备注/, 'record-panel should not render note field');

assert.match(read('app.js'), /CURRENT_PROFILE_STORAGE_KEY/, 'app.js should define current profile storage key');
assert.match(read('app.js'), /setStorageSync\(CURRENT_PROFILE_STORAGE_KEY/, 'app.js should persist currentProfileId');
assert.match(read('app.js'), /getStorageSync\(CURRENT_PROFILE_STORAGE_KEY/, 'app.js should restore currentProfileId');

assert.match(read('pages/record/record.js'), /require\('\.\.\/\.\.\/utils\/record-editor'\)/, 'record page should reuse shared record-editor helper');
assert.doesNotMatch(read('utils/record-editor.js'), /requestSubscribeMessage/, 'record-editor should not request subscribe during save');
assert.doesNotMatch(read('pages/record/record.js'), /requestAlertSubscription/, 'record page should not request subscribe during save');
assert.match(read('pages/profile-edit/profile-edit.js'), /wx\.switchTab\(\s*\{\s*url: '\/pages\/data\/data'/, 'profile create should switch to data tab after success');
assert.match(read('pages/profile-edit/profile-edit.js'), /wx\.setStorageSync\('currentProfileId', [^)]+\)/, 'profile create should persist currentProfileId before switching tabs');
assert.match(
  read('pages/profile-edit/profile-edit.js'),
  /store\.setState\([\s\S]*currentProfileId:[\s\S]*wx\.setStorageSync\('currentProfileId', [^)]+\)[\s\S]*wx\.switchTab\(/,
  'profile create should update store and storage before switchTab',
);
assert.match(read('pages/data/data.js'), /pageReady:\s*false/, 'data page should initialize pageReady as false');
assert.match(read('pages/data/data.js'), /_lastProfileId:\s*''/, 'data page should track the last rendered profile id');
assert.match(read('pages/data/data.js'), /this\.setData\(\{\s*pageReady:\s*false\s*\}\)/, 'data page should enter loading state before switching profile content');
assert.match(read('pages/data/data.js'), /pageReady:\s*true/, 'data page should mark pageReady true after data is ready');
assert.match(read('pages/data/data.js'), /getAppLoginStatus/, 'data page should reuse shared login status helper before rendering');
assert.match(read('pages/data/data.js'), /if \(!loginStatus\.isLoginReady\) \{\s*this\.enterPageLoading\(\);\s*return;\s*\}/, 'data page should stay in loading state until app login finishes');
assert.match(read('pages/data/data.js'), /const loginJustFinished = loginStatus\.isLoginReady && !this\.lastLoginReady/, 'data page should refresh once when login transitions from pending to ready');
assert.match(read('pages/home/home.js'), /requestAlertSubscription/, 'home should reuse shared alert subscription helper');
