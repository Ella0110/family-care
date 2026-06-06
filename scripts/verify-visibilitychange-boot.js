const assert = require('assert');
const path = require('path');

const profileSwitcherPath = path.resolve(__dirname, '../components/profile-switcher/profile-switcher.js');
const recordPanelPath = path.resolve(__dirname, '../components/record-panel/record-panel.js');
const memberPanelPath = path.resolve(__dirname, '../components/member-panel/member-panel.js');
const profileEditPanelPath = path.resolve(__dirname, '../components/profile-edit-panel/profile-edit-panel.js');

const originalComponent = global.Component;
const originalGetApp = global.getApp;
const originalWx = global.wx;

function restoreGlobals() {
  global.Component = originalComponent;
  global.getApp = originalGetApp;
  global.wx = originalWx;
}

function loadComponentDefinition(componentPath) {
  let definition = null;
  global.Component = (nextDefinition) => {
    definition = nextDefinition;
  };
  delete require.cache[componentPath];
  require(componentPath);
  assert(definition, `component at ${componentPath} should register itself`);
  return definition;
}

function buildInstance(extra = {}) {
  return Object.assign(
    {
      data: {},
      setData(patch) {
        this.data = Object.assign({}, this.data, patch);
      },
      triggerEvent(name, detail) {
        this.__events.push({ name, detail });
      },
      __events: [],
    },
    extra,
  );
}

function expectVisibilityLifecycle(definition, instance, componentName) {
  definition.observers.show.call(instance, false);
  assert.strictEqual(
    instance.__events.length,
    0,
    `${componentName} should not emit visibilitychange while first mounting hidden`,
  );
  definition.observers.show.call(instance, true);
  assert.deepStrictEqual(
    instance.__events,
    [{ name: 'visibilitychange', detail: { visible: true } }],
    `${componentName} should emit visible=true once it is opened`,
  );
  definition.observers.show.call(instance, false);
  assert.deepStrictEqual(
    instance.__events,
    [
      { name: 'visibilitychange', detail: { visible: true } },
      { name: 'visibilitychange', detail: { visible: false } },
    ],
    `${componentName} should emit visible=false once it is closed after opening`,
  );
}

try {
  global.getApp = () => ({ globalData: { fontScale: 1 } });
  global.wx = {
    getStorageSync() {
      return 1;
    },
  };

  const profileSwitcherDefinition = loadComponentDefinition(profileSwitcherPath);
  const profileSwitcherInstance = buildInstance({
    syncDisplayProfiles() {},
  });
  expectVisibilityLifecycle(profileSwitcherDefinition, profileSwitcherInstance, 'profile-switcher');

  const recordPanelDefinition = loadComponentDefinition(recordPanelPath);
  const recordPanelInstance = buildInstance({
    properties: {},
    hydrateForm() {},
    clearTransientTimers() {},
  });
  expectVisibilityLifecycle(recordPanelDefinition, recordPanelInstance, 'record-panel');

  const memberPanelDefinition = loadComponentDefinition(memberPanelPath);
  const memberPanelInstance = buildInstance({
    hydrateMember() {},
    resetTransientState() {},
  });
  expectVisibilityLifecycle(memberPanelDefinition, memberPanelInstance, 'member-panel');

  const profileEditPanelDefinition = loadComponentDefinition(profileEditPanelPath);
  const profileEditPanelInstance = buildInstance({
    properties: {},
    hydrateForm() {},
    resetState() {},
  });
  expectVisibilityLifecycle(profileEditPanelDefinition, profileEditPanelInstance, 'profile-edit-panel');

  console.log('verify-visibilitychange-boot: ok');
} finally {
  restoreGlobals();
}
