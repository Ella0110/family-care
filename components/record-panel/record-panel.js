const { store } = require('../../store/index');
const { getErrorMessage } = require('../../utils/error-messages');
const {
  PANEL_RECORD_LIMITS,
  getNowParts,
  getDateTimeParts,
  validateRecordForm,
  buildRecordSaveData,
  saveRecordFromForm,
  updateRecordFromForm,
  deleteRecordById,
} = require('../../utils/record-editor');

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

  observers: {
    'show, record, profileId': function observePanel(show, record) {
      if (!show) {
        return;
      }

      this.hydrateForm(record || null);
    },
  },

  methods: {
    hydrateForm(record) {
      const nowParts = getNowParts();
      const isEditMode = Boolean(record && record._id);
      const dateTime = isEditMode ? getDateTimeParts(record.measuredAt) : nowParts;
      const payload = (record && record.payload) || {};

      this.setData({
        isEditMode,
        recordId: isEditMode ? record._id : '',
        panelTitle: isEditMode ? '编辑记录' : '记录血压',
        isSaving: false,
        isDeleting: false,
        errorText: '',
        minMeasuredDate: nowParts.minDate,
        maxMeasuredDate: nowParts.maxDate,
        form: {
          systolic: payload.systolic || null,
          diastolic: payload.diastolic || null,
          heartRate: payload.heartRate || '',
          measuredDate: dateTime.date,
          measuredTime: dateTime.time,
          note: record && record.note ? record.note : '',
        },
      });
    },

    handleMaskTap() {
      if (this.data.isSaving || this.data.isDeleting) {
        return;
      }

      this.triggerEvent('close');
    },

    handleClose() {
      if (this.data.isSaving || this.data.isDeleting) {
        return;
      }

      this.triggerEvent('close');
    },

    onSystolicInput(event) {
      this.setData({
        'form.systolic': event.detail.value,
        errorText: '',
      });
    },

    onDiastolicInput(event) {
      this.setData({
        'form.diastolic': event.detail.value,
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

    validate() {
      return validateRecordForm({
        profileId: this.data.profileId,
        form: this.data.form,
        limits: PANEL_RECORD_LIMITS,
      });
    },

    async handleCreateSave() {
      try {
        const { result } = await saveRecordFromForm(this.data.profileId, this.data.form);
        wx.showToast({
          title: result.alertTriggered ? '血压偏高，已记录' : '已保存',
          icon: result.alertTriggered ? 'none' : 'success',
          duration: result.alertTriggered ? 1500 : 800,
        });
        this.triggerEvent('success', {
          mode: 'create',
          record: result.record,
        });
        this.triggerEvent('close');
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

    async handleUpdateSave() {
      try {
        const nextData = buildRecordSaveData(this.data.form);
        const previousAttention = this.properties.record
          ? isAboveThreshold(this.properties.record.payload || {}, this.data.profileId)
          : false;
        const { result } = await updateRecordFromForm(this.data.recordId, this.data.form);
        const nextAttention = isAboveThreshold(result.record.payload || nextData.payload, this.data.profileId);
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
        this.triggerEvent('success', {
          mode: 'edit',
          record: result.record,
        });
        this.triggerEvent('close');
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

    handleSave() {
      if (this.data.isSaving || this.data.isDeleting) {
        return;
      }

      const validationMessage = this.validate();
      if (validationMessage) {
        this.setData({ errorText: validationMessage });
        return;
      }

      this.setData({
        isSaving: true,
        errorText: '',
      });

      if (!this.data.isEditMode) {
        this.handleCreateSave();
        return;
      }

      this.handleUpdateSave();
    },

    handleDelete() {
      if (!this.data.isEditMode || this.data.isDeleting || !this.data.recordId) {
        return;
      }

      wx.showModal({
        title: '确定删除这条记录？',
        content: '删除后无法恢复',
        confirmText: '删除',
        confirmColor: '#b42318',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }

          this.setData({ isDeleting: true });
          try {
            await deleteRecordById(this.data.recordId, this.data.profileId);
            wx.showToast({
              title: '已删除',
              icon: 'success',
            });
            this.triggerEvent('delete', { recordId: this.data.recordId });
            this.triggerEvent('close');
          } catch (error) {
            const message = getErrorMessage(error);
            this.setData({ errorText: message });
            wx.showToast({
              title: message,
              icon: 'none',
            });
          } finally {
            this.setData({ isDeleting: false });
          }
        },
      });
    },

    noop() {},
  },
});
