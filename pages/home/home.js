const { store } = require('../../store/index');

function getLoginStatus() {
  const app = getApp();
  const globalData = (app && app.globalData) || {};

  return {
    isLoginReady: globalData.loginReady === true,
    isLoginFailed: Boolean(globalData.loginError),
  };
}

Page({
  data: {
    profiles: [],
    firstProfile: null,
    hasProfiles: false,
    isLoginReady: false,
    isLoginFailed: false,
    isRetrying: false,
  },

  onLoad() {
    this.unsubscribeStore = store.subscribe((nextState) => {
      this.renderState(nextState);
    });
    this.renderState();
  },

  onShow() {
    this.renderState();
  },

  onUnload() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  },

  renderState(nextState) {
    const state = nextState || store.getState();
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const loginStatus = getLoginStatus();

    this.setData({
      profiles,
      firstProfile: profiles[0] || null,
      hasProfiles: profiles.length > 0,
      isLoginReady: loginStatus.isLoginReady,
      isLoginFailed: loginStatus.isLoginFailed,
    });
  },

  handleCreateProfile() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit?mode=create',
    });
  },

  async handleRetryLogin() {
    const app = getApp();

    if (!app || typeof app.login !== 'function') {
      wx.showToast({
        title: '请重新打开小程序',
        icon: 'none',
      });
      return;
    }

    this.setData({ isRetrying: true });

    try {
      await app.login();
      this.renderState();
    } catch (error) {
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none',
      });
    } finally {
      this.setData({ isRetrying: false });
    }
  },
});
