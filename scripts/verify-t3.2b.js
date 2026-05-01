const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function createPageInstance(config) {
  const page = {
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData(patch) {
      Object.keys(patch || {}).forEach((key) => {
        if (key.indexOf('.') === -1) {
          this.data[key] = patch[key];
          return;
        }

        const segments = key.split('.');
        let cursor = this.data;
        while (segments.length > 1) {
          const segment = segments.shift();
          cursor[segment] = cursor[segment] || {};
          cursor = cursor[segment];
        }
        cursor[segments[0]] = patch[key];
      });
    },
  };

  Object.keys(config).forEach((key) => {
    if (typeof config[key] === 'function') {
      page[key] = config[key];
    }
  });

  return page;
}

async function main() {
  const profileDetailUtils = require('../utils/profile-detail');
  const {
    DEFAULT_BP_THRESHOLD,
    buildProfileDetailDisplay,
    formatPhoneWithSpaces,
    validateThresholdValues,
    isDeleteNameMatched,
  } = profileDetailUtils;

  assert.deepStrictEqual(DEFAULT_BP_THRESHOLD, { systolic: 140, diastolic: 90 });
  assert.strictEqual(formatPhoneWithSpaces('13800138000'), '138 0013 8000');
  assert.strictEqual(formatPhoneWithSpaces(''), '');
  assert.strictEqual(validateThresholdValues(145, 95), '');
  assert.match(validateThresholdValues(95, 95), /高压阈值必须高于低压阈值/);
  assert.strictEqual(isDeleteNameMatched('爸爸', '爸爸'), true);
  assert.strictEqual(isDeleteNameMatched('爸爸', ' 妈妈 '), false);

  const detail = buildProfileDetailDisplay({
    name: '爸爸',
    relation: '父亲',
    birthDate: '1975-05-01',
    longTermMedication: true,
    emergencyContact: { name: '新一', phone: '13800138000' },
    settings: { bp: { threshold: { systolic: 140, diastolic: 90 } } },
  }, new Date('2026-05-01T08:00:00.000Z'));
  assert.strictEqual(detail.title, '爸爸（51 岁）');
  assert.strictEqual(detail.metaLine, '父亲 · 长期服药');
  assert.strictEqual(detail.emergencyLine, '新一 · 138 0013 8000');
  assert.strictEqual(detail.thresholdLine, '高压 140 / 低压 90');

  const nameOnlyDetail = buildProfileDetailDisplay({
    name: '妈妈',
    settings: { bp: { threshold: { systolic: 145, diastolic: 95 } } },
  }, new Date('2026-05-01T08:00:00.000Z'));
  assert.strictEqual(nameOnlyDetail.title, '妈妈');
  assert.strictEqual(nameOnlyDetail.metaLine, '');
  assert.strictEqual(nameOnlyDetail.emergencyLine, '');
  assert.strictEqual(nameOnlyDetail.thresholdLine, '高压 145 / 低压 95');

  assert.match(read('pages/home/home.wxml'), /高级设置/);
  assert.match(read('pages/home/home.wxml'), /编辑档案/);
  assert.match(read('pages/home/home.wxml'), /调整/);

  store.setState({
    user: { _id: 'user_owner' },
    profiles: [
      {
        _id: 'profile_a',
        name: '爸爸',
        relation: '父亲',
        birthDate: '1975-05-01',
        longTermMedication: true,
        emergencyContact: { name: '新一', phone: '13800138000' },
        settings: {
          bp: {
            threshold: { systolic: 140, diastolic: 90 },
            referenceLines: {
              systolic: { normal: 120, elevated: 140, high: 160 },
              diastolic: { normal: 80, elevated: 90, high: 100 },
            },
          },
        },
      },
      {
        _id: 'profile_b',
        name: '妈妈',
        relation: '母亲',
        birthDate: '',
        longTermMedication: null,
        emergencyContact: null,
        settings: {
          bp: {
            threshold: { systolic: 150, diastolic: 95 },
            referenceLines: {
              systolic: { normal: 120, elevated: 140, high: 160 },
              diastolic: { normal: 80, elevated: 90, high: 100 },
            },
          },
        },
      },
    ],
    relationships: [
      { _id: 'rel_a', profileId: 'profile_a', role: 'owner', permissions: { canManage: true } },
      { _id: 'rel_b', profileId: 'profile_b', role: 'owner', permissions: { canManage: true } },
    ],
    currentProfileId: 'profile_a',
    session: { dismissedProfileCompletionHints: {} },
  });
  store.setCachedRecords('profile_a', [
    { _id: 'r1', profileId: 'profile_a', measuredAt: '2026-05-01T08:00:00.000Z' },
    { _id: 'r2', profileId: 'profile_a', measuredAt: '2026-04-30T08:00:00.000Z' },
  ]);
  store.setCachedMedications('profile_a', {
    active: [{ _id: 'm1', profileId: 'profile_a' }],
    historical: [{ _id: 'm2', profileId: 'profile_a' }],
  });

  const profileServicePath = path.resolve(__dirname, '../services/profile-service.js');
  delete require.cache[profileServicePath];

  let savedThresholdPatch = null;
  let deletedProfileId = '';
  require.cache[profileServicePath] = {
    id: profileServicePath,
    filename: profileServicePath,
    loaded: true,
    exports: {
      async updateProfileSettings(profileId, patch) {
        savedThresholdPatch = { profileId, patch };
        const profile = store.getState().profiles.find((item) => item._id === profileId);
        return {
          profile: Object.assign({}, profile, {
            settings: {
              bp: {
                threshold: patch.bp.threshold,
                referenceLines: profile.settings.bp.referenceLines,
              },
            },
          }),
        };
      },
      async deleteProfile(profileId) {
        deletedProfileId = profileId;
        return { success: true };
      },
      async createProfile() {
        throw new Error('not used');
      },
      async updateProfile() {
        throw new Error('not used');
      },
    },
  };

  const medicationServicePath = path.resolve(__dirname, '../services/medication-service.js');
  delete require.cache[medicationServicePath];
  require.cache[medicationServicePath] = {
    id: medicationServicePath,
    filename: medicationServicePath,
    loaded: true,
    exports: {
      async loadMedications() {
        return null;
      },
      async fetchMedications() {
        return { activeMedications: [], historicalMedications: [] };
      },
      getCachedMedication() {
        return null;
      },
    },
  };

  const recordServicePath = path.resolve(__dirname, '../services/record-service.js');
  delete require.cache[recordServicePath];
  require.cache[recordServicePath] = {
    id: recordServicePath,
    filename: recordServicePath,
    loaded: true,
    exports: {
      async loadLatestRecord() {
        return null;
      },
      async loadLatestRecordsForProfiles() {
        return null;
      },
      async fetchRecords() {
        return { records: [{ _id: 'r1' }, { _id: 'r2' }], hasMore: false };
      },
      loadRecords() {
        return null;
      },
    },
  };

  let thresholdPageConfig = null;
  let homePageConfig = null;
  let showModalCalls = [];
  let reLaunchUrl = '';
  let navigateToUrl = '';
  let navigateBackCalled = false;
  let shownToast = '';

  global.Page = (config) => {
    if (!thresholdPageConfig) {
      thresholdPageConfig = config;
      return;
    }
    homePageConfig = config;
  };
  global.setTimeout = (callback) => {
    callback();
    return 1;
  };
  global.getApp = () => ({ globalData: { loginReady: true, loginError: null } });
  global.getCurrentPages = () => [{ route: 'pages/home/home' }, { route: 'pages/profile-threshold-edit/profile-threshold-edit' }];
  global.wx = {
    showToast({ title }) {
      shownToast = title;
    },
    showModal(options) {
      showModalCalls.push(options);
      if (typeof options.success === 'function') {
        options.success({ confirm: true, cancel: false });
      }
    },
    navigateTo({ url }) {
      navigateToUrl = url;
    },
    navigateBack() {
      navigateBackCalled = true;
    },
    reLaunch({ url }) {
      reLaunchUrl = url;
    },
    showLoading() {},
    hideLoading() {},
  };

  const thresholdPagePath = path.resolve(__dirname, '../pages/profile-threshold-edit/profile-threshold-edit.js');
  const homePagePath = path.resolve(__dirname, '../pages/home/home.js');
  delete require.cache[thresholdPagePath];
  delete require.cache[homePagePath];
  require('../pages/profile-threshold-edit/profile-threshold-edit');
  require('../pages/home/home');

  assert.ok(thresholdPageConfig, 'profile-threshold-edit should register');
  assert.ok(homePageConfig, 'home should register');

  const thresholdPage = createPageInstance(thresholdPageConfig);
  thresholdPage.onLoad({ profileId: 'profile_a' });
  assert.strictEqual(thresholdPage.data.systolicThreshold, 140);
  assert.strictEqual(thresholdPage.data.diastolicThreshold, 90);
  thresholdPage.handleAdjustSystolic({ currentTarget: { dataset: { delta: 5 } } });
  thresholdPage.handleAdjustDiastolic({ currentTarget: { dataset: { delta: 5 } } });
  assert.strictEqual(thresholdPage.data.systolicThreshold, 145);
  assert.strictEqual(thresholdPage.data.diastolicThreshold, 95);
  await thresholdPage.handleSave();
  assert.deepStrictEqual(savedThresholdPatch, {
    profileId: 'profile_a',
    patch: {
      bp: {
        threshold: {
          systolic: 145,
          diastolic: 95,
        },
      },
    },
  });
  assert.strictEqual(
    store.getState().profiles.find((item) => item._id === 'profile_a').settings.bp.threshold.systolic,
    145,
  );
  navigateBackCalled = false;
  thresholdPage.setData({
    systolicThreshold: 95,
    diastolicThreshold: 95,
  });
  assert.match(thresholdPage.validateThresholds(), /高压阈值必须高于低压阈值/);

  const homePage = createPageInstance(homePageConfig);
  homePage.renderState();
  homePage.setData({
    activeProfile: store.getState().profiles[0],
    viewState: 'single',
  });
  assert.strictEqual(typeof homePage.handleOpenThresholdEditor, 'function');
  homePage.handleOpenThresholdEditor();
  assert.match(navigateToUrl, /\/pages\/profile-threshold-edit\/profile-threshold-edit\?profileId=profile_a/);

  assert.strictEqual(typeof homePage.handleDeleteProfile, 'function');
  await homePage.handleDeleteProfile();
  assert.match(showModalCalls[0].content, /2 条血压记录/);
  assert.match(showModalCalls[0].content, /2 条用药记录/);
  assert.strictEqual(homePage.data.isDeleteConfirmVisible, true);
  assert.strictEqual(homePage.data.deleteConfirmName, '爸爸');
  assert.strictEqual(homePage.isDeleteConfirmReady(), false);
  homePage.onDeleteConfirmInput({ detail: { value: '爸爸' } });
  assert.strictEqual(homePage.isDeleteConfirmReady(), true);
  await homePage.handleConfirmDeleteProfile();
  assert.strictEqual(deletedProfileId, 'profile_a');
  assert.strictEqual(store.getState().profiles.length, 1);
  assert.strictEqual(store.getState().profiles[0]._id, 'profile_b');
  assert.strictEqual(store.getState().currentProfileId, 'profile_b');
  assert.strictEqual(reLaunchUrl, '/pages/home/home');
  assert.strictEqual(shownToast, '已删除「爸爸」');
  assert.strictEqual(navigateBackCalled, false);

  console.log('[verify-t3.2b] pass');
}

main().catch((error) => {
  console.error('[verify-t3.2b] fail');
  console.error(error);
  process.exitCode = 1;
});
