const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const { canWrite } = require('../../utils/permission-helpers');
const { parseCSV, formatEast8DateYMD, formatEast8TimeHM, normalizeDate } = require('../../utils/csv-helpers');

const PARSE_DEBOUNCE_MS = 500;
const IMPORT_DEDUPE_FETCH_LIMIT = 500;
const IMPORT_FEEDBACK_DURATION_MS = 1000;

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

function createEmptyPreview() {
  return {
    total: 0,
    validCount: 0,
    errorCount: 0,
    validRecords: [],
    errors: [],
  };
}

function toTimestamp(value) {
  const date = normalizeDate(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function floorToMinuteTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0;
  }

  return Math.floor(timestamp / 60000) * 60000;
}

function ceilToMinuteTimestamp(timestamp) {
  const minuteStart = floorToMinuteTimestamp(timestamp);
  if (!minuteStart) {
    return 0;
  }

  return minuteStart + 59999;
}

function toMinuteKey(measuredAt) {
  const date = normalizeDate(measuredAt);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  date.setSeconds(0, 0);
  return date.getTime();
}

function buildImportDedupKey(record) {
  if (!record) {
    return '';
  }

  const minuteKey = toMinuteKey(record.measuredAt);
  if (!minuteKey) {
    return '';
  }

  const payload = record.payload || {};
  const systolic = Number(
    Object.prototype.hasOwnProperty.call(payload, 'systolic') ? payload.systolic : record.systolic,
  );
  const diastolic = Number(
    Object.prototype.hasOwnProperty.call(payload, 'diastolic') ? payload.diastolic : record.diastolic,
  );

  return `${minuteKey}_${systolic}_${diastolic}`;
}

async function dedupeImportRecords(profileId, records) {
  const pendingRecords = Array.isArray(records) ? records.slice() : [];
  if (!profileId || !pendingRecords.length) {
    return {
      recordsToImport: pendingRecords,
      duplicateCount: 0,
    };
  }

  const timestamps = pendingRecords
    .map((record) => toTimestamp(record && record.measuredAt))
    .filter((value) => value > 0);

  if (!timestamps.length) {
    return {
      recordsToImport: pendingRecords,
      duplicateCount: 0,
    };
  }

  const since = floorToMinuteTimestamp(Math.min.apply(null, timestamps));
  const until = ceilToMinuteTimestamp(Math.max.apply(null, timestamps));
  console.log('[import-records] start getRecords for dedupe', {
    profileId,
    since,
    until,
    candidateCount: pendingRecords.length,
  });
  const result = await recordService.fetchRecords(profileId, {
    since,
    until,
    limit: IMPORT_DEDUPE_FETCH_LIMIT,
  });
  console.log('[import-records] getRecords returned', {
    success: true,
    existingCount: Array.isArray(result.records) ? result.records.length : 0,
    hasMore: result.hasMore === true,
  });

  const existingKeys = new Set();
  (result.records || []).forEach((existingRecord) => {
    const existKey = buildImportDedupKey(existingRecord);
    console.log('已有记录 measuredAt:', typeof existingRecord.measuredAt, existingRecord.measuredAt);
    console.log('已有记录 dedupe key:', existKey);
    if (existKey) {
      existingKeys.add(existKey);
    }
  });

  const recordsToImport = [];
  let duplicateCount = 0;

  pendingRecords.forEach((importRecord) => {
    const importKey = buildImportDedupKey(importRecord);
    console.log('待导入记录 measuredAt:', typeof importRecord.measuredAt, importRecord.measuredAt);
    console.log('去重 key 对比 - 待导入:', importKey, '已有 Set:', Array.from(existingKeys));
    console.log('去重 key 对比 - 待导入:', importKey, '已有:', existingKeys.has(importKey) ? importKey : '');

    if (!importKey) {
      recordsToImport.push(importRecord);
      return;
    }

    if (existingKeys.has(importKey)) {
      console.log(`待导入 key: ${importKey} 在已有 Set 中找到，标记为重复`);
      duplicateCount += 1;
      return;
    }

    existingKeys.add(importKey);
    recordsToImport.push(importRecord);
  });

  return {
    recordsToImport,
    duplicateCount,
  };
}

async function batchImport(profileId, validRecords, onProgress) {
  const CONCURRENCY = 5;
  const results = { success: 0, failed: 0, errors: [] };
  const records = Array.isArray(validRecords) ? validRecords.slice() : [];
  let completed = 0;
  console.log('[import-records] start saveRecord batch', {
    profileId,
    total: records.length,
  });

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
          console.log('[import-records] saveRecord completed', {
            measuredAt: record.measuredAt,
            payload: record.payload,
            successCount: results.success,
          });
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

  console.log('[import-records] all saveRecord completed', results);
  return results;
}

function goBackToRecords(profileId) {
  if (!profileId) {
    wx.switchTab({
      url: '/pages/data/data',
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
    isParsing: false,
    parseStatusTone: '',
    parseStatusText: '',
    hasPreview: false,
    preview: createEmptyPreview(),
    isImporting: false,
    importProgressText: '',
    hasImportResult: false,
    importResultText: '',
  },

  onLoad(options = {}) {
    this.syncFontScale();
    this.parseTimer = null;
    this.parseRequestId = 0;

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

  onUnload() {
    this.cancelScheduledParse();
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  cancelScheduledParse() {
    if (this.parseTimer) {
      clearTimeout(this.parseTimer);
      this.parseTimer = null;
    }
  },

  resetPreviewState(extraPatch = {}) {
    this.pendingRecords = [];
    this.setData(Object.assign({
      isParsing: false,
      parseStatusTone: '',
      parseStatusText: '',
      hasPreview: false,
      preview: createEmptyPreview(),
    }, extraPatch));
  },

  schedulePreviewParse() {
    const text = String(this.data.csvText || '').trim();
    this.cancelScheduledParse();

    if (!text) {
      this.resetPreviewState();
      return;
    }

    this.parseRequestId += 1;
    const requestId = this.parseRequestId;
    this.setData({
      isParsing: true,
      parseStatusTone: 'pending',
      parseStatusText: '解析中...',
    });

    this.parseTimer = setTimeout(() => {
      this.parseTimer = null;
      this.runPreviewParse(requestId);
    }, PARSE_DEBOUNCE_MS);
  },

  flushPreviewParse() {
    if (!this.parseTimer) {
      return;
    }

    clearTimeout(this.parseTimer);
    this.parseTimer = null;
    this.runPreviewParse(this.parseRequestId);
  },

  runPreviewParse(requestId) {
    const text = String(this.data.csvText || '').trim();
    if (!text) {
      this.resetPreviewState();
      return;
    }

    const parsed = parseCSV(this.data.csvText);
    if (requestId !== this.parseRequestId) {
      return;
    }

    this.pendingRecords = parsed.valid;
    const preview = buildPreview(parsed.valid, parsed.errors);
    const hasErrors = preview.errorCount > 0;
    const statusText = hasErrors
      ? `共 ${preview.total} 条，有效 ${preview.validCount} 条，错误 ${preview.errorCount} 条`
      : `${preview.validCount} 条血压数据已成功解析`;

    this.setData({
      isParsing: false,
      parseStatusTone: hasErrors ? 'warning' : 'success',
      parseStatusText: statusText,
      hasPreview: preview.total > 0,
      preview,
    });
  },

  handleInput(event) {
    this.setData({
      csvText: event.detail.value,
      hasImportResult: false,
      importResultText: '',
      importProgressText: '',
    });
    this.schedulePreviewParse();
  },

  handleInputBlur() {
    this.flushPreviewParse();
  },

  handleClear() {
    this.cancelScheduledParse();
    this.parseRequestId += 1;
    this.resetPreviewState({
      csvText: '',
      hasImportResult: false,
      importResultText: '',
      importProgressText: '',
    });
  },

  async handleImport() {
    console.log('[import-records] entered handleImport');
    if (this.data.isImporting || this.data.isParsing) {
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
    wx.showLoading({
      title: '正在导入',
      mask: true,
    });
    let loadingVisible = true;
    const hideImportLoading = () => {
      if (!loadingVisible) {
        return;
      }

      wx.hideLoading();
      loadingVisible = false;
    };

    try {
      let dedupeResult;
      try {
        dedupeResult = await dedupeImportRecords(
          this.data.profileId,
          records,
        );
      } catch (error) {
        console.warn('[import-records] getRecords dedupe failed, fallback to direct import', error);
        console.log('[import-records] getRecords returned', {
          success: false,
          error: getErrorMessage(error),
        });
        dedupeResult = {
          recordsToImport: records.slice(),
          duplicateCount: 0,
        };
      }
      const { recordsToImport, duplicateCount } = dedupeResult;
      console.log('[import-records] dedupe result', {
        duplicateCount,
        remainingCount: recordsToImport.length,
      });

      if (!recordsToImport.length) {
        const duplicateOnlyText = '所有记录已存在，无需重复导入';
        this.setData({
          hasImportResult: true,
          importResultText: duplicateOnlyText,
          importProgressText: '',
        });
        hideImportLoading();
        wx.showToast({
          title: duplicateOnlyText,
          icon: 'none',
          duration: IMPORT_FEEDBACK_DURATION_MS,
        });
        return;
      }

      this.setData({
        importProgressText: `正在导入 0/${recordsToImport.length}...`,
      });

      const results = await batchImport(
        this.data.profileId,
        recordsToImport,
        (completed, total) => {
          this.setData({
            importProgressText: `正在导入 ${completed}/${total}...`,
          });
        },
      );

      let resultText = results.failed > 0
        ? `成功导入 ${results.success} 条记录，${results.failed} 条导入失败`
        : `成功导入 ${results.success} 条记录`;

      if (duplicateCount > 0) {
        resultText = `发现 ${duplicateCount} 条重复记录已跳过，实际导入 ${results.success} 条`;
        if (results.failed > 0) {
          resultText = `${resultText}，${results.failed} 条导入失败`;
        }
      }

      this.setData({
        hasImportResult: true,
        importResultText: resultText,
        importProgressText: '',
      });
      const resultToastText = duplicateCount > 0
        ? `已跳过 ${duplicateCount} 条重复`
        : (results.failed > 0 ? '导入完成' : '导入成功');
      hideImportLoading();
      wx.showToast({
        title: resultToastText,
        icon: results.failed > 0 ? 'none' : 'success',
        duration: IMPORT_FEEDBACK_DURATION_MS,
      });
    } catch (error) {
      console.error('[import-records] import failed', error);
      const message = getErrorMessage(error);
      this.setData({
        hasImportResult: true,
        importResultText: message,
        importProgressText: '',
      });
      hideImportLoading();
      wx.showToast({
        title: message,
        icon: 'none',
      });
    } finally {
      hideImportLoading();
      this.setData({
        isImporting: false,
      });
    }
  },

  handleBackToRecords() {
    goBackToRecords(this.data.profileId);
  },
});
