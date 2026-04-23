const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { mergeProfileSettings, normalizeProfileSettingsPatch } = require('./_shared/profile-utils');

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateProfileSettingsHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateProfileSettingsHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const patch = normalizeProfileSettingsPatch(event.patch);

    await auth.requireOwnerOrPermission(user._id, profileId, 'canManage');
    const profile = await auth.getActiveProfile(profileId);

    const nextProfile = Object.assign({}, profile, {
      settings: mergeProfileSettings(profile.settings || {}, patch),
      updatedAt: now(),
    });

    await database.collection(COLLECTIONS.PROFILES).doc(profileId).update({
      data: {
        settings: nextProfile.settings,
        updatedAt: nextProfile.updatedAt,
      },
    });

    return {
      profile: nextProfile,
    };
  };
}

module.exports = {
  createUpdateProfileSettingsHandler,
};
