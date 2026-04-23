const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertContains(file, pattern, message) {
  assert.match(read(file), pattern, `${file}: ${message}`);
}

[
  'components/bp-input/bp-input.js',
  'components/bp-input/bp-input.json',
  'components/bp-input/bp-input.wxml',
  'components/bp-input/bp-input.wxss',
  'components/bp-status-tag/bp-status-tag.js',
  'components/bp-status-tag/bp-status-tag.json',
  'components/bp-status-tag/bp-status-tag.wxml',
  'components/bp-status-tag/bp-status-tag.wxss',
  'services/record-service.js',
  'utils/bp-status.js',
].forEach((file) => {
  assert.ok(exists(file), `${file} should exist`);
});

assertContains('services/record-service.js', /require\('\.\/request'\)/, 'record service should use request layer');
assertContains('services/record-service.js', /call\('saveRecord'/, 'record service should call saveRecord');
assertContains('services/record-service.js', /call\('getRecords'/, 'record service should call getRecords');
assert.doesNotMatch(read('services/record-service.js'), /wx\.cloud\.callFunction/, 'record service must not call wx.cloud directly');

const recordJson = JSON.parse(read('pages/record/record.json'));
assert.strictEqual(recordJson.usingComponents['bp-input'], '/components/bp-input/bp-input');
assert.strictEqual(recordJson.usingComponents['bp-status-tag'], '/components/bp-status-tag/bp-status-tag');

assertContains('pages/home/home.js', /getRecords/, 'home should fetch latest record');
assertContains('pages/home/home.js', /record\/record\?mode=create&profileId=/, 'home should navigate to record create page');
assertContains('pages/home/home.wxml', /录入血压/, 'home should render record CTA');
assertContains('pages/home/home.wxml', /查看所有记录/, 'home should render records-list placeholder entry');
assertContains('pages/home/home.wxml', /bp-status-tag/, 'home should render blood pressure status tag');

assertContains('pages/record/record.js', /validateForm/, 'record page should validate before saving');
assertContains('pages/record/record.js', /saveRecord/, 'record page should call record service');
assertContains('pages/record/record.wxml', /bp-input/, 'record page should render bp-input');
assertContains('pages/record/record.wxml', /心率/, 'record page should render heart rate field');
assertContains('pages/record/record.wxml', /测量时间/, 'record page should render measuredAt field');

[
  'pages/home/home.js',
  'pages/record/record.js',
  'services/record-service.js',
  'components/bp-status-tag/bp-status-tag.js',
].forEach((file) => {
  assert.doesNotMatch(read(file), /cloudfunctions\/_shared/, `${file} must not import cloudfunctions shared code`);
});

const { getBPStatusDisplay } = require('../utils/bp-status');

assert.deepStrictEqual(
  getBPStatusDisplay(120, 75, {
    systolic: { elevated: 140, high: 160 },
    diastolic: { elevated: 90, high: 100 },
  }).label,
  '正常',
);
assert.strictEqual(getBPStatusDisplay(160, 95).label, '偏高');
assert.strictEqual(getBPStatusDisplay(88, 58).label, '偏低');

let recordPageConfig = null;
global.Page = (config) => {
  recordPageConfig = config;
};
global.wx = {};
global.getApp = () => ({ globalData: {} });

delete require.cache[require.resolve('../pages/record/record')];
require('../pages/record/record');

function currentMeasuredParts(offsetMs = -10 * 60 * 1000) {
  const date = new Date(Date.now() + offsetMs);
  return {
    measuredDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    measuredTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

function createPage(dataPatch) {
  const measuredParts = currentMeasuredParts();

  return {
    data: Object.assign(
      {
        profileId: 'profile_1',
        form: {
          systolic: 120,
          diastolic: 75,
          heartRate: '',
          measuredDate: measuredParts.measuredDate,
          measuredTime: measuredParts.measuredTime,
          note: '',
        },
      },
      dataPatch || {},
    ),
    setData(patch) {
      Object.keys(patch).forEach((key) => {
        const parts = key.split('.');
        let target = this.data;
        while (parts.length > 1) {
          const part = parts.shift();
          target[part] = target[part] || {};
          target = target[part];
        }
        target[parts[0]] = patch[key];
      });
    },
  };
}

assert.ok(recordPageConfig, 'record page should register Page config');

const validPage = createPage();
assert.strictEqual(recordPageConfig.validateForm.call(validPage), '');

const lowSysPage = createPage({ form: Object.assign({}, createPage().data.form, { systolic: 40, diastolic: 90 }) });
assert.match(recordPageConfig.validateForm.call(lowSysPage), /收缩压/);

const reversedPage = createPage({ form: Object.assign({}, createPage().data.form, { systolic: 100, diastolic: 120 }) });
assert.match(recordPageConfig.validateForm.call(reversedPage), /收缩压必须高于舒张压/);

const badHrPage = createPage({ form: Object.assign({}, createPage().data.form, { heartRate: '-1' }) });
assert.match(recordPageConfig.validateForm.call(badHrPage), /心率/);

const futurePage = createPage({
  form: Object.assign({}, createPage().data.form, {
    measuredDate: currentMeasuredParts(10 * 60 * 1000).measuredDate,
    measuredTime: currentMeasuredParts(10 * 60 * 1000).measuredTime,
  }),
});
assert.match(recordPageConfig.validateForm.call(futurePage), /未来/);

console.log('[verify-t2.2-frontend] pass');
