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
  const invitationUtils = require('../utils/invitation');
  const {
    buildInvitableProfiles,
    buildDefaultInvitationMessage,
    buildInvitationShareTitle,
    buildInvitationExpiryText,
    getInviteLaunchToken,
    buildInvitationPermissionSummary,
    normalizeGrantedUserProfile,
  } = invitationUtils;

  assert.strictEqual(buildDefaultInvitationMessage([{ name: '爸爸' }]), '想请你帮我一起关注爸爸的血压');
  assert.strictEqual(
    buildDefaultInvitationMessage([{ name: '爸爸' }, { name: '妈妈' }]),
    '想请你帮我一起关注家人的健康记录',
  );
  assert.strictEqual(
    buildInvitationShareTitle('Ella', [{ name: '爸爸' }]),
    'Ella 邀请你查看爸爸的健康记录',
  );
  assert.strictEqual(
    buildInvitationShareTitle('Ella', [{ name: '爸爸' }, { name: '妈妈' }]),
    'Ella 邀请你查看家人的健康记录',
  );
  assert.strictEqual(
    buildInvitationExpiryText(new Date('2026-05-10T15:00:00.000+08:00'), new Date('2026-05-03T16:00:00.000+08:00')),
    '6 天 23 小时后过期',
  );
  assert.strictEqual(
    getInviteLaunchToken({
      path: 'pages/invite-accept/invite-accept',
      query: { token: 'abc123' },
    }),
    'abc123',
  );
  assert.deepStrictEqual(buildInvitationPermissionSummary('viewer').enabled, ['查看血压记录', '查看用药情况']);
  assert.deepStrictEqual(buildInvitationPermissionSummary('collaborator').disabled, ['删除档案']);
  assert.strictEqual(normalizeGrantedUserProfile({ nickName: '微信用户', avatarUrl: '' }), null);
  assert.match(read('pages/invite-create/invite-create.js'), /handleGenerateInvitation\(\)\s*\{/);
  assert.match(read('pages/invite-create/invite-create.wxml'), /type="nickname"/);
  assert.match(read('pages/invite-create/invite-create.wxml'), /open-type="chooseAvatar"/);
  assert.match(read('pages/invite-create/invite-create.wxml'), /修改/);

  store.setState({
    user: { _id: 'user_owner', nickname: 'Ella', avatarUrl: 'https://example.com/a.png' },
    profiles: [
      { _id: 'profile_a', name: '爸爸', relation: '父亲', birthDate: '1975-05-01' },
      { _id: 'profile_b', name: '妈妈', relation: '母亲', birthDate: '1980-08-08' },
      { _id: 'profile_c', name: '我自己', relation: '本人', birthDate: '' },
    ],
    relationships: [
      { _id: 'rel_a', profileId: 'profile_a', permissions: { canInvite: true } },
      { _id: 'rel_b', profileId: 'profile_b', permissions: { canInvite: true } },
      { _id: 'rel_c', profileId: 'profile_c', permissions: { canInvite: false } },
    ],
    currentProfileId: 'profile_a',
  });
  store.setCachedLatestRecord('profile_a', {
    _id: 'record_a',
    profileId: 'profile_a',
    measuredAt: '2026-05-03T10:23:00.000+08:00',
    payload: { systolic: 158, diastolic: 88 },
  });

  const draftProfiles = buildInvitableProfiles({
    profiles: store.getState().profiles,
    relationships: store.getState().relationships,
    selectedProfileIds: ['profile_a'],
    getLatestRecord(profileId) {
      return store.getCachedLatestRecord(profileId);
    },
    now: new Date('2026-05-03T12:00:00.000+08:00'),
  });

  assert.strictEqual(draftProfiles.length, 2);
  assert.strictEqual(draftProfiles[0].checked, true);
  assert.strictEqual(draftProfiles[0].latestSummary, '最近 158/88，今天 10:23');
  assert.strictEqual(draftProfiles[1].latestSummary, '还没有记录');

  const requestPath = path.resolve(__dirname, '../services/request.js');
  delete require.cache[requestPath];

  const requestCalls = [];
  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      async call(name, data) {
        requestCalls.push({ name, data });

        if (name === 'createInvitation') {
          return {
            success: true,
            invitation: {
              token: 'invite123',
              profileIds: ['profile_a'],
              expiresAt: new Date('2026-05-10T15:00:00.000+08:00'),
              inviterNickname: 'Ella',
              inviterAvatarUrl: 'https://example.com/a.png',
            },
          };
        }

        if (name === 'updateUserProfile') {
          return {
            success: true,
            user: Object.assign({}, store.getState().user || {}, data.patch || {}),
          };
        }

        if (name === 'getInvitationInfo') {
          return {
            success: true,
            invitation: {
              token: data.token,
              inviterNickname: 'Ella',
              inviterAvatarUrl: 'https://example.com/a.png',
              profiles: [{ _id: 'profile_a', name: '爸爸', relation: '父亲', latestBp: null }],
              defaultRole: 'viewer',
              message: '想请你帮我一起关注爸爸的血压',
              status: 'active',
              expiresAt: new Date('2026-05-10T15:00:00.000+08:00'),
            },
          };
        }

        if (name === 'acceptInvitation') {
          return {
            success: true,
            relationships: [{ _id: 'rel_new', profileId: 'profile_a', role: 'viewer' }],
          };
        }

        throw new Error(`unexpected cloud function: ${name}`);
      },
    },
  };

  delete require.cache[require.resolve('../services/invitation-service')];
  const service = require('../services/invitation-service');

  await service.createInvitation({
    profileIds: ['profile_a'],
    defaultRole: 'viewer',
    message: 'hi',
    inviterProfile: { nickname: 'Ella', avatarUrl: 'https://example.com/a.png' },
  });
  await service.getInvitationInfo('invite123');
  await service.acceptInvitation('invite123');
  assert.deepStrictEqual(
    requestCalls.map((item) => item.name),
    ['createInvitation', 'getInvitationInfo', 'acceptInvitation'],
  );

  let inviteCreateConfig = null;
  let inviteAcceptConfig = null;
  global.Page = (config) => {
    if (!inviteCreateConfig) {
      inviteCreateConfig = config;
      return;
    }
    inviteAcceptConfig = config;
  };

  const appInstance = {
    globalData: {
      fontScale: 1,
      loginReady: true,
      loginError: null,
      userProfileGranted: false,
      userProfile: null,
      store,
    },
    login: async () => store.getState(),
    syncUserProfileGrantState() {
      this.globalData.userProfileGranted = false;
      this.globalData.userProfile = null;
    },
    cacheGrantedUserProfile(profile) {
      this.globalData.userProfileGranted = Boolean(profile && profile.nickname);
      this.globalData.userProfile = profile || null;
      return profile || null;
    },
  };
  global.getApp = () => appInstance;
  global.getCurrentPages = () => [{ route: 'pages/home/home' }, { route: 'pages/invite-create/invite-create' }];
  global.wx = {
    showToast() {},
    navigateBack() {},
    reLaunch() {},
    showModal({ success }) {
      success({ confirm: true, cancel: false });
    },
    setClipboardData() {},
  };

  delete require.cache[require.resolve('../pages/invite-create/invite-create')];
  delete require.cache[require.resolve('../pages/invite-accept/invite-accept')];
  require('../pages/invite-create/invite-create');
  require('../pages/invite-accept/invite-accept');

  assert.ok(inviteCreateConfig, 'invite-create should register Page config');
  assert.ok(inviteAcceptConfig, 'invite-accept should register Page config');
  assert.match(read('pages/invite-create/invite-create.wxml'), /open-type="share"/);

  const inviteCreatePage = createPageInstance(inviteCreateConfig);
  inviteCreatePage.onLoad({ profileId: 'profile_a' });
  assert.strictEqual(inviteCreatePage.data.selectedCount, 1);
  assert.strictEqual(inviteCreatePage.data.defaultRole, 'viewer');
  assert.strictEqual(inviteCreatePage.data.message, '想请你帮我一起关注爸爸的血压');
  assert.strictEqual(inviteCreatePage.data.hasInviterProfile, true);
  assert.strictEqual(inviteCreatePage.data.isEditingInviterProfile, false);
  const shareConfig = inviteCreatePage.onShareAppMessage({
    target: { dataset: { token: 'invite123' } },
  });
  assert.match(shareConfig.path, /token=invite123/);

  const toastCalls = [];
  global.wx.showToast = (payload) => {
    toastCalls.push(payload);
  };

  store.setState({
    user: { _id: 'user_owner', nickname: '微信用户', avatarUrl: '' },
  });
  const inviteCreateFallbackPage = createPageInstance(inviteCreateConfig);
  appInstance.globalData.userProfileGranted = true;
  appInstance.globalData.userProfile = {
    nickname: '微信用户',
    avatarUrl: '',
  };
  inviteCreateFallbackPage.onLoad({ profileId: 'profile_a' });
  assert.strictEqual(inviteCreateFallbackPage.data.hasInviterProfile, false);
  assert.strictEqual(inviteCreateFallbackPage.data.isEditingInviterProfile, true);
  const createInvitationCallCountBeforeFallback = requestCalls.length;
  inviteCreateFallbackPage.handleGenerateInvitation();
  assert.strictEqual(requestCalls.length, createInvitationCallCountBeforeFallback);
  assert.strictEqual(toastCalls[toastCalls.length - 1].title, '请先填写昵称');

  inviteCreateFallbackPage.onInviterNicknameInput({
    detail: { value: 'Ella' },
  });
  inviteCreateFallbackPage.onChooseInviterAvatar({
    detail: { avatarUrl: 'https://example.com/a.png' },
  });
  inviteCreateFallbackPage.handleGenerateInvitation();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(requestCalls.length, createInvitationCallCountBeforeFallback + 2);
  assert.strictEqual(requestCalls[requestCalls.length - 2].name, 'updateUserProfile');
  assert.deepStrictEqual(
    requestCalls[requestCalls.length - 1].data.inviterProfile,
    { nickname: 'Ella', avatarUrl: 'https://example.com/a.png' },
  );

  const inviteAcceptPage = createPageInstance(inviteAcceptConfig);
  inviteAcceptPage.onLoad({});
  assert.strictEqual(inviteAcceptPage.data.viewState, 'invalid');
}

main()
  .then(() => {
    console.log('[verify-t4.2a] pass');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
