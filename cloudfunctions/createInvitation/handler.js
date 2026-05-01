const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const ids = require('./_shared/ids');
const { createError } = require('./_shared/errors');
const {
  normalizeInvitationProfileIds,
  normalizeInvitationRole,
  normalizeInvitationMessage,
  normalizeInviterProfile,
  INVITATION_STATUSES,
} = require('./_shared/invitation-utils');

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {{ db?: any, auth?: any, ids?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createCreateInvitationHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const idTools = deps.ids || ids;
  const now = deps.now || (() => new Date());

  return async function createInvitationHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileIds = normalizeInvitationProfileIds(event.profileIds);
    const defaultRole = normalizeInvitationRole(event.defaultRole);
    const message = normalizeInvitationMessage(event.message);
    const inviterProfile = normalizeInviterProfile(event.inviterProfile);

    for (const profileId of profileIds) {
      try {
        await auth.requirePermission(user._id, profileId, 'canInvite');
      } catch (error) {
        if (
          error &&
          (error.code === 'PERMISSION_DENIED' || error.code === 'RELATIONSHIP_NOT_FOUND')
        ) {
          throw createError(
            'PERMISSION_DENIED',
            `Invite permission is required for profileId ${profileId}`,
          );
        }
        throw error;
      }
    }

    let inviterNickname = user.nickname || null;
    let inviterAvatarUrl = user.avatarUrl || null;
    let shouldSyncInviterProfile = false;

    if (inviterProfile) {
      if (Object.prototype.hasOwnProperty.call(inviterProfile, 'nickname')) {
        inviterNickname = inviterProfile.nickname;
        shouldSyncInviterProfile = true;
      }
      if (Object.prototype.hasOwnProperty.call(inviterProfile, 'avatarUrl')) {
        inviterAvatarUrl = inviterProfile.avatarUrl || null;
        shouldSyncInviterProfile = true;
      }
    }

    if (!inviterNickname) {
      throw createError(
        'NICKNAME_REQUIRED',
        'User nickname is required before creating invitation',
      );
    }

    const timestamp = now();
    if (shouldSyncInviterProfile) {
      await database.collection(COLLECTIONS.USERS).doc(user._id).update({
        data: {
          nickname: inviterNickname,
          avatarUrl: inviterAvatarUrl,
          updatedAt: timestamp,
        },
      });
    }

    const invitationId = idTools.generateInvitationId();
    const token = idTools.generateInvitationToken();
    const expiresAt = new Date(timestamp.getTime() + INVITATION_TTL_MS);
    const invitation = {
      _id: invitationId,
      token,
      status: INVITATION_STATUSES.ACTIVE,
      profileIds,
      defaultRole,
      inviterUserId: user._id,
      inviterNickname,
      inviterAvatarUrl,
      inviteeUserId: null,
      message,
      expiresAt,
      createdAt: timestamp,
      acceptedAt: null,
      revokedAt: null,
    };

    await database.collection(COLLECTIONS.INVITATIONS).doc(invitationId).set({
      data: {
        token: invitation.token,
        status: invitation.status,
        profileIds: invitation.profileIds,
        defaultRole: invitation.defaultRole,
        inviterUserId: invitation.inviterUserId,
        inviterNickname: invitation.inviterNickname,
        inviterAvatarUrl: invitation.inviterAvatarUrl,
        inviteeUserId: invitation.inviteeUserId,
        message: invitation.message,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
      },
    });

    return {
      invitation: {
        token: invitation.token,
        profileIds: invitation.profileIds,
        expiresAt: invitation.expiresAt,
        inviterNickname: invitation.inviterNickname,
        inviterAvatarUrl: invitation.inviterAvatarUrl,
      },
    };
  };
}

module.exports = {
  createCreateInvitationHandler,
};
