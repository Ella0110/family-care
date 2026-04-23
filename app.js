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
    currentProfileId: null,
  };
}

App({
  globalData: {
    store,
    loginReady: false,
    loginError: null,
  },

  async login() {
    try {
      const result = await call('login', {}, { silent: true });
      const nextState = normalizeLoginPayload(result);

      this.globalData.loginReady = true;
      this.globalData.loginError = null;
      store.setState(nextState);

      return nextState;
    } catch (error) {
      this.globalData.loginReady = true;
      this.globalData.loginError = error;
      store.setState({
        user: null,
        profiles: [],
        relationships: [],
        currentProfileId: null,
      });

      throw error;
    }
  },

  async onLaunch() {
    if (!wx.cloud) {
      console.error('wx.cloud is not available in the current environment.');
      this.globalData.loginReady = true;
      this.globalData.loginError = new Error('wx.cloud is not available');
      return;
    }

    this.globalData.store = store;

    try {
      wx.cloud.init({
        env: (localConfig && localConfig.envId) || 'YOUR_ENV_ID',
        traceUser: true,
      });
    } catch (error) {
      this.globalData.loginReady = true;
      this.globalData.loginError = error;
      console.warn('Cloud init failed.', error);
      return;
    }

    try {
      await this.login();
    } catch (error) {
      console.warn('Initial login failed.', error);
    }
  },
});
