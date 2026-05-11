const { store } = require('../../store/index');
const { getErrorMessage } = require('../../utils/error-messages');
const {
  MAX_FUTURE_SKEW_MS,
  MIN_MEASURED_AT_MS,
  getNowParts,
  getDateTimeParts,
  parseInteger,
  parseMeasuredAt,
  buildRecordSaveData,
  saveRecordFromForm,
  updateRecordFromForm,
  deleteRecordById,
} = require('../../utils/record-editor');

const FIELD_LIMITS = {
  systolic: { min: 60, max: 300 },
  diastolic: { min: 30, max: 200 },
  heartRate: { min: 30, max: 250 },
};

const SHAKE_DURATION_MS = 400;
const FEEDBACK_TOAST_DURATION_MS = 1500;

function buildEmptyFieldFlags() {
  return {
    systolic: false,
    diastolic: false,
    heartRate: false,
    measuredAt: false,
  };
}

function getProfileThreshold(profileId) {
  const profile = (store.getState().profiles || []).find((item) => item && item._id === profileId) || null;
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

function isAboveThreshold(payload, profileId) {
  const threshold = getProfileThreshold(profileId);
  return Number(payload && payload.systolic) > threshold.systolic
    || Number(payload && payload.diastolic) > threshold.diastolic;
}

function validatePanelForm(profileId, form) {
  const fieldErrors = buildEmptyFieldFlags();
  const systolic = parseInteger(form && form.systolic);
  const diastolic = parseInteger(form && form.diastolic);
  const heartRate = parseInteger(form && form.heartRate);
  const measuredAt = parseMeasuredAt(
    form && form.measuredDate,
    form && form.measuredTime,
  );
  const maxMeasuredAt = Date.now() + MAX_FUTURE_SKEW_MS;

  if (!profileId) {
    return {
      message: '档案不存在',
      fieldErrors,
    };
  }

  if (!Number.isInteger(systolic) || systolic < FIELD_LIMITS.systolic.min || systolic > FIELD_LIMITS.systolic.max) {
    fieldErrors.systolic = true;
    return {
      message: '高压需为 60-300 之间的整数',
      fieldErrors,
    };
  }

  if (!Number.isInteger(diastolic) || diastolic < FIELD_LIMITS.diastolic.min || diastolic > FIELD_LIMITS.diastolic.max) {
    fieldErrors.diastolic = true;
    return {
      message: '低压需为 30-200 之间的整数',
      fieldErrors,
    };
  }

  if (systolic <= diastolic) {
    fieldErrors.systolic = true;
    fieldErrors.diastolic = true;
    return {
      message: '高压必须大于低压',
      fieldErrors,
    };
  }

  if (
    form
    && form.heartRate !== ''
    && form.heartRate !== null
    && form.heartRate !== undefined
    && (
      !Number.isInteger(heartRate)
      || heartRate < FIELD_LIMITS.heartRate.min
      || heartRate > FIELD_LIMITS.heartRate.max
    )
  ) {
    fieldErrors.heartRate = true;
    return {
      message: '心率需为 30-250 之间的整数',
      fieldErrors,
    };
  }

  if (Number.isNaN(measuredAt.getTime())) {
    fieldErrors.measuredAt = true;
    return {
      message: '请选择有效的测量时间',
      fieldErrors,
    };
  }

  if (measuredAt.getTime() < MIN_MEASURED_AT_MS) {
    fieldErrors.measuredAt = true;
    return {
      message: '测量时间不能早于 2000 年',
      fieldErrors,
    };
  }

  if (measuredAt.getTime() > maxMeasuredAt) {
    fieldErrors.measuredAt = true;
    return {
      message: '测量时间不能是未来时间',
      fieldErrors,
    };
  }

  return {
    message: '',
    fieldErrors,
  };
}

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    profileId: {
      type: String,
      value: '',
    },
    record: {
      type: Object,
      value: null,
    },
  },

  data: {
    isEditMode: false,
    recordId: '',
    panelTitle: '记录血压',
    isSaving: false,
    isDeleting: false,
    hasValidationIssue: false,
    errorText: '',
    fieldErrors: buildEmptyFieldFlags(),
    shakingFields: buildEmptyFieldFlags(),
    showDeleteConfirm: false,
    feedbackToastVisible: false,
    feedbackToastTitle: '',
    feedbackToastTone: 'success',
    feedbackToastIconText: '✓',
    minMeasuredDate: '2000-01-01',
    maxMeasuredDate: '',
    form: {
      systolic: '',
      diastolic: '',
      heartRate: '',
      measuredDate: '',
      measuredTime: '',
      note: '',
    },
  },

  observers: {
    show(visible) {
      this.triggerEvent('visibilitychange', {
        visible: visible === true,
      });

      if (!visible) {
        this.clearTransientTimers();
        return;
      }

      this.hydrateForm(this.properties.record || null);
    },

    record(record) {
      if (this.data.show) {
        this.hydrateForm(record || null);
      }
    },
  },

  lifetimes: {
    detached() {
      this.clearTransientTimers();
    },
  },

  methods: {
    clearTransientTimers() {
      if (this.shakeTimer) {
        clearTimeout(this.shakeTimer);
        this.shakeTimer = null;
      }

      if (this.feedbackTimer) {
        clearTimeout(this.feedbackTimer);
        this.feedbackTimer = null;
      }
    },

    resetTransientState() {
      this.clearTransientTimers();
      this.setData({
        isSaving: false,
        isDeleting: false,
        hasValidationIssue: false,
        errorText: '',
        fieldErrors: buildEmptyFieldFlags(),
        shakingFields: buildEmptyFieldFlags(),
        showDeleteConfirm: false,
        feedbackToastVisible: false,
        feedbackToastTitle: '',
        feedbackToastTone: 'success',
        feedbackToastIconText: '✓',
      });
    },

    hydrateForm(record) {
      const nowParts = getNowParts();
      const isEditMode = Boolean(record && record._id);
      const dateTime = isEditMode ? getDateTimeParts(record.measuredAt) : nowParts;
      const payload = (record && record.payload) || {};

      this.clearTransientTimers();
      this.setData({
        isEditMode,
        recordId: isEditMode ? record._id : '',
        panelTitle: isEditMode ? '编辑记录' : '记录血压',
        isSaving: false,
        isDeleting: false,
        hasValidationIssue: false,
        errorText: '',
        fieldErrors: buildEmptyFieldFlags(),
        shakingFields: buildEmptyFieldFlags(),
        showDeleteConfirm: false,
        feedbackToastVisible: false,
        feedbackToastTitle: '',
        feedbackToastTone: 'success',
        feedbackToastIconText: '✓',
        minMeasuredDate: nowParts.minDate,
        maxMeasuredDate: nowParts.maxDate,
        form: {
          systolic: payload.systolic || '',
          diastolic: payload.diastolic || '',
          heartRate: payload.heartRate || '',
          measuredDate: dateTime.date,
          measuredTime: dateTime.time,
          note: '',
        },
      });
    },

    closePanel() {
      this.triggerEvent('close');
    },

    setFormValue(key, value) {
      this.setData({
        [`form.${key}`]: value,
      }, () => {
        this.revalidateAfterInput();
      });
    },

    onSystolicInput(event) {
      this.setFormValue('systolic', event.detail.value);
    },

    onDiastolicInput(event) {
      this.setFormValue('diastolic', event.detail.value);
    },

    onHeartRateInput(event) {
      this.setFormValue('heartRate', event.detail.value);
    },

    onMeasuredDateChange(event) {
      this.setFormValue('measuredDate', event.detail.value);
    },

    onMeasuredTimeChange(event) {
      this.setFormValue('measuredTime', event.detail.value);
    },

    getValidationResult() {
      return validatePanelForm(this.data.profileId, this.data.form);
    },

    revalidateAfterInput() {
      const shouldRevalidate = this.data.hasValidationIssue
        || Object.values(this.data.fieldErrors || {}).some(Boolean);
      if (!shouldRevalidate) {
        if (this.data.errorText) {
          this.setData({ errorText: '' });
        }
        return;
      }

      const validation = this.getValidationResult();
      if (!validation.message) {
        this.setData({
          hasValidationIssue: false,
          errorText: '',
          fieldErrors: buildEmptyFieldFlags(),
        });
        return;
      }

      this.setData({
        hasValidationIssue: true,
        errorText: validation.message,
        fieldErrors: validation.fieldErrors,
      });
    },

    triggerShake(fieldErrors) {
      const nextShakingFields = buildEmptyFieldFlags();
      Object.keys(nextShakingFields).forEach((key) => {
        nextShakingFields[key] = Boolean(fieldErrors && fieldErrors[key]);
      });

      if (this.shakeTimer) {
        clearTimeout(this.shakeTimer);
        this.shakeTimer = null;
      }

      this.setData({
        shakingFields: buildEmptyFieldFlags(),
      }, () => {
        this.setData({
          shakingFields: nextShakingFields,
        });
      });

      this.shakeTimer = setTimeout(() => {
        this.setData({
          shakingFields: buildEmptyFieldFlags(),
        });
        this.shakeTimer = null;
      }, SHAKE_DURATION_MS);
    },

    applyValidationFailure(validation) {
      this.setData({
        hasValidationIssue: true,
        errorText: validation.message,
        fieldErrors: validation.fieldErrors,
      });
      this.triggerShake(validation.fieldErrors);
    },

    handleMaskTap() {
      if (
        this.data.isSaving
        || this.data.isDeleting
        || this.data.feedbackToastVisible
        || this.data.showDeleteConfirm
      ) {
        return;
      }

      this.closePanel();
    },

    handleClose() {
      if (
        this.data.isSaving
        || this.data.isDeleting
        || this.data.feedbackToastVisible
        || this.data.showDeleteConfirm
      ) {
        return;
      }

      this.closePanel();
    },

    showFeedbackToast(options = {}) {
      this.clearTransientTimers();

      const eventName = options.eventName || '';
      const eventDetail = options.eventDetail || {};
      const tone = options.tone === 'danger' ? 'danger' : 'success';

      this.setData({
        isSaving: false,
        isDeleting: false,
        hasValidationIssue: false,
        errorText: '',
        fieldErrors: buildEmptyFieldFlags(),
        shakingFields: buildEmptyFieldFlags(),
        showDeleteConfirm: false,
        feedbackToastVisible: true,
        feedbackToastTitle: options.title || '记录已保存',
        feedbackToastTone: tone,
        feedbackToastIconText: tone === 'danger' ? '×' : '✓',
      });

      this.feedbackTimer = setTimeout(() => {
        this.feedbackTimer = null;
        this.setData({
          feedbackToastVisible: false,
        }, () => {
          if (eventName) {
            this.triggerEvent(eventName, eventDetail);
          }
          this.closePanel();
        });
      }, FEEDBACK_TOAST_DURATION_MS);
    },

    async handleCreateSave() {
      try {
        const { result } = await saveRecordFromForm(this.data.profileId, this.data.form);
        this.showFeedbackToast({
          title: '记录已保存',
          tone: 'success',
          eventName: 'success',
          eventDetail: {
            mode: 'create',
            record: result.record,
          },
        });
      } catch (error) {
        this.setData({
          isSaving: false,
          errorText: getErrorMessage(error),
        });
      }
    },

    async handleUpdateSave() {
      try {
        const nextData = buildRecordSaveData(this.data.form);
        const previousAttention = this.properties.record
          ? isAboveThreshold(this.properties.record.payload || {}, this.data.profileId)
          : false;
        const { result } = await updateRecordFromForm(this.data.recordId, this.data.form);
        const nextAttention = isAboveThreshold(result.record.payload || nextData.payload, this.data.profileId);

        this.showFeedbackToast({
          title: previousAttention !== nextAttention ? '记录已更新' : '记录已更新',
          tone: 'success',
          eventName: 'success',
          eventDetail: {
            mode: 'edit',
            record: result.record,
          },
        });
      } catch (error) {
        this.setData({
          isSaving: false,
          errorText: getErrorMessage(error),
        });
      }
    },

    handleSave() {
      if (
        this.data.isSaving
        || this.data.isDeleting
        || this.data.feedbackToastVisible
        || this.data.showDeleteConfirm
      ) {
        return;
      }

      const validation = this.getValidationResult();
      if (validation.message) {
        this.applyValidationFailure(validation);
        return;
      }

      this.setData({
        isSaving: true,
        hasValidationIssue: false,
        errorText: '',
        fieldErrors: buildEmptyFieldFlags(),
      });

      if (this.data.isEditMode) {
        this.handleUpdateSave();
        return;
      }

      this.handleCreateSave();
    },

    handleDelete() {
      if (
        !this.data.isEditMode
        || this.data.isDeleting
        || !this.data.recordId
        || this.data.feedbackToastVisible
      ) {
        return;
      }

      this.setData({
        showDeleteConfirm: true,
        errorText: '',
      });
    },

    handleDeleteDialogMaskTap() {
      if (this.data.isDeleting) {
        return;
      }

      this.setData({
        showDeleteConfirm: false,
      });
    },

    handleDeleteCancel() {
      if (this.data.isDeleting) {
        return;
      }

      this.setData({
        showDeleteConfirm: false,
      });
    },

    async handleDeleteConfirm() {
      if (!this.data.recordId || this.data.isDeleting) {
        return;
      }

      this.setData({
        isDeleting: true,
        errorText: '',
      });

      try {
        await deleteRecordById(this.data.recordId, this.data.profileId);
        this.showFeedbackToast({
          title: '记录已删除',
          tone: 'danger',
          eventName: 'delete',
          eventDetail: {
            recordId: this.data.recordId,
          },
        });
      } catch (error) {
        this.setData({
          isDeleting: false,
          errorText: getErrorMessage(error),
        });
      }
    },

    noop() {},
  },
});
