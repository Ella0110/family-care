const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createDeleteProfileHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function deleteProfileHandler(event, context) {
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

    if (relationship.role !== 'owner') {
      throw createError('PERMISSION_DENIED', 'Owner permission is required');
    }

    if (profile.deletedAt) {
      return {};
    }

    const timestamp = now();
    await database.collection(COLLECTIONS.PROFILES).doc(profileId).update({
      data: {
        deletedAt: timestamp,
        updatedAt: timestamp,
      },
    });

    return {};
  };
}

module.exports = {
  createDeleteProfileHandler,
};
