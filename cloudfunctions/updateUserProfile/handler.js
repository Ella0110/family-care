const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const {
  normalizeUserProfilePatch,
  requireUserRecord,
} = require('./_shared/user-profile');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateUserProfileHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateUserProfileHandler(event, context) {
    const user = requireUserRecord(await auth.getCurrentUser(event, context));
    const patch = normalizeUserProfilePatch(event.patch);
    const updatedAt = now();

    const nextUser = Object.assign({}, user, patch, {
      updatedAt,
    });

    await database.collection(COLLECTIONS.USERS).doc(user._id).update({
      data: Object.assign({}, patch, {
        updatedAt,
      }),
    });

    return {
      user: nextUser,
    };
  };
}

module.exports = {
  createUpdateUserProfileHandler,
};
