const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { getReferenceLines } = require('../../utils/bp-status');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const { canWrite, isOwner } = require('../../utils/permission-helpers');

const MIN_MEASURED_AT_MS = 946684800000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function getNowParts() {
  const now = new Date();
  const maxDate = new Date(Date.now() + MAX_FUTURE_SKEW_MS);

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    minDate: '2000-01-01',
    maxDate: `${maxDate.getFullYear()}-${pad(maxDate.getMonth() + 1)}-${pad(maxDate.getDate())}`,
  };
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (!/^\d+$/.test(String(value))) {
    return Number.NaN;
  }

  return Number(value);
}

function parseMeasuredAt(dateValue, timeValue) {
  const dateParts = String(dateValue || '').split('-').map(Number);
  const timeParts = String(timeValue || '').split(':').map(Number);

  if (dateParts.length !== 3 || timeParts.length !== 2) {
    return new Date(Number.NaN);
  }

  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0);
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

function getDateTimeParts(value) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return getNowParts();
  }

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function getProfileThreshold(profile) {
  return (
    profile &&
    profile.settings &&
    profile.settings.bp &&
    profile.settings.bp.threshold
  ) || {
    systolic: 140,
    diastolic: 90,
  };
}

function isAboveThreshold(payload, profile) {
  const threshold = getProfileThreshold(profile);
  return Number(payload.systolic) > threshold.systolic || Number(payload.diastolic) > threshold.diastolic;
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function goBackOrHome() {
  const pages = getCurrentPages();

  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }

  wx.redirectTo({
    url: '/pages/home/home',
  });
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    mode: 'create',
    profileId: '',
    recordId: '',
    profileName: '当前档案',
    pageTitle: '录入血压',
    pageSubtitle: '请按本次测量结果填写',
    referenceLines: getReferenceLines(),
    isEditMode: false,
    isLoadingRecord: false,
    isSaving: false,
    isDeleting: false,
    canDeleteRecord: true,
    errorText: '',
    minMeasuredDate: '2000-01-01',
    maxMeasuredDate: '',
    form: {
      systolic: null,
      diastolic: null,
      heartRate: '',
      measuredDate: '',
      measuredTime: '',
      note: '',
    },
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const nowParts = getNowParts();
    const profileId = options.profileId || '';
    const recordId = options.recordId || '';
    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const profile = profileId ? findProfile(profileId) : null;
    const state = store.getState();
    const canWriteCurrentProfile = profileId ? canWrite(state, profileId) : false;

    this.currentProfile = profile;
    this.originalRecord = null;
    this.setData({
      mode,
      profileId,
      recordId,
      profileName: profile ? profile.name : '当前档案',
      pageTitle: mode === 'edit' ? '编辑血压记录' : `为 ${profile ? profile.name : '当前档案'} 录入血压`,
      pageSubtitle: mode === 'edit' ? '修改后会回到记录列表' : '请按本次测量结果填写',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
      isEditMode: mode === 'edit',
      minMeasuredDate: nowParts.minDate,
      maxMeasuredDate: nowParts.maxDate,
      'form.measuredDate': nowParts.date,
      'form.measuredTime': nowParts.time,
    });

    if (!profileId) {
      this.setData({ errorText: '档案不存在' });
      return;
    }

    if (mode === 'create' && !canWriteCurrentProfile) {
      wx.showToast({
        title: '你没有权限录入血压',
        icon: 'none',
      });
      goBackOrHome();
      return;
    }

    if (mode === 'edit') {
      this.loadEditRecord();
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

  async loadEditRecord() {
    if (!this.data.recordId) {
      this.setData({ errorText: getErrorMessage({ code: 'RECORD_NOT_FOUND' }) });
      return;
    }

    const cachedRecords = store.getCachedRecords(this.data.profileId) || [];
    const cachedRecord = cachedRecords.find((record) => record && record._id === this.data.recordId);
    if (cachedRecord) {
      this.originalRecord = cachedRecord;
      this.fillFormFromRecord(cachedRecord);
      if (!this.ensureEditPermission(cachedRecord)) {
        return;
      }
      return;
    }

    this.setData({
      isLoadingRecord: true,
      errorText: '',
    });

    try {
      const record = await recordService.getRecord(this.data.recordId, {
        profileId: this.data.profileId,
      });

      if (!record) {
        this.setData({ errorText: getErrorMessage({ code: 'RECORD_NOT_FOUND' }) });
        return;
      }

      this.originalRecord = record;
      this.fillFormFromRecord(record);
      this.ensureEditPermission(record);
    } catch (error) {
      this.setData({ errorText: getErrorMessage(error) });
    } finally {
      this.setData({ isLoadingRecord: false });
    }
  },

  fillFormFromRecord(record) {
    const payload = (record && record.payload) || {};
    const dateTime = getDateTimeParts(record && record.measuredAt);

    this.setData({
      'form.systolic': payload.systolic || null,
      'form.diastolic': payload.diastolic || null,
      'form.heartRate': payload.heartRate || '',
      'form.measuredDate': dateTime.date,
      'form.measuredTime': dateTime.time,
      'form.note': record && record.note ? record.note : '',
    });
  },

  ensureEditPermission(record) {
    const state = store.getState();
    const currentUserId = state.user && state.user._id;
    const profileId = this.data.profileId;
    const owner = profileId ? isOwner(state, profileId) : false;
    const canModifyOwnRecord = Boolean(
      canWrite(state, profileId) &&
      record &&
      record.recordedBy === currentUserId,
    );

    if (!owner && !canModifyOwnRecord) {
      wx.showToast({
        title: '你没有权限编辑这条记录',
        icon: 'none',
      });
      goBackOrHome();
      return false;
    }

    this.setData({
      canDeleteRecord: true,
    });
    return true;
  },

  onBPChange(event) {
    this.setData({
      'form.systolic': event.detail.systolic,
      'form.diastolic': event.detail.diastolic,
      errorText: '',
    });
  },

  onHeartRateInput(event) {
    this.setData({
      'form.heartRate': event.detail.value,
      errorText: '',
    });
  },

  onMeasuredDateChange(event) {
    this.setData({
      'form.measuredDate': event.detail.value,
      errorText: '',
    });
  },

  onMeasuredTimeChange(event) {
    this.setData({
      'form.measuredTime': event.detail.value,
      errorText: '',
    });
  },

  onNoteInput(event) {
    this.setData({
      'form.note': event.detail.value,
      errorText: '',
    });
  },

  validateForm() {
    const form = this.data.form;
    const systolic = parseInteger(form.systolic);
    const diastolic = parseInteger(form.diastolic);
    const heartRate = parseInteger(form.heartRate);
    const measuredAt = parseMeasuredAt(form.measuredDate, form.measuredTime);
    const maxMeasuredAt = Date.now() + MAX_FUTURE_SKEW_MS;

    if (!this.data.profileId) {
      return '档案不存在';
    }

    if (!Number.isInteger(systolic) || systolic < 60 || systolic > 300) {
      return '收缩压需为 60-300 之间的整数';
    }

    if (!Number.isInteger(diastolic) || diastolic < 30 || diastolic > 200) {
      return '舒张压需为 30-200 之间的整数';
    }

    if (systolic <= diastolic) {
      return '收缩压必须高于舒张压';
    }

    if (form.heartRate !== '' && (!Number.isInteger(heartRate) || heartRate < 30 || heartRate > 250)) {
      return '心率需为 30-250 之间的整数';
    }

    if (Number.isNaN(measuredAt.getTime())) {
      return '请选择有效的测量时间';
    }

    if (measuredAt.getTime() < MIN_MEASURED_AT_MS) {
      return '测量时间不能早于 2000 年';
    }

    if (measuredAt.getTime() > maxMeasuredAt) {
      return '测量时间不能是未来时间';
    }

    return '';
  },

  buildPayload() {
    const form = this.data.form;
    const payload = {
      systolic: parseInteger(form.systolic),
      diastolic: parseInteger(form.diastolic),
    };
    const heartRate = parseInteger(form.heartRate);

    if (Number.isInteger(heartRate)) {
      payload.heartRate = heartRate;
    }

    return {
      payload,
      measuredAt: parseMeasuredAt(form.measuredDate, form.measuredTime).getTime(),
      note: String(form.note || '').trim(),
    };
  },

  buildPatch() {
    const data = this.buildPayload();

    return {
      measuredAt: data.measuredAt,
      payload: data.payload,
      note: data.note || null,
    };
  },

  async handleSave() {
    const validationMessage = this.validateForm();

    if (validationMessage) {
      this.setData({ errorText: validationMessage });
      return;
    }

    const data = this.buildPayload();
    this.setData({
      isSaving: true,
      errorText: '',
    });

    try {
      if (this.data.isEditMode) {
        const patch = this.buildPatch();
        const result = await recordService.updateRecord(this.data.recordId, patch);
        const previousAttention = this.originalRecord
          ? isAboveThreshold(this.originalRecord.payload || {}, this.currentProfile)
          : false;
        const nextAttention = isAboveThreshold(result.record.payload || patch.payload, this.currentProfile);
        let title = '已更新';

        if (!previousAttention && nextAttention) {
          title = '血压偏高，已更新';
        } else if (previousAttention && !nextAttention) {
          title = '血压恢复正常，已更新';
        }

        wx.showToast({
          title,
          icon: nextAttention ? 'none' : 'success',
          duration: nextAttention ? 1500 : 800,
        });

        setTimeout(() => {
          wx.navigateBack({ delta: 1 });
        }, nextAttention ? 1500 : 800);
        return;
      }

      const result = await recordService.saveRecord(
        this.data.profileId,
        data.payload,
        data.measuredAt,
        data.note,
      );

      wx.showToast({
        title: result.alertTriggered ? '血压偏高，已记录' : '已保存',
        icon: result.alertTriggered ? 'none' : 'success',
        duration: result.alertTriggered ? 1500 : 800,
      });

      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, result.alertTriggered ? 1500 : 800);
    } catch (error) {
      const message = getErrorMessage(error);
      this.setData({ errorText: message });
      wx.showToast({
        title: message,
        icon: 'none',
      });
    } finally {
      this.setData({ isSaving: false });
    }
  },

  handleCancel() {
    wx.navigateBack({ delta: 1 });
  },

  handleDelete() {
    if (this.data.isDeleting || !this.data.recordId) {
      return;
    }

    this.setData({ isDeleting: true });
    wx.showModal({
      title: '确定删除这条记录？',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#b42318',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) {
          this.setData({ isDeleting: false });
          return;
        }

        try {
          await recordService.deleteRecord(this.data.recordId, { profileId: this.data.profileId });
          wx.showToast({
            title: '已删除',
            icon: 'success',
          });
          setTimeout(() => {
            wx.navigateBack({ delta: 1 });
          }, 800);
        } catch (error) {
          const message = getErrorMessage(error);
          this.setData({
            isDeleting: false,
            errorText: message,
          });
          wx.showToast({
            title: message,
            icon: 'none',
          });
        }
      },
      fail: () => {
        this.setData({ isDeleting: false });
      },
    });
  },
});
