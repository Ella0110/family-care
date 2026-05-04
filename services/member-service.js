const { call } = require('./request');
const { store } = require('../store/index');

function createError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function applyRelationshipUpdateToStore(relationship) {
  if (!relationship || !relationship._id) {
    return store.getState();
  }

  const state = store.getState();
  const nextRelationships = (state.relationships || []).map((item) =>
    item && item._id === relationship._id ? Object.assign({}, item, relationship) : item,
  );

  return store.setState({
    relationships: nextRelationships,
  });
}

function applyRelationshipRemovalToStore({ relationshipId, profileId, userId }) {
  const state = store.getState();
  const currentUserId = state.user && state.user._id;
  const nextRelationships = (state.relationships || []).filter(
    (relationship) => relationship && relationship._id !== relationshipId,
  );

  const nextState = {
    relationships: nextRelationships,
  };

  if (currentUserId && userId === currentUserId) {
    nextState.profiles = (state.profiles || []).filter(
      (profile) => profile && profile._id !== profileId,
    );
  }

  return store.setState(nextState);
}

function applyTransferOwnershipToStore({ profileId, currentOwnerUserId }) {
  const state = store.getState();
  const currentUserId = state.user && state.user._id;

  if (!profileId || !currentOwnerUserId || currentUserId !== currentOwnerUserId) {
    return state;
  }

  const nextRelationships = (state.relationships || []).map((relationship) => {
    if (!relationship || relationship.profileId !== profileId || relationship.userId !== currentOwnerUserId) {
      return relationship;
    }

    return Object.assign({}, relationship, {
      role: 'collaborator',
      permissions: {
        canView: true,
        canWrite: true,
        canEditProfile: false,
        canManage: false,
        canInvite: false,
      },
    });
  });

  return store.setState({
    relationships: nextRelationships,
  });
}

async function listProfileMembers(profileId) {
  const result = await call('listProfileMembers', { profileId }, { silent: true });
  return {
    members: Array.isArray(result.members) ? result.members : [],
  };
}

async function updateRelationship(relationshipId, patch) {
  const result = await call('updateRelationship', { relationshipId, patch }, { silent: true });
  applyRelationshipUpdateToStore(result.relationship);
  return {
    relationship: result.relationship,
  };
}

async function removeRelationship(relationshipId, options = {}) {
  await call('removeRelationship', { relationshipId }, { silent: true });

  if (options.relationship) {
    applyRelationshipRemovalToStore({
      relationshipId,
      profileId: options.relationship.profileId,
      userId: options.relationship.userId,
    });
  }

  return { success: true };
}

async function transferOwnership(profileId, newOwnerUserId) {
  const state = store.getState();
  const currentOwnerUserId = state.user && state.user._id;

  if (!currentOwnerUserId) {
    throw createError('AUTH_REQUIRED');
  }

  if (newOwnerUserId === currentOwnerUserId) {
    throw createError('CANNOT_TRANSFER_TO_SELF');
  }

  await call('transferOwnership', { profileId, newOwnerUserId }, { silent: true });
  applyTransferOwnershipToStore({ profileId, currentOwnerUserId });
  return { success: true };
}

module.exports = {
  listProfileMembers,
  updateRelationship,
  removeRelationship,
  transferOwnership,
  applyRelationshipUpdateToStore,
  applyRelationshipRemovalToStore,
  applyTransferOwnershipToStore,
};
