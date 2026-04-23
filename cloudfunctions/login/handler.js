const { cloud, db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { getDefaultUserSettings } = require('./_shared/defaults');
const { createError } = require('./_shared/errors');

/**
 * @param {{ db?: any, cloud?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createLoginHandler(deps = {}) {
  const database = deps.db || db;
  const cloudSdk = deps.cloud || cloud;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function loginHandler(event, context) {
    void event;

    const timestamp = now();
    const wxContext = cloudSdk.getWXContext();
    const openId = wxContext && wxContext.OPENID;
    const unionId = wxContext && wxContext.UNIONID;

    if (!openId) {
      throw createError('USER_NOT_FOUND', 'Current user is not available in cloud context');
    }

    let user = await auth.getCurrentUser(event, context);

    if (!user) {
      user = {
        _id: openId,
        openid: openId,
        unionid: unionId || null,
        nickname: null,
        avatarUrl: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastActiveAt: timestamp,
        settings: getDefaultUserSettings(),
      };

      await database.collection(COLLECTIONS.USERS).doc(openId).set({ data: user });
    } else {
      user = Object.assign({}, user, {
        unionid: user.unionid || unionId || null,
        updatedAt: timestamp,
        lastActiveAt: timestamp,
      });

      await database.collection(COLLECTIONS.USERS).doc(openId).update({
        data: {
          unionid: user.unionid,
          updatedAt: user.updatedAt,
          lastActiveAt: user.lastActiveAt,
        },
      });
    }

    const relationshipsRes = await database
      .collection(COLLECTIONS.RELATIONSHIPS)
      .where({ userId: openId })
      .limit(500)
      .get();

    const relationships = Array.isArray(relationshipsRes.data) ? relationshipsRes.data : [];
    const joinedRelationships = [];

    for (const relationship of relationships) {
      const profile = await auth.getActiveProfile(relationship.profileId);
      if (!profile) {
        continue;
      }

      joinedRelationships.push(
        Object.assign({}, relationship, {
          profile,
        }),
      );
    }

    return {
      user,
      relationships: joinedRelationships,
    };
  };
}

module.exports = {
  createLoginHandler,
};
