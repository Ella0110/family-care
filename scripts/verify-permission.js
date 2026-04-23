require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { getRoleDefaults } = require('../cloudfunctions/_shared/defaults');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createSaveRecordHandler } = require('../cloudfunctions/saveRecord/handler');
const { createGetRecordsHandler } = require('../cloudfunctions/getRecords/handler');
const { createDeleteProfileHandler } = require('../cloudfunctions/deleteProfile/handler');
const { COLLECTIONS } = require('../cloudfunctions/_shared/db');

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
  const runtime = createFakeRuntime({ openId: 'owner_user' });
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const saveRecord = buildFunction(createSaveRecordHandler, runtime);
  const getRecords = buildFunction(createGetRecordsHandler, runtime);
  const deleteProfile = buildFunction(createDeleteProfileHandler, runtime);

  await login({}, {});
  const createdProfile = await createProfile({ name: '外婆' }, {});

  runtime.setOpenId('viewer_user');
  await login({}, {});

  const viewerDefaults = getRoleDefaults('viewer');
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc('rel_viewer').set({
    data: {
      _id: 'rel_viewer',
      userId: 'viewer_user',
      profileId: createdProfile.profile._id,
      role: viewerDefaults.role,
      permissions: viewerDefaults.permissions,
      subscribeAlerts: viewerDefaults.subscribeAlerts,
      displayName: null,
      createdAt: runtime.now(),
      acceptedAt: runtime.now(),
      invitedBy: 'owner_user',
    },
  });

  const viewerSave = await saveRecord({
    profileId: createdProfile.profile._id,
    measuredAt: '2026-04-23T07:20:00.000Z',
    payload: { systolic: 130, diastolic: 80 },
  }, {});
  assert.strictEqual(viewerSave.success, false);
  assert.strictEqual(viewerSave.code, 'PERMISSION_DENIED');

  const viewerDeleteProfile = await deleteProfile({ profileId: createdProfile.profile._id }, {});
  assert.strictEqual(viewerDeleteProfile.success, false);
  assert.strictEqual(viewerDeleteProfile.code, 'PERMISSION_DENIED');

  runtime.setOpenId('outsider_user');
  await login({}, {});

  const outsiderGet = await getRecords({ profileId: createdProfile.profile._id }, {});
  assert.strictEqual(outsiderGet.success, false);
  assert.strictEqual(outsiderGet.code, 'RELATIONSHIP_NOT_FOUND');

  console.log('[verify-permission] pass');
  console.log(
    JSON.stringify(
      {
        viewerSaveCode: viewerSave.code,
        viewerDeleteCode: viewerDeleteProfile.code,
        outsiderReadCode: outsiderGet.code,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[verify-permission] fail');
  console.error(error);
  process.exitCode = 1;
});
