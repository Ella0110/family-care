const { store } = require('../../store/index');
const medicationService = require('../../services/medication-service');
const { getErrorMessage } = require('../../utils/error-messages');
const {
  OTHER_OPTION,
  FREQUENCY_OPTIONS,
  TIMING_OPTIONS,
  getChinaDateString,
  resolveMedicationOptionState,
} = require('../../utils/medication');

function showToast(title, duration = 1500) {
  wx.showToast({
    title,
    icon: 'none',
    duration,
  });
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

function showConfirmModal(options) {
  return new Promise((resolve, reject) => {
    wx.showModal(
      Object.assign({}, options, {
        success: resolve,
        fail: reject,
      }),
    );
  });
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function trimText(value) {
  return String(value || '').trim();
}

Page({
  data: {
    mode: 'create',
    profileId: '',
    medicationId: '',
    profileName: '当前档案',
    pageTitle: '添加用药',
    pageSubtitle: '请按当前长期用药情况填写',
    isEditMode: false,
    isLoadingMedication: false,
    isSaving: false,
    isDeleting: false,
    errorText: '',
    frequencyOptions: FREQUENCY_OPTIONS,
    timingOptions: TIMING_OPTIONS,
    frequencyIndex: -1,
    timingIndex: -1,
    frequencyPickerText: '',
    timingPickerText: '',
    showCustomFrequency: false,
    showCustomTiming: false,
    form: {
      drug: '',
      dose: '',
      frequencySelection: '',
      frequencyCustom: '',
      timingSelection: '',
      timingCustom: '',
      startDate: '',
      endDate: '',
      note: '',
    },
  },

  onLoad(options = {}) {
    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const profileId = options.profileId || '';
    const medicationId = options.medicationId || '';
    const profile = findProfile(profileId);
    const today = getChinaDateString();

    this.originalMedication = null;

    this.setData({
      mode,
      profileId,
      medicationId,
      profileName: profile ? profile.name : '当前档案',
      pageTitle: mode === 'edit' ? '编辑用药' : `为 ${profile ? profile.name : '当前档案'} 添加用药`,
      pageSubtitle: mode === 'edit' ? '修改后会回到首页' : '请按当前长期用药情况填写',
      isEditMode: mode === 'edit',
      'form.startDate': today,
    });

    if (!profileId) {
      this.setData({ errorText: '档案不存在' });
      return;
    }

    if (mode === 'edit') {
      this.loadMedicationForEdit();
    }
  },

  async loadMedicationForEdit() {
    if (!this.data.medicationId) {
      this.setData({ errorText: getErrorMessage({ code: 'MEDICATION_NOT_FOUND' }) });
      return;
    }

    const cachedMedication = medicationService.getCachedMedication(this.data.profileId, this.data.medicationId);
    if (cachedMedication) {
      this.fillFormFromMedication(cachedMedication);
      return;
    }

    this.setData({
      isLoadingMedication: true,
      errorText: '',
    });

    try {
      const result = await medicationService.fetchMedications(this.data.profileId);
      const allMedications = result.activeMedications.concat(result.historicalMedications);
      const medication = allMedications.find((item) => item && item._id === this.data.medicationId);

      if (!medication) {
        this.setData({ errorText: getErrorMessage({ code: 'MEDICATION_NOT_FOUND' }) });
        return;
      }

      this.fillFormFromMedication(medication);
    } catch (error) {
      this.setData({ errorText: getErrorMessage(error) });
    } finally {
      this.setData({ isLoadingMedication: false });
    }
  },

  fillFormFromMedication(medication) {
    const frequencyState = resolveMedicationOptionState(medication.frequency, FREQUENCY_OPTIONS);
    const timingState = resolveMedicationOptionState(medication.timing, TIMING_OPTIONS);

    this.originalMedication = medication;
    this.setData({
      frequencyIndex: frequencyState.pickerIndex,
      frequencyPickerText: frequencyState.selection,
      showCustomFrequency: frequencyState.selection === OTHER_OPTION,
      timingIndex: timingState.pickerIndex,
      timingPickerText: timingState.selection,
      showCustomTiming: timingState.selection === OTHER_OPTION,
      'form.drug': medication.drug || '',
      'form.dose': medication.dose || '',
      'form.frequencySelection': frequencyState.selection,
      'form.frequencyCustom': frequencyState.customValue,
      'form.timingSelection': timingState.selection,
      'form.timingCustom': timingState.customValue,
      'form.startDate': medication.startDate || '',
      'form.endDate': medication.endDate || '',
      'form.note': medication.note || '',
    });
  },

  onDrugInput(event) {
    this.setData({
      'form.drug': event.detail.value,
      errorText: '',
    });
  },

  onDoseInput(event) {
    this.setData({
      'form.dose': event.detail.value,
      errorText: '',
    });
  },

  onFrequencyChange(event) {
    const frequencyIndex = Number(event.detail.value);
    const selection = FREQUENCY_OPTIONS[frequencyIndex] || '';
    const showCustomFrequency = selection === OTHER_OPTION;
    const nextData = {
      frequencyIndex,
      frequencyPickerText: selection,
      showCustomFrequency,
      'form.frequencySelection': selection,
      errorText: '',
    };

    if (!showCustomFrequency) {
      nextData['form.frequencyCustom'] = '';
    }

    this.setData(nextData);
  },

  onFrequencyCustomInput(event) {
    this.setData({
      'form.frequencyCustom': event.detail.value,
      errorText: '',
    });
  },

  onTimingChange(event) {
    const timingIndex = Number(event.detail.value);
    const selection = TIMING_OPTIONS[timingIndex] || '';
    const showCustomTiming = selection === OTHER_OPTION;
    const nextData = {
      timingIndex,
      timingPickerText: selection,
      showCustomTiming,
      'form.timingSelection': selection,
      errorText: '',
    };

    if (!showCustomTiming) {
      nextData['form.timingCustom'] = '';
    }

    this.setData(nextData);
  },

  onTimingCustomInput(event) {
    this.setData({
      'form.timingCustom': event.detail.value,
      errorText: '',
    });
  },

  onStartDateChange(event) {
    this.setData({
      'form.startDate': event.detail.value,
      errorText: '',
    });
  },

  onEndDateChange(event) {
    this.setData({
      'form.endDate': event.detail.value,
      errorText: '',
    });
  },

  clearStartDate() {
    this.setData({
      'form.startDate': '',
      errorText: '',
    });
  },

  clearEndDate() {
    this.setData({
      'form.endDate': '',
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
    const drug = trimText(form.drug);
    const dose = trimText(form.dose);
    const frequencySelection = trimText(form.frequencySelection);
    const frequencyCustom = trimText(form.frequencyCustom);
    const timingSelection = trimText(form.timingSelection);
    const timingCustom = trimText(form.timingCustom);
    const startDate = trimText(form.startDate);
    const endDate = trimText(form.endDate);
    const note = trimText(form.note);

    if (!this.data.profileId) {
      return '档案不存在';
    }

    if (!drug) {
      return '药物名称不能为空';
    }
    if (drug.length > 50) {
      return '药物名称不能超过 50 个字';
    }

    if (!dose) {
      return '剂量不能为空';
    }
    if (dose.length > 20) {
      return '剂量不能超过 20 个字';
    }

    if (!frequencySelection) {
      return '请选择服用频率';
    }

    if (frequencySelection === OTHER_OPTION && !frequencyCustom) {
      return '请填写具体频率';
    }
    if (frequencySelection === OTHER_OPTION && frequencyCustom.length > 30) {
      return '具体频率不能超过 30 个字';
    }

    if (timingSelection === OTHER_OPTION && !timingCustom) {
      return '请填写具体时间';
    }
    if (timingSelection === OTHER_OPTION && timingCustom.length > 30) {
      return '具体时间不能超过 30 个字';
    }

    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return '开始日期格式有误';
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return '停药日期格式有误';
    }
    if (startDate && endDate && endDate <= startDate) {
      return '停药日期必须晚于开始日期';
    }

    if (note.length > 200) {
      return '备注不能超过 200 个字';
    }

    return '';
  },

  buildPayload() {
    const form = this.data.form;
    const frequencySelection = trimText(form.frequencySelection);
    const timingSelection = trimText(form.timingSelection);
    const frequencyCustom = trimText(form.frequencyCustom);
    const timingCustom = trimText(form.timingCustom);

    return {
      drug: trimText(form.drug),
      dose: trimText(form.dose),
      frequency: frequencySelection === OTHER_OPTION ? frequencyCustom : frequencySelection,
      timing: timingSelection
        ? (timingSelection === OTHER_OPTION ? timingCustom : timingSelection)
        : null,
      startDate: trimText(form.startDate) || null,
      endDate: trimText(form.endDate) || null,
      note: trimText(form.note) || null,
    };
  },

  buildPatch() {
    const nextPayload = this.buildPayload();
    const original = this.originalMedication || {};
    const previousPayload = {
      drug: original.drug || '',
      dose: original.dose || '',
      frequency: original.frequency || '',
      timing: original.timing || null,
      startDate: original.startDate || null,
      endDate: original.endDate || null,
      note: original.note || null,
    };
    const patch = {};

    Object.keys(nextPayload).forEach((key) => {
      if (nextPayload[key] !== previousPayload[key]) {
        patch[key] = nextPayload[key];
      }
    });

    return patch;
  },

  async handleSubmit() {
    const validationMessage = this.validateForm();
    if (validationMessage) {
      showToast(validationMessage);
      return;
    }

    if (this.data.isEditMode && !this.originalMedication) {
      showToast(getErrorMessage({ code: 'MEDICATION_NOT_FOUND' }));
      return;
    }

    let shouldResetSaving = true;
    this.setData({ isSaving: true });

    try {
      if (this.data.isEditMode) {
        const patch = this.buildPatch();

        if (Object.keys(patch).length === 0) {
          showToast('未做修改');
          return;
        }

        await medicationService.updateMedication(this.data.medicationId, patch);
        showToast('已更新', 800);
      } else {
        await medicationService.createMedication(this.data.profileId, this.buildPayload());
        showToast('已添加', 800);
      }

      shouldResetSaving = false;
      setTimeout(() => {
        goBackOrHome();
      }, 800);
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      if (shouldResetSaving) {
        this.setData({ isSaving: false });
      }
    }
  },

  async handleDelete() {
    if (!this.data.isEditMode || !this.data.medicationId) {
      return;
    }

    const result = await showConfirmModal({
      title: '确定删除这条用药？',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#b42318',
      cancelText: '取消',
    });

    if (!result.confirm) {
      return;
    }

    let shouldResetDeleting = true;
    this.setData({ isDeleting: true });

    try {
      await medicationService.deleteMedication(this.data.medicationId);
      showToast('已删除', 800);
      shouldResetDeleting = false;
      setTimeout(() => {
        goBackOrHome();
      }, 800);
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      if (shouldResetDeleting) {
        this.setData({ isDeleting: false });
      }
    }
  },

  handleCancel() {
    goBackOrHome();
  },
});
