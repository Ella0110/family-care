const { store } = require('../../store/index');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function findProfile(profileId) {
  return (store.getState().profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    hasProfile: false,
    profileTitle: '来自儿女的关心',
    profileName: '',
    profiles: [],
    currentProfileId: '',
    showProfileSwitcher: false,
  },

  onLoad() {
    this.lastSeenProfileId = store.getState().currentProfileId || '';
    this.syncFontScale();
    this.syncView();
    this._unsubscribe = store.subscribe((nextState) => {
      const nextProfileId = nextState.currentProfileId || '';
      if (nextProfileId !== this.lastSeenProfileId) {
        this.lastSeenProfileId = nextProfileId;
      }
      this.syncView();
    });
  },

  onShow() {
    this.syncFontScale();
    this.syncView();
  },

  onUnload() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  syncView() {
    const state = store.getState();
    const profiles = Array.isArray(state.profiles) ? state.profiles.slice() : [];
    let currentProfileId = state.currentProfileId || '';

    if (!currentProfileId && profiles.length) {
      store.setCurrentProfileId(profiles[0]._id);
      return;
    }

    const profile = currentProfileId ? findProfile(currentProfileId) : null;
    this.setData({
      profiles,
      currentProfileId,
      hasProfile: Boolean(profile),
      profileName: profile && profile.name ? profile.name : '',
      profileTitle: profile ? `${profile.name}的档案` : '来自儿女的关心',
    });
  },

  handleCreateProfile() {
    wx.navigateTo({
      url: `/pages/profile-edit/profile-edit?mode=create&returnTab=${encodeURIComponent('/pages/profile-home/profile-home')}`,
    });
  },

  handleOpenProfileSwitcher() {
    if (!this.data.profiles.length) {
      return;
    }

    this.setData({ showProfileSwitcher: true });
  },

  handleCloseProfileSwitcher() {
    this.setData({ showProfileSwitcher: false });
  },

  handleSelectProfile(event) {
    const profileId = event.detail && event.detail.profileId;
    if (!profileId) {
      this.setData({ showProfileSwitcher: false });
      return;
    }

    store.setCurrentProfileId(profileId);
    this.setData({ showProfileSwitcher: false });
  },
});
