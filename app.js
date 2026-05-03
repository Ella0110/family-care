const { call } = require('./services/request');
const userService = require('./services/user-service');
const { store } = require('./store/index');
const {
  DEFAULT_FONT_SCALE,
  normalizeFontScale,
  persistLocalFontScale,
  readLocalFontScale,
  resolveFontScaleSync,
} = require('./utils/font-scale');
const {
  getInviteLaunchToken,
  normalizeGrantedUserProfile,
} = require('./utils/invitation');

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

function pickGrantedUserProfile(user) {
  if (!user || !user.nickname) {
    return null;
  }

  return {
    nickname: user.nickname,
    avatarUrl: user.avatarUrl || '',
  };
}

App({
  globalData: {
    store,
    loginReady: false,
    loginError: null,
    fontScale: DEFAULT_FONT_SCALE,
    userProfileGranted: false,
    userProfile: null,
    inviteLaunchToken: null,
  },

  onShow() {
    store.resetSessionDismissals();
  },

  applyFontScale(fontScale, options = {}) {
    const { persist = true, syncStoreUser = true } = options;
    const nextFontScale = normalizeFontScale(fontScale);

    this.globalData.fontScale = nextFontScale;
    if (persist) {
      persistLocalFontScale(nextFontScale);
    }

    if (syncStoreUser) {
      const state = store.getState();
      if (state.user) {
        store.setState({
          user: Object.assign({}, state.user, {
            settings: Object.assign({}, state.user.settings || {}, {
              fontScale: nextFontScale,
            }),
          }),
        });
      }
    }

    return nextFontScale;
  },

  cacheGrantedUserProfile(profile) {
    const normalized = normalizeGrantedUserProfile(profile);
    if (!normalized) {
      return null;
    }

    this.globalData.userProfileGranted = true;
    this.globalData.userProfile = normalized;

    const state = store.getState();
    if (state.user) {
      store.setState({
        user: Object.assign({}, state.user, {
          nickname: normalized.nickname,
          avatarUrl: normalized.avatarUrl || state.user.avatarUrl || '',
        }),
      });
    }

    return normalized;
  },

  syncUserProfileGrantState(user) {
    const grantedProfile = pickGrantedUserProfile(user);
    this.globalData.userProfileGranted = Boolean(grantedProfile);
    this.globalData.userProfile = grantedProfile;
  },

  async syncFontScaleWithUser(user) {
    const localFontScale = readLocalFontScale();
    const remoteFontScale = user && user.settings ? user.settings.fontScale : null;
    const decision = resolveFontScaleSync({
      localFontScale,
      remoteFontScale,
    });

    this.applyFontScale(decision.fontScale, {
      persist: decision.shouldPersistLocal,
      syncStoreUser: true,
    });

    if (decision.shouldSyncRemote) {
      try {
        const result = await userService.updateSettings({ fontScale: decision.fontScale });
        store.setState({
          user: result.user,
        });
      } catch (error) {
        console.warn('Font scale sync failed during login.', error);
      }
    }
  },

  async login() {
    try {
      const result = await call('login', {}, { silent: true });
      const nextState = normalizeLoginPayload(result);

      this.globalData.loginReady = true;
      this.globalData.loginError = null;
      store.setState(nextState);
      this.syncUserProfileGrantState(nextState.user);
      await this.syncFontScaleWithUser(nextState.user);

      return nextState;
    } catch (error) {
      this.globalData.loginReady = true;
      this.globalData.loginError = error;
      this.syncUserProfileGrantState(null);
      store.setState({
        user: null,
        profiles: [],
        relationships: [],
        currentProfileId: null,
      });

      throw error;
    }
  },

  async onLaunch(options = {}) {
    if (!wx.cloud) {
      console.error('wx.cloud is not available in the current environment.');
      this.globalData.loginReady = true;
      this.globalData.loginError = new Error('wx.cloud is not available');
      return;
    }

    this.globalData.store = store;
    this.globalData.fontScale = readLocalFontScale() || DEFAULT_FONT_SCALE;
    this.globalData.inviteLaunchToken = getInviteLaunchToken(options);
    if (this.globalData.inviteLaunchToken) {
      console.log('[invite] cold start with token:', this.globalData.inviteLaunchToken);
    }

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
