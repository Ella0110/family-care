const assert = require('assert');
const path = require('path');

const { store } = require('../store/index');
const profileService = require('../services/profile-service');

let capturedDataPage = null;
let capturedProfileHomePage = null;
let switchTabCalls = [];
let persistedProfileId = '__unset__';
let clearedProfileStorage = 0;

global.Page = (definition) => {
  if (definition && typeof definition.handleDeleteProfile === 'function') {
    capturedProfileHomePage = definition;
    return;
  }

  if (definition && typeof definition.handleOpenRecordPanel === 'function') {
    capturedDataPage = definition;
  }
};

global.getApp = () => ({
  globalData: {
    loginReady: true,
    loginError: null,
  },
});

global.wx = {
  showModal(options) {
    options.success({ confirm: true, cancel: false });
  },
  showToast() {},
  switchTab(options) {
    switchTabCalls.push(options || {});
    if (options && typeof options.complete === 'function') {
      options.complete();
    }
  },
  setStorageSync(key, value) {
    if (key === 'currentProfileId') {
      persistedProfileId = value;
    }
  },
  removeStorageSync(key) {
    if (key === 'currentProfileId') {
      clearedProfileStorage += 1;
      persistedProfileId = null;
    }
  },
};

function loadPages() {
  const dataPath = path.join(__dirname, '..', 'pages', 'data', 'data.js');
  const profileHomePath = path.join(__dirname, '..', 'pages', 'profile-home', 'profile-home.js');
  delete require.cache[require.resolve(dataPath)];
  delete require.cache[require.resolve(profileHomePath)];
  require(dataPath);
  require(profileHomePath);
  assert.ok(capturedDataPage, 'data page should be captured');
  assert.ok(capturedProfileHomePage, 'profile-home page should be captured');
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

function setProfilesState(profiles, relationships, currentProfileId) {
  store.setState({
    user: { _id: 'user-1' },
    profiles,
    relationships,
    currentProfileId,
  });
}

function buildProfile(id, name) {
  return { _id: id, name };
}

function buildRelationship(id, profileId) {
  return {
    _id: id,
    profileId,
    userId: 'user-1',
    role: 'owner',
    permissions: {
      canView: true,
      canWrite: true,
      canEditProfile: true,
      canManage: true,
      canInvite: true,
    },
  };
}

async function verifyDeleteFlowKeepsNextProfile() {
  switchTabCalls = [];
  persistedProfileId = '__unset__';
  clearedProfileStorage = 0;

  setProfilesState(
    [buildProfile('profile-a', '档案 A'), buildProfile('profile-b', '档案 B')],
    [buildRelationship('rel-a', 'profile-a'), buildRelationship('rel-b', 'profile-b')],
    'profile-b',
  );

  const originalDeleteProfile = profileService.deleteProfile;
  try {
    let deletedProfileId = null;
    profileService.deleteProfile = async (profileId) => {
      deletedProfileId = profileId;
      return { success: true };
    };

    const instance = createPageInstance(capturedProfileHomePage, {
      data: {
        currentProfileId: 'profile-b',
        canManageCurrentProfile: true,
        isDeletingProfile: false,
      },
      memberCache: {
        'profile-a': [{ cached: true }],
        'profile-b': [{ cached: true }],
      },
    });

    await capturedProfileHomePage.handleDeleteProfile.call(instance);

    assert.strictEqual(deletedProfileId, 'profile-b', 'delete flow should delete the current profile');
    assert.deepStrictEqual(
      store.getState().profiles.map((profile) => profile._id),
      ['profile-a'],
      'delete flow should remove the deleted profile from store before leaving the page',
    );
    assert.deepStrictEqual(
      store.getState().relationships.map((relationship) => relationship.profileId),
      ['profile-a'],
      'delete flow should remove the deleted relationship from store',
    );
    assert.strictEqual(
      store.getState().currentProfileId,
      'profile-a',
      'delete flow should move currentProfileId to the next remaining profile',
    );
    assert.strictEqual(
      persistedProfileId,
      'profile-a',
      'delete flow should persist the next currentProfileId before tab switch',
    );
    assert.strictEqual(clearedProfileStorage, 0, 'delete flow should not clear storage when profiles remain');
    assert.strictEqual(switchTabCalls.length, 1, 'delete flow should switch back to the data tab');
    assert.strictEqual(switchTabCalls[0].url, '/pages/data/data', 'delete flow should switch to the data tab');
  } finally {
    profileService.deleteProfile = originalDeleteProfile;
  }
}

async function verifyDeleteFlowHandlesLastProfile() {
  switchTabCalls = [];
  persistedProfileId = '__unset__';
  clearedProfileStorage = 0;

  setProfilesState(
    [buildProfile('profile-last', '最后一个档案')],
    [buildRelationship('rel-last', 'profile-last')],
    'profile-last',
  );

  const originalDeleteProfile = profileService.deleteProfile;
  try {
    profileService.deleteProfile = async () => ({ success: true });

    const instance = createPageInstance(capturedProfileHomePage, {
      data: {
        currentProfileId: 'profile-last',
        canManageCurrentProfile: true,
        isDeletingProfile: false,
      },
      memberCache: {
        'profile-last': [{ cached: true }],
      },
    });

    await capturedProfileHomePage.handleDeleteProfile.call(instance);

    assert.strictEqual(store.getState().currentProfileId, null, 'last profile deletion should clear currentProfileId');
    assert.deepStrictEqual(store.getState().profiles, [], 'last profile deletion should leave no profiles in store');
    assert.strictEqual(clearedProfileStorage, 1, 'last profile deletion should clear persisted currentProfileId');
    assert.strictEqual(switchTabCalls.length, 1, 'last profile deletion should still go back to the data tab');
    assert.strictEqual(switchTabCalls[0].url, '/pages/data/data', 'last profile deletion should return to the data tab');
  } finally {
    profileService.deleteProfile = originalDeleteProfile;
  }
}

function verifyDataPageProfileSwitchReset() {
  const instance = createPageInstance(capturedDataPage, {
    data: {
      currentProfileId: 'profile-old',
    },
    allRecords: [{ _id: 'record-old' }],
    rangeRecords: [{ _id: 'record-old' }],
    chartData: { points: [1, 2, 3] },
    latestRecord: { _id: 'record-old' },
    lastLoadedProfileId: 'profile-old',
    lastRefreshAt: Date.now(),
    coverageDayCount: 12,
    chartRenderToken: 3,
    lastSeenProfileId: 'profile-old',
    syncProfileMetaCalled: 0,
    loadPageDataArgs: null,
    syncProfileMeta() {
      this.syncProfileMetaCalled += 1;
    },
    loadPageData(options) {
      this.loadPageDataArgs = options;
      return Promise.resolve();
    },
  });

  assert.strictEqual(
    typeof capturedDataPage.handleCurrentProfileChange,
    'function',
    'data page should expose a dedicated currentProfileId change handler',
  );

  capturedDataPage.handleCurrentProfileChange.call(instance, 'profile-new');

  assert.strictEqual(instance.lastSeenProfileId, 'profile-new', 'profile switch handler should track the new current profile');
  assert.deepStrictEqual(instance.allRecords, [], 'profile switch handler should clear stale record data before reload');
  assert.deepStrictEqual(instance.rangeRecords, [], 'profile switch handler should clear stale range data before reload');
  assert.strictEqual(instance.chartData, null, 'profile switch handler should clear stale chart data before reload');
  assert.strictEqual(instance.latestRecord, null, 'profile switch handler should clear stale latest record before reload');
  assert.strictEqual(instance.lastLoadedProfileId, '', 'profile switch handler should reset the last loaded profile id');
  assert.strictEqual(instance.lastRefreshAt, 0, 'profile switch handler should reset page refresh timestamp');
  assert.ok(instance.chartRenderToken > 3, 'profile switch handler should invalidate pending chart renders');
  assert.strictEqual(instance.syncProfileMetaCalled, 1, 'profile switch handler should refresh page metadata before reload');
  assert.deepStrictEqual(
    instance.loadPageDataArgs,
    { force: true, resetReady: true },
    'profile switch handler should reload the new profile in loading state',
  );
}

async function main() {
  loadPages();
  await verifyDeleteFlowKeepsNextProfile();
  await verifyDeleteFlowHandlesLastProfile();
  verifyDataPageProfileSwitchReset();
  console.log('verify-a3-delete-profile-flow: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
