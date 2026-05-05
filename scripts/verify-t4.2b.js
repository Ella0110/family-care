const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');
const permissionHelpers = require('../utils/permission-helpers');
const memberService = require('../services/member-service');

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

function resetStoreForOwnerViewer() {
  store.setState({
    user: { _id: 'user_owner', nickname: 'Ella', avatarUrl: '' },
    profiles: [
      { _id: 'profile_a', name: '爸爸' },
      { _id: 'profile_b', name: '妈妈' },
    ],
    relationships: [
      {
        _id: 'rel_owner',
        profileId: 'profile_a',
        userId: 'user_owner',
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
      {
        _id: 'rel_viewer',
        profileId: 'profile_b',
        userId: 'user_owner',
        role: 'viewer',
        permissions: {
          canView: true,
          canWrite: false,
          canEditProfile: false,
          canManage: false,
          canInvite: false,
        },
        subscribeAlerts: true,
      },
    ],
    currentProfileId: 'profile_a',
    lastRefreshAt: {
      profiles: 0,
      members: {},
    },
  });
}

async function verifyHelpersAndStore() {
  resetStoreForOwnerViewer();
  const state = store.getState();
  assert.strictEqual(permissionHelpers.getCurrentRelationship(state, 'profile_a').role, 'owner');
  assert.strictEqual(permissionHelpers.getCurrentRelationship(state, 'profile_b').role, 'viewer');
  assert.strictEqual(permissionHelpers.isOwner(state, 'profile_a'), true);
  assert.strictEqual(permissionHelpers.isOwner(state, 'profile_b'), false);
  assert.strictEqual(permissionHelpers.canWrite(state, 'profile_a'), true);
  assert.strictEqual(permissionHelpers.canWrite(state, 'profile_b'), false);
  assert.strictEqual(permissionHelpers.canManage(state, 'profile_a'), true);
  assert.strictEqual(permissionHelpers.canManage(state, 'profile_b'), false);
  assert.strictEqual(permissionHelpers.canInvite(state, 'profile_a'), true);
  assert.strictEqual(permissionHelpers.canInvite(state, 'profile_b'), false);

  assert.strictEqual(typeof store.getLastRefreshAt, 'function');
  assert.strictEqual(typeof store.markRefreshed, 'function');
  assert.strictEqual(typeof store.isStale, 'function');
  assert.strictEqual(store.getLastRefreshAt('profiles'), 0);
  assert.strictEqual(store.isStale('profiles', null, 30 * 1000), true);
  store.markRefreshed('profiles');
  assert.strictEqual(store.isStale('profiles', null, 30 * 1000), false);
  assert.strictEqual(store.getLastRefreshAt('members', 'profile_a'), 0);
  store.markRefreshed('members', 'profile_a');
  assert.ok(store.getLastRefreshAt('members', 'profile_a') > 0);
}

async function verifyMemberServiceStoreSync() {
  resetStoreForOwnerViewer();
  const updated = memberService.applyRelationshipUpdateToStore({
    _id: 'rel_viewer',
    profileId: 'profile_b',
    userId: 'user_owner',
    role: 'collaborator',
    permissions: {
      canView: true,
      canWrite: true,
      canEditProfile: false,
      canManage: false,
      canInvite: false,
    },
    subscribeAlerts: false,
  });
  assert.strictEqual(
    updated.relationships.find((relationship) => relationship._id === 'rel_viewer').role,
    'collaborator',
  );

  const transferred = memberService.applyTransferOwnershipToStore({
    profileId: 'profile_a',
    currentOwnerUserId: 'user_owner',
  });
  assert.strictEqual(
    transferred.relationships.find((relationship) => relationship._id === 'rel_owner').role,
    'collaborator',
  );

  const removed = memberService.applyRelationshipRemovalToStore({
    relationshipId: 'rel_viewer',
    profileId: 'profile_b',
    userId: 'user_owner',
  });
  assert.strictEqual(
    removed.relationships.some((relationship) => relationship._id === 'rel_viewer'),
    false,
  );
  assert.strictEqual(
    removed.profiles.some((profile) => profile._id === 'profile_b'),
    false,
  );
}

async function verifyStaticExpectations() {
  assert.match(read('pages/home/home.wxml'), /高级设置/);
  assert.match(read('pages/home/home.js'), /computeAdvancedSettings/);
  assert.match(read('pages/home/home.js'), /isStale\('profiles'/);
  assert.match(read('pages/profile-members/profile-members.js'), /isOwner\(/);
  assert.match(read('pages/profile-members/profile-members.js'), /isStale\('members'/);
  assert.doesNotMatch(read('pages/profile-members/profile-members.wxml'), /异常时通知/);
  assert.match(read('pages/user-settings/user-settings.wxml'), /我的资料/);
  assert.match(read('pages/user-settings/user-settings.wxml'), /修改/);
  assert.match(read('app.json'), /pages\/user-profile-edit\/user-profile-edit/);
  assert.match(read('docs/t4-contracts.md'), /缓存与刷新策略/);
  assert.match(read('docs/t4-contracts.md'), /通知开关位置/);
  assert.match(read('docs/project-status.md'), /T4\.2b 协作刷新坑/);
}

async function verifyProfileMembersBehavior() {
  resetStoreForOwnerViewer();

  const memberServicePath = path.resolve(__dirname, '../services/member-service.js');
  delete require.cache[memberServicePath];
  require.cache[memberServicePath] = {
    id: memberServicePath,
    filename: memberServicePath,
    loaded: true,
    exports: Object.assign({}, memberService, {
      async listProfileMembers() {
        return {
          members: [
            {
              relationship: { _id: 'rel_viewer_b', role: 'viewer', createdAt: '2026-05-01T00:00:00.000Z' },
              user: { _id: 'user_b', nickname: 'B', avatarUrl: '' },
            },
            {
              relationship: { _id: 'rel_owner_a', role: 'owner', createdAt: '2026-04-01T00:00:00.000Z' },
              user: { _id: 'user_owner', nickname: 'A', avatarUrl: '' },
            },
            {
              relationship: { _id: 'rel_collab_c', role: 'collaborator', createdAt: '2026-04-15T00:00:00.000Z' },
              user: { _id: 'user_c', nickname: 'C', avatarUrl: '' },
            },
          ],
        };
      },
    }),
  };

  let profileMembersConfig = null;
  let shownToast = '';
  let navigateBackCalled = false;
  global.Page = (config) => {
    profileMembersConfig = config;
  };
  global.wx = {
    showToast({ title }) {
      shownToast = title;
    },
    navigateBack() {
      navigateBackCalled = true;
    },
    reLaunch() {
      navigateBackCalled = true;
    },
    showActionSheet() {},
    showModal({ success }) {
      success({ confirm: false, cancel: true });
    },
  };
  global.getCurrentPages = () => [{ route: 'pages/profile-members/profile-members' }];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };

  delete require.cache[require.resolve('../pages/profile-members/profile-members')];
  require('../pages/profile-members/profile-members');
  assert.ok(profileMembersConfig, 'profile-members should register');

  const ownerPage = createPageInstance(profileMembersConfig);
  ownerPage.onLoad({ profileId: 'profile_a' });
  await ownerPage.onShow();
  assert.deepStrictEqual(ownerPage.data.members.map((item) => item.relationship.role), [
    'owner',
    'collaborator',
    'viewer',
  ]);

  resetStoreForOwnerViewer();
  store.setState({
    currentProfileId: 'profile_b',
  });
  const viewerPage = createPageInstance(profileMembersConfig);
  shownToast = '';
  navigateBackCalled = false;
  viewerPage.onLoad({ profileId: 'profile_b' });
  assert.strictEqual(shownToast, '只有管理员可以查看');
  assert.strictEqual(navigateBackCalled, true);

  global.setTimeout = originalSetTimeout;
}

async function verifyHomeAndProfileEditPages() {
  resetStoreForOwnerViewer();

  let homeConfig = null;
  let userProfileEditConfig = null;
  global.Page = (config) => {
    if (!homeConfig) {
      homeConfig = config;
      return;
    }
    userProfileEditConfig = config;
  };
  global.getApp = () => ({
    globalData: {
      loginReady: true,
      loginError: null,
      fontScale: 1,
    },
  });
  global.wx = {
    showToast() {},
    navigateTo() {},
    showLoading() {},
    hideLoading() {},
    cloud: {
      callFunction: async () => ({ result: { success: true, records: [], hasMore: false } }),
    },
  };

  delete require.cache[require.resolve('../pages/home/home')];
  delete require.cache[require.resolve('../pages/user-profile-edit/user-profile-edit')];
  require('../pages/home/home');
  require('../pages/user-profile-edit/user-profile-edit');
  assert.ok(homeConfig, 'home should register');
  assert.ok(userProfileEditConfig, 'user-profile-edit should register');

  const homePage = createPageInstance(homeConfig);
  homePage.renderState();
  const ownerItems = homePage.computeAdvancedSettings(store.getState().profiles[0], 1);
  assert.deepStrictEqual(ownerItems.map((item) => item.type), ['invite', 'manageMembers', 'delete']);
  const ownerItemsWithTransfer = homePage.computeAdvancedSettings(store.getState().profiles[0], 2);
  assert.deepStrictEqual(ownerItemsWithTransfer.map((item) => item.type), ['invite', 'manageMembers', 'transfer', 'delete']);

  store.setState({
    currentProfileId: 'profile_b',
  });
  homePage.renderState();
  const viewerItems = homePage.computeAdvancedSettings(store.getState().profiles[1], 0);
  assert.deepStrictEqual(viewerItems.map((item) => item.type), ['notificationSetting', 'leave']);

  const profileEditPage = createPageInstance(userProfileEditConfig);
  profileEditPage.onLoad();
  profileEditPage.setData({
    'form.nickname': '微信用户',
  });
  assert.strictEqual(profileEditPage.validateForm(), '请填写有效昵称');
}

async function main() {
  await verifyHelpersAndStore();
  await verifyMemberServiceStoreSync();
  await verifyStaticExpectations();
  await verifyProfileMembersBehavior();
  await verifyHomeAndProfileEditPages();
  console.log('[verify-t4.2b] pass');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
