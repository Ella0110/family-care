const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { callSilent } = require('../../services/request');
const { getErrorMessage } = require('../../utils/error-messages');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const { canWrite, isViewer } = require('../../utils/permission-helpers');
const { recordsToCSV, normalizeDate } = require('../../utils/csv-helpers');
const {
  EXPORT_IMAGE_CANVAS_WIDTH,
  buildRecentRange,
  measureRecordsImageHeight,
  drawRecordsImageTable,
} = require('../../utils/records-export-helpers');

function pad(value) {
  return String(value).padStart(2, '0');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function wrapSetClipboardData(data) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data,
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

function toDate(value) {
  return normalizeDate(value);
}

function toTimestamp(value) {
  const date = toDate(value);
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

async function fetchIndependentRecords(profileId, options = {}) {
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
  return {
    records: sortRecordsDesc(Array.isArray(result.records) ? result.records : []),
    hasMore: result.hasMore === true,
  };
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
    isExportingImage: false,
    isExportingCsv: false,
    exportCanvasHeight: 1,
    exportTempFilePath: '',
    showExportPreview: false,
    showPermissionModal: false,
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const profileId = options.profileId || '';
    const profile = profileId ? findProfile(profileId) : null;

    this.recordsById = {};
    this.loadedRecords = [];

    const state = store.getState();
    this.setData({
      profileId,
      profileName: profile ? profile.name : '当前档案',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
      canWriteCurrentProfile: profileId ? canWrite(state, profileId) : false,
      isViewerMode: profileId ? isViewer(state, profileId) : false,
    });

    if (!profileId) {
      this.setData({
        errorText: getErrorMessage({ code: 'PROFILE_NOT_FOUND' }),
      });
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
    this.loadedRecords = nextRecords;

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

  handleExportImage() {
    if (!this.data.profileId || this.data.isExportingImage || this.data.isLoading) {
      return;
    }

    const dayOptions = [7, 14, 30];
    wx.showActionSheet({
      itemList: dayOptions.map((days) => `近 ${days} 天`),
      success: (res) => {
        const days = dayOptions[res.tapIndex];
        if (!days) {
          return;
        }

        this.exportImageForDays(days);
      },
      fail: (error) => {
        if (!/cancel/i.test(getErrorReason(error))) {
          console.warn('[records-list] showActionSheet failed', error);
        }
      },
    });
  },

  async exportImageForDays(days) {
    const range = buildRecentRange(days);

    this.setData({
      isExportingImage: true,
    });

    try {
      const result = await fetchIndependentRecords(this.data.profileId, {
        since: range.since,
        until: range.until,
        limit: 200,
      });

      if (!result.records.length) {
        wx.showToast({
          title: '该时间段内暂无记录',
          icon: 'none',
        });
        return;
      }

      const exportHeight = measureRecordsImageHeight(result.records.length);
      this.setData({
        exportCanvasHeight: exportHeight,
      });

      await wait(80);

      const canvasResult = await new Promise((resolve, reject) => {
        wx.createSelectorQuery()
          .select('#recordsExportCanvas')
          .fields({ node: true, size: true }, (res) => {
            if (!res || !res.node) {
              reject(new Error('EXPORT_CANVAS_NOT_FOUND'));
              return;
            }

            resolve(res);
          })
          .exec();
      });

      const canvas = canvasResult.node;
      const ctx = canvas.getContext('2d');

      canvas.width = EXPORT_IMAGE_CANVAS_WIDTH;
      canvas.height = exportHeight;

      drawRecordsImageTable(ctx, {
        records: result.records,
        range,
        width: EXPORT_IMAGE_CANVAS_WIDTH,
      });

      await wait(80);

      const exportResult = await wrapCanvasToTempFilePath(canvas, {
        x: 0,
        y: 0,
        width: EXPORT_IMAGE_CANVAS_WIDTH,
        height: exportHeight,
        destWidth: EXPORT_IMAGE_CANVAS_WIDTH,
        destHeight: exportHeight,
      });

      this.setData({
        exportTempFilePath: exportResult.tempFilePath || '',
        showExportPreview: true,
      });
    } catch (error) {
      console.error('[records-list] export image failed', error);
      wx.showToast({
        title: '生成失败，请尝试更短时间范围',
        icon: 'none',
      });
    } finally {
      this.setData({
        isExportingImage: false,
      });
    }
  },

  async handleExportData() {
    if (!this.data.profileId || this.data.isExportingCsv) {
      return;
    }

    this.setData({
      isExportingCsv: true,
    });

    try {
      const result = await fetchIndependentRecords(this.data.profileId, {
        limit: 200,
      });
      const csvText = recordsToCSV(result.records, {
        hasMore: result.hasMore,
      });

      await wrapSetClipboardData(csvText);
      wx.showToast({
        title: '已复制到剪贴板',
        icon: 'success',
      });
    } catch (error) {
      console.error('[records-list] export csv failed', error);
      wx.showToast({
        title: '导出失败，请重试',
        icon: 'none',
      });
    } finally {
      this.setData({
        isExportingCsv: false,
      });
    }
  },

  handleImportRecords() {
    if (!this.data.profileId) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canWriteCurrentProfile) {
      wx.showToast({
        title: '你没有权限导入记录',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/import-records/import-records?profileId=${this.data.profileId}`,
    });
  },

  onCancelPreview() {
    if (this.data.isExportingImage) {
      return;
    }

    this.setData({
      showExportPreview: false,
      exportTempFilePath: '',
    });
  },

  async onConfirmSave() {
    const filePath = this.data.exportTempFilePath;
    if (!filePath) {
      wx.showToast({
        title: '预览图片不存在，请重新导出',
        icon: 'none',
      });
      return;
    }

    this.setData({
      isExportingImage: true,
    });

    try {
      const saved = await this.trySaveImageToAlbum(filePath, {
        allowPermissionRecovery: true,
      });

      if (saved) {
        this.setData({
          showExportPreview: false,
          exportTempFilePath: '',
        });
      }
    } finally {
      this.setData({
        isExportingImage: false,
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

      console.error('[records-list] save image failed', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none',
      });
      return false;
    }
  },

  handleClosePermissionModal() {
    this.setData({
      showPermissionModal: false,
    });
  },

  handleOpenPermissionSetting() {
    const filePath = this.data.exportTempFilePath;

    this.setData({
      showPermissionModal: false,
    });

    wx.openSetting({
      success: async (res) => {
        const authSetting = res && res.authSetting ? res.authSetting : {};
        const hasPermission = authSetting['scope.writePhotosAlbum'] === true;

        if (hasPermission && filePath) {
          this.setData({
            isExportingImage: true,
          });

          try {
            const saved = await this.trySaveImageToAlbum(filePath, {
              allowPermissionRecovery: false,
            });

            if (!saved) {
              showSystemPermissionHint();
            } else {
              this.setData({
                showExportPreview: false,
                exportTempFilePath: '',
              });
            }
          } finally {
            this.setData({
              isExportingImage: false,
            });
          }
          return;
        }

        showSystemPermissionHint();
      },
      fail: (error) => {
        console.error('[records-list] openSetting failed', error);
        wx.showToast({
          title: '无法打开设置',
          icon: 'none',
        });
      },
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
