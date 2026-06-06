require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const {
  SUBSCRIBE_ALERT_TEMPLATE_ID,
  buildPushData,
  buildTipText,
} = require('../cloudfunctions/_shared/push-helpers');
const { COLLECTIONS } = require('../cloudfunctions/_shared/db');
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
  const measuredAt = '2026-05-06T12:15:00.000Z';
  const runtime = createFakeRuntime({ openId: 'user_record' });
  const originalGetWXContext = runtime.cloud.getWXContext.bind(runtime.cloud);
  runtime.cloud.getWXContext = () => Object.assign({}, originalGetWXContext(), {
    SOURCE: 'wx_devtools',
  });
  const pushCalls = [];
  runtime.cloud.openapi = {
    subscribeMessage: {
      send: async (payload) => {
        pushCalls.push(payload);
        return {
          errCode: 0,
          errMsg: 'openapi.subscribeMessage.send:ok',
        };
      },
    },
  };
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const saveRecord = buildFunction(createSaveRecordHandler, runtime);
  const getRecords = buildFunction(createGetRecordsHandler, runtime);
  const updateRecord = buildFunction(createUpdateRecordHandler, runtime);
  const deleteRecord = buildFunction(createDeleteRecordHandler, runtime);

  assert.strictEqual(
    SUBSCRIBE_ALERT_TEMPLATE_ID,
    'EntTrzNRVv1RDKy5AvLgxsUrGJzislhyAPovjgrXJ4U',
    'push helper should use the new 指标异常提醒 template id',
  );
  assert.strictEqual(
    buildPushData({
      payload: { systolic: 145, diastolic: 92 },
      threshold: { systolic: 200, diastolic: 200 },
      profileName: '爸爸',
      measuredAt,
    }).templateData.thing2.value,
    '血压偏高1级',
    '145/92 should map to 1级 for push display',
  );
  assert.strictEqual(
    buildPushData({
      payload: { systolic: 165, diastolic: 102 },
      threshold: { systolic: 200, diastolic: 200 },
      profileName: '爸爸',
      measuredAt,
    }).templateData.thing2.value,
    '血压偏高2级',
    '165/102 should map to 2级 for push display',
  );
  assert.strictEqual(
    buildPushData({
      payload: { systolic: 185, diastolic: 112 },
      threshold: { systolic: 200, diastolic: 200 },
      profileName: '爸爸',
      measuredAt,
    }).templateData.thing2.value,
    '血压偏高3级',
    '185/112 should map to 3级 for push display',
  );
  assert.strictEqual(
    buildPushData({
      payload: { systolic: 85, diastolic: 55 },
      threshold: { systolic: 200, diastolic: 200 },
      profileName: '爸爸',
      measuredAt,
    }).templateData.thing2.value,
    '血压偏低',
    '85/55 should map to 偏低 for push display',
  );

  await login({}, {});
  const createdProfile = await createProfile({ name: '测试档案名字很长很长很长很长' }, {});
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc(createdProfile.relationship._id).update({
    data: {
      subscribeAlerts: true,
    },
  });
  await runtime.db.collection(COLLECTIONS.PROFILES).doc(createdProfile.profile._id).update({
    data: {
      settings: {
        bp: {
          threshold: {
            systolic: 150,
            diastolic: 95,
          },
          referenceLines: {
            systolic: {
              normal: 120,
              elevated: 140,
              high: 160,
            },
            diastolic: {
              normal: 80,
              elevated: 90,
              high: 100,
            },
          },
        },
        glucose: {},
        chartPreferences: {
          split: false,
        },
      },
    },
  });

  const missingUpdate = await updateRecord({
    recordId: 'missing_record_id',
    patch: {
      note: 'should fail',
    },
  }, {});
  assert.strictEqual(missingUpdate.success, false);
  assert.strictEqual(missingUpdate.code, 'RECORD_NOT_FOUND');

  const missingDelete = await deleteRecord({ recordId: 'missing_record_id' }, {});
  assert.strictEqual(missingDelete.success, false);
  assert.strictEqual(missingDelete.code, 'RECORD_NOT_FOUND');

  const saved = await saveRecord({
    profileId: createdProfile.profile._id,
    measuredAt,
    payload: {
      systolic: 148,
      diastolic: 94,
      heartRate: 72,
    },
    period: 'morning',
    note: '早餐前',
  }, {});
  assert.strictEqual(saved.success, true);
  assert.strictEqual(saved.alertTriggered, false);
  assert.strictEqual(pushCalls.length, 0);

  const alerted = await saveRecord({
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
  assert.strictEqual(alerted.success, true);
  assert.strictEqual(alerted.alertTriggered, true);
  assert.strictEqual(alerted.alertSentTo.length, 1);
  assert.strictEqual(pushCalls.length, 1);
  assert.strictEqual(pushCalls[0].templateId, SUBSCRIBE_ALERT_TEMPLATE_ID);
  assert.strictEqual(pushCalls[0].miniprogramState, 'developer');
  assert.deepStrictEqual(
    pushCalls[0].data,
    {
      thing2: { value: '血压偏高1级' },
      character_string3: { value: '152/96 mmHg' },
      thing5: { value: '测试档案名字很长很长很长很长' },
      time8: { value: '2026-05-06 20:15' },
    },
    'push payload should match the new 指标异常提醒 template fields',
  );
  assert.strictEqual(buildTipText('妈妈', { systolic: 152, diastolic: 96 }), '妈妈的血压152/96 请关注');
  assert.strictEqual(buildTipText('测试档案名字很长很长很长', { systolic: 152, diastolic: 96 }), '血压152/96 请关注');

  const pushCountBeforeSkip = pushCalls.length;
  const savedSkipPush = await saveRecord({
    profileId: createdProfile.profile._id,
    measuredAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    payload: {
      systolic: 166,
      diastolic: 102,
      heartRate: 75,
    },
    note: '历史导入',
    skipPush: true,
  }, {});
  assert.strictEqual(savedSkipPush.success, true);
  assert.strictEqual(savedSkipPush.alertTriggered, true);
  assert.strictEqual(savedSkipPush.alertSentTo.length, 1);
  assert.strictEqual(pushCalls.length, pushCountBeforeSkip, 'skipPush should suppress subscribe message sends');

  const listed = await getRecords({ profileId: createdProfile.profile._id }, {});
  assert.strictEqual(listed.success, true);
  assert.strictEqual(listed.records.length, 3);

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

  const deletedAlerted = await deleteRecord({ recordId: alerted.record._id }, {});
  assert.strictEqual(deletedAlerted.success, true);

  const deletedSkipPush = await deleteRecord({ recordId: savedSkipPush.record._id }, {});
  assert.strictEqual(deletedSkipPush.success, true);

  const listedAfterDelete = await getRecords({ profileId: createdProfile.profile._id }, {});
  assert.strictEqual(listedAfterDelete.success, true);
  assert.strictEqual(listedAfterDelete.records.length, 0);

  console.log('[verify-record-crud] pass');
  console.log(
    JSON.stringify(
      {
        profileId: createdProfile.profile._id,
    recordId: alerted.record._id,
    alertTriggered: alerted.alertTriggered,
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
