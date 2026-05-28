const assert = require('assert');
const fs = require('fs');
const path = require('path');

let capturedProfileEditPage = null;

global.Page = (definition) => {
  if (definition && typeof definition.handleSubmit === 'function') {
    capturedProfileEditPage = definition;
  }
};

global.getCurrentPages = () => [{ route: 'pages/profile-edit/profile-edit' }];
global.wx = {
  showToast() {},
  switchTab() {},
  navigateBack() {},
  setStorageSync() {},
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
      data: JSON.parse(JSON.stringify(pageDefinition.data || {})),
      setData(patch, callback) {
        Object.keys(patch || {}).forEach((key) => {
          assignData(this.data, key, patch[key]);
        });
        if (typeof callback === 'function') {
          callback();
        }
      },
    },
    pageDefinition,
    overrides,
  );
}

function verifyC0DataEmptyGuide() {
  const wxml = read('pages/data/data.wxml');
  const wxss = read('pages/data/data.wxss');

  assert.match(
    wxml,
    /记录血压/,
    'data empty-record state should expose a primary record button',
  );
  assert.match(
    wxml,
    /已有数据？导入历史记录/,
    'data empty-record state should keep the import shortcut copy',
  );
  assert.match(
    wxml,
    /bindtap="handleOpenRecordPanel"/,
    'data empty-record CTA should reuse handleOpenRecordPanel',
  );
  assert.match(
    wxml,
    /bindtap="handleImportRecords"/,
    'data empty-record import link should reuse handleImportRecords',
  );
  assert.doesNotMatch(
    wxml,
    /data-latest__empty-icon">♥</,
    'data empty-record state should remove the legacy red heart emoji',
  );

  assert.match(
    wxss,
    /\.data-latest__empty-orbit[\s\S]*width:\s*200rpx;[\s\S]*height:\s*200rpx;[\s\S]*border:\s*4rpx dashed #dbeafe;[\s\S]*animation:\s*data-empty-spin 10s linear infinite;/i,
    'data empty-record guide should render the rotating dashed orbit',
  );
  assert.match(
    wxss,
    /\.data-latest__empty-card[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.8\);[\s\S]*border-radius:\s*40rpx;/i,
    'data empty-record guide should use the new translucent white card',
  );
  assert.match(
    wxss,
    /\.data-latest__empty-button[\s\S]*width:\s*80%;[\s\S]*min-height:\s*88rpx;[\s\S]*background:\s*#3478f6;/i,
    'data empty-record guide should use the new blue primary button',
  );
}

function verifyC1CreatePageStructure() {
  const wxml = read('pages/profile-edit/profile-edit.wxml');
  const wxss = read('pages/profile-edit/profile-edit.wxss');
  const js = read('pages/profile-edit/profile-edit.js');

  assert.match(
    js,
    /const RELATION_OPTIONS = \['父亲', '母亲', '爷爷', '奶奶', '外公', '外婆', '我自己', '其他'\];/,
    'create profile should expose the required relation options',
  );

  assert.match(
    wxml,
    /wx:if="\{\{!isEditMode\}\}"[\s\S]*与你的关系[\s\S]*picker mode="selector" range="\{\{relationOptions\}\}"/,
    'create profile should show the relation picker in create mode',
  );

  assert.match(
    wxml,
    /showCustomRelation[\s\S]*请填写具体关系/,
    'create profile should reveal a custom relation input when "其他" is selected',
  );

  assert.match(
    wxss,
    /\.page[\s\S]*background:\s*#eef3fb;/i,
    'create profile page should align to the shared light-blue page background',
  );
  assert.match(
    wxss,
    /\.profile-edit__form--create[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.7\);[\s\S]*backdrop-filter:\s*blur\(20px\)/i,
    'create profile content should use the new glass card treatment',
  );
  assert.match(
    wxss,
    /\.profile-edit__form--create[\s\S]*border-radius:\s*40rpx;/i,
    'create profile content should use the new larger create-card radius',
  );
  assert.match(
    wxss,
    /\.form-input[\s\S]*min-height:\s*96rpx;[\s\S]*background:\s*#f8fafc;[\s\S]*border-radius:\s*16rpx;[\s\S]*font-size:\s*32rpx;/i,
    'create profile inputs should use the shared filled-input style',
  );
  assert.match(
    wxss,
    /\.profile-edit__button--create[\s\S]*box-shadow:\s*0 8px 24px rgba\(49,\s*130,\s*247,\s*0\.3\)/i,
    'create profile primary button should add the elevated blue shadow',
  );
  assert.match(
    wxss,
    /\.profile-edit__button--ghost[\s\S]*background:\s*transparent;[\s\S]*color:\s*#94a3b8;/i,
    'create profile secondary action should be a plain gray text button',
  );
}

function verifyC1CreatePayloadBehavior() {
  const pageFile = path.join(__dirname, '..', 'pages', 'profile-edit', 'profile-edit.js');
  delete require.cache[require.resolve(pageFile)];
  require(pageFile);
  assert.ok(capturedProfileEditPage, 'profile-edit page should be captured');

  const instance = createPageInstance(capturedProfileEditPage);
  capturedProfileEditPage.onLoad.call(instance, {
    mode: 'create',
  });

  assert.strictEqual(instance.data.isEditMode, false, 'mode=create should stay in create mode');

  instance.setData({
    'form.name': '爸爸',
    'form.relationSelection': '父亲',
  });
  assert.deepStrictEqual(
    capturedProfileEditPage.buildCreatePayload.call(instance),
    {
      name: '爸爸',
      relation: '父亲',
      gender: null,
      birthDate: null,
      emergencyContact: null,
      longTermMedication: null,
      note: null,
    },
    'create payload should include the selected relation',
  );

  instance.setData({
    'form.relationSelection': '',
    'form.relationCustom': '',
  });
  assert.strictEqual(
    capturedProfileEditPage.buildCreatePayload.call(instance).relation,
    null,
    'create payload should send relation as null when skipped',
  );
}

function main() {
  verifyC0DataEmptyGuide();
  verifyC1CreatePageStructure();
  verifyC1CreatePayloadBehavior();
  console.log('verify-c0-c1-ui: ok');
}

main();
