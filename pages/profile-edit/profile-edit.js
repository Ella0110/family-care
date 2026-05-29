const { store } = require('../../store/index');
const profileService = require('../../services/profile-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const { isOwner } = require('../../utils/permission-helpers');

const RELATION_OPTIONS = ['父亲', '母亲', '爷爷', '奶奶', '外公', '外婆', '我自己', '其他'];
const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
];
const LONG_TERM_MEDICATION_OPTIONS = [
  { label: '是', value: true },
  { label: '否', value: false },
];
const PHONE_PATTERN = /^1\d{10}$/;
const DEFAULT_RETURN_TAB = '/pages/profile-home/profile-home';
const ALLOWED_RETURN_TABS = new Set([
  '/pages/data/data',
  '/pages/profile-home/profile-home',
]);

function getCurrentFontScale() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function showToast(title, duration = 1500) {
  wx.showToast({
    title,
    icon: 'none',
    duration,
  });
}

function getReadableErrorMessage(error) {
  const fallbackMessage = getErrorMessage(error);
  const rawMessage = error && typeof error.message === 'string'
    ? String(error.message).trim()
    : '';

  if (
    fallbackMessage === getErrorMessage({ code: 'INTERNAL_ERROR' })
    && rawMessage
    && rawMessage !== 'Internal error'
    && rawMessage !== '服务异常'
  ) {
    return rawMessage;
  }

  return fallbackMessage;
}

function normalizeReturnTab(value) {
  if (!value) {
    return DEFAULT_RETURN_TAB;
  }

  let decodedValue = '';
  try {
    decodedValue = decodeURIComponent(String(value));
  } catch (error) {
    decodedValue = String(value || '');
  }

  const normalizedValue = decodedValue.trim();
  return ALLOWED_RETURN_TABS.has(normalizedValue) ? normalizedValue : DEFAULT_RETURN_TAB;
}

function goBackOrHome(fallbackUrl = DEFAULT_RETURN_TAB) {
  const pages = getCurrentPages();

  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }

  wx.switchTab({
    url: fallbackUrl,
  });
}

function syncProfileIntoStore(profileId, nextProfile) {
  const state = store.getState();
  store.setState({
    profiles: (state.profiles || []).map((profile) =>
      profile && profile._id === profileId ? nextProfile : profile
    ),
  });
}

function syncCreatedProfileIntoStore(profile, relationship) {
  const state = store.getState();
  const newProfileId = profile && profile._id;
  store.setState({
    profiles: (state.profiles || []).concat(profile),
    relationships: (state.relationships || []).concat(relationship),
    currentProfileId: newProfileId,
  });
  wx.setStorageSync('currentProfileId', newProfileId);
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function trimText(value) {
  return String(value || '').trim();
}

function normalizeRelationState(relation) {
  const nextRelation = trimText(relation === '本人' ? '我自己' : relation);

  if (!nextRelation) {
    return {
      relationIndex: -1,
      relationPickerText: '',
      relationSelection: '',
      relationCustom: '',
      showCustomRelation: false,
    };
  }

  const optionIndex = RELATION_OPTIONS.indexOf(nextRelation);
  if (optionIndex >= 0) {
    return {
      relationIndex: optionIndex,
      relationPickerText: nextRelation,
      relationSelection: nextRelation,
      relationCustom: '',
      showCustomRelation: nextRelation === '其他',
    };
  }

  return {
    relationIndex: RELATION_OPTIONS.indexOf('其他'),
    relationPickerText: '其他',
    relationSelection: '其他',
    relationCustom: nextRelation,
    showCustomRelation: true,
  };
}

function normalizeEmergencyContact(contact) {
  const name = trimText(contact && contact.name);
  const phone = trimText(contact && contact.phone);

  if (!name && !phone) {
    return null;
  }

  return {
    name: name || '',
    phone: phone || '',
  };
}

function getEmergencyContactValidationMessage(name, phone) {
  const hasName = Boolean(name);
  const hasPhone = Boolean(phone);

  if (hasName !== hasPhone) {
    return '请同时填写紧急联系人姓名和手机号';
  }

  return '';
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    mode: 'create',
    profileId: '',
    returnTab: DEFAULT_RETURN_TAB,
    isEditMode: false,
    isSaving: false,
    relationOptions: RELATION_OPTIONS,
    relationIndex: -1,
    relationPickerText: '',
    showCustomRelation: false,
    genderOptions: GENDER_OPTIONS,
    longTermMedicationOptions: LONG_TERM_MEDICATION_OPTIONS,
    pageTitle: '为家人或自己建一个档案',
    pageSubtitle: '只需要 30 秒，先填一个名字就好',
    saveButtonText: '开始记录',
    errorText: '',
    completionSummary: '基础信息已完善 0/5',
    completionItems: [],
    form: {
      name: '',
      relationSelection: '',
      relationCustom: '',
      gender: '',
      birthDate: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      longTermMedication: null,
      note: '',
    },
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const profileId = options.profileId || '';
    const returnTab = normalizeReturnTab(options.returnTab);

    this.originalProfile = null;
    this.setData({
      mode,
      profileId,
      returnTab,
      isEditMode: mode === 'edit',
      pageTitle: mode === 'edit' ? '完善档案信息' : '为家人或自己建一个档案',
      pageSubtitle: mode === 'edit' ? '补充信息后，后续记录和报告会更完整' : '只需要 30 秒，先填一个名字就好',
      saveButtonText: mode === 'edit' ? '保存' : '开始记录',
    });

    if (mode === 'edit') {
      if (!isOwner(store.getState(), profileId)) {
        showToast('你没有权限编辑档案');
        goBackOrHome();
        return;
      }
      this.loadProfileForEdit(profileId);
      return;
    }

    this.refreshCompletionProgress();
  },

  onShow() {
    this.syncFontScale();
  },

  onUnload() {
    if (this.navigateAfterSaveTimer) {
      clearTimeout(this.navigateAfterSaveTimer);
      this.navigateAfterSaveTimer = null;
    }
  },

  syncFontScale() {
    syncFontData.call(this);
  },

  loadProfileForEdit(profileId) {
    const profile = findProfile(profileId);

    if (!profile) {
      this.setData({
        errorText: getErrorMessage({ code: 'PROFILE_NOT_FOUND' }),
      });
      return;
    }

    this.originalProfile = profile;
    const relationState = normalizeRelationState(profile.relation);
    const emergencyContact = normalizeEmergencyContact(profile.emergencyContact);

    this.setData({
      relationIndex: relationState.relationIndex,
      relationPickerText: relationState.relationPickerText,
      showCustomRelation: relationState.showCustomRelation,
      'form.name': profile.name || '',
      'form.relationSelection': relationState.relationSelection,
      'form.relationCustom': relationState.relationCustom,
      'form.gender': profile.gender || '',
      'form.birthDate': profile.birthDate || '',
      'form.emergencyContactName': emergencyContact ? emergencyContact.name : '',
      'form.emergencyContactPhone': emergencyContact ? emergencyContact.phone : '',
      'form.longTermMedication': typeof profile.longTermMedication === 'boolean' ? profile.longTermMedication : null,
      'form.note': profile.note || '',
      errorText: '',
    });

    this.refreshCompletionProgress();
  },

  onNameInput(event) {
    this.setData({
      'form.name': event.detail.value,
      errorText: '',
    });
    this.refreshCompletionProgress();
  },

  onRelationChange(event) {
    const relationIndex = Number(event.detail.value);
    const relationSelection = RELATION_OPTIONS[relationIndex] || '';
    const showCustomRelation = relationSelection === '其他';
    const nextData = {
      relationIndex,
      relationPickerText: relationSelection,
      showCustomRelation,
      'form.relationSelection': relationSelection,
      errorText: '',
    };

    if (!showCustomRelation) {
      nextData['form.relationCustom'] = '';
    }

    this.setData(nextData);
    this.refreshCompletionProgress();
  },

  onRelationCustomInput(event) {
    this.setData({
      'form.relationCustom': event.detail.value,
      errorText: '',
    });
    this.refreshCompletionProgress();
  },

  onGenderTap(event) {
    this.setData({
      'form.gender': event.currentTarget.dataset.value || '',
      errorText: '',
    });
  },

  onBirthDateChange(event) {
    this.setData({
      'form.birthDate': event.detail.value,
      errorText: '',
    });
    this.refreshCompletionProgress();
  },

  onEmergencyContactNameInput(event) {
    this.setData({
      'form.emergencyContactName': event.detail.value,
      errorText: '',
    });
    this.refreshCompletionProgress();
  },

  onEmergencyContactPhoneInput(event) {
    this.setData({
      'form.emergencyContactPhone': event.detail.value,
      errorText: '',
    });
    this.refreshCompletionProgress();
  },

  onLongTermMedicationTap(event) {
    const value = event.currentTarget.dataset.value;
    this.setData({
      'form.longTermMedication': value === true || value === 'true',
      errorText: '',
    });
    this.refreshCompletionProgress();
  },

  onNoteInput(event) {
    this.setData({
      'form.note': event.detail.value,
      errorText: '',
    });
  },

  getCurrentRelationValue() {
    const relationSelection = trimText(this.data.form.relationSelection);
    const relationCustom = trimText(this.data.form.relationCustom);

    if (!relationSelection) {
      return '';
    }

    if (relationSelection === '其他') {
      return relationCustom;
    }

    return relationSelection;
  },

  getCurrentEmergencyContact() {
    const name = trimText(this.data.form.emergencyContactName);
    const phone = trimText(this.data.form.emergencyContactPhone);

    if (!name && !phone) {
      return null;
    }

    return {
      name,
      phone,
    };
  },

  getCompletionItems() {
    const items = [
      { label: '姓名', completed: Boolean(trimText(this.data.form.name)) },
      { label: '与你的关系', completed: Boolean(this.getCurrentRelationValue()) },
      { label: '出生日期', completed: Boolean(trimText(this.data.form.birthDate)) },
      { label: '紧急联系人', completed: Boolean(this.getCurrentEmergencyContact()) },
      {
        label: '是否长期服药',
        completed: typeof this.data.form.longTermMedication === 'boolean',
      },
    ];

    return items.map((item) => Object.assign({}, item, {
      mark: item.completed ? '✓' : '□',
    }));
  },

  getCompletionCount() {
    return this.getCompletionItems().filter((item) => item.completed).length;
  },

  refreshCompletionProgress() {
    const items = this.getCompletionItems();
    const count = items.filter((item) => item.completed).length;

    this.setData({
      completionItems: items,
      completionSummary: `基础信息已完善 ${count}/5`,
    });
  },

  validateCreateForm() {
    return this.validateEditForm();
  },

  validateEditForm() {
    const name = trimText(this.data.form.name);
    const note = trimText(this.data.form.note);
    const relationSelection = trimText(this.data.form.relationSelection);
    const relationCustom = trimText(this.data.form.relationCustom);
    const emergencyContactName = trimText(this.data.form.emergencyContactName);
    const emergencyContactPhone = trimText(this.data.form.emergencyContactPhone);

    if (!name) {
      return '请填写姓名';
    }

    if (name.length > 20) {
      return '姓名不能超过 20 个字';
    }

    if (relationSelection === '其他' && !relationCustom) {
      return '请填写具体关系';
    }

    if (relationSelection === '其他' && relationCustom.length > 10) {
      return '具体关系不能超过 10 个字';
    }

    if (emergencyContactName && emergencyContactName.length > 20) {
      return '紧急联系人姓名不能超过 20 个字';
    }

    const emergencyContactMessage = getEmergencyContactValidationMessage(
      emergencyContactName,
      emergencyContactPhone,
    );
    if (emergencyContactMessage) {
      return emergencyContactMessage;
    }

    if (emergencyContactPhone && !PHONE_PATTERN.test(emergencyContactPhone)) {
      return '请输入正确的手机号';
    }

    if (note.length > 200) {
      return '备注不能超过 200 个字';
    }

    return '';
  },

  buildCreatePayload() {
    return this.buildEditValues();
  },

  buildEditValues() {
    return {
      name: trimText(this.data.form.name),
      relation: this.getCurrentRelationValue() || null,
      gender: trimText(this.data.form.gender) || null,
      birthDate: trimText(this.data.form.birthDate) || null,
      emergencyContact: this.getCurrentEmergencyContact(),
      longTermMedication:
        typeof this.data.form.longTermMedication === 'boolean'
          ? this.data.form.longTermMedication
          : null,
      note: trimText(this.data.form.note) || null,
    };
  },

  buildEditPatch() {
    const current = this.buildEditValues();
    const original = {
      name: trimText(this.originalProfile && this.originalProfile.name) || '',
      relation: trimText(this.originalProfile && this.originalProfile.relation) || null,
      gender: trimText(this.originalProfile && this.originalProfile.gender) || null,
      birthDate: trimText(this.originalProfile && this.originalProfile.birthDate) || null,
      emergencyContact: normalizeEmergencyContact(this.originalProfile && this.originalProfile.emergencyContact),
      longTermMedication:
        this.originalProfile && typeof this.originalProfile.longTermMedication === 'boolean'
          ? this.originalProfile.longTermMedication
          : null,
      note: trimText(this.originalProfile && this.originalProfile.note) || null,
    };
    const patch = {};

    ['name', 'relation', 'gender', 'birthDate', 'longTermMedication', 'note'].forEach((key) => {
      if (current[key] !== original[key]) {
        patch[key] = current[key];
      }
    });

    const currentEmergency = current.emergencyContact;
    const originalEmergency = original.emergencyContact;
    const currentEmergencySignature = JSON.stringify(currentEmergency || null);
    const originalEmergencySignature = JSON.stringify(originalEmergency || null);
    if (currentEmergencySignature !== originalEmergencySignature) {
      patch.emergencyContact = currentEmergency
        ? {
            name: currentEmergency.name || '',
            phone: currentEmergency.phone || '',
          }
        : null;
    }

    return patch;
  },

  async handleSubmit() {
    const validationMessage = this.data.isEditMode
      ? this.validateEditForm()
      : this.validateCreateForm();

    if (validationMessage) {
      showToast(validationMessage);
      return;
    }

    this.setData({ isSaving: true, errorText: '' });

    try {
      if (this.data.isEditMode) {
        const patch = this.buildEditPatch();

        if (Object.keys(patch).length === 0) {
          showToast('未做修改');
          return;
        }

        console.log('[profile-edit] updateProfile patch', {
          profileId: this.data.profileId,
          patch,
        });

        const result = await profileService.updateProfile(this.data.profileId, patch);
        try {
          syncProfileIntoStore(this.data.profileId, result.profile);
        } catch (syncError) {
          console.error('[profile-edit] store sync after updateProfile failed', {
            profileId: this.data.profileId,
            patch,
            syncError,
          });
        }
        wx.showToast({
          title: '已保存',
          icon: 'success',
          duration: 800,
        });
        if (this.navigateAfterSaveTimer) {
          clearTimeout(this.navigateAfterSaveTimer);
        }
        this.navigateAfterSaveTimer = setTimeout(() => {
          this.navigateAfterSaveTimer = null;
          goBackOrHome(this.data.returnTab || DEFAULT_RETURN_TAB);
        }, 800);
        return;
      }

      const payload = this.buildCreatePayload();
      console.log('[profile-edit] createProfile payload', payload);
      const result = await profileService.createProfile(payload);
      try {
        syncCreatedProfileIntoStore(result.profile, result.relationship);
      } catch (syncError) {
        console.error('[profile-edit] store sync after createProfile failed', {
          profileId: result && result.profile && result.profile._id,
          syncError,
        });
      }
      wx.switchTab({
        url: this.data.returnTab || DEFAULT_RETURN_TAB,
      });
    } catch (error) {
      console.error('[profile-edit] save failed', {
        mode: this.data.isEditMode ? 'edit' : 'create',
        profileId: this.data.profileId,
        code: error && error.code,
        message: error && error.message,
        result: error && error.result,
      });
      showToast(getReadableErrorMessage(error));
    } finally {
      this.setData({ isSaving: false });
    }
  },

  handleCancel() {
    goBackOrHome(this.data.returnTab || DEFAULT_RETURN_TAB);
  },
});
