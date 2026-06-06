require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { store } = require('../store/index');
const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { COLLECTIONS } = require('../cloudfunctions/_shared/db');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createSaveRecordHandler } = require('../cloudfunctions/saveRecord/handler');

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

async function seedAlertableProfile(runtime) {
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);

  await login({}, {});
  const createdProfile = await createProfile({ name: '爸爸' }, {});
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc(createdProfile.relationship._id).update({
    data: {
      subscribeAlerts: true,
    },
  });

  return createdProfile.profile._id;
}

async function verifyCloudHandlerMiniprogramState() {
  const runtime = createFakeRuntime({ openId: 'user_env_version' });
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

  const saveRecord = buildFunction(createSaveRecordHandler, runtime);
  const profileId = await seedAlertableProfile(runtime);
  const measuredAt = '2026-05-06T12:15:00.000Z';
  const cases = [
    { envVersion: 'develop', expected: 'developer' },
    { envVersion: 'trial', expected: 'trial' },
    { envVersion: undefined, expected: 'formal' },
  ];

  for (const testCase of cases) {
    pushCalls.length = 0;
    const event = {
      profileId,
      measuredAt,
      payload: {
        systolic: 152,
        diastolic: 96,
        heartRate: 72,
      },
      note: `envVersion:${testCase.envVersion || 'missing'}`,
    };

    if (testCase.envVersion) {
      event.envVersion = testCase.envVersion;
    }

    const result = await saveRecord(event, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alertTriggered, true);
    assert.strictEqual(pushCalls.length, 1, `saveRecord should send one push for envVersion=${testCase.envVersion || 'missing'}`);
    assert.strictEqual(
      pushCalls[0].miniprogramState,
      testCase.expected,
      `saveRecord should map envVersion=${testCase.envVersion || 'missing'} to ${testCase.expected}`,
    );
  }
}

async function verifyRecordServicePassesEnvVersion() {
  store.setState({
    user: null,
    profiles: [],
    relationships: [],
    currentProfileId: null,
  });

  const calls = [];
  global.wx = {
    cloud: {
      callFunction: async ({ name, data }) => {
        calls.push({ name, data });
        return {
          result: {
            success: true,
            record: {
              _id: 'record_env_1',
              profileId: data.profileId,
              measuredAt: data.measuredAt,
              payload: data.payload,
              createdAt: '2026-05-06T12:15:00.000Z',
              updatedAt: '2026-05-06T12:15:00.000Z',
            },
            alertTriggered: false,
            alertSentTo: [],
          },
        };
      },
    },
    getAccountInfoSync() {
      return {
        miniProgram: {
          envVersion: 'trial',
        },
      };
    },
  };

  delete require.cache[require.resolve('../services/record-service')];
  const recordService = require('../services/record-service');
  const saveResult = await recordService.saveRecord(
    'profile_trial',
    { systolic: 120, diastolic: 80 },
    1714968900000,
    null,
  );

  assert.strictEqual(saveResult.record.profileId, 'profile_trial');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].name, 'saveRecord');
  assert.strictEqual(calls[0].data.envVersion, 'trial');
}

Promise.resolve()
  .then(verifyCloudHandlerMiniprogramState)
  .then(verifyRecordServicePassesEnvVersion)
  .then(() => {
    console.log('verify-save-record-env-version: ok');
  })
  .catch((error) => {
    console.error('verify-save-record-env-version: fail');
    console.error(error);
    process.exitCode = 1;
  });
