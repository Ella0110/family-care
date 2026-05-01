const { db, cloud, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');
const { getRoleDefaults } = require('./_shared/permissions');

/**
 * @param {{ db?: any, cloud?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createTransferOwnershipHandler(deps = {}) {
  const database = deps.db || db;
  const cloudSdk = deps.cloud || cloud;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function transferOwnershipHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const newOwnerUserId = assertNonEmptyString(event.newOwnerUserId, 'newOwnerUserId');

    if (newOwnerUserId === user._id) {
      throw createError('INVALID_ARGUMENT', 'newOwnerUserId cannot be the current owner');
    }

    const currentOwnerRelationship = await auth.requireOwner(user._id, profileId);
    const targetRelationship = await auth.getRelationship(newOwnerUserId, profileId);

    if (!targetRelationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'New owner must already be a member');
    }

    const transaction = await database.startTransaction();
    try {
      const timestamp = now();
      const collaboratorDefaults = getRoleDefaults('collaborator');
      const ownerDefaults = getRoleDefaults('owner');

      await transaction
        .collection(COLLECTIONS.RELATIONSHIPS)
        .doc(currentOwnerRelationship._id)
        .update({
          data: {
            role: collaboratorDefaults.role,
            permissions: collaboratorDefaults.permissions,
            updatedAt: timestamp,
          },
        });

      await transaction
        .collection(COLLECTIONS.RELATIONSHIPS)
        .doc(targetRelationship._id)
        .update({
          data: {
            role: ownerDefaults.role,
            permissions: ownerDefaults.permissions,
            updatedAt: timestamp,
          },
        });

      await transaction.commit();
      return {};
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };
}

module.exports = {
  createTransferOwnershipHandler,
};
