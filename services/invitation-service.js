const { call } = require('./request');

function attachInvitationToError(error) {
  if (error && error.result && error.result.invitation) {
    error.invitation = error.result.invitation;
  }

  return error;
}

async function createInvitation({ profileIds, defaultRole, message, inviterProfile } = {}) {
  try {
    const result = await call('createInvitation', {
      profileIds,
      defaultRole,
      message,
      inviterProfile,
    }, { silent: true });

    return {
      invitation: result.invitation,
    };
  } catch (error) {
    throw attachInvitationToError(error);
  }
}

async function getInvitationInfo(token) {
  try {
    const result = await call('getInvitationInfo', { token }, { silent: true });
    return {
      invitation: result.invitation,
    };
  } catch (error) {
    throw attachInvitationToError(error);
  }
}

async function acceptInvitation(token) {
  try {
    const result = await call('acceptInvitation', { token }, { silent: true });
    return {
      relationships: Array.isArray(result.relationships) ? result.relationships : [],
    };
  } catch (error) {
    throw attachInvitationToError(error);
  }
}

module.exports = {
  createInvitation,
  getInvitationInfo,
  acceptInvitation,
};
