const assert = require('assert');
const path = require('path');

let componentDefinition = null;
let currentPages = [];
let app = null;
let switchCalls = [];
const fs = require('fs');

global.Component = (definition) => {
  componentDefinition = definition;
};

global.getCurrentPages = () => currentPages;
global.getApp = () => app;
global.wx = {
  switchTab(options) {
    switchCalls.push(options || {});
  },
};

function loadComponent() {
  const componentPath = path.join(__dirname, '..', 'custom-tab-bar', 'index.js');
  delete require.cache[require.resolve(componentPath)];
  require(componentPath);
  assert.ok(componentDefinition, 'custom tab bar component should be defined');
  assert.ok(componentDefinition.methods, 'custom tab bar should define methods');
}

function createInstance(dataOverrides = {}) {
  return Object.assign({
    data: Object.assign({}, componentDefinition.data, dataOverrides),
    setData(patch) {
      const previousSelectedPath = this.data.selectedPath;
      Object.assign(this.data, patch || {});
      const nextSelectedPath = this.data.selectedPath;
      if (
        patch
        && Object.prototype.hasOwnProperty.call(patch, 'selectedPath')
        && componentDefinition.observers
        && typeof componentDefinition.observers.selectedPath === 'function'
        && previousSelectedPath !== nextSelectedPath
      ) {
        componentDefinition.observers.selectedPath.call(this, nextSelectedPath);
      }
    },
  }, componentDefinition.methods);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  loadComponent();

  const instance = createInstance({
    selectedPath: 'pages/data/data',
    canOpenRecord: true,
  });

  componentDefinition.methods.handleSwitchTab.call(instance, {
    currentTarget: {
      dataset: {
        path: 'pages/profile-home/profile-home',
      },
    },
  });

  assert.strictEqual(
    instance._switching,
    true,
    'handleSwitchTab should enable a switching lock before wx.switchTab completes',
  );
  assert.strictEqual(switchCalls.length, 1, 'first tab switch should call wx.switchTab once');
  assert.strictEqual(
    typeof switchCalls[0].complete,
    'undefined',
    'wx.switchTab should not release the switching lock in complete before the target tab onShow syncs selected state',
  );

  componentDefinition.methods.handleSwitchTab.call(instance, {
    currentTarget: {
      dataset: {
        path: 'pages/data/data',
      },
    },
  });
  assert.strictEqual(
    switchCalls.length,
    1,
    'a second tap before the target tab onShow sync arrives should still be blocked by the lock',
  );

  instance.setData({ selectedPath: 'pages/profile-home/profile-home' });
  assert.strictEqual(
    instance._switching,
    false,
    'target tab onShow sync should release the switching lock',
  );
  assert.strictEqual(
    instance.data.selectedPath,
    'pages/profile-home/profile-home',
    'target tab onShow sync should drive the displayed active tab',
  );

  switchCalls = [];
  componentDefinition.methods.handleSwitchTab.call(instance, {
    currentTarget: {
      dataset: {
        path: 'pages/data/data',
      },
    },
  });

  assert.strictEqual(switchCalls.length, 1, 'after onShow sync unlocks, a new tab click should be allowed');

  await wait(650);
  assert.strictEqual(instance._switching, false, 'switching lock should auto-release after the 600ms fallback');

  let pendingOpenCount = 0;
  app = {
    globalData: {
      openRecordPanelOnDataTab: false,
    },
    requestOpenRecordPanelOnDataTab() {
      pendingOpenCount += 1;
      this.globalData.openRecordPanelOnDataTab = true;
    },
  };
  currentPages = [{ route: 'pages/profile-home/profile-home' }];
  switchCalls = [];

  componentDefinition.methods.handleOpenRecordPanel.call(instance);
  componentDefinition.methods.handleOpenRecordPanel.call(instance);

  assert.strictEqual(
    pendingOpenCount,
    1,
    'rapid repeated add-button taps on profile tab should only request one pending record-panel open',
  );
  assert.strictEqual(
    switchCalls.length,
    1,
    'rapid repeated add-button taps on profile tab should only trigger one wx.switchTab call',
  );

  const dataPageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'data', 'data.js'), 'utf8');
  const profileHomePageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'profile-home', 'profile-home.js'), 'utf8');
  const tabBarSource = fs.readFileSync(path.join(__dirname, '..', 'custom-tab-bar', 'index.js'), 'utf8');
  assert.match(
    dataPageSource,
    /getTabBar\(\)[\s\S]*setData\(\{\s*selectedPath:\s*['"]pages\/data\/data['"]/,
    'data page onShow should sync the active tab through getTabBar().setData',
  );
  assert.match(
    profileHomePageSource,
    /getTabBar\(\)[\s\S]*setData\(\{\s*selectedPath:\s*['"]pages\/profile-home\/profile-home['"]/,
    'profile-home onShow should sync the active tab through getTabBar().setData',
  );
  assert.doesNotMatch(
    tabBarSource,
    /pagePath === this\.data\.selectedPath/,
    'custom tab bar should not treat its own selectedPath as the source of truth for the current page',
  );
  assert.match(
    tabBarSource,
    /setTimeout\([\s\S]*,\s*600\)/,
    'custom tab bar switching lock should use a 600ms fallback timeout',
  );

  console.log('verify-a1-tabbar: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
