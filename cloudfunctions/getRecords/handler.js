const { db, command, COLLECTIONS } = require('../_shared/db');
const authModule = require('../_shared/auth');
const { createError } = require('../_shared/errors');
const { assertNonEmptyString, normalizeNumberInRange } = require('../_shared/validation');
const { parseOptionalClientDateInput } = require('../_shared/time');
const { normalizeRecordType } = require('../_shared/record-utils');

/**
 * @param {{ db?: any, command?: any, auth?: any }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createGetRecordsHandler(deps = {}) {
  const database = deps.db || db;
  const dbCommand = deps.command || command;
  const auth = deps.auth || authModule;

  return async function getRecordsHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const type = normalizeRecordType(event.type);
    const limit =
      event.limit === undefined || event.limit === null || event.limit === ''
        ? 200
        : normalizeNumberInRange(event.limit, 'limit', { min: 1, max: 500, integer: true });
    const since = parseOptionalClientDateInput(event.since, 'since');
    const until = parseOptionalClientDateInput(event.until, 'until');

    if (since && until && since.getTime() > until.getTime()) {
      throw createError('INVALID_ARGUMENT', 'since must be earlier than or equal to until');
    }

    await auth.requirePermission(user._id, profileId, 'canView');

    const where = {
      profileId,
      type,
      deletedAt: null,
    };

    if (since && until) {
      where.measuredAt = dbCommand.and([dbCommand.gte(since), dbCommand.lte(until)]);
    } else if (since) {
      where.measuredAt = dbCommand.gte(since);
    } else if (until) {
      where.measuredAt = dbCommand.lte(until);
    }

    const recordsRes = await database
      .collection(COLLECTIONS.RECORDS)
      .where(where)
      .orderBy('measuredAt', 'desc')
      .limit(limit + 1)
      .get();

    const records = Array.isArray(recordsRes.data) ? recordsRes.data : [];

    return {
      records: records.slice(0, limit),
      hasMore: records.length > limit,
    };
  };
}

module.exports = {
  createGetRecordsHandler,
};
