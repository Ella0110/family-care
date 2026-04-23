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

Page({
  data: {
    profileId: '',
    profileName: '当前档案',
    referenceLines: getReferenceLines(),
    groups: [],
    hasRecords: false,
    hasMore: false,
    isLoading: false,
    errorText: '',
  },

  onLoad(options = {}) {
    const profileId = options.profileId || '';
    const profile = profileId ? findProfile(profileId) : null;

    this.recordsById = {};
    this.setData({
      profileId,
      profileName: profile ? profile.name : '当前档案',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
    });

    if (!profileId) {
      this.setData({ errorText: '缺少档案信息，请返回首页重试' });
    }
  },

  onShow() {
    this.loadRecords();
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

    this.setData({
      isLoading: true,
      errorText: '',
    });

    try {
      const result = await recordService.getRecords(this.data.profileId, { limit: 200 });
      const groups = this.groupRecords(result.records);
      this.recordsById = {};
      result.records.forEach((record) => {
        this.recordsById[record._id] = record;
      });

      this.setData({
        groups,
        hasRecords: result.records.length > 0,
        hasMore: result.hasMore,
        isLoading: false,
      });
    } catch (error) {
      this.setData({
        errorText: '记录加载失败，请稍后重试',
        isLoading: false,
      });
    }
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

    wx.navigateTo({
      url: `/pages/record/record?mode=create&profileId=${this.data.profileId}`,
    });
  },

  handleRecordTap(event) {
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
