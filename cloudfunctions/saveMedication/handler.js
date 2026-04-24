const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const ids = require('./_shared/ids');
const { createError, invalidArgument } = require('./_shared/errors');
const { assertNonEmptyString } = require('./_shared/validation');
const {
  validateMedicationDateRange,
  normalizeCreateMedicationData,
  normalizeMedicationPatch,
} = require('./_shared/medication-utils');
const { getDocumentOrNull } = require('./_shared/documents');

/**
 * @param {{ db?: any, auth?: any, ids?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createSaveMedicationHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const idTools = deps.ids || ids;
  const now = deps.now || (() => new Date());

  return async function saveMedicationHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const hasMedicationId = event.medicationId !== undefined && event.medicationId !== null && event.medicationId !== '';
    const hasProfileId = event.profileId !== undefined && event.profileId !== null && event.profileId !== '';

    if (hasMedicationId && hasProfileId) {
      throw invalidArgument('saveMedication must use either create mode or update mode');
    }

    if (!hasMedicationId && !hasProfileId) {
      throw invalidArgument('saveMedication requires profileId for create or medicationId for update');
    }

    if (hasMedicationId) {
      const medicationId = assertNonEmptyString(event.medicationId, 'medicationId');
      const medication = await getDocumentOrNull(
        database.collection(COLLECTIONS.MEDICATIONS).doc(medicationId),
      );

      if (!medication || medication.deletedAt) {
        throw createError('MEDICATION_NOT_FOUND', 'Medication does not exist');
      }

      await auth.requirePermission(user._id, medication.profileId, 'canWrite');

      const patch = normalizeMedicationPatch(event.patch);
      const nextMedication = Object.assign({}, medication, patch);
      validateMedicationDateRange(nextMedication.startDate, nextMedication.endDate);

      const updatedAt = now();
      await database.collection(COLLECTIONS.MEDICATIONS).doc(medicationId).update({
        data: Object.assign({}, patch, {
          updatedAt,
        }),
      });

      return {
        medication: Object.assign({}, nextMedication, {
          updatedAt,
        }),
      };
    }

    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    await auth.requirePermission(user._id, profileId, 'canWrite');

    const data = normalizeCreateMedicationData(event.data);
    const timestamp = now();
    const medicationId = idTools.generateMedicationId();
    const medication = {
      _id: medicationId,
      profileId,
      drug: data.drug,
      dose: data.dose,
      frequency: data.frequency,
      timing: data.timing,
      startDate: data.startDate,
      endDate: data.endDate,
      note: data.note,
      addedBy: user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    await database.collection(COLLECTIONS.MEDICATIONS).doc(medicationId).set({
      data: {
        profileId: medication.profileId,
        drug: medication.drug,
        dose: medication.dose,
        frequency: medication.frequency,
        timing: medication.timing,
        startDate: medication.startDate,
        endDate: medication.endDate,
        note: medication.note,
        addedBy: medication.addedBy,
        createdAt: medication.createdAt,
        updatedAt: medication.updatedAt,
        deletedAt: medication.deletedAt,
      },
    });

    return {
      medication,
    };
  };
}

module.exports = {
  createSaveMedicationHandler,
};
