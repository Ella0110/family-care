const { call } = require('./services/request');
const { store } = require('./store/index');

let localConfig = null;

try {
  localConfig = require('./local.config');
} catch (error) {
  localConfig = null;
}

/**
 * Splits joined login payload into store-friendly user, profiles, and relationships.
 *
 * @param {{ user?: Object, relationships?: Array<Object> }} [result={}]
 * @returns {{ user: Object|null, profiles: Array<Object>, relationships: Array<Object>, currentProfileId: string|null }}
 */
function normalizeLoginPayload(result = {}) {
  const profiles = [];
  const relationships = Array.isArray(result.relationships)
    ? result.relationships.map((item) => {
        const nextItem = Object.assign({}, item);

        if (nextItem.profile) {
          profiles.push(nextItem.profile);
          delete nextItem.profile;
        }

        return nextItem;
      })
    : [];

  return {
    user: result.user || null,
    profiles,
    relationships,
    currentProfileId: profiles[0] ? profiles[0]._id : null,
  };
}

App({
  globalData: {
    store,
  },

  async onLaunch() {
    if (!wx.cloud) {
      console.error('wx.cloud is not available in the current environment.');
      return;
    }

    this.globalData.store = store;

    try {
      wx.cloud.init({
        env: (localConfig && localConfig.envId) || 'YOUR_ENV_ID',
        traceUser: true,
      });
    } catch (error) {
      console.warn('Cloud init skipped during T0 bootstrap.', error);
      return;
    }

    try {
      const result = await call('login', {}, { silent: true });
      store.setState(normalizeLoginPayload(result));
    } catch (error) {
      console.warn('Initial login skipped during T0 bootstrap.', error);
    }
  },
});
