const { db, COLLECTIONS } = require('../_shared/db');
const authModule = require('../_shared/auth');
const { assertNonEmptyString } = require('../_shared/validation');
const { parseClientDateInput } = require('../_shared/time');
const { createError } = require('../_shared/errors');
const { normalizeRecordPatch } = require('../_shared/record-utils');

/**
 * @param {Object} relationship
 * @param {Object} record
 * @returns {boolean}
 */
function canModifyRecord(relationship, record) {
  if (!relationship) {
    return false;
  }

  if (relationship.role === 'owner') {
    return true;
  }

  if (relationship.permissions && relationship.permissions.canManage === true) {
    return true;
  }

  return Boolean(
    relationship.permissions &&
      relationship.permissions.canWrite === true &&
      record.recordedBy === relationship.userId,
  );
}

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
    const recordRes = await database.collection(COLLECTIONS.RECORDS).doc(recordId).get();
    const record = recordRes && recordRes.data ? recordRes.data : null;

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
  canModifyRecord,
};
