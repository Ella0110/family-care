const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(__dirname, '..', relativePath));
}

function decodeBackspaceSvgFromWxml(wxml) {
  const match = wxml.match(/class="record-panel__backspace-icon"[\s\S]*?src="data:image\/svg\+xml(?:;charset=utf-8)?;base64,([^"]+)"/);
  assert.ok(match, 'record-panel backspace icon should embed an inline SVG data URI');
  return Buffer.from(match[1], 'base64').toString('utf8');
}

const appConfig = JSON.parse(read('app.json'));

assert.ok(Array.isArray(appConfig.pages), 'app.json should define pages');
assert.strictEqual(appConfig.pages[0], 'pages/launch/launch', 'launch page should become the default launch page');
assert.ok(appConfig.pages.includes('pages/profile-home/profile-home'), 'profile-home page should be registered');
assert.ok(!appConfig.pages.some((item) => item.endsWith('/home')), 'legacy home page should be removed');
assert.ok(!appConfig.pages.some((item) => item.endsWith('/profile-detail')), 'legacy profile-detail page should be removed');
assert.ok(!appConfig.pages.some((item) => item.endsWith('/profile-settings')), 'legacy profile-settings page should be removed');

assert.ok(appConfig.tabBar, 'app.json should define tabBar');
assert.strictEqual(appConfig.tabBar.custom, true, 'tabBar should use custom mode');
assert.deepStrictEqual(
  appConfig.tabBar.list.map((item) => item.pagePath),
  ['pages/data/data', 'pages/profile-home/profile-home'],
  'tabBar should include data and profile-home tabs in order',
);

[
  'pages/launch/launch.js',
  'pages/launch/launch.wxml',
  'pages/launch/launch.wxss',
  'pages/launch/launch.json',
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
  'custom-tab-bar/index.js',
  'custom-tab-bar/index.wxml',
  'custom-tab-bar/index.wxss',
  'custom-tab-bar/index.json',
  'utils/record-editor.js',
  'assets/tab-data.png',
  'assets/tab-data-active.png',
  'assets/tab-profile.png',
  'assets/tab-profile-active.png',
].forEach((file) => {
  assert.ok(exists(file), `${file} should exist`);
});

[
  ['pages', 'home', 'home.js'].join('/'),
  ['pages', 'profile-detail', 'profile-detail.js'].join('/'),
  ['pages', 'profile-settings', 'profile-settings.js'].join('/'),
].forEach((file) => {
  assert.ok(!exists(file), `${file} should be removed`);
});

assert.match(read('pages/data/data.wxml'), /profile-switcher/, 'data page should render profile switcher component');
assert.match(read('pages/data/data.wxml'), /record-panel/, 'data page should render record panel component');
assert.doesNotMatch(read('pages/data/data.wxml'), /class="data-add-button"/, 'data page should no longer render a local floating add button');
assert.match(read('pages/data/data.wxml'), /全部记录/, 'data page should expose records-list navigation');
assert.match(read('pages/data/data.wxml'), /数据分析/, 'data page should render the analysis card');
assert.match(read('pages/data/data.wxml'), /wx:if="\{\{pageReady\}\}"/, 'data page should gate content behind pageReady');
assert.match(read('pages/data/data.wxml'), /wx:else/, 'data page should render a loading placeholder when pageReady is false');

assert.match(read('components/profile-switcher/profile-switcher.js'), /triggerEvent\(["']select["']/, 'profile-switcher should emit select event');
assert.match(read('components/profile-switcher/profile-switcher.js'), /triggerEvent\(["']close["']/, 'profile-switcher should emit close event');
assert.match(read('components/profile-switcher/profile-switcher.js'), /triggerEvent\(["']visibilitychange["']/, 'profile-switcher should emit visibility change event');
assert.match(read('components/profile-switcher/profile-switcher.js'), /triggerEvent\(["']openfullprofilelist["']/, 'profile-switcher should emit a full-list event');
assert.match(read('components/record-panel/record-panel.js'), /eventName:\s*["']success["']/, 'record-panel should emit success event after feedback toast');
assert.match(read('components/record-panel/record-panel.js'), /eventName:\s*["']delete["']/, 'record-panel should emit delete event after feedback toast');
assert.match(read('components/record-panel/record-panel.js'), /triggerEvent\(["']visibilitychange["']/, 'record-panel should emit visibility change event');
assert.doesNotMatch(read('components/record-panel/record-panel.js'), /wx\.showModal/, 'record-panel delete flow should no longer use wx.showModal');
assert.match(read('components/record-panel/record-panel.wxml'), /record-panel__feedback-card/, 'record-panel should render custom success toast');
assert.match(read('components/record-panel/record-panel.wxml'), /record-panel__dialog/, 'record-panel should render custom delete dialog');
assert.match(read('components/record-panel/record-panel.wxml'), /record-panel__error-banner/, 'record-panel should render validation error banner');
assert.doesNotMatch(read('components/record-panel/record-panel.wxml'), /textarea|备注/, 'record-panel should not render note field');
const backspaceSvg = decodeBackspaceSvgFromWxml(read('components/record-panel/record-panel.wxml'));
const recordPanelWxml = read('components/record-panel/record-panel.wxml');
const recordPanelWxss = read('components/record-panel/record-panel.wxss');
assert.match(backspaceSvg, /^\s*<svg\b/, 'record-panel backspace icon data URI should decode directly to SVG markup');
assert.match(backspaceSvg, /stroke="#94A3B8"/, 'record-panel backspace icon should use the same muted gray color as the clear action');
assert.match(backspaceSvg, /stroke-width="2\.5"/, 'record-panel backspace icon should use stroke width 2.5');
assert.match(recordPanelWxml, /style="width:\{\{fontScale >= 1\.3 \? '84rpx' : fontScale >= 1\.15 \? '74rpx' : '64rpx'\}\};height:\{\{fontScale >= 1\.3 \? '64rpx' : fontScale >= 1\.15 \? '56rpx' : '48rpx'\}\};"/, 'record-panel backspace icon should scale with font size tiers');
assert.match(recordPanelWxss, /\.record-panel__backspace-icon\s*\{[\s\S]*width:\s*64rpx;[\s\S]*height:\s*48rpx;/, 'record-panel backspace icon should use 64x48 as the standard fallback size');
assert.match(read('custom-tab-bar/index.wxml'), /custom-tab-bar__plus/, 'custom tab bar should render a centered add button');
assert.match(read('custom-tab-bar/index.js'), /switchTab/, 'custom tab bar should switch tabs through wx.switchTab');
assert.match(read('custom-tab-bar/index.js'), /openRecordPanelOnDataTab/, 'custom tab bar should support opening the record panel after switching to data tab');
assert.match(read('custom-tab-bar/index.js'), /setVisible\(visible\)/, 'custom tab bar should expose visibility control');
assert.match(read('custom-tab-bar/index.wxml'), /wx:if="\{\{show\}\}"/, 'custom tab bar should hide when show is false');

assert.match(read('app.js'), /CURRENT_PROFILE_STORAGE_KEY/, 'app.js should define current profile storage key');
assert.match(read('app.js'), /setStorageSync\(CURRENT_PROFILE_STORAGE_KEY/, 'app.js should persist currentProfileId');
assert.match(read('app.js'), /getStorageSync\(CURRENT_PROFILE_STORAGE_KEY/, 'app.js should restore currentProfileId');

assert.doesNotMatch(read('utils/record-editor.js'), /requestSubscribeMessage/, 'record-editor should not request subscribe during save');
assert.match(read('pages/profile-edit/profile-edit.js'), /DEFAULT_RETURN_TAB/, 'profile-edit should keep a default return tab for create fallback');
assert.match(read('pages/profile-edit/profile-edit.js'), /normalizeReturnTab/, 'profile-edit should normalize the requested return tab');
assert.match(read('pages/profile-edit/profile-edit.js'), /wx\.setStorageSync\('currentProfileId', [^)]+\)/, 'profile create should persist currentProfileId before switching tabs');
assert.match(
  read('pages/profile-edit/profile-edit.js'),
  /store\.setState\([\s\S]*currentProfileId:[\s\S]*wx\.setStorageSync\('currentProfileId', [^)]+\)[\s\S]*url: this\.data\.returnTab \|\| DEFAULT_RETURN_TAB/,
  'profile create should update store and storage before switching back to the requested tab',
);
assert.match(read('pages/data/data.js'), /pageReady:\s*false/, 'data page should initialize pageReady as false');
assert.match(read('pages/data/data.js'), /_lastProfileId:\s*['"]{2}/, 'data page should track the last rendered profile id');
assert.match(read('pages/data/data.js'), /consumePendingRecordPanelOpen/, 'data page should consume pending record-panel requests from the custom tab bar');
assert.match(read('pages/data/data.js'), /this\.setData\(\{\s*pageReady:\s*false\s*\}\)/, 'data page should enter loading state before switching profile content');
assert.match(read('pages/data/data.js'), /pageReady:\s*true/, 'data page should mark pageReady true after data is ready');
assert.match(read('pages/data/data.js'), /getAppLoginStatus/, 'data page should reuse shared login status helper before rendering');
assert.match(read('pages/data/data.js'), /if \(!loginStatus\.isLoginReady\) \{\s*this\.enterPageLoading\(\);\s*return;\s*\}/, 'data page should stay in loading state until app login finishes');
assert.match(read('pages/data/data.js'), /const loginJustFinished =\s*loginStatus\.isLoginReady && !this\.lastLoginReady/, 'data page should refresh once when login transitions from pending to ready');
assert.match(read('pages/data/data.js'), /setTabBarVisible\(visible\)/, 'data page should control custom tab bar visibility');
assert.match(read('pages/data/data.wxml'), /bind:visibilitychange="handleProfileSwitcherVisibilityChange"/, 'data page should listen to profile switcher visibility');
assert.match(read('pages/data/data.wxml'), /bind:openfullprofilelist="handleOpenFullProfileList"/, 'data page should bind the profile-switcher full-list event');
assert.match(read('pages/data/data.wxml'), /bind:visibilitychange="handleRecordPanelVisibilityChange"/, 'data page should listen to record panel visibility');
assert.match(read('pages/profile-home/profile-home.js'), /setTabBarVisible\(visible\)/, 'profile-home should control custom tab bar visibility');
assert.match(read('pages/profile-home/profile-home.wxml'), /bind:visibilitychange="handleProfileSwitcherVisibilityChange"/, 'profile-home should listen to profile switcher visibility');
