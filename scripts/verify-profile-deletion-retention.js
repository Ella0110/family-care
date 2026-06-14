require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { getRoleDefaults } = require('../cloudfunctions/_shared/defaults');
const { COLLECTIONS } = require('../cloudfunctions/_shared/db');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createDeleteProfileHandler } = require('../cloudfunctions/deleteProfile/handler');
const {
  PROFILE_RESTORE_WINDOW_MS,
  createRestoreProfileHandler,
} = require('../cloudfunctions/restoreProfile/handler');
const {
  PROFILE_RETENTION_WINDOW_MS,
  cleanupExpiredProfileData,
  createCleanupDeletedProfilesHandler,
} = require('../cloudfunctions/cleanupDeletedProfiles/handler');

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

async function seedRelationship(runtime, relationship) {
  const { _id, ...data } = relationship;
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc(relationship._id).set({
    data,
  });
}

async function verifyRestoreProfile() {
  let currentNow = new Date('2026-06-14T00:00:00.000Z');
  const runtime = createFakeRuntime({
    openId: 'owner_user',
    now: () => new Date(currentNow.getTime()),
  });
  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const deleteProfile = buildFunction(createDeleteProfileHandler, runtime);
  const restoreProfile = buildFunction(createRestoreProfileHandler, runtime);

  await login({}, {});
  const created = await createProfile({ name: '待恢复档案' }, {});
  const deleted = await deleteProfile({ profileId: created.profile._id }, {});
  assert.strictEqual(deleted.success, true);

  currentNow = new Date(currentNow.getTime() + PROFILE_RESTORE_WINDOW_MS - 1);
  const restored = await restoreProfile({ profileId: created.profile._id }, {});
  assert.strictEqual(restored.success, true, 'owner should restore within 30 days');
  assert.strictEqual(
    runtime.db.store[COLLECTIONS.PROFILES][created.profile._id].deletedAt,
    null,
    'restored profile should clear deletedAt',
  );

  const expiredProfile = await createProfile({ name: '过期档案' }, {});
  currentNow = new Date('2026-06-14T00:00:00.000Z');
  await deleteProfile({ profileId: expiredProfile.profile._id }, {});
  currentNow = new Date(currentNow.getTime() + PROFILE_RESTORE_WINDOW_MS + 1);
  const expiredRestore = await restoreProfile({ profileId: expiredProfile.profile._id }, {});
  assert.strictEqual(expiredRestore.success, false);
  assert.strictEqual(expiredRestore.code, 'RESTORE_EXPIRED');

  const viewerDefaults = getRoleDefaults('viewer');
  const viewerProfile = await createProfile({ name: '他人档案' }, {});
  currentNow = new Date('2026-06-14T00:00:00.000Z');
  await deleteProfile({ profileId: viewerProfile.profile._id }, {});

  runtime.setOpenId('viewer_user');
  await login({}, {});
  await seedRelationship(runtime, {
    _id: 'rel_viewer_restore',
    userId: 'viewer_user',
    profileId: viewerProfile.profile._id,
    role: viewerDefaults.role,
    permissions: viewerDefaults.permissions,
    subscribeAlerts: viewerDefaults.subscribeAlerts,
    createdAt: currentNow,
    updatedAt: currentNow,
    acceptedAt: currentNow,
    invitedBy: 'owner_user',
  });
  const forbiddenRestore = await restoreProfile({ profileId: viewerProfile.profile._id }, {});
  assert.strictEqual(forbiddenRestore.success, false);
  assert.strictEqual(forbiddenRestore.code, 'FORBIDDEN');
}

async function verifyCleanupDeletedProfiles() {
  const currentNow = new Date('2026-06-14T00:00:00.000Z');
  const runtime = createFakeRuntime({
    openId: 'system_user',
    now: () => new Date(currentNow.getTime()),
  });
  const cleanupDeletedProfiles = createCloudFunction(
    createCleanupDeletedProfilesHandler({
      db: runtime.db,
      command: runtime.command,
      now: runtime.now,
      logger: { log() {}, error() {} },
    }),
  );

  const recentDeletedAt = new Date(currentNow.getTime() - PROFILE_RETENTION_WINDOW_MS + 1000);
  const expiredDeletedAt = new Date(currentNow.getTime() - PROFILE_RETENTION_WINDOW_MS - 1000);

  await runtime.db.collection(COLLECTIONS.PROFILES).doc('profile_recent').set({
    data: {
      name: '近30天档案',
      createdAt: currentNow,
      updatedAt: currentNow,
      deletedAt: recentDeletedAt,
    },
  });
  await runtime.db.collection(COLLECTIONS.PROFILES).doc('profile_expired').set({
    data: {
      name: '超期档案',
      createdAt: currentNow,
      updatedAt: currentNow,
      deletedAt: expiredDeletedAt,
    },
  });
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc('rel_recent').set({
    data: { userId: 'u1', profileId: 'profile_recent', role: 'owner' },
  });
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc('rel_expired').set({
    data: { userId: 'u2', profileId: 'profile_expired', role: 'owner' },
  });
  await runtime.db.collection(COLLECTIONS.RECORDS).doc('record_recent').set({
    data: { profileId: 'profile_recent', deletedAt: null },
  });
  await runtime.db.collection(COLLECTIONS.RECORDS).doc('record_expired_active').set({
    data: { profileId: 'profile_expired', deletedAt: null },
  });
  await runtime.db.collection(COLLECTIONS.RECORDS).doc('record_expired_deleted').set({
    data: { profileId: 'profile_expired', deletedAt: new Date('2026-05-01T00:00:00.000Z') },
  });
  await runtime.db.collection(COLLECTIONS.MEDICATIONS).doc('med_recent').set({
    data: { profileId: 'profile_recent', deletedAt: null },
  });
  await runtime.db.collection(COLLECTIONS.MEDICATIONS).doc('med_expired').set({
    data: { profileId: 'profile_expired', deletedAt: null },
  });

  const summary = await cleanupDeletedProfiles({}, {});
  assert.strictEqual(summary.success, true);
  assert.strictEqual(summary.processed, 1, 'cleanup should only process expired profiles');
  assert.strictEqual(summary.succeeded, 1);
  assert.strictEqual(summary.failed, 0);
  assert.ok(runtime.db.store[COLLECTIONS.PROFILES].profile_recent, 'recently deleted profile should stay');
  assert.ok(!runtime.db.store[COLLECTIONS.PROFILES].profile_expired, 'expired profile should be removed');
  assert.ok(runtime.db.store[COLLECTIONS.RELATIONSHIPS].rel_recent, 'recent relationship should stay');
  assert.ok(!runtime.db.store[COLLECTIONS.RELATIONSHIPS].rel_expired, 'expired relationship should be removed');
  assert.ok(runtime.db.store[COLLECTIONS.RECORDS].record_recent, 'recent record should stay');
  assert.ok(!runtime.db.store[COLLECTIONS.RECORDS].record_expired_active, 'expired active record should be removed');
  assert.ok(!runtime.db.store[COLLECTIONS.RECORDS].record_expired_deleted, 'expired soft-deleted record should be removed');
  assert.ok(runtime.db.store[COLLECTIONS.MEDICATIONS].med_recent, 'recent medication should stay');
  assert.ok(!runtime.db.store[COLLECTIONS.MEDICATIONS].med_expired, 'expired medication should be removed');

  const rerun = await cleanupDeletedProfiles({}, {});
  assert.strictEqual(rerun.success, true);
  assert.strictEqual(rerun.processed, 0, 'cleanup rerun should be idempotent');
  assert.strictEqual(rerun.failed, 0);
}

async function verifyCleanupFailureIsolation() {
  const currentNow = new Date('2026-06-14T00:00:00.000Z');
  const runtime = createFakeRuntime({
    openId: 'system_user',
    now: () => new Date(currentNow.getTime()),
  });
  const expiredDeletedAt = new Date(currentNow.getTime() - PROFILE_RETENTION_WINDOW_MS - 1000);

  await runtime.db.collection(COLLECTIONS.PROFILES).doc('profile_ok').set({
    data: { name: 'ok', deletedAt: expiredDeletedAt },
  });
  await runtime.db.collection(COLLECTIONS.PROFILES).doc('profile_fail').set({
    data: { name: 'fail', deletedAt: expiredDeletedAt },
  });
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc('rel_ok').set({
    data: { userId: 'u1', profileId: 'profile_ok' },
  });
  await runtime.db.collection(COLLECTIONS.RELATIONSHIPS).doc('rel_fail').set({
    data: { userId: 'u2', profileId: 'profile_fail' },
  });

  const cleanupDeletedProfiles = createCloudFunction(
    createCleanupDeletedProfilesHandler({
      db: runtime.db,
      command: runtime.command,
      now: runtime.now,
      logger: { log() {}, error() {} },
      cleanupProfileData: async (profile) => {
        if (profile._id === 'profile_fail') {
          throw new Error('forced cleanup failure');
        }
        await cleanupExpiredProfileData(runtime.db, profile._id);
      },
    }),
  );

  const summary = await cleanupDeletedProfiles({}, {});
  assert.strictEqual(summary.success, true);
  assert.strictEqual(summary.processed, 2);
  assert.strictEqual(summary.succeeded, 1);
  assert.strictEqual(summary.failed, 1);
  assert.deepStrictEqual(summary.failedProfileIds, ['profile_fail']);
  assert.ok(!runtime.db.store[COLLECTIONS.PROFILES].profile_ok, 'successful cleanup should continue');
  assert.ok(runtime.db.store[COLLECTIONS.PROFILES].profile_fail, 'failed profile should remain for retry');
}

async function main() {
  await verifyRestoreProfile();
  await verifyCleanupDeletedProfiles();
  await verifyCleanupFailureIsolation();

  console.log('verify-profile-deletion-retention: ok');
}

main().catch((error) => {
  console.error('verify-profile-deletion-retention: fail');
  console.error(error);
  process.exitCode = 1;
});
