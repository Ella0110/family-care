require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createSaveRecordHandler } = require('../cloudfunctions/saveRecord/handler');
const { createGetRecordsHandler } = require('../cloudfunctions/getRecords/handler');
const { createUpdateRecordHandler } = require('../cloudfunctions/updateRecord/handler');
const { createDeleteRecordHandler } = require('../cloudfunctions/deleteRecord/handler');

function buildFunction(factory, runtime, extra = {}) {
  const auth = createAuthService({ db: runtime.db, cloud: runtime.cloud });
  return createCloudFunction(
    factory(
      Object.assign(
        {
          db: runtime.db,
          cloud: runtime.cloud,
          command: runtime.command,
          auth,
          now: runtime.now,
        },
        extra,
      ),
    ),
  );
}

async function main() {
  const measuredAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const runtime = createFakeRuntime({ openId: 'user_record' });
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const saveRecord = buildFunction(createSaveRecordHandler, runtime);
  const getRecords = buildFunction(createGetRecordsHandler, runtime);
  const updateRecord = buildFunction(createUpdateRecordHandler, runtime);
  const deleteRecord = buildFunction(createDeleteRecordHandler, runtime);

  await login({}, {});
  const createdProfile = await createProfile({ name: '妈妈' }, {});

  const saved = await saveRecord({
    profileId: createdProfile.profile._id,
    measuredAt,
    payload: {
      systolic: 152,
      diastolic: 96,
      heartRate: 72,
    },
    period: 'morning',
    note: '早餐前',
  }, {});
  assert.strictEqual(saved.success, true);
  assert.strictEqual(saved.alertTriggered, true);
  assert.strictEqual(saved.alertSentTo.length, 1);

  const listed = await getRecords({ profileId: createdProfile.profile._id }, {});
  assert.strictEqual(listed.success, true);
  assert.strictEqual(listed.records.length, 1);

  const updated = await updateRecord({
    recordId: saved.record._id,
    patch: {
      note: '早餐后复测',
      payload: {
        systolic: 148,
        diastolic: 92,
        heartRate: 70,
      },
    },
  }, {});
  assert.strictEqual(updated.success, true);
  assert.strictEqual(updated.record.payload.systolic, 148);

  const deleted = await deleteRecord({ recordId: saved.record._id }, {});
  assert.strictEqual(deleted.success, true);

  const listedAfterDelete = await getRecords({ profileId: createdProfile.profile._id }, {});
  assert.strictEqual(listedAfterDelete.success, true);
  assert.strictEqual(listedAfterDelete.records.length, 0);

  console.log('[verify-record-crud] pass');
  console.log(
    JSON.stringify(
      {
        profileId: createdProfile.profile._id,
        recordId: saved.record._id,
        alertTriggered: saved.alertTriggered,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[verify-record-crud] fail');
  console.error(error);
  process.exitCode = 1;
});
