const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dataPagePath = path.resolve(__dirname, '../pages/data/data.js');
const reportPagePath = path.resolve(__dirname, '../pages/report/report.js');
const { buildReportViewModel } = require('../utils/report-helpers');
const { store } = require('../store/index');

const originalState = store.getState();
const originalPage = global.Page;
const originalGetApp = global.getApp;
const originalWx = global.wx;

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function restore() {
  global.Page = originalPage;
  global.getApp = originalGetApp;
  global.wx = originalWx;
  store.setState({
    user: originalState.user,
    profiles: originalState.profiles,
    relationships: originalState.relationships,
    currentProfileId: originalState.currentProfileId,
    cache: originalState.cache,
    lastRefreshAt: originalState.lastRefreshAt,
    session: originalState.session,
  });
}

function loadPageDefinition(pagePath) {
  let definition = null;
  global.Page = (pageDefinition) => {
    definition = pageDefinition;
  };
  delete require.cache[pagePath];
  require(pagePath);
  assert(definition, `page should register itself: ${pagePath}`);
  return definition;
}

function buildRecord(id, measuredAt, systolic, diastolic) {
  return {
    _id: id,
    profileId: 'profile-1',
    measuredAt,
    createdAt: measuredAt,
    payload: {
      systolic,
      diastolic,
      heartRate: 70,
    },
  };
}

function createDataInstance(definition, profile) {
  const measuredAt = new Date().toISOString();
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data, {
      currentProfileId: profile._id,
      selectedDays: 30,
      relationshipRole: 'owner',
      pageReady: true,
    }),
    chartRenderToken: 0,
    currentUserId: 'user-1',
    coverageDayCount: 8,
    latestRecord: buildRecord('record-latest', measuredAt, 135, 85),
    allRecords: [buildRecord('record-latest', measuredAt, 135, 85)],
    rangeRecords: [],
    chartData: null,
    chartThreshold: null,
    setData(patch, callback) {
      this.data = Object.assign({}, this.data, patch);
      if (typeof callback === 'function') {
        callback();
      }
    },
    consumePendingRecordPanelOpen() {},
    scheduleChartRender() {},
  });
}

function createReportInstance(definition, profile) {
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data, {
      profileId: profile._id,
      selectedDays: 30,
      hideSensitiveInfo: false,
    }),
    chartRenderToken: 0,
    profile,
    activeMedications: [],
    rawRecords: [buildRecord('record-latest', '2026-06-06T08:00:00.000Z', 135, 85)],
    coverageDayCount: 1,
    earliestRecordAgeInDays: 40,
    generatedAt: new Date('2026-06-06T12:00:00.000Z'),
    setData(patch, callback) {
      this.data = Object.assign({}, this.data, patch);
      if (typeof callback === 'function') {
        callback();
      }
    },
    scheduleChartRender() {},
  });
}

try {
  global.getApp = () => ({ globalData: { fontScale: 1 } });
  global.wx = {
    getWindowInfo() {
      return { statusBarHeight: 20, pixelRatio: 3 };
    },
    getDeviceInfo() {
      return {};
    },
  };

  const profile = {
    _id: 'profile-1',
    name: '爸爸',
    relation: '我自己',
    settings: {
      bp: {
        threshold: {
          systolic: 120,
          diastolic: 80,
        },
      },
    },
  };

  store.setState({
    user: { _id: 'user-1' },
    profiles: [profile],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });

  const dataDefinition = loadPageDefinition(dataPagePath);
  const dataInstance = createDataInstance(dataDefinition, profile);
  dataDefinition.initSystemInfo.call(dataInstance);
  assert.strictEqual(
    dataInstance.pixelRatio,
    3,
    'data page should prefer pixelRatio from getWindowInfo so charts stay sharp on high-DPR devices',
  );
  dataDefinition.applyViewModel.call(dataInstance);
  assert.deepStrictEqual(
    dataInstance.chartThreshold,
    { systolic: 140, diastolic: 90 },
    'data page should use the fixed 140/90 display threshold for chart reference lines',
  );
  assert.deepStrictEqual(
    dataInstance.data.rangeSummary,
    {
      normalCount: 1,
      abnormalCount: 0,
      averageText: '135/85',
    },
    'data page should count 135/85 as 达标 even when the profile threshold is lower',
  );
  assert.strictEqual(
    dataInstance.chartData.points[0].systolicAlert,
    false,
    'data page chart points should treat 135 systolic as normal for display purposes',
  );
  assert.strictEqual(
    dataInstance.chartData.points[0].diastolicAlert,
    false,
    'data page chart points should treat 85 diastolic as normal for display purposes',
  );

  const viewModel = buildReportViewModel({
    profile,
    activeMedications: [],
    records: [buildRecord('report-record', '2026-06-06T08:00:00.000Z', 135, 85)],
    days: 30,
    generatedAt: new Date('2026-06-06T12:00:00.000Z'),
  });
  assert.deepStrictEqual(
    viewModel.threshold,
    { systolic: 140, diastolic: 90 },
    'report view model should use the fixed 140/90 display threshold for chart reference lines',
  );
  assert.strictEqual(
    viewModel.chartData.points[0].systolicAlert,
    false,
    'report chart points should treat 135 systolic as normal for display purposes',
  );
  assert.strictEqual(
    viewModel.chartData.points[0].diastolicAlert,
    false,
    'report chart points should treat 85 diastolic as normal for display purposes',
  );

  const reportDefinition = loadPageDefinition(reportPagePath);
  const reportInstance = createReportInstance(reportDefinition, profile);
  reportDefinition.applyViewModel.call(reportInstance);
  assert.deepStrictEqual(
    reportInstance.chartThreshold,
    { systolic: 140, diastolic: 90 },
    'report page should keep using the fixed 140/90 display threshold after applying the view model',
  );

  const userSettingsWxml = read('pages/user-settings/user-settings.wxml');
  assert.match(
    userSettingsWxml,
    /<block wx:if="\{\{hasProfile && isOwnerProfile\}\}">[\s\S]*高压超过多少提醒/i,
    'user-settings should keep the custom systolic threshold stepper block rendered for owner profiles',
  );
  assert.match(
    userSettingsWxml,
    /<block wx:if="\{\{hasProfile && isOwnerProfile\}\}">[\s\S]*低压超过多少提醒/i,
    'user-settings should keep the custom diastolic threshold stepper block rendered for owner profiles',
  );
  assert.match(
    userSettingsWxml,
    /当前提醒阈值：高压 \{\{thresholdSystolic\}\} \/ 低压 \{\{thresholdDiastolic\}\} mmHg/i,
    'user-settings should show a read-only threshold summary for non-owner profiles',
  );

  console.log('verify-fixed-bp-display-thresholds: ok');
} finally {
  restore();
}
