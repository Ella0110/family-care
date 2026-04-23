const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');

store.setState({
  profiles: [
    { _id: 'profile_a', name: '爸爸' },
    { _id: 'profile_b', name: '妈妈' },
  ],
  relationships: [],
  currentProfileId: null,
});

assert.strictEqual(typeof store.getCachedLatestRecord, 'function');
assert.strictEqual(typeof store.setCachedLatestRecord, 'function');
assert.strictEqual(typeof store.getCachedRecords, 'function');
assert.strictEqual(typeof store.setCachedRecords, 'function');
assert.strictEqual(typeof store.invalidateRecords, 'function');
assert.strictEqual(store.getState().cache.profiles.length, 2);

store.setCachedLatestRecord('profile_a', { _id: 'record_a1', profileId: 'profile_a' });
assert.strictEqual(store.getCachedLatestRecord('profile_a')._id, 'record_a1');
assert.strictEqual(store.getCachedLatestRecord('profile_b'), null);
assert.strictEqual(store.hasCachedLatestRecord('profile_a'), true);

store.setCachedRecords('profile_a', [{ _id: 'record_a1', profileId: 'profile_a' }]);
assert.strictEqual(store.getCachedRecords('profile_a').length, 1);
assert.strictEqual(store.getCachedRecords('profile_b'), null);
assert.strictEqual(store.hasCachedRecords('profile_a'), true);

store.invalidateRecords('profile_a');
assert.strictEqual(store.getCachedLatestRecord('profile_a'), null);
assert.strictEqual(store.getCachedRecords('profile_a'), null);

const requestPath = path.resolve(__dirname, '../services/request.js');
delete require.cache[requestPath];

let calls = [];
require.cache[requestPath] = {
  id: requestPath,
  filename: requestPath,
  loaded: true,
  exports: {
    async call(name, data) {
      calls.push({ name, data });

      if (name === 'getRecords') {
        return {
          success: true,
          records: [{ _id: 'fresh_record', profileId: data.profileId, measuredAt: 1 }],
          hasMore: false,
        };
      }

      if (name === 'saveRecord') {
        return {
          success: true,
          record: { _id: 'saved_record', profileId: data.profileId, measuredAt: data.measuredAt, payload: data.payload },
          alertTriggered: false,
          alertSentTo: [],
        };
      }

      if (name === 'updateRecord') {
        return {
          success: true,
          record: { _id: data.recordId, profileId: 'profile_a', measuredAt: data.patch.measuredAt, payload: data.patch.payload },
        };
      }

      if (name === 'deleteRecord') {
        return { success: true };
      }

      throw new Error(`unexpected cloud function: ${name}`);
    },
  },
};

const servicePath = path.resolve(__dirname, '../services/record-service.js');
delete require.cache[servicePath];
const recordService = require('../services/record-service');

async function main() {
  store.setCachedRecords('profile_a', [{ _id: 'cached_record', profileId: 'profile_a', measuredAt: 0 }]);

  const events = [];
  await recordService.loadRecords('profile_a', { limit: 200 }, {
    onCacheHit(data) {
      events.push(`cache:${data.records[0]._id}`);
    },
    onFresh(data) {
      events.push(`fresh:${data.records[0]._id}`);
    },
    onError(error) {
      events.push(`error:${error.message}`);
    },
  });

  assert.deepStrictEqual(events, ['cache:cached_record', 'fresh:fresh_record']);
  assert.strictEqual(store.getCachedRecords('profile_a')[0]._id, 'fresh_record');

  calls = [];
  const saved = await recordService.saveRecord(
    'profile_a',
    { systolic: 150, diastolic: 95 },
    Date.now(),
    'cache test',
  );
  assert.strictEqual(saved.record._id, 'saved_record');
  assert.strictEqual(store.getCachedLatestRecord('profile_a')._id, 'saved_record');
  assert.strictEqual(store.getCachedRecords('profile_a'), null);

  store.setCachedLatestRecord('profile_a', { _id: 'latest_before_update', profileId: 'profile_a' });
  store.setCachedRecords('profile_a', [{ _id: 'record_before_update', profileId: 'profile_a' }]);
  await recordService.updateRecord('record_before_update', {
    measuredAt: Date.now(),
    payload: { systolic: 135, diastolic: 80 },
  });
  assert.strictEqual(store.getCachedLatestRecord('profile_a'), null);
  assert.strictEqual(store.getCachedRecords('profile_a'), null);

  store.setCachedLatestRecord('profile_a', { _id: 'latest_before_delete', profileId: 'profile_a' });
  store.setCachedRecords('profile_a', [{ _id: 'record_before_delete', profileId: 'profile_a' }]);
  await recordService.deleteRecord('record_before_delete', { profileId: 'profile_a' });
  assert.strictEqual(store.getCachedLatestRecord('profile_a'), null);
  assert.strictEqual(store.getCachedRecords('profile_a'), null);

  const homePageSource = fs.readFileSync(
    path.resolve(__dirname, '../pages/home/home.js'),
    'utf8',
  );
  assert.match(homePageSource, /latestRecordRequestId/);
  assert.match(homePageSource, /multiLatestRecordRequestId/);
  assert.match(homePageSource, /this\.data\.activeProfile\._id !== profileId/);
  assert.match(homePageSource, /card\.profile\._id !== profileId/);

  console.log('[verify-t2.5-cache] pass');
}

main().catch((error) => {
  console.error('[verify-t2.5-cache] fail');
  console.error(error);
  process.exitCode = 1;
});
