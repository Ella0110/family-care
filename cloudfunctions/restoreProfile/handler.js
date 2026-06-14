const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');

const PROFILE_RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeDate(value) {
  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createRestoreProfileHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function restoreProfileHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const profile = await auth.getProfile(profileId, { includeDeleted: true });

    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist');
    }

    const relationship = await auth.getRelationship(user._id, profileId);
    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    if (!(relationship.permissions && relationship.permissions.canManage === true)) {
      throw createError('FORBIDDEN', 'Only owners can restore this profile');
    }

    if (!profile.deletedAt) {
      throw createError('INVALID_ARGUMENT', 'Profile is not deleted');
    }

    const deletedAt = normalizeDate(profile.deletedAt);
    const currentTime = normalizeDate(now());
    if (!deletedAt || !currentTime) {
      throw createError('INTERNAL_ERROR', 'Profile restore timestamps are invalid');
    }

    if (currentTime.getTime() - deletedAt.getTime() > PROFILE_RESTORE_WINDOW_MS) {
      throw createError('RESTORE_EXPIRED', '档案已超过恢复期，无法恢复');
    }

    await database.collection(COLLECTIONS.PROFILES).doc(profileId).update({
      data: {
        deletedAt: null,
        updatedAt: currentTime,
      },
    });

    return {};
  };
}

module.exports = {
  PROFILE_RESTORE_WINDOW_MS,
  createRestoreProfileHandler,
};
