const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { DEFAULT_BP_THRESHOLD } = require('./_shared/defaults');
const { assertNonEmptyString } = require('./_shared/validation');
const { parseClientDateInput } = require('./_shared/time');
const {
  normalizeBpPayload,
  normalizePeriod,
  normalizeRecordNote,
  normalizeRecordType,
} = require('./_shared/record-utils');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createSaveRecordHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function saveRecordHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const type = normalizeRecordType(event.type);

    await auth.requirePermission(user._id, profileId, 'canWrite');

    const measuredAt = parseClientDateInput(event.measuredAt, 'measuredAt');
    const payload = normalizeBpPayload(event.payload);
    const period = normalizePeriod(event.period);
    const note = normalizeRecordNote(event.note);
    const timestamp = now();
    const profile = await auth.getActiveProfile(profileId);

    const record = {
      profileId,
      type,
      measuredAt,
      period,
      payload,
      note,
      recordedBy: user._id,
      recordedByName: user.nickname || null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    const writeRes = await database.collection(COLLECTIONS.RECORDS).add({ data: record });
    const recordId = writeRes && (writeRes._id || writeRes.id);
    const savedRecord = Object.assign({ _id: recordId }, record);

    const threshold =
      (profile && profile.settings && profile.settings.bp && profile.settings.bp.threshold) || DEFAULT_BP_THRESHOLD;
    const alertTriggered =
      payload.systolic > threshold.systolic || payload.diastolic > threshold.diastolic;

    let alertSentTo = [];
    if (alertTriggered) {
      const relationshipsRes = await database
        .collection(COLLECTIONS.RELATIONSHIPS)
        .where({ profileId, subscribeAlerts: true })
        .limit(500)
        .get();

      alertSentTo = (relationshipsRes.data || []).map((relationship) => relationship.userId);
    }

    return {
      record: savedRecord,
      alertTriggered,
      alertSentTo,
    };
  };
}

module.exports = {
  createSaveRecordHandler,
};
