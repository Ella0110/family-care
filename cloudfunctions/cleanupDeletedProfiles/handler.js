const { db, COLLECTIONS } = require('./_shared/db');

const PROFILE_RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_BATCH_LIMIT = 20;
const CHILD_BATCH_LIMIT = 100;

function normalizeDate(value) {
  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function removeCollectionDocumentsByProfileId(
  database,
  collectionName,
  profileId,
  batchLimit = CHILD_BATCH_LIMIT,
) {
  let removed = 0;

  while (true) {
    const result = await database
      .collection(collectionName)
      .where({ profileId })
      .limit(batchLimit)
      .get();
    const documents = Array.isArray(result.data) ? result.data.filter(Boolean) : [];

    if (documents.length === 0) {
      break;
    }

    for (const document of documents) {
      if (!document._id) {
        continue;
      }
      await database.collection(collectionName).doc(document._id).remove();
      removed += 1;
    }

    if (documents.length < batchLimit) {
      break;
    }
  }

  return removed;
}

async function cleanupExpiredProfileData(database, profileId) {
  await removeCollectionDocumentsByProfileId(database, COLLECTIONS.RELATIONSHIPS, profileId);
  await removeCollectionDocumentsByProfileId(database, COLLECTIONS.RECORDS, profileId);
  await removeCollectionDocumentsByProfileId(database, COLLECTIONS.MEDICATIONS, profileId);
  await database.collection(COLLECTIONS.PROFILES).doc(profileId).remove();
}

/**
 * @param {{ db?: any, now?: () => Date, logger?: Console, command?: any, batchLimit?: number, cleanupProfileData?: Function }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createCleanupDeletedProfilesHandler(deps = {}) {
  const database = deps.db || db;
  const now = deps.now || (() => new Date());
  const logger = deps.logger || console;
  const command = deps.command || database.command;
  const batchLimit = deps.batchLimit || PROFILE_BATCH_LIMIT;
  const cleanupProfileData =
    deps.cleanupProfileData || ((profile) => cleanupExpiredProfileData(database, profile._id));

  return async function cleanupDeletedProfilesHandler(_event, _context) {
    const currentTime = normalizeDate(now());
    if (!currentTime) {
      throw new Error('cleanupDeletedProfiles requires a valid current time');
    }

    const cutoff = new Date(currentTime.getTime() - PROFILE_RETENTION_WINDOW_MS);
    const deletedAtFilter =
      command && typeof command.and === 'function' && typeof command.gte === 'function'
        ? command.and([command.gte(new Date(0)), command.lte(cutoff)])
        : cutoff;

    const result = await database
      .collection(COLLECTIONS.PROFILES)
      .where({ deletedAt: deletedAtFilter })
      .orderBy('deletedAt', 'asc')
      .limit(batchLimit)
      .get();

    const profiles = (Array.isArray(result.data) ? result.data : []).filter((profile) => {
      const deletedAt = normalizeDate(profile && profile.deletedAt);
      return Boolean(deletedAt) && deletedAt.getTime() <= cutoff.getTime();
    });

    let succeeded = 0;
    let failed = 0;
    const failedProfileIds = [];

    for (const profile of profiles) {
      try {
        await cleanupProfileData(profile);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        failedProfileIds.push(profile._id);
        logger.error('[cleanupDeletedProfiles] failed', {
          profileId: profile._id,
          message: error && error.message ? error.message : String(error),
        });
      }
    }

    const summary = {
      processed: profiles.length,
      succeeded,
      failed,
      failedProfileIds,
    };

    logger.log('[cleanupDeletedProfiles] summary', summary);
    return summary;
  };
}

module.exports = {
  CHILD_BATCH_LIMIT,
  PROFILE_BATCH_LIMIT,
  PROFILE_RETENTION_WINDOW_MS,
  cleanupExpiredProfileData,
  createCleanupDeletedProfilesHandler,
  removeCollectionDocumentsByProfileId,
};
