const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { normalizeProfilePatch } = require('./_shared/profile-utils');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateProfileHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateProfileHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const patch = normalizeProfilePatch(event.patch);

    await auth.requireOwnerOrPermission(user._id, profileId, 'canEditProfile');
    const profile = await auth.getActiveProfile(profileId);

    const nextProfile = Object.assign({}, profile, patch, {
      updatedAt: now(),
    });

    await database.collection(COLLECTIONS.PROFILES).doc(profileId).update({
      data: Object.assign({}, patch, { updatedAt: nextProfile.updatedAt }),
    });

    return {
      profile: nextProfile,
    };
  };
}

module.exports = {
  createUpdateProfileHandler,
};
