const { store } = require('../../store/index');
const profileService = require('../../services/profile-service');
const { getErrorMessage } = require('../../utils/error-messages');

const RELATION_OPTIONS = ['父亲', '母亲', '本人', '配偶', '子女', '其他'];
const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
];

function showToast(title) {
  wx.showToast({
    title,
    icon: 'none',
  });
}

function goHome() {
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
    mode: 'create',
    profileId: '',
    isEditMode: false,
    isSaving: false,
    relationOptions: RELATION_OPTIONS,
    relationIndex: -1,
    relationPickerText: '',
    showCustomRelation: false,
    genderOptions: GENDER_OPTIONS,
    form: {
      name: '',
      relationSelection: '',
      relationCustom: '',
      gender: '',
      birthDate: '',
      note: '',
    },
  },

  onLoad(options = {}) {
    const mode = options.mode === 'edit' ? 'edit' : 'create';

    this.setData({
      mode,
      profileId: options.profileId || '',
      isEditMode: mode === 'edit',
    });

    if (mode === 'edit') {
      showToast('暂不支持编辑档案');
    }
  },

  onNameInput(event) {
    this.setData({
      'form.name': event.detail.value,
    });
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
    };

    if (!showCustomRelation) {
      nextData['form.relationCustom'] = '';
    }

    this.setData(nextData);
  },

  onRelationCustomInput(event) {
    this.setData({
      'form.relationCustom': event.detail.value,
    });
  },

  onGenderTap(event) {
    const gender = event.currentTarget.dataset.value || '';

    this.setData({
      'form.gender': gender,
    });
  },

  onBirthDateChange(event) {
    this.setData({
      'form.birthDate': event.detail.value,
    });
  },

  onNoteInput(event) {
    this.setData({
      'form.note': event.detail.value,
    });
  },

  validateForm() {
    const form = this.data.form;
    const name = (form.name || '').trim();
    const note = (form.note || '').trim();
    const relationSelection = (form.relationSelection || '').trim();
    const relationCustom = (form.relationCustom || '').trim();

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

    if (note.length > 200) {
      return '备注不能超过 200 个字';
    }

    return '';
  },

  buildPayload() {
    const form = this.data.form;
    const payload = {
      name: (form.name || '').trim(),
    };
    const relationSelection = (form.relationSelection || '').trim();
    const relationCustom = (form.relationCustom || '').trim();
    const gender = (form.gender || '').trim();
    const birthDate = (form.birthDate || '').trim();
    const note = (form.note || '').trim();

    if (relationSelection && relationSelection !== '其他') {
      payload.relation = relationSelection;
    }
    if (relationSelection === '其他' && relationCustom) {
      payload.relation = relationCustom;
    }
    if (gender) {
      payload.gender = gender;
    }
    if (birthDate) {
      payload.birthDate = birthDate;
    }
    if (note) {
      payload.note = note;
    }

    return payload;
  },

  async handleSubmit() {
    if (this.data.isEditMode) {
      showToast('暂不支持编辑档案');
      return;
    }

    const validationMessage = this.validateForm();
    if (validationMessage) {
      showToast(validationMessage);
      return;
    }

    this.setData({ isSaving: true });

    try {
      const result = await profileService.createProfile(this.buildPayload());
      const state = store.getState();
      const nextCurrentProfileId =
        state.currentProfileId || (state.profiles.length === 1 ? state.profiles[0]._id : null);

      store.setState({
        profiles: state.profiles.concat(result.profile),
        relationships: state.relationships.concat(result.relationship),
        currentProfileId: nextCurrentProfileId,
      });

      wx.showToast({
        title: `已为${result.profile.name}建档`,
        icon: 'success',
      });
      goHome();
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      this.setData({ isSaving: false });
    }
  },

  handleCancel() {
    goHome();
  },
});
