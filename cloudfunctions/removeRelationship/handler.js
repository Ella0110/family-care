const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');
const { getDocumentOrNull } = require('./_shared/documents');

/**
 * @param {{ db?: any, auth?: any }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createRemoveRelationshipHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;

  return async function removeRelationshipHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const relationshipId = assertNonEmptyString(event.relationshipId, 'relationshipId');
    const relationship = await getDocumentOrNull(
      database.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipId),
    );

    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    const requesterRelationship = await auth.getRelationship(user._id, relationship.profileId);
    if (!requesterRelationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    const isOwner = requesterRelationship.role === 'owner';
    const isSelf = relationship.userId === user._id;

    if (!isOwner && !isSelf) {
      throw createError('PERMISSION_DENIED', 'Relationship removal permission is denied');
    }

    if (relationship.role === 'owner') {
      const ownersResult = await database
        .collection(COLLECTIONS.RELATIONSHIPS)
        .where({
          profileId: relationship.profileId,
          role: 'owner',
        })
        .limit(50)
        .get();

      const owners = Array.isArray(ownersResult.data) ? ownersResult.data : [];
      if (owners.length <= 1) {
        throw createError(
          'LAST_OWNER_CANNOT_LEAVE',
          'The last owner cannot leave the profile',
        );
      }
    }

    await database.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipId).remove();
    return {};
  };
}

module.exports = {
  createRemoveRelationshipHandler,
};
