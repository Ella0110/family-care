const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const dataWxml = read('pages/data/data.wxml');
const dataWxss = read('pages/data/data.wxss');
const dataJs = read('pages/data/data.js');
const rendererJs = read('utils/report-chart-renderer.js');
const helpers = require('../utils/report-helpers');

assert.match(dataWxss, /#F0F5FF/i, 'data page should use the light blue page background');
assert.match(dataWxml, /数据分析/, 'data page should render the data analysis section title');
assert.match(dataWxml, /全部记录 >/u, 'data page should render 全部记录 > as literal text');
assert.doesNotMatch(dataWxml, /&gt;/, 'data page should not rely on HTML entities for >');
assert.doesNotMatch(dataWxml, />数据</, 'data page should not render a duplicate in-content 数据 title');
assert.doesNotMatch(dataWxml, /查看全部档案/, 'data page should not render the extra 查看全部档案 entry');
assert.doesNotMatch(dataWxml, /历史明细/, 'data page should remove the history section');
assert.doesNotMatch(dataWxml, /长期用药/, 'data page should remove the medication summary section');
assert.match(dataJs, /handleExportBloodPressureChart/, 'data page should expose a blood pressure chart export action');
assert.match(dataJs, /handleExportHeartRateChart/, 'data page should expose a heart rate chart export action');
assert.match(dataWxss, /bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*60px\)/, 'floating add button should sit directly above the tabBar');
assert.match(rendererJs, /#1E40AF/i, 'renderer should use the updated deep blue systolic color');
assert.match(rendererJs, /#93C5FD/i, 'renderer should use the updated light blue diastolic color');

const threshold = { systolic: 140, diastolic: 90 };
const now = new Date('2026-05-10T10:00:00+08:00');

const sameDayRecords = [
  {
    _id: 'r-early',
    measuredAt: '2026-05-09T08:30:00+08:00',
    payload: { systolic: 126, diastolic: 82, heartRate: 70 },
  },
  {
    _id: 'r-late',
    measuredAt: '2026-05-09T20:45:00+08:00',
    payload: { systolic: 150, diastolic: 96, heartRate: 88 },
  },
];

const sevenDayTimeline = helpers.buildChartTimeline(sameDayRecords, 7, threshold, now);
assert.strictEqual(
  sevenDayTimeline.points.length,
  1,
  '7-day mode should keep only the latest record per day',
);
assert.strictEqual(
  sevenDayTimeline.points[0]._id,
  'r-late',
  '7-day mode should keep the last measured record for the day',
);

const thirtyDayTimeline = helpers.buildChartTimeline([
  {
    _id: 'r1',
    measuredAt: '2026-05-08T07:30:00+08:00',
    payload: { systolic: 120, diastolic: 80, heartRate: 65 },
  },
  {
    _id: 'r2',
    measuredAt: '2026-05-08T21:10:00+08:00',
    payload: { systolic: 160, diastolic: 100, heartRate: 92 },
  },
], 30, threshold, now);
assert.strictEqual(
  thirtyDayTimeline.points.length,
  1,
  '30-day mode should keep one point per day',
);
assert.strictEqual(
  thirtyDayTimeline.points[0]._id,
  'r2',
  '30-day mode should use the latest record of the day instead of averaging',
);

console.log('[verify-t6.1] pass');
