const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');
const profileService = require('../services/profile-service');

let capturedDataPage = null;
let capturedProfileHomePage = null;
let capturedProfileEditPage = null;
let navigateToCalls = [];
let switchTabCalls = [];

global.Page = (definition) => {
  if (definition && typeof definition.handleOpenRecordPanel === 'function') {
    capturedDataPage = definition;
    return;
  }

  if (definition && typeof definition.handleDeleteProfile === 'function') {
    capturedProfileHomePage = definition;
    return;
  }

  if (definition && typeof definition.handleSubmit === 'function') {
    capturedProfileEditPage = definition;
  }
};

global.getCurrentPages = () => [{ route: 'pages/profile-edit/profile-edit' }];
global.wx = {
  navigateTo(options) {
    navigateToCalls.push(options || {});
  },
  switchTab(options) {
    switchTabCalls.push(options || {});
  },
  showToast() {},
  setStorageSync() {},
  navigateBack() {},
};

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function loadPages() {
  const files = [
    path.join(__dirname, '..', 'pages', 'data', 'data.js'),
    path.join(__dirname, '..', 'pages', 'profile-home', 'profile-home.js'),
    path.join(__dirname, '..', 'pages', 'profile-edit', 'profile-edit.js'),
  ];

  files.forEach((file) => {
    delete require.cache[require.resolve(file)];
    require(file);
  });

  assert.ok(capturedDataPage, 'data page should be captured');
  assert.ok(capturedProfileHomePage, 'profile-home page should be captured');
  assert.ok(capturedProfileEditPage, 'profile-edit page should be captured');
}

function createPageInstance(pageDefinition, overrides = {}) {
  return Object.assign(
    {
      data: Object.assign({}, pageDefinition.data, overrides.data || {}),
      setData(patch, callback) {
        Object.assign(this.data, patch || {});
        if (typeof callback === 'function') {
          callback();
        }
      },
    },
    pageDefinition,
    overrides,
  );
}

function verifyGuideCopy() {
  const dataWxml = read('pages/data/data.wxml');
  const profileHomeWxml = read('pages/profile-home/profile-home.wxml');
  const dataJson = JSON.parse(read('pages/data/data.json'));
  const profileHomeJson = JSON.parse(read('pages/profile-home/profile-home.json'));
  const emptyGuideWxml = read('components/profile-empty-guide/profile-empty-guide.wxml');
  const dataWxss = read('pages/data/data.wxss');
  const profileHomeWxss = read('pages/profile-home/profile-home.wxss');

  [dataWxml, profileHomeWxml].forEach((source, index) => {
    const pageLabel = index === 0 ? 'data page' : 'profile-home page';
    assert.match(source, /profile-empty-guide/, `${pageLabel} should render the shared empty-guide component`);
  });

  assert.strictEqual(
    dataJson.usingComponents['profile-empty-guide'],
    '/components/profile-empty-guide/profile-empty-guide',
    'data page should register the shared empty-guide component',
  );
  assert.strictEqual(
    profileHomeJson.usingComponents['profile-empty-guide'],
    '/components/profile-empty-guide/profile-empty-guide',
    'profile-home should register the shared empty-guide component',
  );
  assert.match(
    profileHomeWxml,
    /wx:if="\{\{profiles\.length > 0\}\}" class="profile-home__topbar"/,
    'profile-home should hide the topbar when there are no profiles',
  );

  assert.match(emptyGuideWxml, /还没有健康档案/, 'shared empty-guide should show the unified title');
  assert.match(emptyGuideWxml, /为家人创建一个健康档案，开始记录血压/, 'shared empty-guide should show the unified subtitle');
  assert.match(emptyGuideWxml, /创建档案/, 'shared empty-guide should show the unified button text');

  assert.doesNotMatch(dataWxml, /记录家人的血压，从第一条开始/, 'data page should remove the legacy empty-state copy');
  assert.doesNotMatch(profileHomeWxml, /暂无档案/, 'profile-home should remove the legacy empty-state copy');
  assert.match(
    dataWxss,
    /\.data-page\s*\{[\s\S]*padding:\s*0 28rpx;/,
    'data page should define its root horizontal padding explicitly',
  );
  assert.match(
    profileHomeWxss,
    /\.profile-home-page\s*\{[\s\S]*padding:\s*0 28rpx;/,
    'profile-home empty state should align its root top padding with the data page',
  );
}

function verifyCreateEntrypoints() {
  navigateToCalls = [];

  const dataInstance = createPageInstance(capturedDataPage);
  capturedDataPage.handleCreateProfile.call(dataInstance);
  assert.strictEqual(
    navigateToCalls[0].url,
    '/pages/profile-edit/profile-edit?mode=create&returnTab=%2Fpages%2Fdata%2Fdata',
    'data empty-guide CTA should open profile-edit with data returnTab',
  );

  navigateToCalls = [];
  const profileHomeInstance = createPageInstance(capturedProfileHomePage);
  capturedProfileHomePage.handleCreateProfile.call(profileHomeInstance);
  assert.strictEqual(
    navigateToCalls[0].url,
    '/pages/profile-edit/profile-edit?mode=create&returnTab=%2Fpages%2Fprofile-home%2Fprofile-home',
    'profile-home empty-guide CTA should preserve the profile-home returnTab',
  );
}

async function verifyProfileEditUsesReturnTab() {
  switchTabCalls = [];
  store.setState({
    user: { _id: 'user-1' },
    profiles: [],
    relationships: [],
    currentProfileId: null,
  });

  const originalCreateProfile = profileService.createProfile;
  try {
    profileService.createProfile = async () => ({
      profile: { _id: 'profile-new', name: '新档案' },
      relationship: {
        _id: 'relationship-new',
        profileId: 'profile-new',
        userId: 'user-1',
        role: 'owner',
      },
    });

    const instance = createPageInstance(capturedProfileEditPage, {
      validateCreateForm() {
        return '';
      },
      buildCreatePayload() {
        return { name: '新档案' };
      },
    });

    capturedProfileEditPage.onLoad.call(instance, {
      mode: 'create',
      returnTab: encodeURIComponent('/pages/data/data'),
    });

    await capturedProfileEditPage.handleSubmit.call(instance);

    assert.strictEqual(
      switchTabCalls.length,
      1,
      'profile-edit create flow should switch tabs after saving',
    );
    assert.strictEqual(
      switchTabCalls[0].url,
      '/pages/data/data',
      'profile-edit create flow should return to the requested tab instead of hardcoding profile-home',
    );
    assert.strictEqual(
      store.getState().currentProfileId,
      'profile-new',
      'profile-edit create flow should still select the newly created profile before returning',
    );
  } finally {
    profileService.createProfile = originalCreateProfile;
  }
}

async function main() {
  loadPages();
  verifyGuideCopy();
  verifyCreateEntrypoints();
  await verifyProfileEditUsesReturnTab();
  console.log('verify-a4-empty-guide: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
