require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createListMedicationsHandler } = require('../cloudfunctions/listMedications/handler');
const { createSaveMedicationHandler } = require('../cloudfunctions/saveMedication/handler');
const { createDeleteMedicationHandler } = require('../cloudfunctions/deleteMedication/handler');

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
  let tick = 0;
  const runtime = createFakeRuntime({
    openId: 'user_owner',
    now: () => new Date(Date.UTC(2026, 3, 24, 4, 0, tick++)),
  });

  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const listMedications = buildFunction(createListMedicationsHandler, runtime);
  const saveMedication = buildFunction(createSaveMedicationHandler, runtime);
  const deleteMedication = buildFunction(createDeleteMedicationHandler, runtime);

  await login({}, {});
  const createdProfile = await createProfile({ name: '妈妈' }, {});
  const profileId = createdProfile.profile._id;

  const invalidCreate = await saveMedication({
    profileId,
    data: {
      drug: '氯沙坦',
      dose: '50mg',
      frequency: '每日一次',
      startDate: '2026-04-24',
      endDate: '2026-04-24',
    },
  }, {});
  assert.strictEqual(invalidCreate.success, false);
  assert.strictEqual(invalidCreate.code, 'INVALID_ARGUMENT');

  const firstCreate = await saveMedication({
    profileId,
    data: {
      drug: '厄贝沙坦',
      dose: '150mg',
      frequency: '每日一次',
      timing: '早餐后',
      startDate: '2026-04-20',
      note: '早晨服用',
    },
  }, {});
  assert.strictEqual(firstCreate.success, true);
  assert.ok(firstCreate.medication._id.startsWith('m_'));

  const secondCreate = await saveMedication({
    profileId,
    data: {
      drug: '阿司匹林',
      dose: '100mg',
      frequency: '每日一次',
      timing: '睡前',
      startDate: '2026-04-10',
      endDate: '2026-04-25',
    },
  }, {});
  assert.strictEqual(secondCreate.success, true);

  const listedActive = await listMedications({ profileId }, {});
  assert.strictEqual(listedActive.success, true);
  assert.strictEqual(listedActive.activeMedications.length, 2);
  assert.strictEqual(listedActive.historicalMedications.length, 0);
  assert.strictEqual(listedActive.activeMedications[0]._id, secondCreate.medication._id);

  const updatedToHistorical = await saveMedication({
    medicationId: secondCreate.medication._id,
    patch: {
      endDate: '2026-04-23',
      note: '已停用',
    },
  }, {});
  assert.strictEqual(updatedToHistorical.success, true);
  assert.strictEqual(updatedToHistorical.medication.endDate, '2026-04-23');

  const listedSplit = await listMedications({ profileId }, {});
  assert.strictEqual(listedSplit.success, true);
  assert.strictEqual(listedSplit.activeMedications.length, 1);
  assert.strictEqual(listedSplit.historicalMedications.length, 1);
  assert.strictEqual(listedSplit.activeMedications[0]._id, firstCreate.medication._id);
  assert.strictEqual(listedSplit.historicalMedications[0]._id, secondCreate.medication._id);

  const protectedPatch = await saveMedication({
    medicationId: firstCreate.medication._id,
    patch: {
      profileId: 'should_not_change',
    },
  }, {});
  assert.strictEqual(protectedPatch.success, false);
  assert.strictEqual(protectedPatch.code, 'INVALID_ARGUMENT');

  runtime.db.store.relationships = runtime.db.store.relationships || {};
  runtime.db.store.relationships.rel_viewer = {
    _id: 'rel_viewer',
    userId: 'user_viewer',
    profileId,
    role: 'viewer',
    permissions: {
      canView: true,
      canWrite: false,
      canEditProfile: false,
      canInvite: false,
      canManage: false,
    },
    subscribeAlerts: false,
    createdAt: new Date(Date.UTC(2026, 3, 24, 4, 30, 0)),
    acceptedAt: new Date(Date.UTC(2026, 3, 24, 4, 30, 0)),
    invitedBy: null,
  };

  runtime.setOpenId('user_viewer');
  await login({}, {});
  const viewerList = await listMedications({ profileId }, {});
  assert.strictEqual(viewerList.success, true);
  const viewerSave = await saveMedication({
    profileId,
    data: {
      drug: '氨氯地平',
      dose: '5mg',
      frequency: '每日一次',
    },
  }, {});
  assert.strictEqual(viewerSave.success, false);
  assert.strictEqual(viewerSave.code, 'PERMISSION_DENIED');

  runtime.setOpenId('user_outsider');
  await login({}, {});
  const outsiderList = await listMedications({ profileId }, {});
  assert.strictEqual(outsiderList.success, false);
  assert.strictEqual(outsiderList.code, 'RELATIONSHIP_NOT_FOUND');

  runtime.setOpenId('user_owner');
  const missingDelete = await deleteMedication({ medicationId: 'missing_medication' }, {});
  assert.strictEqual(missingDelete.success, false);
  assert.strictEqual(missingDelete.code, 'MEDICATION_NOT_FOUND');

  const deleted = await deleteMedication({ medicationId: firstCreate.medication._id }, {});
  assert.strictEqual(deleted.success, true);

  const listedAfterDelete = await listMedications({ profileId }, {});
  assert.strictEqual(listedAfterDelete.success, true);
  assert.strictEqual(listedAfterDelete.activeMedications.length, 0);
  assert.strictEqual(listedAfterDelete.historicalMedications.length, 1);

  console.log('[verify-medication-crud] pass');
  console.log(
    JSON.stringify(
      {
        profileId,
        activeCount: listedAfterDelete.activeMedications.length,
        historicalCount: listedAfterDelete.historicalMedications.length,
        deletedMedicationId: firstCreate.medication._id,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[verify-medication-crud] fail');
  console.error(error);
  process.exitCode = 1;
});
