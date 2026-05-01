const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertAllowedKeys, assertNonEmptyString, assertPlainObject } = require('./_shared/validation');
const { createError, invalidArgument } = require('./_shared/errors');
const { getRoleDefaults } = require('./_shared/permissions');
const { getDocumentOrNull } = require('./_shared/documents');

function normalizeRelationshipPatch(value) {
  const patch = assertPlainObject(value, 'patch');
  assertAllowedKeys(patch, ['role', 'subscribeAlerts'], 'patch');

  if (Object.keys(patch).length === 0) {
    throw invalidArgument('patch must contain at least one editable field');
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(patch, 'role')) {
    const role = assertNonEmptyString(patch.role, 'patch.role');
    if (role !== 'collaborator' && role !== 'viewer') {
      throw invalidArgument('patch.role must be one of: collaborator, viewer');
    }
    normalized.role = role;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'subscribeAlerts')) {
    if (typeof patch.subscribeAlerts !== 'boolean') {
      throw invalidArgument('patch.subscribeAlerts must be a boolean');
    }
    normalized.subscribeAlerts = patch.subscribeAlerts;
  }

  return normalized;
}

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateRelationshipHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateRelationshipHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const relationshipId = assertNonEmptyString(event.relationshipId, 'relationshipId');
    const relationship = await getDocumentOrNull(
      database.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipId),
    );

    if (!relationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    const profile = await auth.getActiveProfile(relationship.profileId);
    if (!profile) {
      throw createError('PROFILE_NOT_FOUND', 'Profile does not exist or has been deleted');
    }

    const requesterRelationship = await auth.getRelationship(user._id, relationship.profileId);
    if (!requesterRelationship) {
      throw createError('RELATIONSHIP_NOT_FOUND', 'Relationship does not exist');
    }

    const patch = normalizeRelationshipPatch(event.patch);
    const isSelf = relationship.userId === user._id;
    const isOwner = requesterRelationship.role === 'owner';

    if (Object.prototype.hasOwnProperty.call(patch, 'role')) {
      if (!isOwner || isSelf) {
        throw createError(
          'PERMISSION_DENIED',
          'Only an owner can update another member role',
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'subscribeAlerts') && !isOwner && !isSelf) {
      throw createError(
        'PERMISSION_DENIED',
        'Only owners can update other members alert settings',
      );
    }

    const nextRelationship = Object.assign({}, relationship, {
      updatedAt: now(),
    });
    const updateData = {
      updatedAt: nextRelationship.updatedAt,
    };

    if (Object.prototype.hasOwnProperty.call(patch, 'role')) {
      const roleDefaults = getRoleDefaults(patch.role);
      nextRelationship.role = roleDefaults.role;
      nextRelationship.permissions = roleDefaults.permissions;
      updateData.role = nextRelationship.role;
      updateData.permissions = nextRelationship.permissions;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'subscribeAlerts')) {
      nextRelationship.subscribeAlerts = patch.subscribeAlerts;
      updateData.subscribeAlerts = patch.subscribeAlerts;
    }

    await database.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipId).update({
      data: updateData,
    });

    return {
      relationship: nextRelationship,
    };
  };
}

module.exports = {
  createUpdateRelationshipHandler,
};
