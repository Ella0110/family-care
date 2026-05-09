const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function runInUtc(snippet) {
  return execFileSync(
    process.execPath,
    ['-e', snippet],
    {
      cwd: root,
      env: Object.assign({}, process.env, { TZ: 'UTC' }),
      encoding: 'utf8',
    },
  ).trim();
}

const fixedNowIso = '2026-05-09T01:30:00.000Z';

const sinceIso = runInUtc(`
  const { getSinceForDays } = require('./utils/report-helpers');
  const now = new Date('${fixedNowIso}');
  process.stdout.write(getSinceForDays(7, now).toISOString());
`);
assert.strictEqual(
  sinceIso,
  '2026-05-02T16:00:00.000Z',
  'getSinceForDays should anchor to East8 midnight even when device timezone is UTC',
);

const exportRangeSinceIso = runInUtc(`
  const { buildRecentRange } = require('./utils/records-export-helpers');
  const now = new Date('${fixedNowIso}');
  process.stdout.write(buildRecentRange(14, now).since.toISOString());
`);
assert.strictEqual(
  exportRangeSinceIso,
  '2026-04-25T16:00:00.000Z',
  'records export range should use East8 day boundaries',
);

const pointCount = runInUtc(`
  const { buildChartTimeline } = require('./utils/report-helpers');
  const now = new Date('${fixedNowIso}');
  const timeline = buildChartTimeline([
    {
      _id: 'r1',
      measuredAt: '2026-05-03T00:30:00+08:00',
      payload: { systolic: 128, diastolic: 82, heartRate: 72 },
    },
  ], 7, { systolic: 140, diastolic: 90 }, now);
  process.stdout.write(String(timeline.points.length));
`);
assert.strictEqual(
  pointCount,
  '1',
  '7-day chart timeline should retain East8 early-morning imported records',
);

console.log('[verify-date-range-east8] pass');
