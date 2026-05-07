const { store } = require('../../store/index');
const profileService = require('../../services/profile-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { isOwner } = require('../../utils/permission-helpers');

const RELATION_OPTIONS = ['父亲', '母亲', '本人', '配偶', '子女', '其他'];
const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
];
const LONG_TERM_MEDICATION_OPTIONS = [
  { label: '是', value: true },
  { label: '否', value: false },
];
const PHONE_PATTERN = /^1\d{10}$/;

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

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function trimText(value) {
  return String(value || '').trim();
}

function normalizeRelationState(relation) {
  const nextRelation = trimText(relation);

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

Page({
  data: {
    mode: 'create',
    profileId: '',
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
    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const profileId = options.profileId || '';

    this.originalProfile = null;
    this.setData({
      mode,
      profileId,
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
    const name = trimText(this.data.form.name);

    if (!name) {
      return '请填写姓名';
    }

    if (name.length > 20) {
      return '姓名不能超过 20 个字';
    }

    return '';
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

    if (emergencyContactPhone && !PHONE_PATTERN.test(emergencyContactPhone)) {
      return '请输入正确的手机号';
    }

    if (note.length > 200) {
      return '备注不能超过 200 个字';
    }

    return '';
  },

  buildCreatePayload() {
    return {
      name: trimText(this.data.form.name),
    };
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

        const result = await profileService.updateProfile(this.data.profileId, patch);
        const state = store.getState();
        store.setState({
          profiles: (state.profiles || []).map((profile) =>
            profile && profile._id === this.data.profileId ? result.profile : profile,
          ),
        });
        wx.showToast({
          title: '已保存',
          icon: 'success',
          duration: 800,
        });
        setTimeout(() => {
          goBackOrHome();
        }, 800);
        return;
      }

      const result = await profileService.createProfile(this.buildCreatePayload());
      const state = store.getState();
      store.setState({
        profiles: (state.profiles || []).concat(result.profile),
        relationships: (state.relationships || []).concat(result.relationship),
        currentProfileId: result.profile._id,
      });
      wx.switchTab({
        url: '/pages/data/data',
      });
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      this.setData({ isSaving: false });
    }
  },

  handleCancel() {
    goBackOrHome();
  },
});
