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
const GRANTED_USER_PROFILE_STORAGE_KEY = 'grantedUserProfile';

try {
  localConfig = require('./local.config');
} catch (error) {
  localConfig = null;
}

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

function buildInviterProfileFromUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return normalizeGrantedUserProfile({
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  });
}

function readGrantedUserProfileFromStorage() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
    return null;
  }

  try {
    return normalizeGrantedUserProfile(wx.getStorageSync(GRANTED_USER_PROFILE_STORAGE_KEY));
  } catch (error) {
    console.warn('Read granted user profile from storage failed.', error);
    return null;
  }
}

function persistGrantedUserProfileToStorage(profile) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
    return;
  }

  try {
    wx.setStorageSync(GRANTED_USER_PROFILE_STORAGE_KEY, profile);
  } catch (error) {
    console.warn('Persist granted user profile failed.', error);
  }
}

function clearGrantedUserProfileFromStorage() {
  if (typeof wx === 'undefined' || typeof wx.removeStorageSync !== 'function') {
    return;
  }

  try {
    wx.removeStorageSync(GRANTED_USER_PROFILE_STORAGE_KEY);
  } catch (error) {
    console.warn('Clear granted user profile failed.', error);
  }
}

function applyGrantedUserProfileState(app, profile) {
  const normalized = normalizeGrantedUserProfile(profile);
  if (!normalized) {
    app.globalData.userProfileGranted = false;
    app.globalData.userProfile = null;
    return null;
  }

  app.globalData.userProfileGranted = true;
  app.globalData.userProfile = normalized;
  return normalized;
}

function syncGrantedUserProfileStateFromStorage(app) {
  const cachedProfile = readGrantedUserProfileFromStorage();
  const normalized = applyGrantedUserProfileState(app, cachedProfile);
  if (!normalized) {
    clearGrantedUserProfileFromStorage();
  }
  return normalized;
}

function syncGrantedUserProfileIntoStore(profile) {
  const normalized = normalizeGrantedUserProfile(profile);
  if (!normalized) {
    return null;
  }

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
}

function cacheGrantedUserProfile(app, profile) {
  const normalized = applyGrantedUserProfileState(app, profile);
  if (!normalized) {
    clearGrantedUserProfileFromStorage();
    return null;
  }

  persistGrantedUserProfileToStorage(normalized);
  syncGrantedUserProfileIntoStore(normalized);
  return {
    nickname: normalized.nickname,
    avatarUrl: normalized.avatarUrl || '',
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
    return cacheGrantedUserProfile(this, profile);
  },

  syncUserProfileGrantState() {
    syncGrantedUserProfileStateFromStorage(this);
  },

  syncInviterProfileState(user) {
    const normalizedFromUser = buildInviterProfileFromUser(user);
    if (normalizedFromUser) {
      cacheGrantedUserProfile(this, normalizedFromUser);
      return normalizedFromUser;
    }

    if (user && user._id) {
      clearGrantedUserProfileFromStorage();
      applyGrantedUserProfileState(this, null);
      return null;
    }

    return syncGrantedUserProfileStateFromStorage(this);
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
      this.syncInviterProfileState(nextState.user);
      await this.syncFontScaleWithUser(nextState.user);

      return nextState;
    } catch (error) {
      this.globalData.loginReady = true;
      this.globalData.loginError = error;
      this.syncInviterProfileState(null);
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
    this.syncInviterProfileState();
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
