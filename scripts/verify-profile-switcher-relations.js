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
  const navigateToCalls = [];
  global.wx = {
    navigateTo(options) {
      navigateToCalls.push(options || {});
    },
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

  assert.match(
    wxml,
    /wx:if="\{\{displayProfiles\.length >= 2\}\}"[\s\S]*查看完整档案列表 >/,
    'profile-switcher should only show the full-list entry when there are at least two profiles',
  );

  assert(
    componentDefinition.methods && typeof componentDefinition.methods.handleOpenProfileSelector === 'function',
    'profile-switcher should expose a handler for the full-list entry',
  );

  const emittedEvents = [];
  const interactiveInstance = {
    data: {
      profiles: [
        { _id: 'profile-owner', name: '爸爸', relation: '我自己' },
        { _id: 'profile-viewer', name: 'Hank', relation: '父亲' },
      ],
      displayProfiles: [],
    },
    setData(patch) {
      this.data = Object.assign({}, this.data, patch);
    },
    triggerEvent(name, detail) {
      emittedEvents.push({ name, detail });
    },
  };

  Object.assign(interactiveInstance, componentDefinition.methods);
  interactiveInstance.handleOpenProfileSelector();

  assert.deepStrictEqual(
    emittedEvents.map((item) => item.name),
    ['openfullprofilelist'],
    'profile-switcher should notify the parent before opening the full profile list',
  );
  assert.strictEqual(
    navigateToCalls.length,
    0,
    'profile-switcher should not navigate directly for the full-list entry',
  );

  console.log('verify-profile-switcher-relations: ok');
} finally {
  restoreGlobals();
}
