const assert = require('assert');
const path = require('path');

const pagePath = path.resolve(__dirname, '../pages/data/data.js');
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
  assert(definition, 'data page should register itself');
  return definition;
}

function createInstance(definition, nowValue) {
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data, {
      currentProfileId: 'profile-1',
      selectedDays: 90,
      relationshipRole: 'owner',
    }),
    requestId: 0,
    activeLoadPromise: null,
    chartRenderToken: 0,
    lastLoadedProfileId: 'profile-1',
    lastRefreshAt: nowValue,
    coverageDayCount: NaN,
    latestRecord: null,
    allRecords: [],
    rangeRecords: [],
    chartData: null,
    currentUserId: 'user-1',
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

function buildRecord(id, measuredAt, systolic = 120, diastolic = 80) {
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

function getOption(instance, days) {
  return (instance.data.periodOptions || []).find((item) => item.days === days) || null;
}

function withFrozenNow(nowIso, fn) {
  const RealDate = Date;
  const frozenNow = new RealDate(nowIso);

  function MockDate(...args) {
    if (!(this instanceof MockDate)) {
      return RealDate(...args);
    }
    if (!args.length) {
      return new RealDate(frozenNow);
    }
    return new RealDate(...args);
  }

  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;
  MockDate.now = () => frozenNow.getTime();
  MockDate.prototype = RealDate.prototype;

  global.Date = MockDate;
  try {
    fn();
  } finally {
    global.Date = RealDate;
  }
}

function verifyEnables90DayByEarliestRecordAge(definition) {
  const nowIso = '2026-06-06T12:00:00.000Z';
  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '爸爸', relation: '我自己', settings: {} }],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });

  const instance = createInstance(definition, Date.parse(nowIso));
  instance.allRecords = [buildRecord('record-1', '2026-04-18T08:00:00.000Z', 130, 85)];
  instance.latestRecord = instance.allRecords[0];
  instance.coverageDayCount = 1;

  withFrozenNow(nowIso, () => {
    definition.applyViewModel.call(instance);
  });

  assert.strictEqual(getOption(instance, 7).enabled, true, '7 day option should stay enabled with one record day');
  assert.strictEqual(getOption(instance, 30).enabled, false, '30 day option should still depend on unique measured days');
  assert.strictEqual(
    getOption(instance, 90).enabled,
    true,
    '90 day option should enable when the earliest measuredAt is more than 30 days old',
  );
}

function verifyDisables90DayWithoutRecords(definition) {
  const nowIso = '2026-06-06T12:00:00.000Z';
  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '爸爸', relation: '我自己', settings: {} }],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });

  const instance = createInstance(definition, Date.parse(nowIso));
  instance.allRecords = [];
  instance.latestRecord = null;
  instance.coverageDayCount = 0;

  withFrozenNow(nowIso, () => {
    definition.applyViewModel.call(instance);
  });

  assert.strictEqual(
    getOption(instance, 90).enabled,
    false,
    '90 day option should stay disabled when there are no records',
  );
}

try {
  global.getApp = () => ({
    globalData: { loginReady: true },
  });
  global.wx = {
    showToast() {},
  };

  const definition = loadPageDefinition();
  verifyEnables90DayByEarliestRecordAge(definition);
  verifyDisables90DayWithoutRecords(definition);
  console.log('verify-data-period-options: ok');
} finally {
  restore();
}
