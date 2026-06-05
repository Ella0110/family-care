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
const CURRENT_PROFILE_STORAGE_KEY = 'currentProfileId';
const LAST_SELECTED_PROFILE_STORAGE_KEY = 'lastSelectedProfileId';
const LAUNCH_ROUTE = 'pages/launch/launch';
const LAUNCH_URL = '/pages/launch/launch';
const PROFILE_SELECTOR_ROUTE = 'pages/profile-selector/profile-selector';
const PROFILE_SELECTOR_URL = '/pages/profile-selector/profile-selector';

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

function readCurrentProfileIdFromStorage() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
    return null;
  }

  try {
    const profileId = wx.getStorageSync(CURRENT_PROFILE_STORAGE_KEY);
    return typeof profileId === 'string' && profileId ? profileId : null;
  } catch (error) {
    console.warn('Read current profile id from storage failed.', error);
    return null;
  }
}

function readLastSelectedProfileIdFromStorage() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
    return null;
  }

  try {
    const profileId = wx.getStorageSync(LAST_SELECTED_PROFILE_STORAGE_KEY);
    return typeof profileId === 'string' && profileId ? profileId : null;
  } catch (error) {
    console.warn('Read last selected profile id from storage failed.', error);
    return null;
  }
}

function persistLastSelectedProfileIdToStorage(profileId) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
    return;
  }

  try {
    wx.setStorageSync(LAST_SELECTED_PROFILE_STORAGE_KEY, profileId);
  } catch (error) {
    console.warn('Persist last selected profile id failed.', error);
  }
}

function clearLastSelectedProfileIdFromStorage() {
  if (typeof wx === 'undefined' || typeof wx.removeStorageSync !== 'function') {
    return;
  }

  try {
    wx.removeStorageSync(LAST_SELECTED_PROFILE_STORAGE_KEY);
  } catch (error) {
    console.warn('Clear last selected profile id failed.', error);
  }
}

function persistCurrentProfileIdToStorage(profileId) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
    return;
  }

  try {
    wx.setStorageSync(CURRENT_PROFILE_STORAGE_KEY, profileId);
  } catch (error) {
    console.warn('Persist current profile id failed.', error);
  }
}

function clearCurrentProfileIdFromStorage() {
  if (typeof wx === 'undefined' || typeof wx.removeStorageSync !== 'function') {
    return;
  }

  try {
    wx.removeStorageSync(CURRENT_PROFILE_STORAGE_KEY);
  } catch (error) {
    console.warn('Clear current profile id failed.', error);
  }
}

function pickInitialCurrentProfileId(profiles, preferredProfileId) {
  const validIds = (Array.isArray(profiles) ? profiles : [])
    .map((profile) => profile && profile._id)
    .filter(Boolean);

  if (!validIds.length) {
    return null;
  }

  if (preferredProfileId && validIds.includes(preferredProfileId)) {
    return preferredProfileId;
  }

  return validIds[0] || null;
}

function hasProfileId(profiles, profileId) {
  if (!profileId) {
    return false;
  }

  return (Array.isArray(profiles) ? profiles : []).some(
    (profile) => profile && profile._id === profileId,
  );
}

function getCurrentRoute() {
  if (typeof getCurrentPages !== 'function') {
    return '';
  }

  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  return currentPage && currentPage.route ? currentPage.route : '';
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
    openRecordPanelOnDataTab: false,
    memberListDirty: false,
  },

  onShow() {
    store.resetSessionDismissals();
    this.routeToProfileSelectorIfNeeded(store.getState());
  },

  initCurrentProfilePersistence() {
    if (this.currentProfileUnsubscribe) {
      return;
    }

    this.lastPersistedCurrentProfileId = readCurrentProfileIdFromStorage();

    this.currentProfileUnsubscribe = store.subscribe((nextState) => {
      const nextProfileId = nextState.currentProfileId || null;
      if (nextProfileId === this.lastPersistedCurrentProfileId) {
        return;
      }

      this.lastPersistedCurrentProfileId = nextProfileId;

      if (nextProfileId) {
        persistCurrentProfileIdToStorage(nextProfileId);
        return;
      }

      clearCurrentProfileIdFromStorage();
    });
  },

  requestOpenRecordPanelOnDataTab() {
    this.globalData.openRecordPanelOnDataTab = true;
  },

  consumePendingRecordPanelOpen() {
    const pending = Boolean(this.globalData.openRecordPanelOnDataTab);
    this.globalData.openRecordPanelOnDataTab = false;
    return pending;
  },

  readLastSelectedProfileId() {
    return readLastSelectedProfileIdFromStorage();
  },

  persistLastSelectedProfileId(profileId) {
    if (!profileId) {
      clearLastSelectedProfileIdFromStorage();
      return;
    }

    persistLastSelectedProfileIdToStorage(profileId);
  },

  clearLastSelectedProfileId() {
    clearLastSelectedProfileIdFromStorage();
  },

  routeToProfileSelectorIfNeeded(nextState = store.getState()) {
    if (!this.globalData.loginReady) {
      return false;
    }

    const currentRoute = getCurrentRoute();
    if (
      currentRoute
      && currentRoute !== 'pages/data/data'
      && currentRoute !== 'pages/profile-home/profile-home'
      && currentRoute !== LAUNCH_ROUTE
      && currentRoute !== PROFILE_SELECTOR_ROUTE
    ) {
      return false;
    }

    if (currentRoute === 'pages/invite-accept/invite-accept') {
      return false;
    }

    const profiles = Array.isArray(nextState && nextState.profiles)
      ? nextState.profiles
      : [];
    if (profiles.length < 2) {
      return false;
    }

    const lastSelectedProfileId = readLastSelectedProfileIdFromStorage();
    if (hasProfileId(profiles, lastSelectedProfileId)) {
      if ((nextState.currentProfileId || null) !== lastSelectedProfileId) {
        store.setCurrentProfileId(lastSelectedProfileId);
      }
      return false;
    }

    clearLastSelectedProfileIdFromStorage();

    if (currentRoute === PROFILE_SELECTOR_ROUTE) {
      return false;
    }

    wx.reLaunch({
      url: PROFILE_SELECTOR_URL,
    });
    return true;
  },

  markMemberListDirty() {
    this.globalData.memberListDirty = true;
  },

  hasPendingMemberListRefresh() {
    return Boolean(this.globalData.memberListDirty);
  },

  consumePendingMemberListRefresh() {
    const pending = Boolean(this.globalData.memberListDirty);
    this.globalData.memberListDirty = false;
    return pending;
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

  async resumeLaunchRouting() {
    if (this.launchRoutingPromise) {
      return this.launchRoutingPromise;
    }

    this.launchRoutingPromise = (async () => {
      const currentRoute = getCurrentRoute();
      if (currentRoute && currentRoute !== LAUNCH_ROUTE) {
        return false;
      }

      try {
        let nextState = store.getState();
        if (!(this.globalData.loginReady && !this.globalData.loginError && nextState.user)) {
          nextState = await this.login();
        }

        const wentToSelector = this.routeToProfileSelectorIfNeeded(nextState);
        const activeRoute = getCurrentRoute();
        if (!wentToSelector && (!activeRoute || activeRoute === LAUNCH_ROUTE)) {
          wx.switchTab({
            url: '/pages/data/data',
          });
        }
        return true;
      } catch (error) {
        console.warn('Launch routing failed.', error);
        return false;
      } finally {
        this.launchRoutingPromise = null;
      }
    })();

    return this.launchRoutingPromise;
  },

  async login(options = {}) {
    const preserveCurrentProfileId = options && options.preserveCurrentProfileId === true;
    try {
      const result = await call('login', {}, { silent: true });
      const nextState = normalizeLoginPayload(result);
      const previousState = store.getState();
      const storedCurrentProfileId = readCurrentProfileIdFromStorage();
      const lastSelectedProfileId = readLastSelectedProfileIdFromStorage();

      if (preserveCurrentProfileId) {
        const currentProfileId = previousState.currentProfileId;
        const hasCurrentProfile = currentProfileId
          && nextState.profiles.some((profile) => profile && profile._id === currentProfileId);

        if (hasCurrentProfile) {
          nextState.currentProfileId = currentProfileId;
        }
      }

      if (!nextState.currentProfileId) {
        if (nextState.profiles.length >= 2) {
          nextState.currentProfileId = hasProfileId(nextState.profiles, lastSelectedProfileId)
            ? lastSelectedProfileId
            : null;
        } else {
          nextState.currentProfileId = pickInitialCurrentProfileId(
            nextState.profiles,
            lastSelectedProfileId || storedCurrentProfileId,
          );
        }
      }

      this.globalData.loginReady = true;
      this.globalData.loginError = null;
      store.setState(nextState);
      store.markRefreshed('profiles');
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
    this.initCurrentProfilePersistence();
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

    await this.resumeLaunchRouting();
  },
});
