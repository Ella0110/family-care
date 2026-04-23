const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ERROR_MESSAGES } = require('../utils/error-messages');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

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

assert.deepStrictEqual(ERROR_MESSAGES, {
  NETWORK: '网络异常，请稍后再试',
  AUTH_REQUIRED: '登录状态异常，请重试',
  PERMISSION_DENIED: '没有操作权限',
  INVALID_ARGUMENT: '输入有误，请检查',
  USER_NOT_FOUND: '用户不存在',
  PROFILE_NOT_FOUND: '档案不存在',
  RECORD_NOT_FOUND: '记录不存在',
  NOT_IMPLEMENTED: '该功能正在开发中',
  INTERNAL_ERROR: '服务异常，请稍后再试',
  UNKNOWN: '操作失败，请重试',
});

assert.match(read('services/request.js'), /REQUEST STORM WARNING/);
assert.match(read('pages/home/home.wxml'), /关注的家人/);
assert.doesNotMatch(read('pages/home/home.wxml'), /T2\.|T3\./);
assert.doesNotMatch(read('pages/record/record.wxml'), /T2\.|T3\./);
assert.doesNotMatch(read('pages/records-list/records-list.wxml'), /T2\.|T3\./);
assert.doesNotMatch(read('pages/profile-edit/profile-edit.wxml'), /T2\.|T3\./);

let profileEditConfig = null;
global.Page = (config) => {
  profileEditConfig = config;
};
global.wx = {
  showToast() {},
  navigateBack() {},
  redirectTo() {},
};
global.getCurrentPages = () => [{ route: 'pages/home/home' }];

delete require.cache[require.resolve('../pages/profile-edit/profile-edit')];
require('../pages/profile-edit/profile-edit');

assert.ok(profileEditConfig, 'profile-edit should register Page config');

const page = createPageInstance(profileEditConfig);
page.onLoad({ mode: 'create' });
page.onNameInput({ detail: { value: '测试用户' } });

page.onRelationChange({ detail: { value: 5 } });
assert.strictEqual(page.data.showCustomRelation, true);
assert.strictEqual(page.data.form.relationSelection, '其他');
assert.strictEqual(page.validateForm(), '请填写具体关系');

page.onRelationCustomInput({ detail: { value: '弟弟' } });
assert.strictEqual(page.buildPayload().relation, '弟弟');

page.onRelationChange({ detail: { value: 0 } });
assert.strictEqual(page.data.showCustomRelation, false);
assert.strictEqual(page.data.form.relationCustom, '');
assert.strictEqual(page.buildPayload().relation, '父亲');

assert.match(read('pages/record/record.js'), /duration: nextAttention \? 1500 : 800/);
assert.match(read('pages/record/record.js'), /duration: result\.alertTriggered \? 1500 : 800/);

console.log('[verify-t2.6] pass');
