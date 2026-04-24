const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');
const { getDocumentOrNull } = require('./_shared/documents');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createDeleteMedicationHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function deleteMedicationHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const medicationId = assertNonEmptyString(event.medicationId, 'medicationId');
    const medication = await getDocumentOrNull(
      database.collection(COLLECTIONS.MEDICATIONS).doc(medicationId),
    );

    if (!medication || medication.deletedAt) {
      throw createError('MEDICATION_NOT_FOUND', 'Medication does not exist');
    }

    const relationship = await auth.getRelationship(user._id, medication.profileId);
    const canWrite = Boolean(
      relationship &&
      relationship.permissions &&
      relationship.permissions.canWrite === true,
    );
    const isAddedByCurrentUser = medication.addedBy === user._id;

    if (!canWrite && !isAddedByCurrentUser) {
      throw createError('PERMISSION_DENIED', 'Medication delete permission is denied');
    }

    const profile = await auth.getActiveProfile(medication.profileId);
    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist or has been deleted');
    }

    const timestamp = now();
    await database.collection(COLLECTIONS.MEDICATIONS).doc(medicationId).update({
      data: {
        deletedAt: timestamp,
        updatedAt: timestamp,
      },
    });

    return {};
  };
}

module.exports = {
  createDeleteMedicationHandler,
};
