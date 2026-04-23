const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const ids = require('./_shared/ids');
const { getDefaultProfileSettings, getRoleDefaults } = require('./_shared/defaults');
const { normalizeCreateProfileInput } = require('./_shared/profile-utils');

/**
 * @param {{ db?: any, auth?: any, ids?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createCreateProfileHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const idTools = deps.ids || ids;
  const now = deps.now || (() => new Date());

  return async function createProfileHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const input = normalizeCreateProfileInput(event);
    const timestamp = now();
    const profileId = idTools.generateProfileId();
    const relationshipId = idTools.generateRelationshipId();
    const ownerDefaults = getRoleDefaults('owner');

    const profile = {
      _id: profileId,
      name: input.name,
      relation: input.relation,
      gender: input.gender,
      birthDate: input.birthDate,
      note: input.note,
      emergencyContact: null,
      createdBy: user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      settings: getDefaultProfileSettings(),
    };

    const relationship = {
      _id: relationshipId,
      userId: user._id,
      profileId,
      role: ownerDefaults.role,
      permissions: ownerDefaults.permissions,
      subscribeAlerts: ownerDefaults.subscribeAlerts,
      displayName: null,
      createdAt: timestamp,
      acceptedAt: timestamp,
      invitedBy: null,
    };

    const transaction = await database.startTransaction();
    try {
      await transaction.collection(COLLECTIONS.PROFILES).doc(profileId).set({
        data: {
          name: profile.name,
          relation: profile.relation,
          gender: profile.gender,
          birthDate: profile.birthDate,
          note: profile.note,
          emergencyContact: profile.emergencyContact,
          createdBy: profile.createdBy,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          deletedAt: profile.deletedAt,
          settings: profile.settings,
        },
      });
      await transaction.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipId).set({
        data: {
          userId: relationship.userId,
          profileId: relationship.profileId,
          role: relationship.role,
          permissions: relationship.permissions,
          subscribeAlerts: relationship.subscribeAlerts,
          displayName: relationship.displayName,
          createdAt: relationship.createdAt,
          acceptedAt: relationship.acceptedAt,
          invitedBy: relationship.invitedBy,
        },
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return {
      profile,
      relationship,
    };
  };
}

module.exports = {
  createCreateProfileHandler,
};
