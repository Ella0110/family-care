const { store } = require('../../store/index');
const medicationService = require('../../services/medication-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const { canWrite } = require('../../utils/permission-helpers');
const {
  OTHER_OPTION,
  FREQUENCY_OPTIONS,
  getChinaDateString,
  resolveMedicationOptionState,
} = require('../../utils/medication');

const UI_COLORS = Object.freeze({
  danger: '#FF3B30',
});

function showToast(title, icon = 'none', duration = 1500) {
  wx.showToast({
    title,
    icon,
    duration,
  });
}

function buildListUrl(profileId) {
  return `/pages/medication-edit/medication-edit?profileId=${profileId || ''}`;
}

function goBackToList(profileId) {
  const pages = getCurrentPages();

  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }

  wx.redirectTo({
    url: buildListUrl(profileId),
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

function trimText(value) {
  return String(value || '').trim();
}

function canAccessMedicationEdit(profileId) {
  if (!profileId) {
    return false;
  }

  return canWrite(store.getState(), profileId);
}

function getCurrentFontScale() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    mode: 'create',
    profileId: '',
    medicationId: '',
    isEditMode: false,
    isLoadingMedication: false,
    isSaving: false,
    isDeleting: false,
    errorText: '',
    frequencyOptions: FREQUENCY_OPTIONS,
    frequencyIndex: -1,
    frequencyPickerText: '',
    showCustomFrequency: false,
    form: {
      drug: '',
      dose: '',
      frequencySelection: '',
      frequencyCustom: '',
      timing: '',
      startDate: '',
      endDate: '',
    },
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const profileId = options.profileId || '';
    const medicationId = options.medicationId || '';
    const today = getChinaDateString();
    const title = mode === 'edit' ? '编辑用药' : '添加用药';

    this.originalMedication = null;

    wx.setNavigationBarTitle({
      title,
    });

    this.setData({
      mode,
      profileId,
      medicationId,
      isEditMode: mode === 'edit',
      'form.startDate': today,
    });

    if (!profileId) {
      this.setData({ errorText: '档案不存在' });
      return;
    }

    if (!canAccessMedicationEdit(profileId)) {
      showToast('你没有权限管理用药');
      goBackToList(profileId);
      return;
    }

    if (mode === 'edit') {
      this.loadMedicationForEdit();
    }
  },

  onShow() {
    this.syncFontScale();
  },

  syncFontScale() {
    syncFontData.call(this);
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

    this.originalMedication = medication;
    this.setData({
      frequencyIndex: frequencyState.pickerIndex,
      frequencyPickerText: frequencyState.selection,
      showCustomFrequency: frequencyState.selection === OTHER_OPTION,
      'form.drug': medication.drug || '',
      'form.dose': medication.dose || '',
      'form.frequencySelection': frequencyState.selection,
      'form.frequencyCustom': frequencyState.customValue,
      'form.timing': medication.timing || '',
      'form.startDate': medication.startDate || '',
      'form.endDate': medication.endDate || '',
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

  onTimingInput(event) {
    this.setData({
      'form.timing': event.detail.value,
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

  validateForm() {
    const form = this.data.form;
    const drug = trimText(form.drug);
    const dose = trimText(form.dose);
    const frequencySelection = trimText(form.frequencySelection);
    const frequencyCustom = trimText(form.frequencyCustom);
    const timing = trimText(form.timing);
    const startDate = trimText(form.startDate);
    const endDate = trimText(form.endDate);

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

    if (timing.length > 30) {
      return '服用时间不能超过 30 个字';
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

    return '';
  },

  buildPayload() {
    const form = this.data.form;
    const frequencySelection = trimText(form.frequencySelection);
    const frequencyCustom = trimText(form.frequencyCustom);

    return {
      drug: trimText(form.drug),
      dose: trimText(form.dose),
      frequency: frequencySelection === OTHER_OPTION ? frequencyCustom : frequencySelection,
      timing: trimText(form.timing) || null,
      startDate: trimText(form.startDate) || null,
      endDate: trimText(form.endDate) || null,
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
        showToast('修改已保存', 'success', 800);
      } else {
        await medicationService.createMedication(this.data.profileId, this.buildPayload());
        showToast('已保存', 'success', 800);
      }

      shouldResetSaving = false;
      setTimeout(() => {
        goBackToList(this.data.profileId);
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
      confirmColor: UI_COLORS.danger,
      cancelText: '取消',
    });

    if (!result.confirm) {
      return;
    }

    let shouldResetDeleting = true;
    this.setData({ isDeleting: true });

    try {
      await medicationService.deleteMedication(this.data.medicationId);
      showToast('已删除', 'success', 800);
      shouldResetDeleting = false;
      setTimeout(() => {
        goBackToList(this.data.profileId);
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
    goBackToList(this.data.profileId);
  },
});
