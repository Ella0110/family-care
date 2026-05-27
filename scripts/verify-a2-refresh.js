const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');
const memberService = require('../services/member-service');

let capturedPage = null;
let app = {
  globalData: {
    loginReady: true,
    loginError: null,
  },
};
let stopPullDownRefreshCount = 0;

global.Page = (definition) => {
  capturedPage = definition;
};

global.getApp = () => app;
global.wx = {
  stopPullDownRefresh() {
    stopPullDownRefreshCount += 1;
  },
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

function loadPage(relativePath) {
  capturedPage = null;
  const absolutePath = path.join(__dirname, '..', relativePath);
  delete require.cache[require.resolve(absolutePath)];
  require(absolutePath);
  assert.ok(capturedPage, `${relativePath} should register a Page definition`);
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
    },
    pageDefinition,
    overrides,
  );
}

async function verifyPullDownThrottle(pageDefinition, pageLabel, dataOverrides = {}) {
  stopPullDownRefreshCount = 0;
  let refreshCalls = 0;
  const instance = createPageInstance(pageDefinition, Object.assign({}, dataOverrides, {
    refreshPageData: async () => {
      refreshCalls += 1;
    },
  }));

  assert.strictEqual(
    typeof pageDefinition.onPullDownRefresh,
    'function',
    `${pageLabel} should implement onPullDownRefresh`,
  );
  assert.strictEqual(
    typeof pageDefinition.refreshPageData,
    'function',
    `${pageLabel} should expose refreshPageData for reuse`,
  );

  await pageDefinition.onPullDownRefresh.call(instance);
  await pageDefinition.onPullDownRefresh.call(instance);

  assert.strictEqual(refreshCalls, 1, `${pageLabel} pull-down refresh should throttle repeated calls within 2 seconds`);
  assert.strictEqual(stopPullDownRefreshCount, 2, `${pageLabel} should always stop the pull-down animation`);
}

function verifyOnShowStaleRefresh(pageDefinition, pageLabel, dataOverrides = {}) {
  const now = Date.now();
  store.setState({
    profiles: [{ _id: 'profile-1', name: '家人' }],
    relationships: [],
    currentProfileId: 'profile-1',
    lastRefreshAt: {
      profiles: now - 31 * 1000,
      members: {},
    },
  });

  let loadArgs = null;
  let refreshArgs = null;
  const instance = createPageInstance(pageDefinition, Object.assign({}, dataOverrides, {
    data: Object.assign({}, dataOverrides.data || {}, {
      pageReady: true,
      _lastProfileId: 'profile-1',
    }),
    syncTabBarVisibility() {},
    syncFontScale() {},
    syncProfileMeta() {},
    enterPageLoading() {
      throw new Error(`${pageLabel} should not enter loading state when login is ready`);
    },
    loadPageData(options) {
      loadArgs = options;
      return Promise.resolve();
    },
    refreshPageData(options) {
      refreshArgs = options;
      return Promise.resolve();
    },
  }));

  pageDefinition.onShow.call(instance);

  assert.deepStrictEqual(
    loadArgs,
    null,
    `${pageLabel} onShow should not take the normal TTL path when profile data is stale for over 30 seconds`,
  );
  assert.ok(refreshArgs, `${pageLabel} onShow should trigger a silent refresh after 30 seconds of staleness`);
  assert.strictEqual(refreshArgs.silent, true, `${pageLabel} stale onShow refresh should be silent`);
}

async function verifyProfileHomeForceMembers(profileHomeDefinition) {
  const originalListProfileMembers = memberService.listProfileMembers;
  try {
    let memberFetches = 0;
    memberService.listProfileMembers = async (profileId) => {
      memberFetches += 1;
      return {
        members: [{ relationship: { _id: `rel-${profileId}` }, user: { _id: 'user-1' } }],
      };
    };

    const now = Date.now();
    store.setState({
      profiles: [{ _id: 'profile-1', name: '家人' }],
      relationships: [],
      currentProfileId: 'profile-1',
      lastRefreshAt: {
        profiles: now,
        members: {
          'profile-1': now,
        },
      },
    });

    const instance = createPageInstance(profileHomeDefinition, {
      memberCache: {
        'profile-1': [{ cached: true }],
      },
    });

    const cachedMembers = await profileHomeDefinition.loadMembers.call(instance, 'profile-1');
    assert.deepStrictEqual(cachedMembers, [{ cached: true }], 'profile-home should keep using cached members when they are fresh');
    assert.strictEqual(memberFetches, 0, 'profile-home should not fetch members when fresh cache is available');

    const forcedMembers = await profileHomeDefinition.loadMembers.call(instance, 'profile-1', { force: true });
    assert.strictEqual(memberFetches, 1, 'profile-home forced refresh should bypass the fresh member cache');
    assert.strictEqual(forcedMembers.length, 1, 'profile-home forced refresh should return freshly loaded members');
  } finally {
    memberService.listProfileMembers = originalListProfileMembers;
  }
}

async function main() {
  const dataJson = readJson('pages/data/data.json');
  const profileHomeJson = readJson('pages/profile-home/profile-home.json');

  assert.strictEqual(dataJson.enablePullDownRefresh, true, 'data page should enable pull-down refresh');
  assert.strictEqual(dataJson.backgroundTextStyle, 'dark', 'data page pull-down refresh should use dark background text');
  assert.strictEqual(profileHomeJson.enablePullDownRefresh, true, 'profile-home page should enable pull-down refresh');
  assert.strictEqual(profileHomeJson.backgroundTextStyle, 'dark', 'profile-home pull-down refresh should use dark background text');

  const dataDefinition = loadPage('pages/data/data.js');
  const profileHomeDefinition = loadPage('pages/profile-home/profile-home.js');

  await verifyPullDownThrottle(dataDefinition, 'data page', {
    data: {
      showProfileSwitcher: false,
      showRecordPanel: false,
    },
  });
  verifyOnShowStaleRefresh(dataDefinition, 'data page', {
    data: {
      showProfileSwitcher: false,
      showRecordPanel: false,
    },
  });

  await verifyPullDownThrottle(profileHomeDefinition, 'profile-home page', {
    data: {
      showProfileSwitcher: false,
      showMemberPanel: false,
    },
  });
  verifyOnShowStaleRefresh(profileHomeDefinition, 'profile-home page', {
    data: {
      showProfileSwitcher: false,
      showMemberPanel: false,
    },
  });
  await verifyProfileHomeForceMembers(profileHomeDefinition);

  console.log('verify-a2-refresh: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
