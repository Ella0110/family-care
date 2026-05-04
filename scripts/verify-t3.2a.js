require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createUpdateProfileHandler } = require('../cloudfunctions/updateProfile/handler');
const { store } = require('../store/index');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function buildFunction(factory, runtime, extra = {}) {
  const auth = createAuthService({ db: runtime.db, cloud: runtime.cloud });
  return createCloudFunction(
    factory(
      Object.assign(
        {
          db: runtime.db,
          cloud: runtime.cloud,
          command: runtime.command,
          auth,
          now: runtime.now,
        },
        extra,
      ),
    ),
  );
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

async function verifyCloudHandlers() {
  const runtime = createFakeRuntime({ openId: 'user_owner' });
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const updateProfile = buildFunction(createUpdateProfileHandler, runtime);

  await login({}, {});

  const created = await createProfile({ name: '爸爸' }, {});
  assert.strictEqual(created.success, true);
  assert.strictEqual(created.profile.name, '爸爸');
  assert.strictEqual(created.profile.relation, null);
  assert.strictEqual(created.profile.gender, null);
  assert.strictEqual(created.profile.birthDate, null);
  assert.strictEqual(created.profile.emergencyContact, null);
  assert.strictEqual(created.profile.longTermMedication, null);

  const emergencyOnly = await updateProfile({
    profileId: created.profile._id,
    patch: {
      emergencyContact: {
        name: '新一',
        phone: '13800138000',
      },
    },
  }, {});
  assert.strictEqual(emergencyOnly.success, true);
  assert.strictEqual(emergencyOnly.profile.name, '爸爸');
  assert.deepStrictEqual(emergencyOnly.profile.emergencyContact, {
    name: '新一',
    phone: '13800138000',
  });

  const medicationFlag = await updateProfile({
    profileId: created.profile._id,
    patch: {
      longTermMedication: true,
    },
  }, {});
  assert.strictEqual(medicationFlag.success, true);
  assert.strictEqual(medicationFlag.profile.longTermMedication, true);
  assert.deepStrictEqual(medicationFlag.profile.emergencyContact, {
    name: '新一',
    phone: '13800138000',
  });

  const invalidPhone = await updateProfile({
    profileId: created.profile._id,
    patch: {
      emergencyContact: {
        phone: 'abc',
      },
    },
  }, {});
  assert.strictEqual(invalidPhone.success, false);
  assert.strictEqual(invalidPhone.code, 'INVALID_PHONE');

  const clearedEmergency = await updateProfile({
    profileId: created.profile._id,
    patch: {
      emergencyContact: {
        name: '',
        phone: '',
      },
    },
  }, {});
  assert.strictEqual(clearedEmergency.success, true);
  assert.strictEqual(clearedEmergency.profile.emergencyContact, null);

  const seedProfileId = 'p_legacy_profile';
  runtime.db.store.profiles = runtime.db.store.profiles || {};
  runtime.db.store.profiles[seedProfileId] = {
    _id: seedProfileId,
    name: '老档案',
    relation: null,
    gender: null,
    birthDate: null,
    note: null,
    createdBy: 'user_owner',
    createdAt: new Date('2026-04-24T00:00:00.000Z'),
    updatedAt: new Date('2026-04-24T00:00:00.000Z'),
    deletedAt: null,
    settings: {
      bp: {
        threshold: { systolic: 140, diastolic: 90 },
        referenceLines: {
          systolic: { normal: 120, elevated: 140, high: 160 },
          diastolic: { normal: 80, elevated: 90, high: 100 },
        },
      },
    },
  };
  runtime.db.store.relationships.rel_legacy = {
    _id: 'rel_legacy',
    userId: 'user_owner',
    profileId: seedProfileId,
    role: 'owner',
    permissions: {
      canView: true,
      canWrite: true,
      canEditProfile: true,
      canInvite: true,
      canManage: true,
    },
    subscribeAlerts: true,
    createdAt: new Date('2026-04-24T00:00:00.000Z'),
    acceptedAt: new Date('2026-04-24T00:00:00.000Z'),
    invitedBy: null,
  };

  const legacyUpdate = await updateProfile({
    profileId: seedProfileId,
    patch: {
      emergencyContact: {
        phone: '13800138001',
      },
    },
  }, {});
  assert.strictEqual(legacyUpdate.success, true);
  assert.strictEqual(legacyUpdate.profile.name, '老档案');
  assert.deepStrictEqual(legacyUpdate.profile.emergencyContact, {
    name: null,
    phone: '13800138001',
  });
}

async function verifyFrontendBehavior() {
  store.setState({
    user: { _id: 'user_owner' },
    profiles: [
      {
        _id: 'profile_a',
        name: '爸爸',
        relation: null,
        gender: null,
        birthDate: null,
        note: null,
        emergencyContact: null,
        longTermMedication: null,
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
    ],
    relationships: [
      {
        _id: 'rel_a',
        userId: 'user_owner',
        profileId: 'profile_a',
        role: 'owner',
        permissions: {
          canView: true,
          canWrite: true,
          canEditProfile: true,
          canManage: true,
          canInvite: true,
        },
        subscribeAlerts: true,
      },
    ],
    currentProfileId: 'profile_a',
    session: {
      dismissedProfileCompletionHints: {},
    },
  });

  const profileServicePath = path.resolve(__dirname, '../services/profile-service.js');
  delete require.cache[profileServicePath];
  require.cache[profileServicePath] = {
    id: profileServicePath,
    filename: profileServicePath,
    loaded: true,
    exports: {
      async createProfile(data) {
        return {
          profile: {
            _id: 'profile_new',
            name: data.name,
            relation: null,
            gender: null,
            birthDate: null,
            note: null,
            emergencyContact: null,
            longTermMedication: null,
          },
          relationship: {
            _id: 'rel_new',
            profileId: 'profile_new',
          },
        };
      },
      async updateProfile(profileId, patch) {
        return {
          profile: Object.assign({}, store.getState().profiles.find((item) => item._id === profileId), patch),
        };
      },
    },
  };

  let redirectedUrl = '';
  let navigatedBack = false;
  let navigatedUrl = '';
  let shownToast = '';
  let appConfig = null;
  let profileEditConfig = null;
  let homeConfig = null;

  global.App = (config) => {
    appConfig = config;
  };
  global.Page = (config) => {
    if (!profileEditConfig) {
      profileEditConfig = config;
      return;
    }
    homeConfig = config;
  };
  global.getCurrentPages = () => [{ route: 'pages/home/home' }, { route: 'pages/profile-edit/profile-edit' }];
  global.getApp = () => ({ globalData: { loginReady: true, loginError: null } });
  global.wx = {
    showToast({ title }) {
      shownToast = title;
    },
    redirectTo({ url }) {
      redirectedUrl = url;
    },
    navigateBack() {
      navigatedBack = true;
    },
    navigateTo({ url }) {
      navigatedUrl = url;
    },
    showLoading() {},
    hideLoading() {},
    cloud: {
      callFunction: async () => ({ result: { success: true, records: [], hasMore: false } }),
    },
  };

  delete require.cache[require.resolve('../pages/profile-edit/profile-edit')];
  delete require.cache[require.resolve('../pages/home/home')];
  delete require.cache[require.resolve('../app')];
  require('../app');
  require('../pages/profile-edit/profile-edit');
  require('../pages/home/home');

  assert.ok(appConfig, 'app should register');
  assert.ok(profileEditConfig, 'profile-edit should register');
  assert.ok(homeConfig, 'home should register');

  const createPage = createPageInstance(profileEditConfig);
  createPage.onLoad({ mode: 'create' });
  assert.strictEqual(createPage.data.isEditMode, false);
  createPage.onNameInput({ detail: { value: '爸爸' } });
  await createPage.handleSubmit();
  assert.match(redirectedUrl, /\/pages\/record\/record\?mode=create&profileId=profile_new/);

  const editPage = createPageInstance(profileEditConfig);
  editPage.onLoad({ mode: 'edit', profileId: 'profile_a' });
  assert.strictEqual(editPage.data.isEditMode, true);
  assert.strictEqual(editPage.data.form.name, '爸爸');
  assert.strictEqual(editPage.getCompletionCount(), 1);
  editPage.setData({
    'form.emergencyContactName': '新一',
    'form.emergencyContactPhone': 'abc',
  });
  assert.strictEqual(editPage.validateEditForm(), '请输入正确的手机号');
  editPage.originalProfile = Object.assign({}, editPage.originalProfile, {
    emergencyContact: {
      name: '旧联系人',
      phone: '13800138009',
    },
  });
  editPage.setData({
    'form.emergencyContactName': '',
    'form.emergencyContactPhone': '',
  });
  assert.strictEqual(editPage.buildEditPatch().emergencyContact, null);

  store.setState({
    user: { _id: 'user_owner' },
    profiles: [
      {
        _id: 'profile_a',
        name: '爸爸',
        relation: null,
        gender: null,
        birthDate: null,
        note: null,
        emergencyContact: null,
        longTermMedication: null,
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
    ],
    relationships: [
      {
        _id: 'rel_a',
        userId: 'user_owner',
        profileId: 'profile_a',
        role: 'owner',
        permissions: {
          canView: true,
          canWrite: true,
          canEditProfile: true,
          canManage: true,
          canInvite: true,
        },
        subscribeAlerts: true,
      },
    ],
    currentProfileId: 'profile_a',
    session: {
      dismissedProfileCompletionHints: {},
    },
  });

  const homePage = createPageInstance(homeConfig);
  homePage.renderState();
  assert.strictEqual(
    homePage.shouldShowProfileCompletionPrompt(store.getState().profiles[0], 'single', true),
    true,
  );
  assert.match(read('pages/home/home.wxml'), /编辑档案/, 'home should render a stable profile edit entry');
  assert.strictEqual(typeof homePage.handleEditProfile, 'function', 'home should expose profile edit handler');
  homePage.data.activeProfile = store.getState().profiles[0];
  homePage.handleEditProfile();
  assert.match(navigatedUrl, /\/pages\/profile-edit\/profile-edit\?mode=edit&profileId=profile_a/, 'edit entry should navigate to profile edit page');
  store.dismissProfileCompletionHint('profile_a');
  assert.strictEqual(
    homePage.shouldShowProfileCompletionPrompt(store.getState().profiles[0], 'single', true),
    false,
  );
  appConfig.onShow.call({ globalData: { store } });
  assert.strictEqual(
    homePage.shouldShowProfileCompletionPrompt(store.getState().profiles[0], 'single', true),
    true,
  );
  assert.strictEqual(navigatedBack, false);
  assert.ok(shownToast === '' || typeof shownToast === 'string');
}

async function main() {
  await verifyCloudHandlers();
  await verifyFrontendBehavior();
  console.log('[verify-t3.2a] pass');
}

main().catch((error) => {
  console.error('[verify-t3.2a] fail');
  console.error(error);
  process.exitCode = 1;
});
