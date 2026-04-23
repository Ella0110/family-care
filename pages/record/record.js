const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getReferenceLines } = require('../../utils/bp-status');

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

function getSaveErrorMessage(error) {
  if (error && error.code === 'INVALID_ARGUMENT') {
    const message = error.message || '';
    if (/measuredAt|timestamp|date|时间/i.test(message)) {
      return '测量时间有误，请选择 2000 年以后的时间';
    }

    return '血压信息填写有误，请检查后重试';
  }

  if (error && error.code === 'NETWORK') {
    return '网络异常，请恢复网络后重试';
  }

  if (error && error.code === 'USER_NOT_FOUND') {
    return '登录状态异常，请重新打开小程序';
  }

  if (error && error.code === 'PERMISSION_DENIED') {
    return '没有权限录入该档案';
  }

  return '保存失败，请稍后重试';
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

Page({
  data: {
    mode: 'create',
    profileId: '',
    profileName: '当前档案',
    referenceLines: getReferenceLines(),
    isSaving: false,
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
    const nowParts = getNowParts();
    const profileId = options.profileId || '';
    const profile = profileId ? findProfile(profileId) : null;

    this.setData({
      mode: options.mode || 'create',
      profileId,
      profileName: profile ? profile.name : '当前档案',
      referenceLines: getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines),
      minMeasuredDate: nowParts.minDate,
      maxMeasuredDate: nowParts.maxDate,
      'form.measuredDate': nowParts.date,
      'form.measuredTime': nowParts.time,
    });

    if (!profileId) {
      this.setData({ errorText: '缺少档案信息，请返回首页重试' });
    }
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
      return '缺少档案信息，请返回首页重试';
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
      const message = getSaveErrorMessage(error);
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
});
