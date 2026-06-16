const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function loadPageDefinition(pagePath) {
  const originalPage = global.Page;
  let definition = null;

  global.Page = (pageDefinition) => {
    definition = pageDefinition;
  };

  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;

  assert(definition, `page should register itself: ${pagePath}`);
  return definition;
}

const profileHomePagePath = path.resolve(__dirname, '../pages/profile-home/profile-home.js');
const profileHomeWxml = read('pages/profile-home/profile-home.wxml');
const profileHomeWxss = read('pages/profile-home/profile-home.wxss');
const userProfileEditWxml = read('pages/user-profile-edit/user-profile-edit.wxml');

const originalWx = global.wx;
const originalGetApp = global.getApp;

try {
  const definition = loadPageDefinition(profileHomePagePath);

  global.wx = {};
  global.getApp = () => ({ globalData: {} });

  const baseInstance = {
    data: {
      currentProfileId: 'profile-1',
      memberItems: [],
      showMemberPanel: false,
      selectedMember: null,
      showSelfActionDialog: false,
      selfActionDialogMember: null,
      selfActionDialogHasAvatar: false,
      showQuickProfileSyncDialog: false,
    },
    setData(patch) {
      this.data = Object.assign({}, this.data, patch);
    },
    openQuickProfileSyncDialog() {
      this.data.showQuickProfileSyncDialog = true;
    },
  };

  const selfWithoutAvatar = Object.assign({}, baseInstance, {
    data: Object.assign({}, baseInstance.data, {
      memberItems: [{
        relationshipId: 'rel-self-empty',
        isSelf: true,
        avatarUrl: '',
      }],
    }),
  });

  definition.handleMemberTap.call(selfWithoutAvatar, {
    currentTarget: {
      dataset: {
        relationshipId: 'rel-self-empty',
      },
    },
  });

  assert.strictEqual(
    selfWithoutAvatar.data.showSelfActionDialog,
    true,
    'self avatar without a configured avatar should open the custom self action dialog',
  );
  assert.strictEqual(
    selfWithoutAvatar.data.showMemberPanel,
    false,
    'self avatar tap should not open the member panel',
  );
  assert.strictEqual(
    selfWithoutAvatar.data.selfActionDialogHasAvatar,
    false,
    'self avatar without an uploaded avatar should render the two-action state',
  );

  const selfWithAvatar = Object.assign({}, baseInstance, {
    data: Object.assign({}, baseInstance.data, {
      memberItems: [{
        relationshipId: 'rel-self-avatar',
        isSelf: true,
        avatarUrl: 'cloud://avatar.png',
        roleLabel: '管理员',
      }],
    }),
  });

  definition.handleMemberTap.call(selfWithAvatar, {
    currentTarget: {
      dataset: {
        relationshipId: 'rel-self-avatar',
      },
    },
  });

  assert.strictEqual(
    selfWithAvatar.data.showSelfActionDialog,
    true,
    'self avatar with a configured avatar should still use the custom self action dialog',
  );
  assert.strictEqual(
    selfWithAvatar.data.selfActionDialogHasAvatar,
    true,
    'self avatar with a configured avatar should render the single-action state',
  );

  const otherMember = Object.assign({}, baseInstance, {
    data: Object.assign({}, baseInstance.data, {
      memberItems: [{
        relationshipId: 'rel-other',
        isSelf: false,
        avatarUrl: '',
        userId: 'other-user',
      }],
    }),
  });

  definition.handleMemberTap.call(otherMember, {
    currentTarget: {
      dataset: {
        relationshipId: 'rel-other',
      },
    },
  });

  assert.strictEqual(
    otherMember.data.showMemberPanel,
    true,
    'non-self member taps should keep opening the member panel',
  );

  assert.match(
    profileHomeWxml,
    /open-type="chooseAvatar"/,
    'profile-home should include a chooseAvatar control for the self-profile sync flow',
  );

  assert.match(
    profileHomeWxml,
    /profile-home__self-action-dialog/,
    'profile-home should render a custom self avatar action dialog',
  );

  assert.match(
    profileHomeWxml,
    /一键授权微信昵称与头像[\s\S]*自行修改个人资料[\s\S]*修改个人资料/,
    'profile-home self action dialog should expose the new button copy for both avatar states',
  );

  assert.match(
    profileHomeWxss,
    /\.profile-home__self-action-dialog[\s\S]*align-items:\s*flex-end[\s\S]*padding:\s*0;/i,
    'profile-home should pin the self action dialog flush to the bottom edge',
  );

  assert.match(
    profileHomeWxss,
    /\.profile-home__self-action-sheet[\s\S]*width:\s*100%[\s\S]*border-radius:\s*32rpx 32rpx 0 0[\s\S]*padding:\s*40rpx 28rpx calc\(16rpx \+ env\(safe-area-inset-bottom\)\)/i,
    'profile-home self action dialog should use the tightened bottom sheet shape without extra blank space',
  );

  assert.match(
    profileHomeWxml,
    /type="nickname"/,
    'profile-home should include a nickname input for the self-profile sync flow',
  );

  assert.match(
    userProfileEditWxml,
    /保存修改/,
    'user-profile-edit should keep the save action visible after the redesign',
  );

  console.log('verify-user-profile-avatar-actions: ok');
} finally {
  global.wx = originalWx;
  global.getApp = originalGetApp;
}
