const assert = require('assert');

const { store } = require('../store/index');

let homeConfig = null;
global.Page = (config) => {
  homeConfig = config;
};
global.getApp = () => ({ globalData: { loginReady: true, loginError: null } });
global.wx = {
  showToast() {},
  navigateTo() {},
  navigateBack() {},
};

delete require.cache[require.resolve('../pages/home/home')];
require('../pages/home/home');

assert.ok(homeConfig, 'home page should register Page config');

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

store.setState({
  user: { _id: 'user_1' },
  profiles: [
    { _id: 'profile_a', name: '爸爸' },
    { _id: 'profile_b', name: '妈妈' },
  ],
  relationships: [],
  currentProfileId: null,
});

const page = createPageInstance(homeConfig);
let loadCount = 0;
page.loadRecordsForCurrentView = () => {
  loadCount += 1;
};

page.onLoad();
page.onShow();
loadCount = 0;

store.setCachedLatestRecord('profile_a', {
  _id: 'record_a_1',
  profileId: 'profile_a',
  measuredAt: Date.now(),
  payload: { systolic: 120, diastolic: 75 },
});

assert.strictEqual(
  loadCount,
  0,
  'cache-only store updates should not trigger another home data fetch',
);

store.setCurrentProfileId('profile_a');

assert.strictEqual(
  loadCount,
  1,
  'profile selection changes should still trigger a home data fetch',
);

page.onUnload();

console.log('[verify-t2.5-home-swr] pass');
