const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const { canWrite, isViewer } = require('../../utils/permission-helpers');

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

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isSameDay(left, right) {
  return dateKey(left) === dateKey(right);
}

function formatDateLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) {
    return '今天';
  }

  if (isSameDay(date, yesterday)) {
    return '昨天';
  }

  return dateKey(date);
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    profileId: '',
    profileName: '当前档案',
    referenceLines: getReferenceLines(),
    groups: [],
    hasRecords: false,
    hasMore: false,
    isLoading: false,
    errorText: '',
    canWriteCurrentProfile: false,
    isViewerMode: false,
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const profileId = options.profileId || '';
    const profile = profileId ? findProfile(profileId) : null;

    this.recordsById = {};
    const state = store.getState();
    this.setData({
      profileId,
      profileName: profile ? profile.name : '当前档案',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
      canWriteCurrentProfile: profileId ? canWrite(state, profileId) : false,
      isViewerMode: profileId ? isViewer(state, profileId) : false,
    });

    if (!profileId) {
      this.setData({ errorText: getErrorMessage({ code: 'PROFILE_NOT_FOUND' }) });
    }
  },

  onShow() {
    this.syncFontScale();
    this.loadRecords();
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  groupRecords(records) {
    const referenceLines = getReferenceLines(this && this.data ? this.data.referenceLines : null);
    const groups = [];
    const groupMap = {};

    (records || []).forEach((record) => {
      const measuredAt = toDate(record.measuredAt);
      if (Number.isNaN(measuredAt.getTime())) {
        return;
      }

      const key = dateKey(measuredAt);
      if (!groupMap[key]) {
        groupMap[key] = {
          date: key,
          label: formatDateLabel(measuredAt),
          records: [],
        };
        groups.push(groupMap[key]);
      }

      const payload = record.payload || {};
      const status = getBPStatusDisplay(payload.systolic, payload.diastolic, referenceLines);
      groupMap[key].records.push(
        Object.assign({}, record, {
          timeText: formatTime(measuredAt),
          valueText: `${payload.systolic} / ${payload.diastolic}`,
          heartRateText: payload.heartRate ? `心率 ${payload.heartRate} bpm` : '',
          status,
        }),
      );
    });

    return groups;
  },

  async loadRecords() {
    if (!this.data.profileId) {
      return;
    }

    const profileId = this.data.profileId;
    const hasCache = store.hasCachedRecords(profileId);
    this.setData({
      isLoading: !hasCache,
      errorText: '',
    });

    await recordService.loadRecords(profileId, { limit: 200 }, {
      onCacheHit: (result) => {
        if (this.data.profileId !== profileId) {
          return;
        }

        this.applyRecords(result.records, result.hasMore);
      },
      onFresh: (result) => {
        if (this.data.profileId !== profileId) {
          return;
        }

        this.applyRecords(result.records, result.hasMore);
      },
      onError: (error) => {
        if (this.data.profileId !== profileId) {
          return;
        }

        if (!hasCache) {
          this.setData({
            errorText: getErrorMessage(error),
            isLoading: false,
          });
        }
      },
    });
  },

  applyRecords(records, hasMore) {
    const nextRecords = Array.isArray(records) ? records : [];
    const groups = this.groupRecords(nextRecords);
    this.recordsById = {};
    nextRecords.forEach((record) => {
      this.recordsById[record._id] = record;
    });

    this.setData({
      groups,
      hasRecords: nextRecords.length > 0,
      hasMore: hasMore === true,
      isLoading: false,
      errorText: '',
    });
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  handleAddRecord() {
    if (!this.data.profileId) {
      wx.showToast({
        title: '请先返回首页',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canWriteCurrentProfile) {
      wx.showToast({
        title: '你没有权限录入血压',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/record/record?mode=create&profileId=${this.data.profileId}`,
    });
  },

  handleRecordTap(event) {
    if (this.data.isViewerMode) {
      return;
    }

    const recordId = event.currentTarget.dataset.recordId;
    const record = this.recordsById && this.recordsById[recordId];

    if (!record) {
      wx.showToast({
        title: '记录不存在，请刷新',
        icon: 'none',
      });
      return;
    }

    recordService.setCachedRecord(record);
    wx.navigateTo({
      url: `/pages/record/record?mode=edit&profileId=${this.data.profileId}&recordId=${recordId}`,
    });
  },
});
