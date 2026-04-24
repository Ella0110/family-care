const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { getTodayInChinaTimezone } = require('./_shared/time');

function splitMedicationsByStatus(medications, todayInChina) {
  return (medications || []).reduce(
    (accumulator, medication) => {
      const endDate = medication && medication.endDate;
      const isActive = !endDate || endDate > todayInChina;

      if (isActive) {
        accumulator.activeMedications.push(medication);
      } else {
        accumulator.historicalMedications.push(medication);
      }

      return accumulator;
    },
    {
      activeMedications: [],
      historicalMedications: [],
    },
  );
}

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createListMedicationsHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function listMedicationsHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');

    await auth.requirePermission(user._id, profileId, 'canView');

    const medicationsRes = await database
      .collection(COLLECTIONS.MEDICATIONS)
      .where({
        profileId,
        deletedAt: null,
      })
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const medications = Array.isArray(medicationsRes.data) ? medicationsRes.data : [];
    const todayInChina = getTodayInChinaTimezone(now());

    return splitMedicationsByStatus(medications, todayInChina);
  };
}

module.exports = {
  splitMedicationsByStatus,
  createListMedicationsHandler,
};
