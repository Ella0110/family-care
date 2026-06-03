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
  const _ = database.command;

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

      await database.collection(COLLECTIONS.USERS).doc(openId).set({
        data: {
          openid: user.openid,
          unionid: user.unionid,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastActiveAt: user.lastActiveAt,
          settings: user.settings,
        },
      });
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
    const profileIds = relationships.map((relationship) => relationship.profileId).filter(Boolean);
    let joinedRelationships = [];

    if (profileIds.length > 0) {
      const profilesRes = await database
        .collection(COLLECTIONS.PROFILES)
        .where({
          _id: _.in(profileIds),
          deletedAt: null,
        })
        .limit(500)
        .get();

      const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
      const profileMap = new Map(
        profiles
          .filter((profile) => profile && profile._id)
          .map((profile) => [profile._id, profile]),
      );

      joinedRelationships = relationships
        .map((relationship) => {
          const profile = profileMap.get(relationship.profileId);
          if (!profile) {
            return null;
          }

          return Object.assign({}, relationship, {
            profile,
          });
        })
        .filter(Boolean);
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
