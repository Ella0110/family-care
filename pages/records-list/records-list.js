const { store } = require('../../store/index');
const { callSilent } = require('../../services/request');
const { getErrorMessage } = require('../../utils/error-messages');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const { canWrite, isViewer, getCurrentRelationship } = require('../../utils/permission-helpers');
const { recordsToCSV, normalizeDate } = require('../../utils/csv-helpers');
const { deleteRecordById } = require('../../utils/record-editor');
const {
  EXPORT_IMAGE_CANVAS_WIDTH,
  buildRecentRange,
  measureRecordsImageHeight,
  drawRecordsImageTable,
} = require('../../utils/records-export-helpers');

const DELETE_ACTION_WIDTH_RPX = 160;
const DELETE_ACTION_THRESHOLD_RPX = 60;
const FEEDBACK_TOAST_MS = 1500;
const EXPORT_DAY_OPTIONS = [7, 30, 90];
const MONTH_PICKER_START_YEAR = 2000;
const MAX_EXPORT_CANVAS_HEIGHT = 4096;

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

function formatMonthLabel(year, month) {
  return `${year}年${month}月`;
}

function buildMonthPickerRanges(currentYear = new Date().getFullYear()) {
  const years = [];
  for (let year = MONTH_PICKER_START_YEAR; year <= currentYear; year += 1) {
    years.push(`${year}年`);
  }

  const months = [];
  for (let month = 1; month <= 12; month += 1) {
    months.push(`${month}月`);
  }

  return [years, months];
}

function buildMonthPickerState(records, selectedYear, selectedMonth) {
  const fallbackDate = new Date();
  const fallbackYear = fallbackDate.getFullYear();
  const fallbackMonth = fallbackDate.getMonth() + 1;
  const monthMap = new Map();

  (records || []).forEach((record) => {
    const measuredAt = toDate(record && record.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) {
      return;
    }

    const year = measuredAt.getFullYear();
    const month = measuredAt.getMonth() + 1;
    if (!monthMap.has(year)) {
      monthMap.set(year, new Set());
    }
    monthMap.get(year).add(month);
  });

  if (!monthMap.size) {
    return {
      ranges: buildMonthPickerRanges(fallbackYear),
      value: [fallbackYear - MONTH_PICKER_START_YEAR, fallbackMonth - 1],
      year: fallbackYear,
      month: fallbackMonth,
      label: formatMonthLabel(fallbackYear, fallbackMonth),
    };
  }

  const years = Array.from(monthMap.keys()).sort((left, right) => left - right);
  const normalizedYear = years.includes(selectedYear) ? selectedYear : years[years.length - 1];
  const monthsInYear = Array.from(monthMap.get(normalizedYear) || []).sort((left, right) => left - right);
  const normalizedMonth = monthsInYear.includes(selectedMonth)
    ? selectedMonth
    : monthsInYear[monthsInYear.length - 1];

  return {
    ranges: [
      years.map((year) => `${year}年`),
      Array.from({ length: 12 }, (_, index) => `${index + 1}月`),
    ],
    value: [years.indexOf(normalizedYear), normalizedMonth - 1],
    year: normalizedYear,
    month: normalizedMonth,
    label: formatMonthLabel(normalizedYear, normalizedMonth),
  };
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function canDeleteRecord(record, options = {}) {
  if (!record) {
    return false;
  }

  if (options.role === 'owner') {
    return true;
  }

  return Boolean(
    options.canWrite
      && options.currentUserId
      && record.recordedBy
      && record.recordedBy === options.currentUserId,
  );
}

function buildRecorderText(record, options = {}) {
  if (!options.showRecorderLabel || !record) {
    return '';
  }

  if (options.currentUserId && record.recordedBy === options.currentUserId) {
    return '我录入';
  }

  const recordedByName = String(record.recordedByName || '').trim();
  return recordedByName ? `由 ${recordedByName} 录入` : '';
}

function shouldShowRecorderLabel(records, options = {}) {
  if (options.role && options.role !== 'owner') {
    return true;
  }

  const recorderIds = new Set(
    (Array.isArray(records) ? records : [])
      .map((record) => record && record.recordedBy)
      .filter(Boolean),
  );

  if (!recorderIds.size) {
    return false;
  }

  if (options.currentUserId && (recorderIds.size > 1 || !recorderIds.has(options.currentUserId))) {
    return true;
  }

  return recorderIds.size > 1;
}

function resolveExportScale(logicalHeight, systemDpr) {
  let exportScale = Math.max(1, Number(systemDpr) || 1);

  while (logicalHeight * exportScale > MAX_EXPORT_CANVAS_HEIGHT && exportScale > 1) {
    exportScale -= 0.5;
  }

  return Math.max(1, Math.round(exportScale * 2) / 2);
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
    data.since = toTimestamp(options.since);
  }

  if (options.until) {
    data.until = toTimestamp(options.until);
  }

  const result = await callSilent('getRecords', data);
  return {
    records: sortRecordsDesc(Array.isArray(result.records) ? result.records : []),
    hasMore: result.hasMore === true,
  };
}

function buildStatusMeta(status) {
  if (!status) {
    return {
      text: '正常',
      className: 'records-status--normal',
    };
  }

  return {
    text: status.tagText,
    className: `${status.recordsClassName}${status.level === 'stage3' ? ' records-status--strong' : ''}`,
  };
}

function getSwipeOffset(recordId, swipeState) {
  if (swipeState.activeRecordId === recordId) {
    return swipeState.activeOffset;
  }

  if (swipeState.openRecordId === recordId) {
    return -DELETE_ACTION_WIDTH_RPX;
  }

  return 0;
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    profileId: '',
    profileName: '当前档案',
    referenceLines: getReferenceLines(),
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    monthPickerRanges: buildMonthPickerRanges(),
    monthPickerValue: [new Date().getFullYear() - MONTH_PICKER_START_YEAR, new Date().getMonth()],
    monthLabel: formatMonthLabel(new Date().getFullYear(), new Date().getMonth() + 1),
    scrollTargetId: '',
    groups: [],
    hasRecords: false,
    hasMore: false,
    isLoading: false,
    errorText: '',
    canWriteCurrentProfile: false,
    isViewerMode: false,
    isExportingImage: false,
    isExportingCsv: false,
    showExportSheet: false,
    selectedExportDays: 7,
    exportCanvasHeight: 1,
    exportTempFilePath: '',
    showExportPreview: false,
    showPermissionModal: false,
    openDeleteRecordId: '',
    activeSwipeRecordId: '',
    swipeOffsetRpx: 0,
    showDeleteDialog: false,
    pendingDeleteRecordId: '',
    pendingDeleteRecordText: '',
    isDeletingRecord: false,
    feedbackVisible: false,
    feedbackTitle: '',
    showRecordPanel: false,
    editingRecord: null,
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const profileId = options.profileId || '';
    const profile = profileId ? findProfile(profileId) : null;
    const state = store.getState();
    const now = new Date();

    this.recordsById = {};
    this.loadedRecords = [];
    this.monthAnchors = {};
    this.feedbackTimer = null;
    this.rowTouchState = null;
    this.lastSwipeGesture = null;
    this.lastSwipeMoveAt = 0;
    this.isClosingRecordPanel = false;
    this.pendingPanelRefresh = false;
    this.rowPathMap = {};
    this.currentUserId = state.user && state.user._id;
    this.currentRelationshipRole = '';

    this.setData({
      profileId,
      profileName: profile ? profile.name : '当前档案',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
      canWriteCurrentProfile: profileId ? canWrite(state, profileId) : false,
      isViewerMode: profileId ? isViewer(state, profileId) : false,
      selectedYear: now.getFullYear(),
      selectedMonth: now.getMonth() + 1,
      monthPickerRanges: buildMonthPickerRanges(now.getFullYear()),
      monthPickerValue: [now.getFullYear() - MONTH_PICKER_START_YEAR, now.getMonth()],
      monthLabel: formatMonthLabel(now.getFullYear(), now.getMonth() + 1),
    });

    if (!profileId) {
      this.setData({
        errorText: getErrorMessage({ code: 'PROFILE_NOT_FOUND' }),
      });
    }
  },

  onShow() {
    this.syncFontScale();
    this.refreshProfileContext();
    this.loadAllRecords();
  },

  onUnload() {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }

    this.rowTouchState = null;
    this.lastSwipeGesture = null;
    this.lastSwipeMoveAt = 0;
  },

  syncFontScale() {
    syncFontData.call(this);
  },

  refreshProfileContext() {
    const profile = findProfile(this.data.profileId);
    const state = store.getState();
    const relationship = getCurrentRelationship(state, this.data.profileId);

    this.currentUserId = state.user && state.user._id;
    this.currentRelationshipRole = relationship ? relationship.role : '';

    this.setData({
      profileName: profile ? profile.name : '当前档案',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
      canWriteCurrentProfile: this.data.profileId ? canWrite(state, this.data.profileId) : false,
      isViewerMode: this.data.profileId ? isViewer(state, this.data.profileId) : false,
    });
  },

  buildGroups(records) {
    const referenceLines = getReferenceLines(this.data.referenceLines);
    const groups = [];
    const groupMap = {};
    const seenMonthKeys = new Set();
    const showRecorderLabel = shouldShowRecorderLabel(records, {
      role: this.currentRelationshipRole,
      currentUserId: this.currentUserId,
    });
    const swipeState = {
      openRecordId: this.data.openDeleteRecordId,
      activeRecordId: this.data.activeSwipeRecordId,
      activeOffset: this.data.swipeOffsetRpx,
    };

    (records || []).forEach((record) => {
      const measuredAt = toDate(record.measuredAt);
      if (Number.isNaN(measuredAt.getTime())) {
        return;
      }

      const key = dateKey(measuredAt);
      if (!groupMap[key]) {
        const monthKey = `${measuredAt.getFullYear()}-${pad(measuredAt.getMonth() + 1)}`;
        const anchorId = !seenMonthKeys.has(monthKey) ? `month-${monthKey}` : '';
        seenMonthKeys.add(monthKey);
        groupMap[key] = {
          date: key,
          label: formatDateLabel(measuredAt),
          monthKey,
          anchorId,
          records: [],
        };
        groups.push(groupMap[key]);
      }

      const payload = record.payload || {};
      const status = getBPStatusDisplay(payload.systolic, payload.diastolic, referenceLines);
      const statusMeta = buildStatusMeta(status);
      const swipeOffset = getSwipeOffset(record._id, swipeState);
      const canDelete = canDeleteRecord(record, {
        role: this.currentRelationshipRole,
        canWrite: this.data.canWriteCurrentProfile,
        currentUserId: this.currentUserId,
      });
      const recorderText = buildRecorderText(record, {
        currentUserId: this.currentUserId,
        showRecorderLabel,
      });
      groupMap[key].records.push(Object.assign({}, record, {
        timeText: formatTime(measuredAt),
        valueText: `${payload.systolic} / ${payload.diastolic}`,
        heartRateText: payload.heartRate ? `心率 ${payload.heartRate} bpm` : '',
        recorderText,
        canDelete,
        statusText: statusMeta.text,
        statusClassName: statusMeta.className,
        swipeOffsetText: `transform: translateX(${swipeOffset}rpx);`,
      }));
    });

    return groups;
  },

  syncGroups() {
    const groups = this.buildGroups(this.loadedRecords);
    const monthPickerState = buildMonthPickerState(
      this.loadedRecords,
      this.data.selectedYear,
      this.data.selectedMonth,
    );

    this.monthAnchors = {};
    this.rowPathMap = {};
    groups.forEach((group, groupIndex) => {
      if (group.anchorId) {
        this.monthAnchors[group.monthKey] = group.anchorId;
      }

      (group.records || []).forEach((record, recordIndex) => {
        this.rowPathMap[record._id] = `groups[${groupIndex}].records[${recordIndex}].swipeOffsetText`;
      });
    });

    this.setData({
      groups,
      hasRecords: this.loadedRecords.length > 0,
      monthPickerRanges: monthPickerState.ranges,
      monthPickerValue: monthPickerState.value,
      selectedYear: monthPickerState.year,
      selectedMonth: monthPickerState.month,
      monthLabel: monthPickerState.label,
    });
  },

  applySwipePatch(entries, statePatch = {}, callback) {
    const patch = Object.assign({}, statePatch);
    let hasEntryPatch = false;

    (entries || []).forEach(([recordId, offset]) => {
      const path = this.rowPathMap[recordId];
      if (!path) {
        return;
      }

      patch[path] = `transform: translateX(${offset}rpx);`;
      hasEntryPatch = true;
    });

    if (!hasEntryPatch && !Object.keys(statePatch).length) {
      if (typeof callback === 'function') {
        callback();
      }
      return;
    }

    this.setData(patch, callback);
  },

  async loadAllRecords() {
    if (!this.data.profileId) {
      return;
    }

    const profileId = this.data.profileId;
    const requestKey = `${profileId}:all`;

    this.closeSwipeRow();
    this.setData({
      isLoading: true,
      errorText: '',
    });

    try {
      const result = await fetchIndependentRecords(profileId, { limit: 200 });

      if (requestKey !== `${this.data.profileId}:all`) {
        return;
      }

      this.loadedRecords = result.records;
      this.recordsById = {};
      result.records.forEach((record) => {
        this.recordsById[record._id] = record;
      });

      this.setData({
        hasMore: result.hasMore,
        isLoading: false,
        errorText: '',
      });
      this.syncGroups();
    } catch (error) {
      if (requestKey !== `${this.data.profileId}:all`) {
        return;
      }

      this.loadedRecords = [];
      this.recordsById = {};
      this.setData({
        groups: [],
        hasRecords: false,
        hasMore: false,
        isLoading: false,
        errorText: getErrorMessage(error),
      });
    }
  },

  handleMonthPickerChange(event) {
    const value = Array.isArray(event.detail && event.detail.value) ? event.detail.value : [0, 0];
    const yearIndex = Number(value[0]) || 0;
    const monthIndex = Number(value[1]) || 0;
    const yearOptions = Array.isArray(this.data.monthPickerRanges) ? this.data.monthPickerRanges[0] || [] : [];
    const yearText = yearOptions[yearIndex] || '';
    const year = parseInt(yearText, 10) || (MONTH_PICKER_START_YEAR + yearIndex);
    const month = monthIndex + 1;

    this.setData({
      selectedYear: year,
      selectedMonth: month,
      monthPickerValue: [yearIndex, monthIndex],
      monthLabel: formatMonthLabel(year, month),
    }, () => {
      this.scrollToMonth(year, month);
    });
  },

  scrollToMonth(year, month) {
    const monthKey = `${year}-${pad(month)}`;
    const anchorId = this.monthAnchors[monthKey];

    if (!anchorId) {
      wx.showToast({
        title: '该月份暂无记录',
        icon: 'none',
      });
      return;
    }

    this.setData({
      scrollTargetId: anchorId,
    });

    wx.nextTick(() => {
      wx.pageScrollTo({
        selector: `#${anchorId}`,
        duration: 220,
      });
    });
  },

  handleOpenExportSheet() {
    if (this.data.isLoading || !!this.data.errorText) {
      return;
    }

    this.closeSwipeRow();
    this.setData({
      showExportSheet: true,
      selectedExportDays: this.data.selectedExportDays || 7,
    });
  },

  handleCloseExportSheet() {
    this.setData({
      showExportSheet: false,
    });
  },

  handleSelectExportDays(event) {
    const days = Number(event.currentTarget.dataset.days);
    if (!EXPORT_DAY_OPTIONS.includes(days)) {
      return;
    }

    this.setData({
      selectedExportDays: days,
    });
  },

  async handleExportImage() {
    if (!this.data.profileId || this.data.isExportingImage || this.data.isLoading) {
      return;
    }

    this.setData({
      showExportSheet: false,
    });

    const days = this.data.selectedExportDays || 7;
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
      const exportScale = resolveExportScale(
        exportHeight,
        Number(wx.getSystemInfoSync().pixelRatio) || 1,
      );
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

      canvas.width = Math.max(1, Math.round(EXPORT_IMAGE_CANVAS_WIDTH * exportScale));
      canvas.height = Math.max(1, Math.round(exportHeight * exportScale));
      ctx.scale(exportScale, exportScale);

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
        destWidth: Math.max(1, Math.round(EXPORT_IMAGE_CANVAS_WIDTH * exportScale)),
        destHeight: Math.max(1, Math.round(exportHeight * exportScale)),
      });

      this.setData({
        exportTempFilePath: exportResult.tempFilePath || '',
        showExportPreview: true,
      });
    } catch (error) {
      console.error('[records-list] export image failed', error);
      wx.showToast({
        title: '生成失败，请稍后重试',
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
      showExportSheet: false,
      isExportingCsv: true,
    });

    try {
      const days = this.data.selectedExportDays || 7;
      const range = buildRecentRange(days);
      const result = await fetchIndependentRecords(this.data.profileId, {
        since: range.since,
        until: range.until,
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

  closeSwipeRow() {
    if (!this.data.openDeleteRecordId && !this.data.activeSwipeRecordId) {
      return;
    }

    const entries = [];
    if (this.data.openDeleteRecordId) {
      entries.push([this.data.openDeleteRecordId, 0]);
    }
    if (
      this.data.activeSwipeRecordId
      && this.data.activeSwipeRecordId !== this.data.openDeleteRecordId
    ) {
      entries.push([this.data.activeSwipeRecordId, 0]);
    }

    this.applySwipePatch(entries, {
      openDeleteRecordId: '',
      activeSwipeRecordId: '',
      swipeOffsetRpx: 0,
    });
  },

  handleRowTouchStart(event) {
    if (!this.data.canWriteCurrentProfile || this.data.showDeleteDialog || this.data.showRecordPanel) {
      return;
    }

    const recordId = event.currentTarget.dataset.recordId;
    const record = this.recordsById[recordId];
    const touch = event.touches && event.touches[0];
    if (!recordId || !touch || !canDeleteRecord(record, {
      role: this.currentRelationshipRole,
      canWrite: this.data.canWriteCurrentProfile,
      currentUserId: this.currentUserId,
    })) {
      return;
    }

    if (this.data.openDeleteRecordId && this.data.openDeleteRecordId !== recordId) {
      this.applySwipePatch([[this.data.openDeleteRecordId, 0]], {
        openDeleteRecordId: '',
      });
    }

    this.rowTouchState = {
      recordId,
      startX: touch.clientX,
      startY: touch.clientY,
      baseOffset: this.data.openDeleteRecordId === recordId ? -DELETE_ACTION_WIDTH_RPX : 0,
      direction: '',
      moved: false,
    };
  },

  handleRowTouchMove(event) {
    const state = this.rowTouchState;
    const recordId = event.currentTarget.dataset.recordId;
    const touch = event.touches && event.touches[0];

    if (!state || state.recordId !== recordId || !touch) {
      return;
    }

    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;

    if (!state.direction) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
        return;
      }

      state.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }

    if (state.direction !== 'horizontal') {
      return;
    }

    const moveAt = Date.now();
    if (moveAt - this.lastSwipeMoveAt < 16) {
      return;
    }
    this.lastSwipeMoveAt = moveAt;

    let nextOffset = state.baseOffset + deltaX;
    nextOffset = Math.min(0, nextOffset);
    nextOffset = Math.max(-DELETE_ACTION_WIDTH_RPX, nextOffset);

    state.moved = true;

    this.applySwipePatch([[recordId, nextOffset]], {
      activeSwipeRecordId: recordId,
      swipeOffsetRpx: nextOffset,
    });
  },

  handleRowTouchEnd() {
    const state = this.rowTouchState;
    if (!state) {
      return;
    }

    if (state.direction !== 'horizontal' || !state.moved) {
      this.rowTouchState = null;
      return;
    }

    const finalOffset = this.data.activeSwipeRecordId === state.recordId
      ? this.data.swipeOffsetRpx
      : state.baseOffset;
    const shouldOpen = Math.abs(finalOffset) > DELETE_ACTION_THRESHOLD_RPX;

    this.lastSwipeGesture = {
      recordId: state.recordId,
      at: Date.now(),
    };

    this.setData({
      openDeleteRecordId: shouldOpen ? state.recordId : '',
      activeSwipeRecordId: '',
      swipeOffsetRpx: 0,
    });

    this.applySwipePatch([[state.recordId, shouldOpen ? -DELETE_ACTION_WIDTH_RPX : 0]]);

    this.rowTouchState = null;
  },

  handleDeleteActionTap(event) {
    const recordId = event.currentTarget.dataset.recordId;
    const record = this.recordsById[recordId];

    if (!record || !canDeleteRecord(record, {
      role: this.currentRelationshipRole,
      canWrite: this.data.canWriteCurrentProfile,
      currentUserId: this.currentUserId,
    })) {
      return;
    }

    const systemInfo = wx.getSystemInfoSync();
    const isAndroid = systemInfo.platform === 'android';
    if (isAndroid) {
      wx.showModal({
        title: '确定删除此记录？',
        content: '删除后数据将无法恢复',
        confirmText: '删除',
        confirmColor: '#FF3B30',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) {
            return;
          }

          this.deleteRecordWithFeedback(recordId);
        },
      });
      return;
    }

    this.setData({
      showDeleteDialog: true,
      pendingDeleteRecordId: recordId,
      pendingDeleteRecordText: `${record.payload.systolic} / ${record.payload.diastolic}`,
    });
  },

  handleDeleteDialogMaskTap() {
    if (this.data.isDeletingRecord) {
      return;
    }

    this.setData({
      showDeleteDialog: false,
      pendingDeleteRecordId: '',
      pendingDeleteRecordText: '',
    });
  },

  handleDeleteDialogCancel() {
    if (this.data.isDeletingRecord) {
      return;
    }

    this.setData({
      showDeleteDialog: false,
      pendingDeleteRecordId: '',
      pendingDeleteRecordText: '',
    });
  },

  async handleDeleteDialogConfirm() {
    const recordId = this.data.pendingDeleteRecordId;
    if (!recordId || this.data.isDeletingRecord) {
      return;
    }

    await this.deleteRecordWithFeedback(recordId, {
      closeDialog: true,
    });
  },

  async deleteRecordWithFeedback(recordId, options = {}) {
    if (!recordId || this.data.isDeletingRecord) {
      return;
    }

    this.setData({
      isDeletingRecord: true,
    });

    try {
      await deleteRecordById(recordId, this.data.profileId);
      this.setData({
        showDeleteDialog: false,
        pendingDeleteRecordId: '',
        pendingDeleteRecordText: '',
        isDeletingRecord: false,
      });
      this.closeSwipeRow();
      this.showFeedbackToast('记录已删除');
      this.loadAllRecords();
    } catch (error) {
      this.setData({
        isDeletingRecord: false,
      });
      if (options.closeDialog) {
        this.setData({
          showDeleteDialog: false,
          pendingDeleteRecordId: '',
          pendingDeleteRecordText: '',
        });
      }
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    }
  },

  showFeedbackToast(title) {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }

    this.setData({
      feedbackVisible: true,
      feedbackTitle: title,
    });

    this.feedbackTimer = setTimeout(() => {
      this.feedbackTimer = null;
      this.setData({
        feedbackVisible: false,
        feedbackTitle: '',
      });
    }, FEEDBACK_TOAST_MS);
  },

  handleRecordTap(event) {
    const recordId = event.currentTarget.dataset.recordId;
    const record = this.recordsById[recordId];

    if (!record || this.data.isViewerMode) {
      return;
    }

    if (
      this.lastSwipeGesture
      && this.lastSwipeGesture.recordId === recordId
      && Date.now() - this.lastSwipeGesture.at < 250
    ) {
      return;
    }

    if (this.data.openDeleteRecordId === recordId) {
      this.closeSwipeRow();
      return;
    }

    this.setData({
      editingRecord: record,
      showRecordPanel: true,
    });
  },

  closeRecordPanelAndRefreshIfNeeded() {
    if (this.isClosingRecordPanel) {
      return;
    }

    const shouldRefresh = this.pendingPanelRefresh === true;
    this.pendingPanelRefresh = false;
    this.isClosingRecordPanel = true;

    this.setData({
      showRecordPanel: false,
      editingRecord: null,
    }, () => {
      this.isClosingRecordPanel = false;
      if (shouldRefresh) {
        this.loadAllRecords();
      }
    });
  },

  handleRecordPanelVisibilityChange(event) {
    const visible = !!(event.detail && event.detail.visible);
    if (visible) {
      return;
    }

    if (!this.data.showRecordPanel && !this.data.editingRecord && !this.pendingPanelRefresh) {
      return;
    }

    this.closeRecordPanelAndRefreshIfNeeded();
  },

  handleRecordPanelSuccess() {
    this.pendingPanelRefresh = true;
  },

  handleRecordPanelDelete() {
    this.pendingPanelRefresh = true;
  },

  handleCloseRecordPanel() {
    this.closeRecordPanelAndRefreshIfNeeded();
  },
});
