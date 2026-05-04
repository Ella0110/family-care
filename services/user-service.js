const { call } = require('./request');

/**
 * Updates user-level settings through the unified request layer.
 *
 * @param {{ fontScale?: number, theme?: string|null }} patch
 * @returns {Promise<{ user: Object }>}
 */
async function updateSettings(patch) {
  const result = await call('updateUserSettings', { patch }, { silent: true });
  return {
    user: result.user,
  };
}

/**
 * Updates inviter-facing profile fields such as nickname and avatarUrl.
 *
 * @param {{ nickname?: string, avatarUrl?: string }} patch
 * @returns {Promise<{ user: Object }>}
 */
async function updateProfile(patch) {
  const result = await call('updateUserProfile', { patch }, { silent: true });
  return {
    user: result.user,
  };
}

module.exports = {
  updateSettings,
  updateProfile,
};
