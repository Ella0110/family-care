const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(__dirname, '..', relativePath));
}

const csvHelpers = require('../utils/csv-helpers');
const exportHelpers = require('../utils/records-export-helpers');

assert.strictEqual(typeof csvHelpers.recordsToCSV, 'function', 'recordsToCSV should be exported');
assert.strictEqual(typeof csvHelpers.parseCSV, 'function', 'parseCSV should be exported');
assert.strictEqual(typeof exportHelpers.buildRecentRange, 'function', 'buildRecentRange should be exported');
assert.strictEqual(typeof exportHelpers.measureRecordsImageHeight, 'function', 'measureRecordsImageHeight should be exported');

const csv = csvHelpers.recordsToCSV([
  {
    measuredAt: '2026-05-06T12:15:00.000Z',
    payload: { systolic: 155, diastolic: 94, heartRate: 88 },
    note: '晚饭后,复测',
  },
  {
    measuredAt: '2026-05-06T00:30:00.000Z',
    payload: { systolic: 128, diastolic: 82, heartRate: 72 },
    note: '晨起测量',
  },
], { hasMore: true });

assert.match(csv, /^日期,时间,高压,低压,心率,备注/m, 'CSV should start with header');
assert.match(csv, /2026-05-06,08:30,128,82,72,晨起测量/, 'CSV should sort records in ascending time order and format East8 date/time');
assert.match(csv, /2026-05-06,20:15,155,94,88,晚饭后、复测/, 'CSV should sanitize commas in note');
assert.match(csv, /# 注意：仅导出了前 200 条记录$/, 'CSV should append truncation warning when hasMore=true');

const parsed = csvHelpers.parseCSV(`\uFEFF日期,时间,高压,低压,心率,备注
2026-05-06,08:30,128,82,72,晨起
2026-05-06,20:15,155,94,,晚饭后
bad-line
# 注意：示例注释
2026/05/06,08:30,128,82,72,格式错误`);

assert.strictEqual(parsed.valid.length, 2, 'parseCSV should collect valid rows');
assert.strictEqual(parsed.errors.length, 2, 'parseCSV should collect invalid rows');
assert.strictEqual(parsed.valid[0].measuredAt, '2026-05-06T08:30:00+08:00');
assert.deepStrictEqual(parsed.valid[1].payload, { systolic: 155, diastolic: 94 });
assert.match(parsed.errors[0].reason, /列数不足/);
assert.match(parsed.errors[1].reason, /日期格式/);

const fixedNow = new Date(2026, 4, 7, 15, 20, 0, 0);
const range = exportHelpers.buildRecentRange(7, fixedNow);
assert.strictEqual(range.label, '近 7 天');
assert.strictEqual(range.since.getTime(), new Date(2026, 4, 1, 0, 0, 0, 0).getTime(), 'buildRecentRange should anchor since to local start of day');
assert.strictEqual(range.startDateText, '2026.05.01');
assert.strictEqual(range.endDateText, '2026.05.07');
assert.strictEqual(exportHelpers.measureRecordsImageHeight(3), 396, 'image height should follow fixed table layout');

const appConfig = JSON.parse(read('app.json'));
assert.ok(appConfig.pages.includes('pages/import-records/import-records'), 'app.json should register import-records page');

[
  'pages/import-records/import-records.js',
  'pages/import-records/import-records.wxml',
  'pages/import-records/import-records.wxss',
  'pages/import-records/import-records.json',
].forEach((file) => {
  assert.ok(exists(file), `${file} should exist`);
});

assert.match(read('pages/records-list/records-list.wxml'), /导出图片/, 'records-list should render image export action');
assert.match(read('pages/records-list/records-list.wxml'), /导出数据/, 'records-list should render CSV export action');
assert.match(read('pages/records-list/records-list.wxml'), /导入/, 'records-list should render import action');
assert.match(read('pages/records-list/records-list.wxml'), /recordsExportCanvas/, 'records-list should define hidden export canvas');
assert.match(read('pages/records-list/records-list.wxml'), /showExportPreview/, 'records-list should render export preview overlay');
assert.match(read('pages/records-list/records-list.wxml'), /保存到相册/, 'records-list preview should expose explicit save action');
assert.match(read('pages/records-list/records-list.wxml'), /onCancelPreview/, 'records-list preview should support cancel');
assert.match(read('pages/records-list/records-list.wxml'), /onConfirmSave/, 'records-list preview should support save confirmation');
assert.match(read('pages/records-list/records-list.js'), /showExportPreview:\s*false/, 'records-list page should track preview visibility');
assert.match(read('pages/records-list/records-list.js'), /onCancelPreview\(/, 'records-list page should implement preview cancel handler');
assert.match(read('pages/records-list/records-list.js'), /onConfirmSave\(/, 'records-list page should implement preview save handler');
assert.match(read('pages/data/data.wxml'), /已有数据？导入历史记录/, 'data page empty state should offer import entry');
assert.match(read('pages/data/data.js'), /handleImportRecords\(/, 'data page should handle import entry tap');
assert.match(read('pages/import-records/import-records.js'), /const CONCURRENCY = 5/, 'import page should batch saves with concurrency 5');
assert.match(read('pages/import-records/import-records.js'), /Promise\.all\(/, 'import page should use Promise.all for chunked batch import');
assert.match(read('pages/import-records/import-records.js'), /skipPush:\s*true/, 'import page should skip push notifications during import');
