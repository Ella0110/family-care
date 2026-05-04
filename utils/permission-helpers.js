function getCurrentRelationship(state, profileId) {
  if (!state || !profileId) {
    return null;
  }

  const userId = state.user && state.user._id;
  if (!userId) {
    return null;
  }

  return (state.relationships || []).find(
    (relationship) =>
      relationship &&
      relationship.profileId === profileId &&
      relationship.userId === userId,
  ) || null;
}

function hasPermission(state, profileId, permission) {
  const relationship = getCurrentRelationship(state, profileId);
  return Boolean(
    relationship &&
    relationship.permissions &&
    relationship.permissions[permission],
  );
}

function isOwner(state, profileId) {
  const relationship = getCurrentRelationship(state, profileId);
  return Boolean(relationship && relationship.role === 'owner');
}

function isCollaborator(state, profileId) {
  const relationship = getCurrentRelationship(state, profileId);
  return Boolean(relationship && relationship.role === 'collaborator');
}

function isViewer(state, profileId) {
  const relationship = getCurrentRelationship(state, profileId);
  return Boolean(relationship && relationship.role === 'viewer');
}

function canWrite(state, profileId) {
  return hasPermission(state, profileId, 'canWrite');
}

function canManage(state, profileId) {
  return hasPermission(state, profileId, 'canManage');
}

function canInvite(state, profileId) {
  return hasPermission(state, profileId, 'canInvite');
}

function canEditProfile(state, profileId) {
  return hasPermission(state, profileId, 'canEditProfile');
}

module.exports = {
  getCurrentRelationship,
  hasPermission,
  isOwner,
  isCollaborator,
  isViewer,
  canWrite,
  canManage,
  canInvite,
  canEditProfile,
};
