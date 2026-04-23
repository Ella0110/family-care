const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && value.$date) {
    return new Date(value.$date);
  }

  return new Date(value);
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatMeasuredAt(value) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = new Date();

  if (isSameDay(date, today)) {
    return `今天 ${time}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

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
    referenceLines: getReferenceLines(),
    hasProfiles: false,
    hasLatestRecord: false,
    latestRecord: null,
    latestRecordDisplay: null,
    isLoadingLatestRecord: false,
    latestRecordError: '',
    isLoginReady: false,
    isLoginFailed: false,
    isRetrying: false,
  },

  onLoad() {
    this.unsubscribeStore = store.subscribe((nextState) => {
      this.renderState(nextState);
      this.loadLatestRecord();
    });
    this.renderState();
  },

  onShow() {
    this.renderState();
    this.loadLatestRecord();
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
    const firstProfile = profiles[0] || null;
    const loginStatus = getLoginStatus();

    this.setData({
      profiles,
      firstProfile,
      referenceLines: getReferenceLines(firstProfile && firstProfile.settings && firstProfile.settings.bp && firstProfile.settings.bp.referenceLines),
      hasProfiles: profiles.length > 0,
      isLoginReady: loginStatus.isLoginReady,
      isLoginFailed: loginStatus.isLoginFailed,
    });
  },

  formatLatestRecord(record, profile) {
    const payload = (record && record.payload) || {};
    const referenceLines = getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines);
    const status = getBPStatusDisplay(payload.systolic, payload.diastolic, referenceLines);

    return {
      systolic: payload.systolic,
      diastolic: payload.diastolic,
      heartRate: payload.heartRate || null,
      measuredAtText: formatMeasuredAt(record.measuredAt),
      statusLabel: status.detail ? `${status.label}${status.detail}` : status.label,
      statusLevel: status.level,
      statusClassName: status.className,
    };
  },

  async loadLatestRecord() {
    const profile = this.data.firstProfile;

    if (!profile || !profile._id || this.data.isLoginFailed) {
      this.latestRecordRequestId = (this.latestRecordRequestId || 0) + 1;
      this.setData({
        hasLatestRecord: false,
        latestRecord: null,
        latestRecordDisplay: null,
        latestRecordError: '',
        isLoadingLatestRecord: false,
      });
      return;
    }

    const requestId = (this.latestRecordRequestId || 0) + 1;
    this.latestRecordRequestId = requestId;
    this.setData({
      isLoadingLatestRecord: true,
      latestRecordError: '',
    });

    try {
      const result = await recordService.getRecords(profile._id, { limit: 1 });

      if (this.latestRecordRequestId !== requestId) {
        return;
      }

      const latestRecord = result.records[0] || null;
      this.setData({
        hasLatestRecord: Boolean(latestRecord),
        latestRecord,
        latestRecordDisplay: latestRecord ? this.formatLatestRecord(latestRecord, profile) : null,
        isLoadingLatestRecord: false,
      });
    } catch (error) {
      if (this.latestRecordRequestId !== requestId) {
        return;
      }

      this.setData({
        hasLatestRecord: false,
        latestRecord: null,
        latestRecordDisplay: null,
        latestRecordError: '血压记录加载失败，请稍后重试',
        isLoadingLatestRecord: false,
      });
    }
  },

  handleCreateProfile() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit?mode=create',
    });
  },

  handleAddRecord() {
    const profile = this.data.firstProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '请先创建档案',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/record/record?mode=create&profileId=${profile._id}`,
    });
  },

  handleViewRecords() {
    wx.showToast({
      title: 'T2.3 上线',
      icon: 'none',
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
