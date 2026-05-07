const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const medicationService = require('../../services/medication-service');
const { callSilent } = require('../../services/request');
const { getErrorMessage } = require('../../utils/error-messages');
const { getReferenceLines, getBPStatusDisplay } = require('../../utils/bp-status');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const {
  getCurrentRelationship,
  isOwner,
  isViewer,
  canWrite,
} = require('../../utils/permission-helpers');
const {
  getSinceForDays,
  toMeasuredDate,
  countUniqueMeasuredDays,
  buildChartTimeline,
} = require('../../utils/report-helpers');
const {
  drawBloodPressureTrendChart,
  drawHeartRateChart,
} = require('../../utils/report-chart-renderer');

const RANGE_OPTIONS = [
  { days: 7, label: '7天' },
  { days: 30, label: '30天' },
  { days: 90, label: '90天' },
];

const EXPORT_CHART_CANVAS_WIDTH = 750;
const REFRESH_TTL_MS = 5 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortRecordsDesc(records) {
  return (Array.isArray(records) ? records.slice() : []).sort((left, right) => {
    const measuredAtDiff = toTimestamp(right && right.measuredAt) - toTimestamp(left && left.measuredAt);
    if (measuredAtDiff !== 0) {
      return measuredAtDiff;
    }

    return toTimestamp(right && right.createdAt) - toTimestamp(left && left.createdAt);
  });
}

function findProfile(profileId) {
  return (store.getState().profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function getThreshold(profile) {
  return (
    profile
    && profile.settings
    && profile.settings.bp
    && profile.settings.bp.threshold
  ) || {
    systolic: 140,
    diastolic: 90,
  };
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function getErrorReason(error) {
  if (!error) {
    return 'unknown';
  }

  if (error.errMsg) {
    return error.errMsg;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

function isPermissionInterrupted(error) {
  return /deny|cancel/i.test(getErrorReason(error));
}

function wrapCanvasToTempFilePath(canvas, options = {}) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath(Object.assign({
      canvas,
      fileType: 'png',
      quality: 1,
      success: resolve,
      fail: reject,
    }, options));
  });
}

function wrapSaveImageToPhotosAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject,
    });
  });
}

function showSystemPermissionHint() {
  wx.showModal({
    title: '需要在系统设置中开启权限',
    content: '请前往手机「设置 → 微信 → 照片」，将权限设为“允许”',
    showCancel: false,
    confirmText: '知道了',
  });
}

function buildPeriodOptions(coverageDayCount) {
  if (!Number.isFinite(coverageDayCount)) {
    return RANGE_OPTIONS.map((item) => Object.assign({}, item, { enabled: true }));
  }

  return RANGE_OPTIONS.map((item) => {
    let enabled = false;
    if (item.days === 7) {
      enabled = coverageDayCount >= 1;
    } else if (item.days === 30) {
      enabled = coverageDayCount > 7;
    } else if (item.days === 90) {
      enabled = coverageDayCount > 30;
    }

    return Object.assign({}, item, { enabled });
  });
}

function getDisabledPeriodToast(days) {
  if (days === 30) {
    return '记录超过 7 天后可查看';
  }

  if (days === 90) {
    return '记录超过 30 天后可查看';
  }

  return '当前暂无可查看数据';
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatMeasuredAt(value) {
  const date = toMeasuredDate(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (isSameDay(date, now)) {
    return `今天 ${time}`;
  }

  if (isSameDay(date, yesterday)) {
    return `昨天 ${time}`;
  }

  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`;
}

function formatExportDateRange(days, now = new Date()) {
  const start = getSinceForDays(days, now);
  return `${start.getFullYear()}.${pad(start.getMonth() + 1)}.${pad(start.getDate())} - ${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
}

function formatRomanGrade(detail) {
  if (detail === '1级') {
    return 'I 级';
  }

  if (detail === '2级') {
    return 'II 级';
  }

  if (detail === '3级') {
    return 'III 级';
  }

  return detail || '';
}

function formatLatestStatusText(status) {
  if (!status) {
    return '血压正常';
  }

  if (status.level === 'high') {
    const grade = status.detail ? ` (Grade ${status.detail.replace('级', '')})` : '';
    return `血压${status.label}${grade}`;
  }

  if (status.level === 'low') {
    return '血压偏低';
  }

  return '血压正常';
}

function formatHistoryStatusText(status) {
  if (!status) {
    return '血压正常';
  }

  if (status.level === 'high') {
    return status.detail
      ? `血压${status.label} · ${formatRomanGrade(status.detail)}`
      : `血压${status.label}`;
  }

  if (status.level === 'low') {
    return '血压偏低';
  }

  return '血压正常';
}

function buildMedicationSummary(activeMedications) {
  const names = (Array.isArray(activeMedications) ? activeMedications : [])
    .map((item) => String(item && item.drug || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  return names.length ? names.join('、') : '';
}

function buildLatestDisplay(record, profile) {
  if (!record) {
    return null;
  }

  const payload = record.payload || {};
  const referenceLines = getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines);
  const status = getBPStatusDisplay(payload.systolic, payload.diastolic, referenceLines);

  return {
    statusText: formatLatestStatusText(status),
    statusClassName: status.className,
    valueText: `${payload.systolic} / ${payload.diastolic} mmHg`,
    heartRateText: payload.heartRate ? `${payload.heartRate} bpm` : '--',
    measuredAtText: formatMeasuredAt(record.measuredAt),
  };
}

function canEditRecord(state, profileId, record) {
  if (!record || !profileId || !canWrite(state, profileId)) {
    return false;
  }

  if (isOwner(state, profileId)) {
    return true;
  }

  const currentUserId = state.user && state.user._id;
  return Boolean(currentUserId && record.recordedBy === currentUserId);
}

function buildHistoryItems(records, profile) {
  const referenceLines = getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines);
  const state = store.getState();
  const profileId = profile && profile._id;

  return (Array.isArray(records) ? records : [])
    .slice(0, 5)
    .map((record) => {
      const payload = record.payload || {};
      const status = getBPStatusDisplay(payload.systolic, payload.diastolic, referenceLines);
      return {
        _id: record._id,
        raw: record,
        timeText: formatMeasuredAt(record.measuredAt),
        valueText: `${payload.systolic} / ${payload.diastolic} mmHg`,
        heartRateText: payload.heartRate ? `心率 ${payload.heartRate} bpm` : '',
        statusText: formatHistoryStatusText(status),
        statusClassName: status.className,
        canEdit: canEditRecord(state, profileId, record),
      };
    });
}

function buildChartExportHeight(hasHeartRateData) {
  return hasHeartRateData ? 900 : 660;
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    hasProfile: false,
    profileName: '',
    profileTitle: '来自儿女的关心',
    profiles: [],
    currentProfileId: '',
    selectedDays: 7,
    periodOptions: buildPeriodOptions(NaN),
    isLoading: false,
    errorText: '',
    latestRecordDisplay: null,
    latestRecord: null,
    hasAnyRecords: false,
    hasRangeRecords: false,
    hasHeartRateData: false,
    historyItems: [],
    medicationText: '暂未添加',
    hasMedicationSummary: false,
    showProfileSwitcher: false,
    showRecordPanel: false,
    editingRecord: null,
    canWriteCurrentProfile: false,
    isViewerMode: false,
    exportCanvasHeight: 1,
    isExportingChart: false,
    showPermissionModal: false,
  },

  onLoad() {
    this.requestId = 0;
    this.chartRenderToken = 0;
    this.pixelRatio = 1;
    this.lastRefreshAt = 0;
    this.lastLoadedProfileId = '';
    this.coverageDayCount = NaN;
    this.allRecords = [];
    this.activeMedications = [];
    this.chartData = null;
    this.chartThreshold = { systolic: 140, diastolic: 90 };
    this.exportTempFilePath = '';
    this.exportChartMeta = null;
    this.lastSeenProfileId = store.getState().currentProfileId || '';

    this.syncFontScale();
    this.initSystemInfo();
    this.syncProfileMeta();

    this._unsubscribe = store.subscribe((nextState) => {
      const nextProfileId = nextState.currentProfileId || '';
      if (nextProfileId !== this.lastSeenProfileId) {
        this.lastSeenProfileId = nextProfileId;
        this.syncProfileMeta();
        this.loadPageData({ force: true });
        return;
      }

      this.syncProfileMeta();
    });
  },

  onShow() {
    this.syncFontScale();
    this.syncProfileMeta();
    this.loadPageData({ force: false });
  },

  onUnload() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this.chartRenderToken += 1;
    this.exportTempFilePath = '';
  },

  initSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.pixelRatio = Number(systemInfo.pixelRatio) || 1;
    } catch (error) {
      this.pixelRatio = 1;
    }
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  syncProfileMeta() {
    const state = store.getState();
    const profiles = Array.isArray(state.profiles) ? state.profiles.slice() : [];
    let currentProfileId = state.currentProfileId || '';

    if (!currentProfileId && profiles.length) {
      store.setCurrentProfileId(profiles[0]._id);
      return;
    }

    const profile = currentProfileId ? findProfile(currentProfileId) : null;
    const relationship = currentProfileId ? getCurrentRelationship(state, currentProfileId) : null;
    const profileName = profile && profile.name ? profile.name : '';

    this.setData({
      profiles,
      currentProfileId,
      hasProfile: Boolean(profile),
      profileName,
      profileTitle: profile ? `${profileName}的记录` : '来自儿女的关心',
      canWriteCurrentProfile: profile ? canWrite(state, currentProfileId) : false,
      isViewerMode: profile ? isViewer(state, currentProfileId) : false,
      relationshipRole: relationship ? relationship.role : '',
    });
  },

  async fetchIndependentRecords(profileId) {
    const result = await callSilent('getRecords', {
      profileId,
      type: 'bp',
      limit: 200,
    });

    return {
      records: sortRecordsDesc(Array.isArray(result.records) ? result.records : []),
      hasMore: result.hasMore === true,
    };
  },

  async loadPageData(options = {}) {
    const force = options.force === true;
    const profileId = store.getState().currentProfileId;

    if (!profileId) {
      this.chartRenderToken += 1;
      this.lastLoadedProfileId = '';
      this.lastRefreshAt = 0;
      this.coverageDayCount = NaN;
      this.allRecords = [];
      this.activeMedications = [];
      this.chartData = null;
      this.setData({
        hasProfile: false,
        isLoading: false,
        errorText: '',
        latestRecord: null,
        latestRecordDisplay: null,
        hasAnyRecords: false,
        hasRangeRecords: false,
        hasHeartRateData: false,
        historyItems: [],
        medicationText: '暂未添加',
        hasMedicationSummary: false,
        periodOptions: buildPeriodOptions(NaN),
      });
      return;
    }

    const shouldSkip = !force
      && this.lastLoadedProfileId === profileId
      && (Date.now() - this.lastRefreshAt) < REFRESH_TTL_MS;

    if (shouldSkip) {
      return;
    }

    const profile = findProfile(profileId);
    if (!profile) {
      this.setData({
        hasProfile: false,
        isLoading: false,
        errorText: '档案不存在或已被移除',
      });
      return;
    }

    this.requestId += 1;
    const requestId = this.requestId;

    this.setData({
      isLoading: true,
      errorText: '',
    });

    try {
      const [latestResult, recordResult, medicationResult] = await Promise.all([
        recordService.fetchLatestRecord(profileId),
        this.fetchIndependentRecords(profileId),
        medicationService.fetchMedications(profileId),
      ]);

      if (requestId !== this.requestId) {
        return;
      }

      this.lastLoadedProfileId = profileId;
      this.lastRefreshAt = Date.now();
      this.allRecords = Array.isArray(recordResult.records) ? recordResult.records.slice() : [];
      this.coverageDayCount = countUniqueMeasuredDays(this.allRecords);
      this.activeMedications = Array.isArray(medicationResult.activeMedications)
        ? medicationResult.activeMedications.slice()
        : [];
      this.latestRecord = latestResult.record || this.allRecords[0] || null;

      this.applyViewModel();
    } catch (error) {
      if (requestId !== this.requestId) {
        return;
      }

      this.chartRenderToken += 1;
      this.setData({
        isLoading: false,
        errorText: getErrorMessage(error),
        latestRecord: null,
        latestRecordDisplay: null,
        hasAnyRecords: false,
        hasRangeRecords: false,
        hasHeartRateData: false,
        historyItems: [],
        medicationText: '暂未添加',
        hasMedicationSummary: false,
        periodOptions: buildPeriodOptions(NaN),
      });
    }
  },

  applyViewModel() {
    const profileId = this.data.currentProfileId;
    const profile = profileId ? findProfile(profileId) : null;
    const periodOptions = buildPeriodOptions(this.coverageDayCount);
    const selectedOption = periodOptions.find((item) => item.days === this.data.selectedDays && item.enabled);
    const nextSelectedDays = selectedOption
      ? this.data.selectedDays
      : ((periodOptions.find((item) => item.enabled) || periodOptions[0] || { days: 7 }).days);
    const latestRecordDisplay = buildLatestDisplay(this.latestRecord, profile);
    const medicationText = buildMedicationSummary(this.activeMedications);
    const hasMedicationSummary = Boolean(medicationText);
    const historyItems = buildHistoryItems(this.allRecords, profile);

    this.chartThreshold = getThreshold(profile);
    this.chartData = buildChartTimeline(
      this.allRecords,
      nextSelectedDays,
      this.chartThreshold,
      new Date(),
    );

    const hasAnyRecords = this.allRecords.length > 0;
    const hasRangeRecords = Boolean(this.chartData && this.chartData.points && this.chartData.points.length);
    const hasHeartRateData = Boolean(this.chartData && this.chartData.hasHeartRateData);

    this.setData({
      selectedDays: nextSelectedDays,
      isLoading: false,
      errorText: '',
      latestRecord: this.latestRecord,
      latestRecordDisplay,
      hasAnyRecords,
      hasRangeRecords,
      hasHeartRateData,
      historyItems,
      medicationText,
      hasMedicationSummary,
      periodOptions,
    }, () => {
      if (hasRangeRecords) {
        this.scheduleChartRender();
      } else {
        this.chartRenderToken += 1;
      }
    });
  },

  scheduleChartRender() {
    const token = ++this.chartRenderToken;

    setTimeout(() => {
      if (token !== this.chartRenderToken) {
        return;
      }

      this.renderCharts(token);
    }, 0);
  },

  getCanvasNode(selector) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select(selector)
        .fields({ node: true, size: true })
        .exec((result) => {
          const target = result && result[0];
          if (!target || !target.node || !target.width || !target.height) {
            reject(new Error(`canvas not ready: ${selector}`));
            return;
          }

          resolve(target);
        });
    });
  },

  async renderCharts(token) {
    try {
      await this.renderBloodPressureChart(token);
      if (this.data.hasHeartRateData) {
        await this.renderHeartRateChart(token);
      }
    } catch (error) {
      console.error('[data] render charts failed', error);
    }
  },

  async renderBloodPressureChart(token) {
    const target = await this.getCanvasNode('#dataBpChart');
    if (token !== this.chartRenderToken) {
      return;
    }

    const canvas = target.node;
    const width = target.width;
    const height = target.height;
    canvas.width = Math.max(1, Math.round(width * this.pixelRatio));
    canvas.height = Math.max(1, Math.round(height * this.pixelRatio));

    const ctx = canvas.getContext('2d');
    ctx.scale(this.pixelRatio, this.pixelRatio);
    drawBloodPressureTrendChart(
      ctx,
      this.chartData,
      this.chartThreshold,
      { width, height },
      this.data.selectedDays,
    );
  },

  async renderHeartRateChart(token) {
    const target = await this.getCanvasNode('#dataHeartRateChart');
    if (token !== this.chartRenderToken) {
      return;
    }

    const canvas = target.node;
    const width = target.width;
    const height = target.height;
    canvas.width = Math.max(1, Math.round(width * this.pixelRatio));
    canvas.height = Math.max(1, Math.round(height * this.pixelRatio));

    const ctx = canvas.getContext('2d');
    ctx.scale(this.pixelRatio, this.pixelRatio);
    drawHeartRateChart(
      ctx,
      this.chartData,
      this.chartThreshold,
      { width, height },
      this.data.selectedDays,
    );
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
    if (!profileId || profileId === this.data.currentProfileId) {
      this.setData({ showProfileSwitcher: false });
      return;
    }

    store.setCurrentProfileId(profileId);
    this.setData({ showProfileSwitcher: false });
  },

  handleCreateProfile() {
    wx.navigateTo({
      url: `/pages/profile-edit/profile-edit?mode=create&returnTab=${encodeURIComponent('/pages/data/data')}`,
    });
  },

  handleOpenRecordPanel() {
    if (!this.data.canWriteCurrentProfile) {
      return;
    }

    this.setData({
      showRecordPanel: true,
      editingRecord: null,
    });
  },

  handleCloseRecordPanel() {
    this.setData({
      showRecordPanel: false,
      editingRecord: null,
    });
  },

  handleRecordPanelSuccess() {
    this.handleCloseRecordPanel();
    this.loadPageData({ force: true });
  },

  handleRecordPanelDelete() {
    this.handleCloseRecordPanel();
    this.loadPageData({ force: true });
  },

  handleSelectPeriod(event) {
    const days = Number(event.currentTarget.dataset.days);
    const option = (this.data.periodOptions || []).find((item) => item.days === days);

    if (!days || !option) {
      return;
    }

    if (!option.enabled) {
      wx.showToast({
        title: getDisabledPeriodToast(days),
        icon: 'none',
      });
      return;
    }

    if (days === this.data.selectedDays) {
      return;
    }

    this.setData({
      selectedDays: days,
    }, () => {
      this.applyViewModel();
    });
  },

  handleViewAllRecords() {
    if (!this.data.currentProfileId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/records-list/records-list?profileId=${this.data.currentProfileId}`,
    });
  },

  handleHistoryRecordTap(event) {
    const recordId = event.currentTarget.dataset.recordId;
    const record = (this.data.historyItems || []).find((item) => item && item._id === recordId);

    if (!record || !record.canEdit) {
      return;
    }

    this.setData({
      showRecordPanel: true,
      editingRecord: record.raw,
    });
  },

  async handleExportChart() {
    if (this.data.isExportingChart || !this.data.hasRangeRecords) {
      if (!this.data.hasRangeRecords) {
        wx.showToast({
          title: '该时间段内暂无趋势数据',
          icon: 'none',
        });
      }
      return;
    }

    this.setData({
      isExportingChart: true,
    });

    try {
      const exportHeight = buildChartExportHeight(this.data.hasHeartRateData);
      this.setData({
        exportCanvasHeight: exportHeight,
      });

      await wait(80);
      const target = await this.getCanvasNode('#dataExportCanvas');
      const canvas = target.node;
      canvas.width = EXPORT_CHART_CANVAS_WIDTH;
      canvas.height = exportHeight;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, EXPORT_CHART_CANVAS_WIDTH, exportHeight);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, EXPORT_CHART_CANVAS_WIDTH, exportHeight);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(`${this.data.profileName || '当前档案'}的血压趋势`, EXPORT_CHART_CANVAS_WIDTH / 2, 60);
      ctx.fillStyle = '#6B7280';
      ctx.font = '14px sans-serif';
      ctx.fillText(
        `近 ${this.data.selectedDays} 天数据（${formatExportDateRange(this.data.selectedDays)}）`,
        EXPORT_CHART_CANVAS_WIDTH / 2,
        96,
      );

      ctx.save();
      ctx.translate(20, 130);
      drawBloodPressureTrendChart(
        ctx,
        this.chartData,
        this.chartThreshold,
        { width: 710, height: 320 },
        this.data.selectedDays,
      );
      ctx.restore();

      if (this.data.hasHeartRateData) {
        ctx.save();
        ctx.translate(20, 480);
        drawHeartRateChart(
          ctx,
          this.chartData,
          this.chartThreshold,
          { width: 710, height: 260 },
          this.data.selectedDays,
        );
        ctx.restore();
      } else {
        ctx.fillStyle = '#F9FAFB';
        ctx.fillRect(20, 500, 710, 120);
        ctx.fillStyle = '#6B7280';
        ctx.font = '16px sans-serif';
        ctx.fillText('暂无心率数据', EXPORT_CHART_CANVAS_WIDTH / 2, 570);
      }

      const result = await wrapCanvasToTempFilePath(canvas, {
        x: 0,
        y: 0,
        width: EXPORT_CHART_CANVAS_WIDTH,
        height: exportHeight,
        destWidth: EXPORT_CHART_CANVAS_WIDTH,
        destHeight: exportHeight,
      });
      this.exportTempFilePath = result.tempFilePath || '';
      await this.trySaveImageToAlbum(this.exportTempFilePath, {
        allowPermissionRecovery: true,
      });
    } catch (error) {
      console.error('[data] export chart failed', error);
      wx.showToast({
        title: '导出失败，请重试',
        icon: 'none',
      });
    } finally {
      this.setData({
        isExportingChart: false,
      });
    }
  },

  async trySaveImageToAlbum(filePath, options = {}) {
    try {
      await wrapSaveImageToPhotosAlbum(filePath);
      wx.showToast({
        title: '已保存到相册',
        icon: 'success',
      });
      return true;
    } catch (error) {
      if (options.allowPermissionRecovery && isPermissionInterrupted(error)) {
        this.setData({
          showPermissionModal: true,
        });
        return false;
      }

      if (options.showFailureToast !== false) {
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none',
        });
      }
      return false;
    }
  },

  handleClosePermissionModal() {
    this.setData({
      showPermissionModal: false,
    });
  },

  handleOpenPermissionSetting() {
    const filePath = this.exportTempFilePath;
    this.setData({
      showPermissionModal: false,
    });

    wx.openSetting({
      success: async (res) => {
        const authSetting = res && res.authSetting ? res.authSetting : {};
        const hasPermission = authSetting['scope.writePhotosAlbum'] === true;

        if (hasPermission && filePath) {
          this.setData({ isExportingChart: true });
          try {
            const saved = await this.trySaveImageToAlbum(filePath, {
              allowPermissionRecovery: false,
              showFailureToast: false,
            });
            if (!saved) {
              showSystemPermissionHint();
            }
          } finally {
            this.setData({ isExportingChart: false });
          }
          return;
        }

        showSystemPermissionHint();
      },
      fail: (error) => {
        console.error('[data] openSetting failed', error);
        wx.showToast({
          title: '无法打开设置',
          icon: 'none',
        });
      },
    });
  },
});
