const { call } = require('./request');

/**
 * Creates a profile through the unified request layer.
 *
 * @param {{ name: string, relation?: string, gender?: string, birthDate?: string, note?: string }} data
 * @returns {Promise<{ profile: Object, relationship: Object }>}
 */
async function createProfile(data) {
  const result = await call('createProfile', data, { silent: true });

  return {
    profile: result.profile,
    relationship: result.relationship,
  };
}

/**
 * Updates a profile through the unified request layer.
 *
 * @param {string} profileId
 * @param {Object} patch
 * @returns {Promise<{ profile: Object }>}
 */
async function updateProfile(profileId, patch) {
  const result = await call('updateProfile', { profileId, patch }, { silent: true });

  return {
    profile: result.profile,
  };
}

/**
 * Updates profile settings through the unified request layer.
 *
 * @param {string} profileId
 * @param {Object} patch
 * @returns {Promise<{ profile: Object }>}
 */
async function updateProfileSettings(profileId, patch) {
  const result = await call('updateProfileSettings', { profileId, patch }, { silent: true });

  return {
    profile: result.profile,
  };
}

/**
 * Soft-deletes a profile through the unified request layer.
 *
 * @param {string} profileId
 * @returns {Promise<{ success: boolean }>}
 */
async function deleteProfile(profileId) {
  await call('deleteProfile', { profileId }, { silent: true });
  return { success: true };
}

module.exports = {
  createProfile,
  updateProfile,
  updateProfileSettings,
  deleteProfile,
};
