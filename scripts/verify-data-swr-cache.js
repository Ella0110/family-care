const assert = require('assert');
const path = require('path');

const pagePath = path.resolve(__dirname, '../pages/data/data.js');
const recordService = require('../services/record-service');
const { store } = require('../store/index');

const originalState = store.getState();
const originalPage = global.Page;
const originalGetApp = global.getApp;
const originalWx = global.wx;
const originalLoadLatestRecord = recordService.loadLatestRecord;
const originalLoadRecords = recordService.loadRecords;
const originalFetchLatestRecord = recordService.fetchLatestRecord;

function restore() {
  recordService.loadLatestRecord = originalLoadLatestRecord;
  recordService.loadRecords = originalLoadRecords;
  recordService.fetchLatestRecord = originalFetchLatestRecord;
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

function createInstance(definition) {
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data, {
      currentProfileId: 'profile-1',
      selectedDays: 7,
      relationshipRole: 'owner',
    }),
    requestId: 0,
    activeLoadPromise: null,
    chartRenderToken: 0,
    lastLoadedProfileId: '',
    lastRefreshAt: 0,
    coverageDayCount: NaN,
    latestRecord: null,
    allRecords: [],
    rangeRecords: [],
    chartData: null,
    currentUserId: 'user-1',
    setData(patch) {
      this.data = Object.assign({}, this.data, patch);
    },
    enterPageLoading() {},
    applyViewModel() {
      this.applyViewModelCalled = true;
    },
    syncProfileMeta() {},
  });
}

async function verifyUsesLoadApis(definition) {
  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '爸爸', relation: '我自己', settings: {} }],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });
  store.invalidateRecords('profile-1');

  const calls = {
    loadLatestRecord: 0,
    loadRecords: 0,
    fetchLatestRecord: 0,
  };

  recordService.loadLatestRecord = async () => {
    calls.loadLatestRecord += 1;
    return { record: null };
  };
  recordService.loadRecords = async () => {
    calls.loadRecords += 1;
    return { records: [], hasMore: false };
  };
  recordService.fetchLatestRecord = async () => {
    calls.fetchLatestRecord += 1;
    return { record: null };
  };

  const instance = createInstance(definition);
  await definition.loadPageData.call(instance, { force: false, resetReady: true });

  assert.strictEqual(calls.loadLatestRecord, 1, 'data page should use loadLatestRecord on fresh loads');
  assert.strictEqual(calls.loadRecords, 1, 'data page should use loadRecords on fresh loads');
  assert.strictEqual(calls.fetchLatestRecord, 0, 'data page should not use fetchLatestRecord directly');
}

async function verifyRendersCachedDataBeforeFresh(definition) {
  const cachedRecord = {
    _id: 'record-1',
    profileId: 'profile-1',
    measuredAt: '2026-06-05T08:00:00.000Z',
    createdAt: '2026-06-05T08:00:00.000Z',
    payload: {
      systolic: 120,
      diastolic: 80,
      heartRate: 70,
    },
  };
  const freshRecord = {
    _id: 'record-2',
    profileId: 'profile-1',
    measuredAt: '2026-06-06T08:00:00.000Z',
    createdAt: '2026-06-06T08:00:00.000Z',
    payload: {
      systolic: 130,
      diastolic: 85,
      heartRate: 72,
    },
  };

  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '爸爸', relation: '我自己', settings: {} }],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });
  let resolveLatest;
  let resolveRecords;
  recordService.loadLatestRecord = (profileId, callbacks = {}) => {
    if (callbacks.onCacheHit) {
      callbacks.onCacheHit({ record: cachedRecord, fromCache: true });
    }
    return new Promise((resolve) => {
      resolveLatest = () => resolve({ record: freshRecord });
    });
  };
  recordService.loadRecords = (profileId, options = {}, callbacks = {}) => {
    if (callbacks.onCacheHit) {
      callbacks.onCacheHit({
        records: [cachedRecord],
        hasMore: false,
        fromCache: true,
      });
    }
    return new Promise((resolve) => {
      resolveRecords = () => resolve({ records: [freshRecord], hasMore: false });
    });
  };

  const instance = createInstance(definition);
  instance.applySnapshots = [];
  instance.applyViewModel = function applyViewModel() {
    this.applySnapshots.push({
      latestRecordId: this.latestRecord && this.latestRecord._id,
      recordCount: this.allRecords.length,
      coverageDayCount: this.coverageDayCount,
    });
  };

  const pending = definition.loadPageData.call(instance, { force: false, resetReady: true });
  await Promise.resolve();

  assert.deepStrictEqual(
    instance.applySnapshots,
    [{ latestRecordId: 'record-1', recordCount: 1, coverageDayCount: 1 }],
    'data page should render cached content immediately when both cache hits are available',
  );

  resolveLatest();
  resolveRecords();
  await pending;

  assert.deepStrictEqual(
    instance.applySnapshots,
    [
      { latestRecordId: 'record-1', recordCount: 1, coverageDayCount: 1 },
      { latestRecordId: 'record-2', recordCount: 1, coverageDayCount: 1 },
    ],
    'data page should silently re-render with fresh content after network results arrive',
  );
  assert.strictEqual(instance._pendingCacheLatest, undefined, 'latest cache staging state should be cleaned up');
  assert.strictEqual(instance._pendingCacheRecords, undefined, 'records cache staging state should be cleaned up');
}

async function verifyDoesNotRenderPartialCache(definition) {
  const cachedRecord = {
    _id: 'record-1',
    profileId: 'profile-1',
    measuredAt: '2026-06-05T08:00:00.000Z',
    createdAt: '2026-06-05T08:00:00.000Z',
    payload: {
      systolic: 120,
      diastolic: 80,
      heartRate: 70,
    },
  };
  const freshRecord = {
    _id: 'record-2',
    profileId: 'profile-1',
    measuredAt: '2026-06-06T08:00:00.000Z',
    createdAt: '2026-06-06T08:00:00.000Z',
    payload: {
      systolic: 130,
      diastolic: 85,
      heartRate: 72,
    },
  };

  store.setState({
    user: { _id: 'user-1' },
    profiles: [{ _id: 'profile-1', name: '爸爸', relation: '我自己', settings: {} }],
    relationships: [{ _id: 'rel-1', profileId: 'profile-1', role: 'owner' }],
    currentProfileId: 'profile-1',
  });
  let resolveLatest;
  let resolveRecords;
  recordService.loadLatestRecord = (profileId, callbacks = {}) => {
    if (callbacks.onCacheHit) {
      callbacks.onCacheHit({ record: cachedRecord, fromCache: true });
    }
    return new Promise((resolve) => {
      resolveLatest = () => resolve({ record: freshRecord });
    });
  };
  recordService.loadRecords = () =>
    new Promise((resolve) => {
      resolveRecords = () => resolve({ records: [freshRecord], hasMore: false });
    });

  const instance = createInstance(definition);
  instance.applySnapshots = [];
  instance.applyViewModel = function applyViewModel() {
    this.applySnapshots.push({
      latestRecordId: this.latestRecord && this.latestRecord._id,
      recordCount: this.allRecords.length,
      coverageDayCount: this.coverageDayCount,
    });
  };

  const pending = definition.loadPageData.call(instance, { force: false, resetReady: true });
  await Promise.resolve();

  assert.deepStrictEqual(
    instance.applySnapshots,
    [],
    'data page should not render partial cache when only one cache hit is available',
  );

  resolveLatest();
  resolveRecords();
  await pending;

  assert.deepStrictEqual(
    instance.applySnapshots,
    [{ latestRecordId: 'record-2', recordCount: 1, coverageDayCount: 1 }],
    'data page should wait for fresh data when cache is incomplete',
  );
}

async function main() {
  global.getApp = () => ({
    consumePendingRecordPanelOpen: () => false,
  });
  global.wx = {
    nextTick(callback) {
      if (typeof callback === 'function') {
        callback();
      }
    },
  };

  const definition = loadPageDefinition();
  await verifyUsesLoadApis(definition);
  await verifyRendersCachedDataBeforeFresh(definition);
  await verifyDoesNotRenderPartialCache(definition);
  console.log('verify-data-swr-cache: ok');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    restore();
  });
