const { db, COLLECTIONS } = require('../_shared/db');
const authModule = require('../_shared/auth');
const { assertNonEmptyString } = require('../_shared/validation');
const { createError } = require('../_shared/errors');
const { canModifyRecord } = require('../updateRecord/handler');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createDeleteRecordHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function deleteRecordHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const recordId = assertNonEmptyString(event.recordId, 'recordId');
    const recordRes = await database.collection(COLLECTIONS.RECORDS).doc(recordId).get();
    const record = recordRes && recordRes.data ? recordRes.data : null;

    if (!record) {
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
      throw createError('PERMISSION_DENIED', 'Record delete permission is denied');
    }

    if (record.deletedAt) {
      return {};
    }

    const timestamp = now();
    await database.collection(COLLECTIONS.RECORDS).doc(recordId).update({
      data: {
        deletedAt: timestamp,
        updatedAt: timestamp,
      },
    });

    return {};
  };
}

module.exports = {
  createDeleteRecordHandler,
};
