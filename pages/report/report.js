// 报告页直调 getRecords 云函数，绕过 record-service 缓存层，避免子集查询污染全局缓存。T5.1a 技术债，后续可通过给缓存 key 加时间范围参数解决。
const { callSilent } = require('../../services/request');
const medicationService = require('../../services/medication-service');
const { store } = require('../../store/index');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const {
  REPORT_DISCLAIMER,
  getSinceForDays,
  buildReportViewModel,
} = require('../../utils/report-helpers');
const {
  drawBloodPressureTrendChart,
  drawHeartRateChart,
} = require('../../utils/report-chart-renderer');

const PERIOD_OPTIONS = [
  { days: 7, label: '近7天' },
  { days: 30, label: '近30天' },
  { days: 90, label: '近90天' },
];

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
    profileId: '',
    periodOptions: PERIOD_OPTIONS,
    selectedDays: 7,
    isLoading: false,
    errorText: '',
    patientNameText: '未命名档案',
    medicationText: '暂无用药记录',
    emergencyText: '未设置',
    generatedAtText: '',
    banner: null,
    summaryCards: [],
    recentAlerts: [],
    hasRecords: false,
    hasHeartRateData: false,
    hideSensitiveInfo: false,
    disclaimer: REPORT_DISCLAIMER,
  },

  onLoad(options = {}) {
    this.reportRequestId = 0;
    this.chartRenderToken = 0;
    this.profile = null;
    this.activeMedications = [];
    this.rawRecords = [];
    this.generatedAt = new Date();
    this.pixelRatio = 1;
    this.hasEntered = false;

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

    this.loadReportData(7);
  },

  onShow() {
    this.syncFontScale();

    if (this.hasEntered && this.data.profileId) {
      this.loadReportData(this.data.selectedDays);
    }

    this.hasEntered = true;
  },

  onUnload() {
    this.chartRenderToken += 1;
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
    const records = Array.isArray(result.records) ? result.records : [];

    return {
      records,
      hasMore: result.hasMore === true,
    };
  },

  async loadReportData(days) {
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
      const [medicationResult, recordResult] = await Promise.all([
        medicationService.fetchMedications(profileId),
        this.fetchReportRecords(profileId, {
          since: getSinceForDays(days, now),
          until: now,
          limit: 200,
        }),
      ]);

      if (requestId !== this.reportRequestId) {
        return;
      }

      this.profile = findProfile(profileId) || profile;
      this.activeMedications = Array.isArray(medicationResult.activeMedications)
        ? medicationResult.activeMedications.slice()
        : [];
      this.rawRecords = Array.isArray(recordResult.records) ? recordResult.records.slice() : [];
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

    this.chartRecords = viewModel.chartRecords;
    this.chartThreshold = viewModel.threshold;

    this.setData({
      isLoading: false,
      errorText: '',
      patientNameText: viewModel.patient.nameText,
      medicationText: viewModel.patient.medicationText,
      emergencyText: viewModel.patient.emergencyText,
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
      this.chartRecords,
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
      this.chartRecords,
      this.chartThreshold,
      { width, height },
      this.data.selectedDays,
    );
  },

  handleSelectPeriod(event) {
    const days = Number(event.currentTarget.dataset.days);

    if (!days || days === this.data.selectedDays || this.data.isLoading) {
      return;
    }

    this.loadReportData(days);
  },

  handleTogglePrivacy(event) {
    this.setData({
      hideSensitiveInfo: !!(event.detail && event.detail.value),
    }, () => {
      this.applyViewModel();
    });
  },

  handleSaveReport() {
    wx.showToast({
      title: '导出功能开发中',
      icon: 'none',
    });
  },
});
