const assert = require('assert');
const path = require('path');

const { store } = require('../store/index');

let capturedPage = null;
let app = null;

global.Page = (definition) => {
  capturedPage = definition;
};

global.getApp = () => app;
global.wx = {
  stopPullDownRefresh() {},
  showToast() {},
  showLoading() {},
  hideLoading() {},
  navigateTo() {},
  switchTab() {},
  setStorageSync() {},
  removeStorageSync() {},
  reLaunch() {},
  showModal() {},
};

function loadPage() {
  capturedPage = null;
  const filePath = path.join(__dirname, '..', 'pages', 'profile-home', 'profile-home.js');
  delete require.cache[require.resolve(filePath)];
  require(filePath);
  assert.ok(capturedPage, 'profile-home should register a Page definition');
  return capturedPage;
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
      getTabBar() {
        return null;
      },
      setTabBarVisible() {},
      syncFontScale() {},
      syncTabBarVisibility() {},
    },
    pageDefinition,
    overrides,
  );
}

function resetStore(patch = {}) {
  store.setState(
    Object.assign(
      {
        user: null,
        profiles: [],
        relationships: [],
        currentProfileId: null,
        lastRefreshAt: {
          profiles: 0,
          members: {},
        },
      },
      patch,
    ),
  );
}

async function verifyLoginFinishWithImplicitProfileSelection(pageDefinition) {
  app = {
    globalData: {
      loginReady: false,
      loginError: null,
      fontScale: 'normal',
    },
  };

  resetStore({
    user: { _id: 'user-1' },
  });

  let loadCalls = 0;
  const instance = createPageInstance(pageDefinition, {
    loadPageData() {
      loadCalls += 1;
      return Promise.resolve();
    },
  });

  pageDefinition.onLoad.call(instance);

  app.globalData.loginReady = true;
  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '家人一' }],
    relationships: [],
    currentProfileId: null,
  });

  assert.strictEqual(
    store.getState().currentProfileId,
    'profile-1',
    'profile-home should still auto-select the first profile after login completes',
  );
  assert.strictEqual(
    loadCalls,
    1,
    'profile-home should trigger exactly one loadPageData call when login completion also causes implicit profile selection',
  );

  pageDefinition.onUnload.call(instance);
}

async function verifySelfMembershipChangedUsesSubscriptionReload(pageDefinition) {
  app = {
    globalData: {
      loginReady: true,
      loginError: null,
      fontScale: 'normal',
    },
  };

  resetStore({
    user: { _id: 'user-1' },
    profiles: [
      { _id: 'profile-new', name: '新档案' },
      { _id: 'profile-old', name: '旧档案' },
    ],
    relationships: [],
    currentProfileId: 'profile-old',
  });

  const loadArgs = [];
  const instance = createPageInstance(pageDefinition, {
    data: {
      currentProfileId: 'profile-old',
    },
    loadPageData(options) {
      loadArgs.push(options);
      return Promise.resolve();
    },
  });

  pageDefinition.onLoad.call(instance);

  pageDefinition.handleMemberChanged.call(instance, {
    detail: {
      affectedUserId: 'user-1',
    },
  });

  assert.strictEqual(
    store.getState().currentProfileId,
    'profile-new',
    'profile-home should switch to the next available profile when self membership changes',
  );
  assert.strictEqual(
    loadArgs.length,
    1,
    'profile-home should avoid a second manual loadPageData call when self membership change already triggered a subscribed reload',
  );
  assert.deepStrictEqual(
    loadArgs[0],
    { force: true, resetReady: true },
    'self membership change should reuse the subscribed profile-switch reload path',
  );

  pageDefinition.onUnload.call(instance);
}

async function verifyOtherMembershipChangeStillReloads(pageDefinition) {
  app = {
    globalData: {
      loginReady: true,
      loginError: null,
      fontScale: 'normal',
    },
  };

  resetStore({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-old', name: '当前档案' }],
    relationships: [],
    currentProfileId: 'profile-old',
  });

  const loadArgs = [];
  const instance = createPageInstance(pageDefinition, {
    data: {
      currentProfileId: 'profile-old',
    },
    loadPageData(options) {
      loadArgs.push(options);
      return Promise.resolve();
    },
  });

  pageDefinition.onLoad.call(instance);

  pageDefinition.handleMemberChanged.call(instance, {
    detail: {
      affectedUserId: 'other-user',
    },
  });

  assert.strictEqual(
    loadArgs.length,
    1,
    'profile-home should still trigger one manual reload when another member changes',
  );
  assert.deepStrictEqual(
    loadArgs[0],
    { force: true, resetReady: false },
    'non-self membership changes should keep the existing manual reload options',
  );

  pageDefinition.onUnload.call(instance);
}

async function main() {
  const pageDefinition = loadPage();
  await verifyLoginFinishWithImplicitProfileSelection(pageDefinition);
  await verifySelfMembershipChangedUsesSubscriptionReload(pageDefinition);
  await verifyOtherMembershipChangeStillReloads(pageDefinition);
  console.log('verify-profile-home-refresh-gates: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
