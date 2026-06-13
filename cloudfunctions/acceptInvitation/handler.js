const { db, cloud, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const ids = require('./_shared/ids');
const { assertNonEmptyString } = require('./_shared/validation');
const { createError } = require('./_shared/errors');
const {
  findInvitationByToken,
  getEffectiveInvitationStatus,
  getInvitationErrorCodeByStatus,
} = require('./_shared/invitation-utils');
const { getRoleDefaults } = require('./_shared/permissions');

/**
 * @param {{ db?: any, cloud?: any, auth?: any, ids?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createAcceptInvitationHandler(deps = {}) {
  const database = deps.db || db;
  const cloudSdk = deps.cloud || cloud;
  const auth = deps.auth || authModule;
  const idTools = deps.ids || ids;
  const now = deps.now || (() => new Date());

  return async function acceptInvitationHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const token = assertNonEmptyString(event.token, 'token');
    const invitation = await findInvitationByToken(database, COLLECTIONS.INVITATIONS, token);

    if (!invitation) {
      throw createError('INVITATION_NOT_FOUND', 'Invitation does not exist');
    }

    const effectiveStatus = getEffectiveInvitationStatus(invitation, now());
    if (effectiveStatus !== 'active') {
      throw createError(
        getInvitationErrorCodeByStatus(effectiveStatus),
        `Invitation is ${effectiveStatus}`,
      );
    }

    if (user._id === invitation.inviterUserId) {
      throw createError('CANNOT_INVITE_SELF', 'Inviter cannot accept their own invitation');
    }

    const transaction = await database.startTransaction();
    try {
      const txAuth = authModule.createAuthService({ db: transaction, cloud: cloudSdk });
      const currentInvitation = await findInvitationByToken(
        transaction,
        COLLECTIONS.INVITATIONS,
        token,
      );

      if (!currentInvitation) {
        throw createError('INVITATION_NOT_FOUND', 'Invitation does not exist');
      }

      const currentStatus = getEffectiveInvitationStatus(currentInvitation, now());
      if (currentStatus !== 'active') {
        throw createError(
          getInvitationErrorCodeByStatus(currentStatus),
          `Invitation is ${currentStatus}`,
        );
      }

      const timestamp = now();
      const roleDefaults = getRoleDefaults(currentInvitation.defaultRole);
      const relationships = [];

      for (const profileId of currentInvitation.profileIds || []) {
        const profile = await txAuth.getActiveProfile(profileId);
        if (!profile) {
          throw createError('PROFILE_NOT_FOUND', `Profile ${profileId} does not exist`);
        }

        const existingRelationship = await txAuth.getRelationship(user._id, profileId);
        if (existingRelationship) {
          throw createError('ALREADY_MEMBER', `User already belongs to profile ${profileId}`);
        }

        const relationshipId = idTools.generateRelationshipId();
        const relationship = {
          _id: relationshipId,
          userId: user._id,
          profileId,
          role: roleDefaults.role,
          permissions: roleDefaults.permissions,
          subscribeAlerts: roleDefaults.subscribeAlerts,
          subscribeAuthStatus: null,
          displayName: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          acceptedAt: timestamp,
          invitedBy: currentInvitation.inviterUserId,
          inviterNickname: currentInvitation.inviterNickname || null,
        };

        await transaction.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipId).set({
          data: {
            userId: relationship.userId,
            profileId: relationship.profileId,
            role: relationship.role,
            permissions: relationship.permissions,
            subscribeAlerts: relationship.subscribeAlerts,
            subscribeAuthStatus: relationship.subscribeAuthStatus,
            displayName: relationship.displayName,
            createdAt: relationship.createdAt,
            updatedAt: relationship.updatedAt,
            acceptedAt: relationship.acceptedAt,
            invitedBy: relationship.invitedBy,
            inviterNickname: relationship.inviterNickname,
          },
        });

        relationships.push(relationship);
      }

      await transaction.collection(COLLECTIONS.INVITATIONS).doc(currentInvitation._id).update({
        data: {
          status: 'used',
          inviteeUserId: user._id,
          acceptedAt: timestamp,
        },
      });

      await transaction.commit();
      return { relationships };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };
}

module.exports = {
  createAcceptInvitationHandler,
};
