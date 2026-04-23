const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { parseClientDateInput } = require('./_shared/time');
const { createError } = require('./_shared/errors');
const { normalizeRecordPatch } = require('./_shared/record-utils');
const { canModifyRecord } = require('./_shared/record-permissions');
const { getDocumentOrNull } = require('./_shared/documents');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateRecordHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateRecordHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const recordId = assertNonEmptyString(event.recordId, 'recordId');
    const record = await getDocumentOrNull(
      database.collection(COLLECTIONS.RECORDS).doc(recordId),
    );

    if (!record || record.deletedAt) {
      throw createError('RECORD_NOT_FOUND', 'Record does not exist');
    }

    const profile = await auth.getActiveProfile(record.profileId);
    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist or has been deleted');
    }

    const relationship = await auth.getRelationship(user._id, record.profileId);
    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    if (!canModifyRecord(relationship, record)) {
      throw createError('PERMISSION_DENIED', 'Record update permission is denied');
    }

    const patch = normalizeRecordPatch(event.patch, parseClientDateInput);
    const nextRecord = Object.assign({}, record, patch, {
      updatedAt: now(),
    });

    await database.collection(COLLECTIONS.RECORDS).doc(recordId).update({
      data: Object.assign({}, patch, { updatedAt: nextRecord.updatedAt }),
    });

    return {
      record: nextRecord,
    };
  };
}

module.exports = {
  createUpdateRecordHandler,
};
