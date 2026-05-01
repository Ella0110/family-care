const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const {
  mergeUserSettings,
  normalizeUserSettingsPatch,
  requireUserRecord,
} = require('./_shared/user-settings');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateUserSettingsHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateUserSettingsHandler(event, context) {
    const user = requireUserRecord(await auth.getCurrentUser(event, context));
    const patch = normalizeUserSettingsPatch(event.patch);
    const nextSettings = mergeUserSettings(user.settings, patch);
    const updatedAt = now();

    await database.collection(COLLECTIONS.USERS).doc(user._id).update({
      data: {
        settings: nextSettings,
        updatedAt,
      },
    });

    return {
      user: Object.assign({}, user, {
        settings: nextSettings,
        updatedAt,
      }),
    };
  };
}

module.exports = {
  createUpdateUserSettingsHandler,
};
