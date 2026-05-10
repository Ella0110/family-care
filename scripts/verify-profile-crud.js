require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createUpdateProfileHandler } = require('../cloudfunctions/updateProfile/handler');
const { createDeleteProfileHandler } = require('../cloudfunctions/deleteProfile/handler');

function buildAuth(runtime) {
  return createAuthService({ db: runtime.db, cloud: runtime.cloud });
}

function buildFunction(factory, runtime, extra = {}) {
  const auth = buildAuth(runtime);
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
  const runtime = createFakeRuntime({ openId: 'user_profile' });
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const updateProfile = buildFunction(createUpdateProfileHandler, runtime);
  const deleteProfile = buildFunction(createDeleteProfileHandler, runtime);

  await login({}, {});

  const created = await createProfile({
    name: '爸爸',
    relation: '父亲',
    gender: 'male',
    birthDate: '1950-01-01',
    note: '高血压病史',
  }, {});
  assert.strictEqual(created.success, true);
  assert.strictEqual(created.profile.name, '爸爸');
  assert.strictEqual(created.relationship.role, 'owner');

  const updated = await updateProfile({
    profileId: created.profile._id,
    patch: {
      note: '长期监测',
      emergencyContact: {
        name: '姐姐',
        phone: '13800000000',
      },
    },
  }, {});
  assert.strictEqual(updated.success, true);
  assert.strictEqual(updated.profile.note, '长期监测');
  assert.strictEqual(updated.profile.emergencyContact.name, '姐姐');

  const incompleteEmergencyContact = await updateProfile({
    profileId: created.profile._id,
    patch: {
      emergencyContact: {
        name: '只有姓名',
      },
    },
  }, {});
  assert.strictEqual(incompleteEmergencyContact.success, false);
  assert.strictEqual(incompleteEmergencyContact.code, 'INVALID_EMERGENCY_CONTACT');

  const deleted = await deleteProfile({ profileId: created.profile._id }, {});
  assert.strictEqual(deleted.success, true);

  console.log('[verify-profile-crud] pass');
  console.log(
    JSON.stringify(
      {
        profileId: created.profile._id,
        ownerRelationshipId: created.relationship._id,
        deleted: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[verify-profile-crud] fail');
  console.error(error);
  process.exitCode = 1;
});
