const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagePath = path.resolve(__dirname, '../pages/profile-selector/profile-selector.js');
const wxmlPath = path.resolve(__dirname, '../pages/profile-selector/profile-selector.wxml');
const { store } = require('../store/index');

const originalState = store.getState();
const originalPage = global.Page;
const originalGetApp = global.getApp;
const originalWx = global.wx;

function restoreGlobals() {
  global.Page = originalPage;
  global.getApp = originalGetApp;
  global.wx = originalWx;
  store.setState({
    user: originalState.user,
    profiles: originalState.profiles,
    relationships: originalState.relationships,
    currentProfileId: originalState.currentProfileId,
    cache: originalState.cache,
    lastRefreshAt: originalState.lastRefreshAt,
    session: originalState.session,
  });
}

async function main() {
  store.setState({
    user: null,
    profiles: [
      { _id: 'profile-owner', name: '爸爸', relation: '我自己' },
      { _id: 'profile-viewer', name: 'Hank', relation: '父亲' },
      { _id: 'profile-empty', name: '空关系', relation: '' },
    ],
    relationships: [
      { _id: 'rel-owner', profileId: 'profile-owner', role: 'owner' },
      { _id: 'rel-viewer', profileId: 'profile-viewer', role: 'viewer' },
      { _id: 'rel-empty', profileId: 'profile-empty', role: 'owner' },
    ],
    currentProfileId: null,
  });

  store.setCachedLatestRecord('profile-owner', null);
  store.setCachedLatestRecord('profile-viewer', null);
  store.setCachedLatestRecord('profile-empty', null);

  let pageDefinition = null;
  global.Page = (definition) => {
    pageDefinition = definition;
  };
  global.getApp = () => ({
    readLastSelectedProfileId: () => '',
  });
  global.wx = {
    getStorageSync() {
      return '';
    },
    switchTab() {},
    getSystemInfoSync() {
      return { statusBarHeight: 20 };
    },
    setStorageSync() {},
  };

  delete require.cache[pagePath];
  require(pagePath);

  assert(pageDefinition, 'profile-selector page should register itself');

  const instance = Object.assign({}, pageDefinition, {
    data: Object.assign({}, pageDefinition.data),
    setData(patch) {
      this.data = Object.assign({}, this.data, patch);
    },
  });

  await instance.loadProfiles();

  assert.deepStrictEqual(
    instance.data.cards.map((item) => item.displayRelation),
    ['我自己', '共同关注', ''],
    'profile-selector should hide owner relation for collaborator/viewer rows only',
  );

  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  assert.match(
    wxml,
    /\{\{item\.displayRelation\}\}/,
    'profile-selector template should render displayRelation',
  );

  console.log('verify-profile-selector-relations: ok');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    restoreGlobals();
  });
