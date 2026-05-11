const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const rendererJs = read('utils/report-chart-renderer.js');
const helpers = require('../utils/report-helpers');
const {
  drawBloodPressureTrendChart,
  drawHeartRateChart,
} = require('../utils/report-chart-renderer');

function createFakeCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    texts: [],
    dashes: [],
    currentDash: [],
    arcs: [],
    segments: [],
    curves: [],
    _currentPoint: null,
    clearRect() {},
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {
      this._currentPoint = null;
    },
    moveTo(x, y) {
      this._currentPoint = { x, y };
    },
    lineTo(x, y) {
      if (this._currentPoint) {
        this.segments.push({
          x1: this._currentPoint.x,
          y1: this._currentPoint.y,
          x2: x,
          y2: y,
          strokeStyle: this.strokeStyle,
          lineWidth: this.lineWidth,
          dash: this.currentDash.slice(),
        });
      }
      this._currentPoint = { x, y };
    },
    stroke() {},
    arc(x, y, radius) {
      this.arcs.push({ x, y, radius });
    },
    fill() {},
    quadraticCurveTo(cpx, cpy, x, y) {
      this.curves.push({
        type: 'quadratic',
        cpx,
        cpy,
        x,
        y,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        dash: this.currentDash.slice(),
      });
      this._currentPoint = { x, y };
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      this.curves.push({
        type: 'bezier',
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        x,
        y,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        dash: this.currentDash.slice(),
      });
      this._currentPoint = { x, y };
    },
    closePath() {},
    setLineDash(value) {
      this.currentDash = Array.isArray(value) ? value.slice() : [];
      this.dashes.push(value);
    },
    fillText(text, x, y) {
      this.texts.push({ text: String(text), x, y });
    },
  };
}

assert.match(rendererJs, /#0356fc/i, 'renderer should use the unified Tencent-style blue');
assert.doesNotMatch(rendererJs, /#1E40AF/i, 'renderer should no longer use the old deep blue systolic color');
assert.doesNotMatch(rendererJs, /#93C5FD/i, 'renderer should no longer use the old light blue diastolic color');

const threshold = { systolic: 140, diastolic: 90 };
const now = new Date('2026-05-10T10:00:00+08:00');

const sameDayRecords = [
  {
    _id: 'r-early',
    measuredAt: '2026-05-09T08:30:00+08:00',
    payload: { systolic: 126, diastolic: 82, heartRate: 70, period: 'morning' },
  },
  {
    _id: 'r-noon',
    measuredAt: '2026-05-09T12:45:00+08:00',
    payload: { systolic: 132, diastolic: 84, heartRate: 74, period: 'afternoon' },
  },
  {
    _id: 'r-late',
    measuredAt: '2026-05-09T20:45:00+08:00',
    payload: { systolic: 150, diastolic: 96, heartRate: 88, period: 'evening' },
  },
  {
    _id: 'r-extra',
    measuredAt: '2026-05-09T22:10:00+08:00',
    payload: { systolic: 148, diastolic: 92, heartRate: 86, period: 'other' },
  },
];

const sevenDayTimeline = helpers.buildChartTimeline(sameDayRecords, 7, threshold, now);
assert.strictEqual(
  sevenDayTimeline.points.length,
  3,
  '7-day mode should keep up to three records from the same day',
);
assert.deepStrictEqual(
  sevenDayTimeline.points.map((point) => point._id),
  ['r-early', 'r-noon', 'r-late'],
  '7-day mode should keep the selected records in chronological order',
);
assert.deepStrictEqual(
  sevenDayTimeline.points.map((point) => point.slotCount),
  [3, 3, 3],
  '7-day points in the same day should know they share one three-slot interval',
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

const sevenDayCtx = createFakeCtx();
const sevenDayChartData = {
  mode: 7,
  slots: Array.from({ length: 7 }, (_, index) => ({
    index,
    date: new Date(`2026-05-${String(index + 4).padStart(2, '0')}T00:00:00+08:00`),
    label: `05/${String(index + 4).padStart(2, '0')}`,
  })),
  points: [
    { slotIndex: 0, slotCount: 3, positionInSlot: 0, systolic: 149, diastolic: 91, systolicAlert: true, diastolicAlert: true, hasHeartRate: false },
    { slotIndex: 0, slotCount: 3, positionInSlot: 1, systolic: 144, diastolic: 89, systolicAlert: true, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 0, slotCount: 3, positionInSlot: 2, systolic: 140, diastolic: 88, systolicAlert: true, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 6, slotCount: 2, positionInSlot: 0, systolic: 132, diastolic: 82, systolicAlert: false, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 6, slotCount: 2, positionInSlot: 1, systolic: 120, diastolic: 80, systolicAlert: false, diastolicAlert: false, hasHeartRate: false },
  ],
};
drawBloodPressureTrendChart(sevenDayCtx, sevenDayChartData, threshold, { width: 300, height: 220 }, 7, { hideTitle: true });
const sevenDayTexts = sevenDayCtx.texts.map((item) => item.text);
assert.ok(sevenDayTexts.includes('5/4'), '7-day x-axis labels should drop leading zeros');
assert.ok(!sevenDayTexts.includes('05/04'), '7-day x-axis labels should not use padded month/day');
assert.ok(sevenDayTexts.includes('0'), 'blood pressure y-axis should start at 0');
assert.ok(sevenDayTexts.includes('50'), 'blood pressure y-axis should include 50');
assert.ok(sevenDayTexts.includes('100'), 'blood pressure y-axis should include 100');
assert.ok(sevenDayTexts.includes('150'), 'blood pressure y-axis should include 150 when max is 149');
const sevenDayPointXs = sevenDayCtx.arcs.map((item) => item.x);
assert.ok(
  Math.min.apply(null, sevenDayPointXs) < Math.max.apply(null, sevenDayPointXs),
  '7-day points from the same range should be horizontally separated inside the day slot',
);
assert.ok(
  Math.min.apply(null, sevenDayPointXs) >= 36 && Math.max.apply(null, sevenDayPointXs) <= 282,
  '7-day points should stay inside the chart plotting width',
);
const sevenDayVerticalGridSegments = sevenDayCtx.segments.filter((segment) => (
  segment.strokeStyle === '#E2E8F0' &&
  Math.abs(segment.x1 - segment.x2) < 0.001 &&
  Math.abs(segment.y1 - 36) < 0.001 &&
  Math.abs(segment.y2 - 190) < 0.001
));
const sevenDayHorizontalGridSegments = sevenDayCtx.segments.filter((segment) => (
  segment.strokeStyle === '#E2E8F0' &&
  Math.abs(segment.y1 - segment.y2) < 0.001
));
assert.strictEqual(
  sevenDayHorizontalGridSegments.length,
  0,
  '7-day chart should not draw regular horizontal grid lines',
);
const sevenDayReferenceSegments = sevenDayCtx.segments.filter((segment) => (
  segment.strokeStyle === '#D1D5DB' &&
  Math.abs(segment.y1 - segment.y2) < 0.001 &&
  segment.dash.join(',') === '6,4'
));
assert.strictEqual(
  sevenDayReferenceSegments.length,
  2,
  'blood-pressure chart should keep only the two dashed threshold lines',
);
const sevenDayVerticalXs = Array.from(new Set(
  sevenDayVerticalGridSegments.map((segment) => Number(segment.x1.toFixed(3))),
)).sort((a, b) => a - b);
assert.ok(
  sevenDayVerticalXs.length >= 8,
  '7-day chart should draw day-boundary guide lines instead of only day centers',
);
assert.ok(
  Math.abs(sevenDayVerticalXs[0] - 36) < 0.01,
  '7-day guide lines should start at the left plot boundary',
);
assert.ok(
  Math.abs(sevenDayVerticalXs[sevenDayVerticalXs.length - 1] - 282) < 0.01,
  '7-day guide lines should end at the right plot boundary',
);
const blueTrendSegments = sevenDayCtx.segments.filter((segment) => segment.strokeStyle === '#0356FC');
const arcCenters = sevenDayCtx.arcs.map((item) => `${item.x}:${item.y}`);
assert.ok(
  blueTrendSegments.some((segment) => !arcCenters.includes(`${segment.x1}:${segment.y1}`) && !arcCenters.includes(`${segment.x2}:${segment.y2}`)),
  'trend lines should stop short of point centers to leave a visible gap around each point',
);

const thirtyDayCtx = createFakeCtx();
const thirtyDayLabelChartData = {
  mode: 30,
  slots: Array.from({ length: 30 }, (_, index) => ({
    index,
    date: new Date(`2026-05-${String(index + 1).padStart(2, '0')}T00:00:00+08:00`),
    label: `05/${String(index + 1).padStart(2, '0')}`,
  })),
  points: [
    { slotIndex: 0, slotCount: 1, positionInSlot: 0, systolic: 180, diastolic: 100, systolicAlert: true, diastolicAlert: true, hasHeartRate: false },
    { slotIndex: 10, slotCount: 1, positionInSlot: 0, systolic: 130, diastolic: 85, systolicAlert: false, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 19, slotCount: 1, positionInSlot: 0, systolic: 135, diastolic: 88, systolicAlert: false, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 29, slotCount: 1, positionInSlot: 0, systolic: 140, diastolic: 90, systolicAlert: true, diastolicAlert: true, hasHeartRate: false },
  ],
};
drawBloodPressureTrendChart(thirtyDayCtx, thirtyDayLabelChartData, threshold, { width: 300, height: 220 }, 30, { hideTitle: true });
const thirtyDayTexts = thirtyDayCtx.texts.map((item) => item.text);
const thirtyDayHorizontalGridSegments = thirtyDayCtx.segments.filter((segment) => (
  segment.strokeStyle === '#E2E8F0' &&
  Math.abs(segment.y1 - segment.y2) < 0.001
));
assert.ok(thirtyDayTexts.includes('5/1'), '30-day x-axis should keep first-day labels');
assert.ok(thirtyDayTexts.includes('5/11'), '30-day x-axis should keep the first inner one-third label');
assert.ok(thirtyDayTexts.includes('5/20'), '30-day x-axis should keep the second inner one-third label');
assert.ok(thirtyDayTexts.includes('5/30'), '30-day x-axis should keep the last-day label');
assert.ok(!thirtyDayTexts.includes('5/15'), '30-day x-axis should no longer key off month-day semantics');
assert.ok(thirtyDayTexts.includes('200'), 'blood pressure y-axis should extend to 200 when max is 180');
assert.ok(thirtyDayCtx.arcs.length > 0, '30-day blood-pressure chart should still render visible points');
assert.ok(
  thirtyDayHorizontalGridSegments.length > 0,
  '30-day chart should keep regular horizontal grid lines',
);

const thirtyDaySmoothCtx = createFakeCtx();
drawBloodPressureTrendChart(thirtyDaySmoothCtx, {
  mode: 30,
  slots: Array.from({ length: 30 }, (_, index) => ({
    index,
    date: new Date(`2026-05-${String(index + 1).padStart(2, '0')}T00:00:00+08:00`),
    label: `05/${String(index + 1).padStart(2, '0')}`,
  })),
  points: [
    { slotIndex: 10, slotCount: 1, positionInSlot: 0, systolic: 180, diastolic: 100, systolicAlert: true, diastolicAlert: true, hasHeartRate: false },
    { slotIndex: 11, slotCount: 1, positionInSlot: 0, systolic: 130, diastolic: 85, systolicAlert: false, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 12, slotCount: 1, positionInSlot: 0, systolic: 135, diastolic: 88, systolicAlert: false, diastolicAlert: false, hasHeartRate: false },
    { slotIndex: 13, slotCount: 1, positionInSlot: 0, systolic: 140, diastolic: 90, systolicAlert: true, diastolicAlert: true, hasHeartRate: false },
  ],
}, threshold, { width: 300, height: 220 }, 30, { hideTitle: true });
assert.ok(thirtyDaySmoothCtx.curves.length > 0, '30-day blood-pressure chart should use smoothed curves instead of straight line segments');

const ninetyDayCtx = createFakeCtx();
const ninetyDayChartData = {
  mode: 90,
  slots: Array.from({ length: 2 }, (_, index) => ({
    index,
    date: new Date(`2026-02-${String(index + 10).padStart(2, '0')}T00:00:00+08:00`),
    label: `02/${String(index + 10).padStart(2, '0')}`,
  })),
  points: [
    { slotIndex: 0, slotCount: 1, positionInSlot: 0, systolic: 180, diastolic: 100, systolicAlert: true, diastolicAlert: true, hasHeartRate: true, heartRate: 120, heartRateAlert: true },
    { slotIndex: 1, slotCount: 1, positionInSlot: 0, systolic: 120, diastolic: 80, systolicAlert: false, diastolicAlert: false, hasHeartRate: true, heartRate: 70, heartRateAlert: false },
  ],
};
drawBloodPressureTrendChart(ninetyDayCtx, ninetyDayChartData, threshold, { width: 300, height: 220 }, 90, { hideTitle: true });
assert.strictEqual(ninetyDayCtx.arcs.length, 0, '90-day blood-pressure chart should not render point markers');
const ninetyDayHorizontalGridSegments = ninetyDayCtx.segments.filter((segment) => (
  segment.strokeStyle === '#E2E8F0' &&
  Math.abs(segment.y1 - segment.y2) < 0.001
));
const ninetyDayBloodBlueCount = ninetyDayCtx.segments.filter((segment) => segment.strokeStyle === '#0356FC').length;
const ninetyDayBloodRedCount = ninetyDayCtx.segments.filter((segment) => segment.strokeStyle === '#EF4444').length;
assert.ok(ninetyDayBloodRedCount > 0, '90-day blood-pressure chart should keep the above-threshold part red');
assert.ok(ninetyDayBloodBlueCount > 0, '90-day blood-pressure chart should turn blue after the curve falls back inside threshold');
assert.ok(
  ninetyDayHorizontalGridSegments.length > 0,
  '90-day chart should keep regular horizontal grid lines',
);

const heartRateCtx = createFakeCtx();
const heartRateChartData = {
  mode: 30,
  slots: [
    { index: 0, date: new Date('2026-05-01T00:00:00+08:00'), label: '05/01' },
    { index: 1, date: new Date('2026-05-15T00:00:00+08:00'), label: '05/15' },
    { index: 2, date: new Date('2026-05-31T00:00:00+08:00'), label: '05/31' },
  ],
  points: [
    { slotIndex: 0, slotCount: 1, positionInSlot: 0, heartRate: 76, heartRateAlert: false, hasHeartRate: true },
    { slotIndex: 1, slotCount: 1, positionInSlot: 0, heartRate: 102, heartRateAlert: true, hasHeartRate: true },
    { slotIndex: 2, slotCount: 1, positionInSlot: 0, heartRate: 88, heartRateAlert: false, hasHeartRate: true },
  ],
};
drawHeartRateChart(heartRateCtx, heartRateChartData, threshold, { width: 300, height: 220 }, 30, { hideTitle: true });
const heartRateTexts = heartRateCtx.texts.map((item) => item.text);
assert.ok(heartRateTexts.includes('0'), 'heart-rate y-axis should start at 0');
assert.ok(heartRateTexts.includes('50'), 'heart-rate y-axis should include 50');
assert.ok(heartRateTexts.includes('100'), 'heart-rate y-axis should include 100 when max is 102');
assert.ok(heartRateTexts.includes('150'), 'heart-rate y-axis should extend to the next 50-step bucket');
assert.ok(heartRateCtx.arcs.length > 0, '30-day heart-rate chart should still render visible points');
const heartRateSmoothCtx = createFakeCtx();
drawHeartRateChart(heartRateSmoothCtx, {
  mode: 30,
  slots: [
    { index: 0, date: new Date('2026-05-11T00:00:00+08:00'), label: '05/11' },
    { index: 1, date: new Date('2026-05-12T00:00:00+08:00'), label: '05/12' },
    { index: 2, date: new Date('2026-05-13T00:00:00+08:00'), label: '05/13' },
    { index: 3, date: new Date('2026-05-14T00:00:00+08:00'), label: '05/14' },
  ],
  points: [
    { slotIndex: 0, slotCount: 1, positionInSlot: 0, heartRate: 76, heartRateAlert: false, hasHeartRate: true },
    { slotIndex: 1, slotCount: 1, positionInSlot: 0, heartRate: 102, heartRateAlert: true, hasHeartRate: true },
    { slotIndex: 2, slotCount: 1, positionInSlot: 0, heartRate: 88, heartRateAlert: false, hasHeartRate: true },
    { slotIndex: 3, slotCount: 1, positionInSlot: 0, heartRate: 92, heartRateAlert: false, hasHeartRate: true },
  ],
}, threshold, { width: 300, height: 220 }, 30, { hideTitle: true });
assert.ok(heartRateSmoothCtx.curves.length > 0, '30-day heart-rate chart should use smoothed curves instead of straight line segments');

const ninetyDayHeartRateCtx = createFakeCtx();
drawHeartRateChart(ninetyDayHeartRateCtx, ninetyDayChartData, threshold, { width: 300, height: 220 }, 90, { hideTitle: true });
assert.strictEqual(ninetyDayHeartRateCtx.arcs.length, 0, '90-day heart-rate chart should not render point markers');
const ninetyDayHeartBlueCount = ninetyDayHeartRateCtx.segments.filter((segment) => segment.strokeStyle === '#0356FC').length;
const ninetyDayHeartRedCount = ninetyDayHeartRateCtx.segments.filter((segment) => segment.strokeStyle === '#EF4444').length;
assert.ok(ninetyDayHeartRedCount > 0, '90-day heart-rate chart should keep the above-threshold part red');
assert.ok(ninetyDayHeartBlueCount > 0, '90-day heart-rate chart should turn blue after the curve falls back inside threshold');

console.log('[verify-t6.1] pass');
