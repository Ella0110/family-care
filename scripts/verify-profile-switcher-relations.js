const assert = require('assert');
const fs = require('fs');
const path = require('path');

const componentPath = path.resolve(__dirname, '../components/profile-switcher/profile-switcher.js');
const wxmlPath = path.resolve(__dirname, '../components/profile-switcher/profile-switcher.wxml');
const { store } = require('../store/index');

const originalState = store.getState();
const originalComponent = global.Component;
const originalGetApp = global.getApp;
const originalWx = global.wx;

function restoreGlobals() {
  global.Component = originalComponent;
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

try {
  store.setState({
    user: null,
    profiles: [],
    relationships: [
      { _id: 'rel-owner', profileId: 'profile-owner', role: 'owner' },
      { _id: 'rel-viewer', profileId: 'profile-viewer', role: 'viewer' },
      { _id: 'rel-collab', profileId: 'profile-collab', role: 'collaborator' },
      { _id: 'rel-empty', profileId: 'profile-empty', role: 'owner' },
    ],
    currentProfileId: null,
  });

  global.getApp = () => ({ globalData: { fontScale: 1 } });
  global.wx = {
    navigateTo() {},
  };

  let componentDefinition = null;
  global.Component = (definition) => {
    componentDefinition = definition;
  };

  delete require.cache[componentPath];
  require(componentPath);

  assert(componentDefinition, 'profile-switcher component should register itself');
  assert(
    componentDefinition.methods && typeof componentDefinition.methods.syncDisplayProfiles === 'function',
    'profile-switcher should expose syncDisplayProfiles',
  );

  const instance = {
    data: {
      profiles: [
        { _id: 'profile-owner', name: '爸爸', relation: '我自己' },
        { _id: 'profile-viewer', name: 'Hank', relation: '父亲' },
        { _id: 'profile-collab', name: '妈妈', relation: '母亲' },
        { _id: 'profile-empty', name: '空关系', relation: '' },
      ],
      displayProfiles: [],
    },
    setData(patch) {
      this.data = Object.assign({}, this.data, patch);
    },
    triggerEvent() {},
  };

  Object.assign(instance, componentDefinition.methods);
  instance.syncDisplayProfiles();

  assert.deepStrictEqual(
    instance.data.displayProfiles.map((item) => item.displayRelation),
    ['我自己', '共同关注', '共同关注', ''],
    'profile-switcher should hide owner relation for collaborator/viewer rows only',
  );

  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  assert.match(
    wxml,
    /\{\{item\.displayRelation\}\}/,
    'profile-switcher template should render displayRelation',
  );

  console.log('verify-profile-switcher-relations: ok');
} finally {
  restoreGlobals();
}
