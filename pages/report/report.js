// 报告页直调 getRecords 云函数，绕过 record-service 缓存层，避免子集查询污染全局缓存。T5.1a 技术债，后续可通过给缓存 key 加时间范围参数解决。
const { callSilent } = require('../../services/request');
const medicationService = require('../../services/medication-service');
const { store } = require('../../store/index');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const {
  REPORT_DISCLAIMER,
  getSinceForDays,
  toMeasuredDate,
  toDateKey,
  buildReportViewModel,
} = require('../../utils/report-helpers');
const {
  drawBloodPressureTrendChart,
  drawHeartRateChart,
} = require('../../utils/report-chart-renderer');
const {
  EXPORT_CANVAS_WIDTH,
  EXPORT_PADDING,
  measureReportExportHeight,
  drawReportExportCanvas,
} = require('../../utils/report-exporter');

const PERIOD_OPTIONS = [
  { days: 7, label: '近7天' },
  { days: 30, label: '近30天' },
  { days: 90, label: '近90天' },
];

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

function buildPeriodOptions(coverageDayCount) {
  if (!Number.isFinite(coverageDayCount)) {
    return PERIOD_OPTIONS.map((item) => Object.assign({}, item, { enabled: true }));
  }

  return PERIOD_OPTIONS.map((item) => {
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

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function findProfile(profileId) {
  return (store.getState().profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitEmergencyText(value) {
  const safeText = String(value || '').trim();

  if (!safeText || safeText === '未设置') {
    return {
      nameText: '未设置',
      phoneText: '',
    };
  }

  if (safeText === '***') {
    return {
      nameText: '***',
      phoneText: '',
    };
  }

  const parts = safeText.split(' · ').map((item) => String(item || '').trim()).filter(Boolean);
  if (parts.length <= 1) {
    return {
      nameText: safeText,
      phoneText: '',
    };
  }

  return {
    nameText: parts.slice(0, -1).join(' · '),
    phoneText: parts[parts.length - 1],
  };
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

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    profileId: '',
    periodOptions: buildPeriodOptions(NaN),
    selectedDays: 7,
    isLoading: false,
    errorText: '',
    patientNameText: '未命名档案',
    medicationText: '暂无用药记录',
    emergencyText: '未设置',
    emergencyNameText: '未设置',
    emergencyPhoneText: '',
    generatedAtText: '',
    banner: null,
    summaryCards: [],
    recentAlerts: [],
    hasRecords: false,
    hasHeartRateData: false,
    hideSensitiveInfo: false,
    disclaimer: REPORT_DISCLAIMER,
    isExporting: false,
    exportCanvasHeight: 1,
    showPermissionModal: false,
  },

  onLoad(options = {}) {
    this.reportRequestId = 0;
    this.chartRenderToken = 0;
    this.profile = null;
    this.activeMedications = [];
    this.rawRecords = [];
    this.coverageDayCount = NaN;
    this.generatedAt = new Date();
    this.pixelRatio = 1;
    this.hasEntered = false;
    this.exportTempFilePath = '';
    this.exportCanvasPixelHeight = 1;

    this.syncFontScale();
    this.initSystemInfo();

    const profileId = options.profileId || '';
    this.setData({
      profileId,
    });

    if (!profileId) {
      this.setData({
        errorText: '缺少档案信息，请返回首页重试',
      });
      return;
    }

    this.loadReportData(7, { refreshCoverage: true });
  },

  onShow() {
    this.syncFontScale();

    if (this.hasEntered && this.data.profileId) {
      this.loadReportData(this.data.selectedDays, { refreshCoverage: true });
    }

    this.hasEntered = true;
  },

  onUnload() {
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
    syncFontData.call(this);
  },

  async fetchReportRecords(profileId, options = {}) {
    // 这里保持与 record-service.fetchRecords 相同的字段约定：
    // profileId/type/limit/since/until 原样传给 getRecords，
    // 返回值也保持 { records, hasMore }，不在这一层改写 record 结构。
    const data = {
      profileId,
      type: 'bp',
      limit: options.limit || 200,
    };

    if (options.since) {
      data.since = options.since;
    }

    if (options.until) {
      data.until = options.until;
    }

    const result = await callSilent('getRecords', data);
    const records = sortRecordsDesc(Array.isArray(result.records) ? result.records : []);

    return {
      records,
      hasMore: result.hasMore === true,
    };
  },

  async fetchCoverageDayCount(profileId) {
    const uniqueDays = new Set();
    let nextUntil = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && uniqueDays.size <= 30 && pageCount < 8) {
      const result = await this.fetchReportRecords(profileId, {
        limit: 200,
        until: nextUntil,
      });
      const records = Array.isArray(result.records) ? result.records : [];

      records.forEach((record) => {
        if (record && record.measuredAt) {
          uniqueDays.add(toDateKey(record.measuredAt));
        }
      });

      if (!records.length) {
        break;
      }

      const oldestRecord = records[records.length - 1];
      const oldestMeasuredAt = toMeasuredDate(oldestRecord && oldestRecord.measuredAt);
      if (Number.isNaN(oldestMeasuredAt.getTime())) {
        break;
      }

      nextUntil = new Date(oldestMeasuredAt.getTime() - 1);
      hasMore = result.hasMore === true;
      pageCount += 1;
    }

    return uniqueDays.size;
  },

  async loadReportData(days, options = {}) {
    const profileId = this.data.profileId;

    if (!profileId) {
      return;
    }

    const profile = findProfile(profileId);
    if (!profile) {
      this.setData({
        errorText: '档案不存在或已被移除',
        isLoading: false,
      });
      return;
    }

    this.reportRequestId += 1;
    const requestId = this.reportRequestId;
    const now = new Date();

    this.setData({
      selectedDays: days,
      isLoading: true,
      errorText: '',
    });

    try {
      const shouldRefreshCoverage = options.refreshCoverage !== false || !Number.isFinite(this.coverageDayCount);
      const coveragePromise = shouldRefreshCoverage
        ? this.fetchCoverageDayCount(profileId).catch((error) => {
          console.warn('[report] fetchCoverageDayCount failed', error);
          return NaN;
        })
        : Promise.resolve(this.coverageDayCount);
      const [medicationResult, recordResult, coverageDayCount] = await Promise.all([
        medicationService.fetchMedications(profileId),
        this.fetchReportRecords(profileId, {
          since: getSinceForDays(days, now),
          until: now,
          limit: 200,
        }),
        coveragePromise,
      ]);

      if (requestId !== this.reportRequestId) {
        return;
      }

      this.profile = findProfile(profileId) || profile;
      this.activeMedications = Array.isArray(medicationResult.activeMedications)
        ? medicationResult.activeMedications.slice()
        : [];
      this.rawRecords = Array.isArray(recordResult.records) ? recordResult.records.slice() : [];
      if (Number.isFinite(coverageDayCount)) {
        this.coverageDayCount = coverageDayCount;
      }
      this.generatedAt = now;

      this.applyViewModel();
    } catch (error) {
      if (requestId !== this.reportRequestId) {
        return;
      }

      this.chartRenderToken += 1;
      this.setData({
        isLoading: false,
        errorText: getErrorMessage(error),
        hasRecords: false,
        hasHeartRateData: false,
        summaryCards: [],
        recentAlerts: [],
        banner: null,
        periodOptions: buildPeriodOptions(this.coverageDayCount),
      });
    }
  },

  applyViewModel() {
    const viewModel = buildReportViewModel({
      profile: this.profile,
      activeMedications: this.activeMedications,
      records: this.rawRecords,
      days: this.data.selectedDays,
      hideSensitive: this.data.hideSensitiveInfo,
      generatedAt: this.generatedAt,
    });

    this.chartData = viewModel.chartData;
    this.chartThreshold = viewModel.threshold;
    const emergencyDisplay = splitEmergencyText(viewModel.patient.emergencyText);

    this.setData({
      isLoading: false,
      errorText: '',
      periodOptions: buildPeriodOptions(this.coverageDayCount),
      patientNameText: viewModel.patient.nameText,
      medicationText: viewModel.patient.medicationText,
      emergencyText: viewModel.patient.emergencyText,
      emergencyNameText: emergencyDisplay.nameText,
      emergencyPhoneText: emergencyDisplay.phoneText,
      generatedAtText: viewModel.generatedAtText,
      banner: viewModel.banner,
      summaryCards: viewModel.summaryCards,
      recentAlerts: viewModel.recentAlerts,
      hasRecords: viewModel.hasRecords,
      hasHeartRateData: viewModel.hasHeartRateData,
      disclaimer: viewModel.disclaimer,
    }, () => {
      if (viewModel.hasRecords) {
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

  async renderCharts(token) {
    try {
      await this.renderBloodPressureChart(token);

      if (this.data.hasHeartRateData) {
        await this.renderHeartRateChart(token);
      }
    } catch (error) {
      console.error('[report] render charts failed', error);
    }
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

  prepareExportCanvas(canvas, logicalHeight, exportScale) {
    canvas.width = Math.max(1, Math.round(EXPORT_CANVAS_WIDTH * exportScale));
    canvas.height = Math.max(1, Math.round(logicalHeight * exportScale));

    const ctx = canvas.getContext('2d');
    ctx.scale(exportScale, exportScale);
    return ctx;
  },

  async renderBloodPressureChart(token) {
    const target = await this.getCanvasNode('#reportBpChart');
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
    const target = await this.getCanvasNode('#reportHeartRateChart');
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

  handleSelectPeriod(event) {
    const days = Number(event.currentTarget.dataset.days);
    const nextOption = (this.data.periodOptions || []).find((item) => item.days === days);

    if (!days || !nextOption) {
      return;
    }

    if (!nextOption.enabled) {
      wx.showToast({
        title: getDisabledPeriodToast(days),
        icon: 'none',
      });
      return;
    }

    if (days === this.data.selectedDays || this.data.isLoading) {
      return;
    }

    this.loadReportData(days, { refreshCoverage: false });
  },

  handleTogglePrivacy(event) {
    this.setData({
      hideSensitiveInfo: !!(event.detail && event.detail.value),
    }, () => {
      this.applyViewModel();
    });
  },

  handleSaveReport() {
    if (this.data.isExporting || this.data.isLoading || this.data.errorText) {
      return;
    }

    this.exportReportImage();
  },

  buildExportPayload() {
    const rawViewModel = buildReportViewModel({
      profile: this.profile,
      activeMedications: this.activeMedications,
      records: this.rawRecords,
      days: this.data.selectedDays,
      hideSensitive: false,
      generatedAt: this.generatedAt,
    });
    const maskedViewModel = this.data.hideSensitiveInfo
      ? buildReportViewModel({
        profile: this.profile,
        activeMedications: this.activeMedications,
        records: this.rawRecords,
        days: this.data.selectedDays,
        hideSensitive: true,
        generatedAt: this.generatedAt,
      })
      : rawViewModel;

    return {
      periodLabel: `近 ${this.data.selectedDays} 天`,
      generatedAtText: this.data.generatedAtText,
      patient: {
        rawNameText: rawViewModel.patient.nameText,
        maskedNameText: maskedViewModel.patient.nameText,
        medicationText: rawViewModel.patient.medicationText,
        rawEmergencyText: rawViewModel.patient.emergencyText,
        maskedEmergencyText: maskedViewModel.patient.emergencyText,
      },
      banner: this.data.banner,
      summaryCards: this.data.summaryCards,
      hasRecords: this.data.hasRecords,
      hasHeartRateData: this.data.hasHeartRateData,
      records: this.chartData || { mode: this.data.selectedDays, slots: [], points: [] },
      threshold: this.chartThreshold,
      mode: this.data.selectedDays,
      recentAlerts: this.data.recentAlerts || [],
      disclaimer: this.data.disclaimer,
      privacyMode: this.data.hideSensitiveInfo,
    };
  },

  async exportReportImage() {
    this.setData({
      isExporting: true,
      showPermissionModal: false,
    });

    const startedAt = Date.now();

    try {
      const exportPayload = this.buildExportPayload();
      const exportLayout = measureReportExportHeight(exportPayload);
      const exportScale = Math.max(1, Number(this.pixelRatio) || 1);

      this.exportCanvasPixelHeight = exportLayout.height;
      this.setData({
        exportCanvasHeight: Math.max(1, Math.ceil(exportLayout.height / 2)),
      });

      await wait(100);

      const target = await this.getCanvasNode('#reportExportCanvas');
      const canvas = target.node;
      const ctx = this.prepareExportCanvas(
        canvas,
        exportLayout.height,
        exportScale,
      );

      const lastY = drawReportExportCanvas(ctx, Object.assign({}, exportPayload, {
        exportLayout,
      }));
      const exportPixelHeight = Math.max(
        1,
        Math.ceil((Number(lastY) || 0) + EXPORT_PADDING),
      );
      const finalExportLayout = Object.assign({}, exportLayout, {
        height: exportPixelHeight,
      });

      console.log('[report-export] first pass', {
        lastY,
        canvasHeight: canvas.height,
        exportHeight: exportPixelHeight,
      });

      if (exportPixelHeight !== exportLayout.height) {
        this.setData({
          exportCanvasHeight: Math.max(1, Math.ceil(exportPixelHeight / 2)),
        });

        const redrawCtx = this.prepareExportCanvas(
          canvas,
          exportPixelHeight,
          exportScale,
        );
        drawReportExportCanvas(redrawCtx, Object.assign({}, exportPayload, {
          exportLayout: finalExportLayout,
        }));
      }

      this.exportCanvasPixelHeight = exportPixelHeight;
      console.log('[report-export] final canvas size', {
        canvasHeight: canvas.height,
        exportHeight: exportPixelHeight,
      });

      await wait(80);

      const result = await wrapCanvasToTempFilePath(canvas, {
        x: 0,
        y: 0,
        width: EXPORT_CANVAS_WIDTH,
        height: exportPixelHeight,
        destWidth: Math.max(1, Math.round(EXPORT_CANVAS_WIDTH * exportScale)),
        destHeight: Math.max(1, Math.round(exportPixelHeight * exportScale)),
      });
      this.exportTempFilePath = result.tempFilePath || '';

      console.log('[report-export] canvas export success', {
        width: EXPORT_CANVAS_WIDTH,
        height: exportPixelHeight,
        durationMs: Date.now() - startedAt,
        tempFilePath: this.exportTempFilePath,
      });

      await this.trySaveImageToAlbum(this.exportTempFilePath, {
        allowPermissionRecovery: true,
      });
    } catch (error) {
      console.error('[report-export] export failed', error);
      wx.showToast({
        title: '生成失败，请重试',
        icon: 'none',
      });
    } finally {
      this.setData({
        isExporting: false,
      });
    }
  },

  async trySaveImageToAlbum(filePath, options = {}) {
    const startedAt = Date.now();

    try {
      const result = await wrapSaveImageToPhotosAlbum(filePath);

      console.log('[report-export] save success', {
        durationMs: Date.now() - startedAt,
        result,
      });

      wx.showToast({
        title: '已保存到相册',
        icon: 'success',
      });

      return true;
    } catch (error) {
      if (options.allowPermissionRecovery && isPermissionInterrupted(error)) {
        console.log('[report-export] save interrupted by permission', {
          durationMs: Date.now() - startedAt,
          error,
        });

        this.setData({
          showPermissionModal: true,
        });
        return false;
      }

      console.error('[report-export] save failed', {
        durationMs: Date.now() - startedAt,
        error,
      });
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

        console.log('[report-export] openSetting result:', JSON.stringify(authSetting));
        console.log('[report-export] writePhotosAlbum permission:', authSetting['scope.writePhotosAlbum']);

        if (hasPermission && filePath) {
          this.setData({
            isExporting: true,
          });

          try {
            const saved = await this.trySaveImageToAlbum(filePath, {
              allowPermissionRecovery: false,
              showFailureToast: false,
            });

            if (!saved) {
              showSystemPermissionHint();
            }
          } finally {
            this.setData({
              isExporting: false,
            });
          }
          return;
        }

        showSystemPermissionHint();
      },
      fail: (error) => {
        console.error('[report-export] openSetting failed', error);
        wx.showToast({
          title: '无法打开设置',
          icon: 'none',
        });
      },
    });
  },
});
