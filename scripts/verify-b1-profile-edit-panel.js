const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');
const profileService = require('../services/profile-service');

let capturedProfileHomePage = null;
let capturedEditPanel = null;
let navigateToCalls = [];

global.Page = (definition) => {
  if (definition && typeof definition.handleDeleteProfile === 'function') {
    capturedProfileHomePage = definition;
  }
};

global.Component = (definition) => {
  if (definition && definition.methods && typeof definition.methods.handleSave === 'function') {
    capturedEditPanel = definition;
  }
};

global.wx = {
  navigateTo(options) {
    navigateToCalls.push(options || {});
  },
  showToast() {},
};

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function assignData(target, keyPath, value) {
  const segments = String(keyPath || '').split('.');
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

function createPageInstance(pageDefinition, overrides = {}) {
  return Object.assign(
    {
      data: Object.assign({}, pageDefinition.data, overrides.data || {}),
      setData(patch, callback) {
        Object.keys(patch || {}).forEach((key) => {
          assignData(this.data, key, patch[key]);
        });
        if (typeof callback === 'function') {
          callback();
        }
      },
      syncTabBarVisibility() {},
      syncProfileMeta() {},
      applyViewModel() {},
      memberCache: {},
      activeMedications: [],
      historicalMedications: [],
    },
    pageDefinition,
    overrides,
  );
}

function createComponentInstance(definition, overrides = {}) {
  const events = [];
  const instance = Object.assign(
    {
      data: Object.assign({}, definition.data, overrides.data || {}),
      properties: Object.assign({}, overrides.properties || {}),
      setData(patch, callback) {
        Object.keys(patch || {}).forEach((key) => {
          assignData(this.data, key, patch[key]);
        });
        if (typeof callback === 'function') {
          callback();
        }
      },
      triggerEvent(name, detail) {
        events.push({ name, detail });
      },
    },
    definition.methods || {},
    overrides,
  );

  instance.__events = events;
  return instance;
}

function loadDefinitions() {
  const files = [
    path.join(__dirname, '..', 'pages', 'profile-home', 'profile-home.js'),
    path.join(__dirname, '..', 'components', 'profile-edit-panel', 'profile-edit-panel.js'),
  ];

  files.forEach((file) => {
    delete require.cache[require.resolve(file)];
    require(file);
  });

  assert.ok(capturedProfileHomePage, 'profile-home page should be captured');
  assert.ok(capturedEditPanel, 'profile-edit-panel component should be captured');
}

function verifyStructure() {
  const profileHomeJson = JSON.parse(read('pages/profile-home/profile-home.json'));
  const profileHomeWxml = read('pages/profile-home/profile-home.wxml');
  const profileHomeJs = read('pages/profile-home/profile-home.js');
  const panelWxml = read('components/profile-edit-panel/profile-edit-panel.wxml');
  const panelJs = read('components/profile-edit-panel/profile-edit-panel.js');

  assert.strictEqual(
    profileHomeJson.usingComponents['profile-edit-panel'],
    '/components/profile-edit-panel/profile-edit-panel',
    'profile-home should register the profile-edit-panel component',
  );

  assert.match(
    profileHomeWxml,
    /<profile-edit-panel[\s\S]*bind:saved="handleProfileEditSaved"[\s\S]*bind:close="handleCloseEditPanel"/,
    'profile-home should render the edit panel and listen for save/close events',
  );

  assert.match(
    profileHomeJs,
    /showEditPanel:\s*false/,
    'profile-home should track whether the edit panel is open',
  );

  assert.match(
    panelWxml,
    /姓名[\s\S]*性别[\s\S]*picker mode="date"[\s\S]*紧急联系人电话/,
    'profile-edit-panel should keep the five required edit fields',
  );

  assert.doesNotMatch(
    panelWxml,
    /与你的关系|长期服药|备注|scroll-view/,
    'profile-edit-panel should remove the relation field and the deprecated legacy fields',
  );

  assert.match(
    panelJs,
    /profileService\.updateProfile/,
    'profile-edit-panel should save through profileService.updateProfile',
  );

  assert.match(
    panelJs,
    /store\.setState/,
    'profile-edit-panel should sync the updated profile into the local store immediately after save',
  );
}

function verifyProfileHomeEditEntry() {
  navigateToCalls = [];
  const instance = createPageInstance(capturedProfileHomePage, {
    data: {
      currentProfileId: 'profile-1',
      canEditCurrentProfile: true,
      showEditPanel: false,
    },
  });

  capturedProfileHomePage.handleEditProfile.call(instance);

  assert.strictEqual(
    instance.data.showEditPanel,
    true,
    'profile-home edit entry should open the bottom-sheet panel',
  );
  assert.strictEqual(
    navigateToCalls.length,
    0,
    'profile-home edit entry should no longer navigate to profile-edit in mode=edit',
  );
}

async function verifyEditPanelSaveFlow() {
  const originalProfile = {
    _id: 'profile-1',
    name: '王妈妈',
    relation: '母亲',
    gender: 'female',
    birthDate: '1968-03-08',
    emergencyContact: {
      name: '王小明',
      phone: '13800138000',
    },
  };

  store.setState({
    profiles: [originalProfile],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });

  let capturedPatch = null;
  const originalUpdateProfile = profileService.updateProfile;

  try {
    profileService.updateProfile = async (profileId, patch) => {
      capturedPatch = { profileId, patch };
      return {
        profile: Object.assign({}, originalProfile, patch),
      };
    };

    const instance = createComponentInstance(capturedEditPanel, {
      data: {
        show: true,
        profileId: 'profile-1',
      },
      properties: {
        show: true,
        profileId: 'profile-1',
      },
    });

    capturedEditPanel.observers.show.call(instance, true);

    assert.strictEqual(instance.data.form.name, '王妈妈', 'panel should prefill the current profile name');
    assert.strictEqual(instance.data.form.gender, 'female', 'panel should prefill the current gender');
    assert.strictEqual(instance.data.form.birthDate, '1968-03-08', 'panel should prefill the current birth date');
    assert.strictEqual(instance.data.form.emergencyContactName, '王小明', 'panel should prefill emergency contact name');
    assert.strictEqual(instance.data.form.emergencyContactPhone, '13800138000', 'panel should prefill emergency contact phone');
    assert.ok(!Object.prototype.hasOwnProperty.call(instance.data.form, 'relation'), 'panel form should no longer track relation in Round 3');

    instance.setData({
      'form.name': '王阿姨',
      'form.emergencyContactPhone': '13900139000',
    });

    await instance.handleSave();

    assert.deepStrictEqual(
      capturedPatch,
      {
        profileId: 'profile-1',
        patch: {
          name: '王阿姨',
          emergencyContact: {
            name: '王小明',
            phone: '13900139000',
          },
        },
      },
      'panel save should only submit the changed fields',
    );

    const savedProfile = store.getState().profiles.find((profile) => profile && profile._id === 'profile-1');
    assert.strictEqual(savedProfile.name, '王阿姨', 'panel save should update the local store immediately');
    assert.strictEqual(
      savedProfile.emergencyContact.phone,
      '13900139000',
      'panel save should keep the updated emergency contact in the store',
    );
    assert.strictEqual(savedProfile.relation, '母亲', 'panel save should not modify the existing relation');

    assert.ok(
      instance.__events.some((event) => event.name === 'saved'),
      'panel save should emit a saved event for the parent page',
    );
    assert.ok(
      instance.__events.some((event) => event.name === 'close'),
      'panel save should close itself after a successful save',
    );
  } finally {
    profileService.updateProfile = originalUpdateProfile;
  }
}

async function main() {
  loadDefinitions();
  verifyStructure();
  verifyProfileHomeEditEntry();
  await verifyEditPanelSaveFlow();
  console.log('verify-b1-profile-edit-panel: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
