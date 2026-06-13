const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { compareRelationshipRoles } = require('./_shared/permissions');
const { getDocumentOrNull } = require('./_shared/documents');

/**
 * @param {{ db?: any, auth?: any }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createListProfileMembersHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;

  return async function listProfileMembersHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');

    await auth.requirePermission(user._id, profileId, 'canView');

    const relationshipsResult = await database
      .collection(COLLECTIONS.RELATIONSHIPS)
      .where({ profileId })
      .limit(500)
      .get();

    const relationships = Array.isArray(relationshipsResult.data)
      ? relationshipsResult.data.slice()
      : [];

    relationships.sort((left, right) => {
      const roleCompare = compareRelationshipRoles(left.role, right.role);
      if (roleCompare !== 0) {
        return roleCompare;
      }

      const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : 0;
      const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : 0;
      return leftTime - rightTime;
    });

    const userMap = {};
    await Promise.all(
      relationships.map(async (relationship) => {
        if (userMap[relationship.userId]) {
          return;
        }
        userMap[relationship.userId] = await getDocumentOrNull(
          database.collection(COLLECTIONS.USERS).doc(relationship.userId),
        );
      }),
    );

    return {
      members: relationships.map((relationship) => ({
        relationship: {
          _id: relationship._id,
          role: relationship.role,
          permissions: relationship.permissions,
          subscribeAlerts: relationship.subscribeAlerts,
          subscribeAuthStatus: relationship.subscribeAuthStatus || null,
          inviterNickname: relationship.inviterNickname || null,
          createdAt: relationship.createdAt,
        },
        user: {
          _id: relationship.userId,
          nickname: userMap[relationship.userId]
            ? userMap[relationship.userId].nickname || null
            : null,
          avatarUrl: userMap[relationship.userId]
            ? userMap[relationship.userId].avatarUrl || null
            : null,
        },
      })),
    };
  };
}

module.exports = {
  createListProfileMembersHandler,
};
