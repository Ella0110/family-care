const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyAppJson() {
  const appJson = JSON.parse(read('app.json'));
  assert(
    Array.isArray(appJson.pages) && appJson.pages.includes('pages/profile-selector/profile-selector'),
    'app.json should register pages/profile-selector/profile-selector',
  );

  const tabPaths = (((appJson || {}).tabBar || {}).list || []).map((item) => item && item.pagePath);
  assert(
    !tabPaths.includes('pages/profile-selector/profile-selector'),
    'profile-selector should not appear in tabBar.list',
  );
}

function verifyProfileSelectorPage() {
  const json = JSON.parse(read('pages/profile-selector/profile-selector.json'));
  const js = read('pages/profile-selector/profile-selector.js');
  const wxml = read('pages/profile-selector/profile-selector.wxml');
  const wxss = read('pages/profile-selector/profile-selector.wxss');

  assert.strictEqual(json.navigationStyle, 'custom', 'profile-selector should use custom navigation');

  assert.match(js, /recordService\.fetchLatestRecord\(profileId\)/, 'profile-selector should hydrate latest records');
  assert.match(js, /wx\.switchTab\(\s*\{\s*url:\s*'\/pages\/data\/data'/, 'selecting a profile should switchTab to data');
  assert.match(js, /persistLastSelectedProfileId|setStorageSync\('lastSelectedProfileId'/, 'selecting a profile should persist lastSelectedProfileId');

  assert.match(wxml, /选择要查看的档案/, 'profile-selector should render the selector title');
  assert.match(wxml, /bindtap="handleSelectProfile"/, 'profile-selector cards should select a profile');
  assert.match(wxss, /\.profile-selector-card \{[\s\S]*border-radius:\s*32rpx;[\s\S]*box-shadow:\s*0 4px 20px rgba\(0,\s*0,\s*0,\s*0\.02\);/i, 'profile-selector cards should use shared card style');
}

function verifyAppRouting() {
  const appJs = read('app.js');

  assert.match(appJs, /LAST_SELECTED_PROFILE_STORAGE_KEY = 'lastSelectedProfileId'/, 'app should define lastSelectedProfileId storage key');
  assert.match(appJs, /routeToProfileSelectorIfNeeded\(nextState = store\.getState\(\)\)/, 'app should expose startup selector routing');
  assert.match(appJs, /wx\.reLaunch\(\{\s*url:\s*PROFILE_SELECTOR_URL/, 'app should reLaunch to profile-selector when cache is missing');
  assert.match(appJs, /nextState\.profiles\.length >= 2[\s\S]*nextState\.currentProfileId = hasProfileId\(nextState\.profiles,\s*lastSelectedProfileId\)/, 'multi-profile login should prefer lastSelectedProfileId');
}

function verifyDataPageCleanup() {
  const js = read('pages/data/data.js');
  const wxml = read('pages/data/data.wxml');
  const wxss = read('pages/data/data.wxss');

  assert.doesNotMatch(js, /showInitialProfileSelector/, 'data page should no longer track embedded selector state');
  assert.doesNotMatch(js, /presentInitialProfileSelector/, 'data page should no longer embed the selector presentation flow');
  assert.doesNotMatch(js, /handleSelectInitialProfile/, 'data page should no longer expose the embedded selector handler');
  assert.doesNotMatch(wxml, /data-profile-selector/, 'data page WXML should no longer render embedded selector markup');
  assert.doesNotMatch(wxss, /\.data-profile-selector/, 'data page WXSS should no longer include embedded selector styles');
}

function verifySelectionPersistence() {
  const dataJs = read('pages/data/data.js');
  const profileHomeJs = read('pages/profile-home/profile-home.js');
  const profileEditJs = read('pages/profile-edit/profile-edit.js');
  const profileStoreJs = read('utils/profile-store.js');

  assert.match(dataJs, /persistLastSelectedProfileId|setStorageSync\('lastSelectedProfileId'/, 'data page profile switching should persist lastSelectedProfileId');
  assert.match(profileHomeJs, /persistLastSelectedProfileId|setStorageSync\("lastSelectedProfileId"/, 'profile-home switching should persist lastSelectedProfileId');
  assert.match(profileEditJs, /setStorageSync\('lastSelectedProfileId', newProfileId\)/, 'profile creation should persist lastSelectedProfileId');
  assert.match(profileStoreJs, /LAST_SELECTED_PROFILE_STORAGE_KEY/, 'profile store should know the lastSelectedProfileId storage key');
  assert.match(profileStoreJs, /wx\.removeStorageSync\(LAST_SELECTED_PROFILE_STORAGE_KEY\)/, 'deleting the selected profile should clear lastSelectedProfileId');
}

verifyAppJson();
verifyProfileSelectorPage();
verifyAppRouting();
verifyDataPageCleanup();
verifySelectionPersistence();
console.log('verify-h3-profile-selector: ok');
