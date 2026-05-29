const { store } = require('../../store/index');
const profileService = require('../../services/profile-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const { isOwner } = require('../../utils/permission-helpers');
const {
  DEFAULT_BP_THRESHOLD,
  THRESHOLD_LIMITS,
  getThreshold,
  clampThresholdValue,
  validateThresholdValues,
} = require('../../utils/profile-detail');

function showToast(title, duration = 1500) {
  wx.showToast({
    title,
    icon: 'none',
    duration,
  });
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function goBackOrHome() {
  const pages = getCurrentPages();

  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }

  wx.switchTab({
    url: '/pages/profile-home/profile-home',
  });
}

function getCurrentFontScale() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    profileId: '',
    profileName: '当前档案',
    systolicThreshold: DEFAULT_BP_THRESHOLD.systolic,
    diastolicThreshold: DEFAULT_BP_THRESHOLD.diastolic,
    isSaving: false,
    errorText: '',
    systolicMin: THRESHOLD_LIMITS.systolic.min,
    systolicMax: THRESHOLD_LIMITS.systolic.max,
    diastolicMin: THRESHOLD_LIMITS.diastolic.min,
    diastolicMax: THRESHOLD_LIMITS.diastolic.max,
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const profileId = options.profileId || '';
    if (profileId && !isOwner(store.getState(), profileId)) {
      showToast('你没有权限编辑档案');
      goBackOrHome();
      return;
    }

    const profile = findProfile(profileId);
    const threshold = getThreshold(profile);

    this.setData({
      profileId,
      profileName: profile ? profile.name : '当前档案',
      systolicThreshold: threshold.systolic,
      diastolicThreshold: threshold.diastolic,
      errorText: profile ? '' : '档案不存在',
    });
  },

  onShow() {
    this.syncFontScale();
  },

  syncFontScale() {
    syncFontData.call(this);
  },

  validateThresholds() {
    return validateThresholdValues(
      this.data.systolicThreshold,
      this.data.diastolicThreshold,
    );
  },

  handleAdjustSystolic(event) {
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    this.setData({
      systolicThreshold: clampThresholdValue('systolic', this.data.systolicThreshold + delta),
      errorText: '',
    });
  },

  handleAdjustDiastolic(event) {
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    this.setData({
      diastolicThreshold: clampThresholdValue('diastolic', this.data.diastolicThreshold + delta),
      errorText: '',
    });
  },

  handleRestoreDefault() {
    this.setData({
      systolicThreshold: DEFAULT_BP_THRESHOLD.systolic,
      diastolicThreshold: DEFAULT_BP_THRESHOLD.diastolic,
      errorText: '',
    });
  },

  async handleSave() {
    if (!this.data.profileId) {
      showToast('档案不存在');
      return;
    }

    const validationMessage = this.validateThresholds();
    if (validationMessage) {
      this.setData({ errorText: validationMessage });
      return;
    }

    this.setData({
      isSaving: true,
      errorText: '',
    });

    try {
      const patch = {
        bp: {
          threshold: {
            systolic: this.data.systolicThreshold,
            diastolic: this.data.diastolicThreshold,
          },
        },
      };
      const result = await profileService.updateProfileSettings(this.data.profileId, patch);
      const state = store.getState();
      store.setState({
        profiles: (state.profiles || []).map((profile) =>
          profile && profile._id === this.data.profileId ? result.profile : profile
        ),
      });

      wx.showToast({
        title: '已保存',
        icon: 'success',
        duration: 800,
      });
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 800);
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      this.setData({ isSaving: false });
    }
  },
});
