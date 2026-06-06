const assert = require('assert');
const path = require('path');

const pagePath = path.resolve(__dirname, '../pages/report/report.js');
const { store } = require('../store/index');

const originalState = store.getState();
const originalPage = global.Page;
const originalGetApp = global.getApp;
const originalWx = global.wx;

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

function loadPageDefinition() {
  let definition = null;
  global.Page = (pageDefinition) => {
    definition = pageDefinition;
  };
  delete require.cache[pagePath];
  require(pagePath);
  assert(definition, 'report page should register itself');
  return definition;
}

function buildRecord(id, measuredAt, systolic = 130, diastolic = 85) {
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

function createInstance(definition) {
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data, {
      profileId: 'profile-1',
      selectedDays: 90,
      hideSensitiveInfo: false,
    }),
    chartRenderToken: 0,
    reportRequestId: 0,
    profile: {
      _id: 'profile-1',
      name: '爸爸',
      relation: '我自己',
      settings: {},
    },
    activeMedications: [],
    rawRecords: [buildRecord('record-1', '2026-06-05T08:00:00.000Z')],
    coverageDayCount: 1,
    earliestRecordAgeInDays: 49,
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

function getOption(instance, days) {
  return (instance.data.periodOptions || []).find((item) => item.days === days) || null;
}

function verifyEnables90DayByEarliestRecordAge(definition) {
  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '爸爸', relation: '我自己', settings: {} }],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });

  const instance = createInstance(definition);
  definition.applyViewModel.call(instance);

  assert.strictEqual(getOption(instance, 7).enabled, true, '7 day option should stay enabled with one record day');
  assert.strictEqual(getOption(instance, 30).enabled, false, '30 day option should still depend on unique measured days');
  assert.strictEqual(
    getOption(instance, 90).enabled,
    true,
    '90 day option should enable when earliestRecordAgeInDays is more than 30 days',
  );
}

function verifyDisables90DayWithoutOlderHistory(definition) {
  const instance = createInstance(definition);
  instance.coverageDayCount = 12;
  instance.earliestRecordAgeInDays = 10;
  definition.applyViewModel.call(instance);

  assert.strictEqual(
    getOption(instance, 90).enabled,
    false,
    '90 day option should stay disabled when the earliest record is not older than 30 days',
  );
}

try {
  global.getApp = () => ({ globalData: { fontScale: 1 } });
  global.wx = {
    getSystemInfoSync() {
      return { pixelRatio: 2 };
    },
  };

  const definition = loadPageDefinition();
  verifyEnables90DayByEarliestRecordAge(definition);
  verifyDisables90DayWithoutOlderHistory(definition);
  console.log('verify-report-period-options: ok');
} finally {
  restore();
}
