/**
 * @typedef {Object} CloudContext
 * @property {string=} OPENID
 * @property {string=} APPID
 * @property {string=} UNIONID
 */

/**
 * @typedef {Object} RelationshipPermissions
 * @property {boolean} canView
 * @property {boolean} canWrite
 * @property {boolean} canEditProfile
 * @property {boolean} canInvite
 * @property {boolean} canManage
 */

/**
 * @typedef {Object} UserRecord
 * @property {string} _id
 * @property {string} openid
 * @property {string=} unionid
 * @property {string=} nickname
 * @property {string=} avatarUrl
 * @property {*} createdAt
 * @property {*} updatedAt
 * @property {*} lastActiveAt
 * @property {{ fontScale?: number, theme?: string }=} settings
 */

/**
 * @typedef {Object} RelationshipRecord
 * @property {string} _id
 * @property {string} userId
 * @property {string} profileId
 * @property {'owner'|'collaborator'|'viewer'} role
 * @property {RelationshipPermissions} permissions
 * @property {boolean} subscribeAlerts
 * @property {string=} displayName
 * @property {*} createdAt
 * @property {*} acceptedAt
 * @property {string=} invitedBy
 */

class AuthError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class PermissionDeniedError extends AuthError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super('PERMISSION_DENIED', message);
  }
}

class NotImplementedInT0Error extends AuthError {
  constructor() {
    super('NOT_IMPLEMENTED', 'Not implemented in T0, will be done in T1');
  }
}

/**
 * Resolves the current mini-program user from cloud context.
 *
 * @param {CloudContext} [context] Optional cloud context override for testing or custom entry points.
 * @returns {Promise<UserRecord|null>} The matching user document, or `null` when the openid has not been created yet.
 * @throws {AuthError} When context is invalid or the lookup fails.
 */
async function getCurrentUser(context) {
  void context;
  throw new NotImplementedInT0Error();
}

/**
 * Ensures a user has the required permission on a profile.
 *
 * @param {string} userId Current user id.
 * @param {string} profileId Target profile id.
 * @param {keyof RelationshipPermissions} permission Permission flag to validate.
 * @returns {Promise<RelationshipRecord>} The matched relationship document when permission passes.
 * @throws {PermissionDeniedError} When the relationship is missing or the permission is false.
 * @throws {AuthError} When input is invalid or the lookup fails.
 */
async function requirePermission(userId, profileId, permission) {
  void userId;
  void profileId;
  void permission;
  throw new NotImplementedInT0Error();
}

/**
 * Ensures the user is the owner of a profile.
 *
 * @param {string} userId Current user id.
 * @param {string} profileId Target profile id.
 * @returns {Promise<RelationshipRecord>} The matched owner relationship document when validation passes.
 * @throws {PermissionDeniedError} When the relationship is missing or the role is not `owner`.
 * @throws {AuthError} When input is invalid or the lookup fails.
 */
async function requireOwner(userId, profileId) {
  void userId;
  void profileId;
  throw new NotImplementedInT0Error();
}

module.exports = {
  AuthError,
  PermissionDeniedError,
  NotImplementedInT0Error,
  getCurrentUser,
  requirePermission,
  requireOwner,
};
