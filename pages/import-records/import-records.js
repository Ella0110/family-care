const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const { canWrite } = require('../../utils/permission-helpers');
const { parseCSV, formatEast8DateYMD, formatEast8TimeHM } = require('../../utils/csv-helpers');

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function buildPreview(validRecords, errors) {
  const valid = Array.isArray(validRecords) ? validRecords : [];
  const invalid = Array.isArray(errors) ? errors : [];

  return {
    total: valid.length + invalid.length,
    validCount: valid.length,
    errorCount: invalid.length,
    validRecords: valid.map((record) => {
      const payload = record.payload || {};
      return Object.assign({}, record, {
        dateText: formatEast8DateYMD(record.measuredAt),
        timeText: formatEast8TimeHM(record.measuredAt),
        valueText: payload.heartRate != null
          ? `${payload.systolic}/${payload.diastolic}，心率 ${payload.heartRate}`
          : `${payload.systolic}/${payload.diastolic}`,
      });
    }),
    errors: invalid,
  };
}

async function batchImport(profileId, validRecords, onProgress) {
  const CONCURRENCY = 5;
  const results = { success: 0, failed: 0, errors: [] };
  const records = Array.isArray(validRecords) ? validRecords.slice() : [];
  let completed = 0;

  for (let index = 0; index < records.length; index += CONCURRENCY) {
    const chunk = records.slice(index, index + CONCURRENCY);

    await Promise.all(
      chunk.map((record) =>
        recordService.saveRecord(
          profileId,
          record.payload,
          record.measuredAt,
          record.note,
          { skipPush: true },
        ).then(() => {
          results.success += 1;
        }).catch((error) => {
          results.failed += 1;
          results.errors.push({
            line: record._raw,
            reason: getErrorMessage(error) || '保存失败',
          });
          console.warn('[import-records] save failed', {
            record,
            error,
          });
        }),
      ),
    );

    completed += chunk.length;
    if (typeof onProgress === 'function') {
      onProgress(completed, records.length, results);
    }
  }

  return results;
}

function goBackToRecords(profileId) {
  if (!profileId) {
    wx.redirectTo({
      url: '/pages/home/home',
    });
    return;
  }

  const pages = getCurrentPages();
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }

  wx.redirectTo({
    url: `/pages/records-list/records-list?profileId=${profileId}`,
  });
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    profileId: '',
    csvText: '',
    hasPreview: false,
    preview: {
      total: 0,
      validCount: 0,
      errorCount: 0,
      validRecords: [],
      errors: [],
    },
    isImporting: false,
    importProgressText: '',
    hasImportResult: false,
    importResultText: '',
  },

  onLoad(options = {}) {
    this.syncFontScale();

    const profileId = options.profileId || '';
    const writable = profileId ? canWrite(store.getState(), profileId) : false;

    this.pendingRecords = [];

    this.setData({
      profileId,
    });

    if (!profileId) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      goBackToRecords('');
      return;
    }

    if (!writable) {
      wx.showToast({
        title: '你没有权限导入记录',
        icon: 'none',
      });
      goBackToRecords(profileId);
    }
  },

  onShow() {
    this.syncFontScale();
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  handleInput(event) {
    this.setData({
      csvText: event.detail.value,
      hasImportResult: false,
      importResultText: '',
      importProgressText: '',
    });
  },

  handleClear() {
    this.pendingRecords = [];
    this.setData({
      csvText: '',
      hasPreview: false,
      hasImportResult: false,
      importResultText: '',
      importProgressText: '',
      preview: {
        total: 0,
        validCount: 0,
        errorCount: 0,
        validRecords: [],
        errors: [],
      },
    });
  },

  handlePreview() {
    const parsed = parseCSV(this.data.csvText);
    this.pendingRecords = parsed.valid;
    const preview = buildPreview(parsed.valid, parsed.errors);

    this.setData({
      hasPreview: true,
      hasImportResult: false,
      importResultText: '',
      importProgressText: '',
      preview,
    });

    if (preview.validCount === 0) {
      wx.showToast({
        title: '无有效数据',
        icon: 'none',
      });
    }
  },

  async handleImport() {
    if (this.data.isImporting) {
      return;
    }

    const records = Array.isArray(this.pendingRecords) ? this.pendingRecords.slice() : [];
    if (!records.length) {
      wx.showToast({
        title: '无有效数据',
        icon: 'none',
      });
      return;
    }

    this.setData({
      isImporting: true,
      hasImportResult: false,
      importResultText: '',
      importProgressText: `正在导入 0/${records.length}...`,
    });

    try {
      const results = await batchImport(
        this.data.profileId,
        records,
        (completed, total) => {
          this.setData({
            importProgressText: `正在导入 ${completed}/${total}...`,
          });
        },
      );

      const resultText = results.failed > 0
        ? `成功导入 ${results.success} 条记录，${results.failed} 条导入失败`
        : `成功导入 ${results.success} 条记录`;

      this.setData({
        hasImportResult: true,
        importResultText: resultText,
        importProgressText: '',
      });
    } finally {
      this.setData({
        isImporting: false,
      });
    }
  },

  handleBackToRecords() {
    goBackToRecords(this.data.profileId);
  },
});
