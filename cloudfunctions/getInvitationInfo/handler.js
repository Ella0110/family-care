const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');
const {
  findInvitationByToken,
  getEffectiveInvitationStatus,
  getInvitationErrorCodeByStatus,
} = require('./_shared/invitation-utils');

async function getLatestBp(database, profileId) {
  const result = await database
    .collection(COLLECTIONS.RECORDS)
    .where({
      profileId,
      type: 'bp',
      deletedAt: null,
    })
    .orderBy('measuredAt', 'desc')
    .limit(1)
    .get();

  const record = result && Array.isArray(result.data) && result.data[0] ? result.data[0] : null;
  if (!record || !record.payload) {
    return null;
  }

  return {
    systolic: record.payload.systolic,
    diastolic: record.payload.diastolic,
    measuredAt: record.measuredAt,
  };
}

function buildInvitationInfo(invitation, profiles, status) {
  return {
    token: invitation.token,
    inviterNickname: invitation.inviterNickname || null,
    inviterAvatarUrl: invitation.inviterAvatarUrl || null,
    profiles,
    defaultRole: invitation.defaultRole,
    message: invitation.message || null,
    status,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createGetInvitationInfoHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function getInvitationInfoHandler(event) {
    const token = assertNonEmptyString(event.token, 'token');
    const invitation = await findInvitationByToken(database, COLLECTIONS.INVITATIONS, token);

    if (!invitation) {
      throw createError('INVITATION_NOT_FOUND', 'Invitation does not exist');
    }

    const profiles = [];
    for (const profileId of invitation.profileIds || []) {
      const profile = await auth.getProfile(profileId, { includeDeleted: true });
      if (!profile) {
        continue;
      }

      profiles.push({
        _id: profile._id,
        name: profile.name,
        relation: profile.relation || null,
        latestBp: await getLatestBp(database, profileId),
      });
    }

    const status = getEffectiveInvitationStatus(invitation, now());
    const info = buildInvitationInfo(invitation, profiles, status);

    if (status !== 'active') {
      throw createError(
        getInvitationErrorCodeByStatus(status),
        `Invitation is ${status}`,
        { invitation: info },
      );
    }

    return {
      invitation: info,
    };
  };
}

module.exports = {
  createGetInvitationInfoHandler,
};
