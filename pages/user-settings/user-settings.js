const userService = require('../../services/user-service');
const { store } = require('../../store/index');
const { getErrorMessage } = require('../../utils/error-messages');
const {
  buildInvitationNicknameInitial,
  normalizeGrantedUserProfile,
} = require('../../utils/invitation');
const {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_OPTIONS,
  FONT_SCALE_LABELS,
  buildFontScaleStyle,
  isValidFontScale,
  normalizeFontScale,
} = require('../../utils/font-scale');

function getAppFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function getSelectedLabel(fontScale) {
  return FONT_SCALE_LABELS[normalizeFontScale(fontScale)] || FONT_SCALE_LABELS[DEFAULT_FONT_SCALE];
}

function getCurrentUserProfileSummary() {
  const state = store.getState();
  const user = state.user || {};
  const normalized = normalizeGrantedUserProfile({
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  });

  return {
    nickname: normalized ? normalized.nickname : '未填写昵称',
    avatarUrl: normalized ? normalized.avatarUrl || '' : '',
    avatarFallback: buildInvitationNicknameInitial(normalized ? normalized.nickname : '', '我'),
    hasValidProfile: Boolean(normalized),
  };
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fontScaleStyle: buildFontScaleStyle(DEFAULT_FONT_SCALE),
    selectedFontScale: DEFAULT_FONT_SCALE,
    selectedLabel: getSelectedLabel(DEFAULT_FONT_SCALE),
    fontScaleOptions: FONT_SCALE_OPTIONS.map((value) => ({
      value,
      label: FONT_SCALE_LABELS[value],
    })),
    profileSummary: getCurrentUserProfileSummary(),
  },

  onLoad() {
    this.settingsRequestId = 0;
    this.syncFontScale();
  },

  onShow() {
    this.syncFontScale();
    this.syncProfileSummary();
  },

  syncFontScale() {
    const fontScale = getAppFontScale();
    this.setData({
      fontScale,
      fontScaleStyle: buildFontScaleStyle(fontScale),
      selectedFontScale: fontScale,
      selectedLabel: getSelectedLabel(fontScale),
    });
  },

  syncProfileSummary() {
    this.setData({
      profileSummary: getCurrentUserProfileSummary(),
    });
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  handleOpenUserProfileEdit() {
    wx.navigateTo({
      url: '/pages/user-profile-edit/user-profile-edit',
    });
  },

  applyScaleLocally(fontScale) {
    const app = getApp();
    const nextScale = normalizeFontScale(fontScale);

    app.applyFontScale(nextScale, {
      persist: true,
      syncStoreUser: true,
    });

    this.setData({
      fontScale: nextScale,
      fontScaleStyle: buildFontScaleStyle(nextScale),
      selectedFontScale: nextScale,
      selectedLabel: getSelectedLabel(nextScale),
    });
  },

  async handleSelectScale(event) {
    const fontScale = Number(event.currentTarget.dataset.scale);
    if (!isValidFontScale(fontScale)) {
      return;
    }

    if (normalizeFontScale(this.data.selectedFontScale) === fontScale) {
      return;
    }

    this.settingsRequestId += 1;
    const requestId = this.settingsRequestId;
    this.applyScaleLocally(fontScale);

    try {
      const result = await userService.updateSettings({ fontScale });
      if (requestId !== this.settingsRequestId) {
        return;
      }

      store.setState({
        user: result.user,
      });
      this.applyScaleLocally(result.user.settings && result.user.settings.fontScale);
    } catch (error) {
      if (requestId !== this.settingsRequestId) {
        return;
      }

      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    }
  },
});
