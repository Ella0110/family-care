const { cloud, db, COLLECTIONS } = require('./db');
const { createError, invalidArgument } = require('./errors');
const { getDocumentOrNull } = require('./documents');

/**
 * @param {{ db: any, cloud: any }} [deps]
 * @returns {Object}
 */
function createAuthService(deps = {}) {
  const database = deps.db || db;
  const cloudSdk = deps.cloud || cloud;

  /**
   * @param {string} profileId
   * @param {{ includeDeleted?: boolean }} [options]
   * @returns {Promise<Object|null>}
   */
  async function getProfile(profileId, options = {}) {
    const { includeDeleted = false } = options;

    if (typeof profileId !== 'string' || !profileId.trim()) {
      throw invalidArgument('profileId must be a non-empty string');
    }

    const profile = await getDocumentOrNull(
      database.collection(COLLECTIONS.PROFILES).doc(profileId),
    );

    if (!profile) {
      return null;
    }

    if (!includeDeleted && profile.deletedAt) {
      return null;
    }

    return profile;
  }

  /**
   * @param {string} profileId
   * @returns {Promise<Object|null>}
   */
  async function getActiveProfile(profileId) {
    return getProfile(profileId, { includeDeleted: false });
  }

  /**
   * Resolves the current user from cloud context. Missing users return null by design so
   * login can create them while other functions can convert the absence into USER_NOT_FOUND.
   *
   * @param {Object} _event
   * @param {Object} _context
   * @returns {Promise<Object|null>}
   */
  async function getCurrentUser(_event, _context) {
    const wxContext = cloudSdk.getWXContext();
    const openId = wxContext && wxContext.OPENID;

    if (!openId) {
      throw createError('USER_NOT_FOUND', 'Current user is not available in cloud context');
    }

    return getDocumentOrNull(database.collection(COLLECTIONS.USERS).doc(openId));
  }

  /**
   * @param {Object} event
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async function requireCurrentUser(event, context) {
    const user = await getCurrentUser(event, context);

    if (!user) {
      throw createError('USER_NOT_FOUND', 'Current user record does not exist');
    }

    return user;
  }

  /**
   * @param {string} userId
   * @param {string} profileId
   * @returns {Promise<Object|null>}
   */
  async function getRelationship(userId, profileId) {
    if (typeof userId !== 'string' || !userId.trim()) {
      throw invalidArgument('userId must be a non-empty string');
    }

    if (typeof profileId !== 'string' || !profileId.trim()) {
      throw invalidArgument('profileId must be a non-empty string');
    }

    const res = await database
      .collection(COLLECTIONS.RELATIONSHIPS)
      .where({ userId, profileId })
      .limit(1)
      .get();

    return res && Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  }

  /**
   * @param {string} userId
   * @param {string} profileId
   * @param {string} permission
   * @returns {Promise<Object>}
   */
  async function requirePermission(userId, profileId, permission) {
    if (typeof permission !== 'string' || !permission.trim()) {
      throw invalidArgument('permission must be a non-empty string');
    }

    const profile = await getActiveProfile(profileId);
    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist or has been deleted');
    }

    const relationship = await getRelationship(userId, profileId);
    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    if (!relationship.permissions || relationship.permissions[permission] !== true) {
      throw createError('PERMISSION_DENIED', `Permission ${permission} is required`);
    }

    return relationship;
  }

  /**
   * @param {string} userId
   * @param {string} profileId
   * @returns {Promise<Object>}
   */
  async function requireOwner(userId, profileId) {
    const profile = await getActiveProfile(profileId);
    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist or has been deleted');
    }

    const relationship = await getRelationship(userId, profileId);
    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    if (relationship.role !== 'owner') {
      throw createError('PERMISSION_DENIED', 'Owner permission is required');
    }

    return relationship;
  }

  /**
   * @param {string} userId
   * @param {string} profileId
   * @param {string} permission
   * @returns {Promise<Object>}
   */
  async function requireOwnerOrPermission(userId, profileId, permission) {
    const profile = await getActiveProfile(profileId);
    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist or has been deleted');
    }

    const relationship = await getRelationship(userId, profileId);
    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    if (relationship.role === 'owner') {
      return relationship;
    }

    if (!relationship.permissions || relationship.permissions[permission] !== true) {
      throw createError('PERMISSION_DENIED', `Owner role or ${permission} permission is required`);
    }

    return relationship;
  }

  return {
    getCurrentUser,
    requireCurrentUser,
    getRelationship,
    getProfile,
    getActiveProfile,
    requirePermission,
    requireOwner,
    requireOwnerOrPermission,
  };
}

const authService = createAuthService();

module.exports = {
  createAuthService,
  getCurrentUser: authService.getCurrentUser,
  requireCurrentUser: authService.requireCurrentUser,
  getRelationship: authService.getRelationship,
  getProfile: authService.getProfile,
  getActiveProfile: authService.getActiveProfile,
  requirePermission: authService.requirePermission,
  requireOwner: authService.requireOwner,
  requireOwnerOrPermission: authService.requireOwnerOrPermission,
};
