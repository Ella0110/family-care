const { cloud, db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { DEFAULT_BP_THRESHOLD } = require('./_shared/defaults');
const { SUBSCRIBE_ALERT_TEMPLATE_ID, buildPushData } = require('./_shared/push-helpers');
const { assertNonEmptyString } = require('./_shared/validation');
const { parseClientDateInput } = require('./_shared/time');
const {
  normalizeBpPayload,
  normalizePeriod,
  normalizeRecordNote,
  normalizeRecordType,
} = require('./_shared/record-utils');

/**
 * @param {{ db?: any, cloud?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createSaveRecordHandler(deps = {}) {
  const cloudSdk = deps.cloud || cloud;
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  function resolveMiniprogramState(envVersion) {
    if (envVersion === 'develop') {
      return 'developer';
    }

    if (envVersion === 'trial') {
      return 'trial';
    }

    return 'formal';
  }

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
    const skipPush = event && event.skipPush === true;

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

    const response = {
      record: savedRecord,
      alertTriggered,
      alertSentTo,
    };

    const canSendSubscribeMessage = Boolean(
      cloudSdk &&
      cloudSdk.openapi &&
      cloudSdk.openapi.subscribeMessage &&
      typeof cloudSdk.openapi.subscribeMessage.send === 'function',
    );

    if (!alertTriggered || alertSentTo.length === 0 || skipPush || !canSendSubscribeMessage) {
      if (alertTriggered && alertSentTo.length > 0 && skipPush) {
        console.log('[saveRecord] skip push for imported record', {
          profileId,
          recordId,
        });
      }

      if (alertTriggered && alertSentTo.length > 0 && !skipPush && !canSendSubscribeMessage) {
        console.warn('[saveRecord] subscribeMessage.send unavailable, skip push');
      }

      return response;
    }

    const { templateData, alertLevel, alertType } = buildPushData({
      payload: savedRecord.payload,
      threshold,
      profileName: profile && profile.name,
      measuredAt: savedRecord.measuredAt,
    });

    try {
      const pushResults = await Promise.allSettled(
        alertSentTo.map((userId) =>
          cloudSdk.openapi.subscribeMessage.send({
            touser: userId,
            templateId: SUBSCRIBE_ALERT_TEMPLATE_ID,
            page: 'pages/data/data',
            data: templateData,
            miniprogramState: resolveMiniprogramState(event && event.envVersion),
          }),
        ),
      );

      const pushSummary = pushResults.map((result, index) => {
        const touser = alertSentTo[index];

        if (result.status === 'fulfilled') {
          return {
            touser,
            ok: true,
            errCode: result.value && result.value.errCode,
            errMsg: result.value && result.value.errMsg,
          };
        }

        const errCode = Number(result.reason && result.reason.errCode);
        const errMsg = (result.reason && result.reason.errMsg) || (result.reason && result.reason.message) || '';

        if (errCode !== 43101) {
          console.warn(`[saveRecord] push to ${touser} failed:`, errCode, errMsg);
        }

        return {
          touser,
          ok: false,
          errCode: Number.isNaN(errCode) ? null : errCode,
          errMsg,
          skipped: errCode === 43101,
        };
      });

      console.log(
        '[saveRecord] push results:',
        JSON.stringify({
          profileId,
          recordId,
          alertLevel,
          alertType,
          results: pushSummary,
        }),
      );
    } catch (error) {
      console.error(
        '[saveRecord] push summary failed:',
        error && error.message ? error.message : error,
      );
    }

    return response;
  };
}

module.exports = {
  createSaveRecordHandler,
};
