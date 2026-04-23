const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(file, pattern, message) {
  assert.match(read(file), pattern, `${file}: ${message}`);
}

assertContains('services/record-service.js', /updateRecord/, 'record service should export updateRecord');
assertContains('services/record-service.js', /deleteRecord/, 'record service should export deleteRecord');
assertContains('services/record-service.js', /getRecord/, 'record service should support edit-mode record lookup');
assertContains('services/record-service.js', /setCachedRecord/, 'record service should cache records from list navigation');
assertContains('services/record-service.js', /call\('updateRecord'/, 'record service should call updateRecord cloud function');
assertContains('services/record-service.js', /call\('deleteRecord'/, 'record service should call deleteRecord cloud function');

assertContains('pages/home/home.js', /records-list\/records-list\?profileId=/, 'home should navigate to records list');

const recordsListJson = JSON.parse(read('pages/records-list/records-list.json'));
assert.strictEqual(recordsListJson.usingComponents['bp-status-tag'], '/components/bp-status-tag/bp-status-tag');

assertContains('pages/records-list/records-list.js', /getRecords/, 'records list should load records');
assertContains('pages/records-list/records-list.js', /groupRecords/, 'records list should group records by date');
assertContains('pages/records-list/records-list.js', /setCachedRecord/, 'records list should cache record before edit navigation');
assertContains('pages/records-list/records-list.wxml', /还没有记录，去录入第一条/, 'records list should render empty state');
assertContains('pages/records-list/records-list.wxml', /还有更多记录未加载/, 'records list should render hasMore notice');

assertContains('pages/record/record.js', /isEditMode/, 'record page should support edit mode');
assertContains('pages/record/record.js', /loadEditRecord/, 'record page should load edit record');
assertContains('pages/record/record.js', /updateRecord/, 'record page should call updateRecord in edit mode');
assertContains('pages/record/record.js', /deleteRecord/, 'record page should call deleteRecord');
assertContains('pages/record/record.js', /isDeleting/, 'record page should guard duplicate deletion');
assertContains('pages/record/record.wxml', /删除/, 'record page should render delete button in edit mode');

let recordsListConfig = null;
global.Page = (config) => {
  recordsListConfig = config;
};
global.wx = {};
global.getApp = () => ({ globalData: {} });
delete require.cache[require.resolve('../pages/records-list/records-list')];
require('../pages/records-list/records-list');

assert.ok(recordsListConfig, 'records-list page should register Page config');
assert.strictEqual(typeof recordsListConfig.groupRecords, 'function');

const grouped = recordsListConfig.groupRecords([
  {
    _id: 'r1',
    measuredAt: '2026-04-23T07:30:00.000Z',
    payload: { systolic: 120, diastolic: 75 },
  },
  {
    _id: 'r2',
    measuredAt: '2026-04-22T12:00:00.000Z',
    payload: { systolic: 160, diastolic: 95, heartRate: 72 },
  },
]);

assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].records[0]._id, 'r1');
assert.match(grouped[0].records[0].timeText, /^\d{2}:\d{2}$/);
assert.strictEqual(grouped[1].records[0].status.label, '偏高');

let recordConfig = null;
global.Page = (config) => {
  recordConfig = config;
};
delete require.cache[require.resolve('../pages/record/record')];
require('../pages/record/record');

assert.ok(recordConfig, 'record page should register Page config');
assert.strictEqual(typeof recordConfig.fillFormFromRecord, 'function');
assert.strictEqual(typeof recordConfig.buildPatch, 'function');

const page = Object.assign({}, recordConfig, {
  data: {
    recordId: 'record_1',
    profileId: 'profile_1',
    isEditMode: true,
    form: {
      systolic: 135,
      diastolic: 80,
      heartRate: '70',
      measuredDate: '2026-04-23',
      measuredTime: '15:30',
      note: '',
    },
  },
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
});

const patch = recordConfig.buildPatch.call(page);
assert.strictEqual(patch.payload.systolic, 135);
assert.strictEqual(patch.payload.diastolic, 80);
assert.strictEqual(patch.payload.heartRate, 70);
assert.strictEqual(patch.note, null);
assert.ok(patch.measuredAt);

console.log('[verify-t2.3-frontend] pass');
