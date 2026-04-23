const { store } = require('../../store/index');
const profileService = require('../../services/profile-service');

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

function getCreateErrorMessage(error) {
  if (error && error.code === 'INVALID_ARGUMENT') {
    return '档案信息填写有误，请检查后重试';
  }

  if (error && error.code === 'USER_NOT_FOUND') {
    return '登录状态异常，请重新打开小程序';
  }

  if (error && error.code === 'PERMISSION_DENIED') {
    return '没有权限保存档案';
  }

  return (error && error.message) || '保存失败，请稍后重试';
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
    genderOptions: GENDER_OPTIONS,
    form: {
      name: '',
      relation: '',
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
      showToast('编辑功能将在后续阶段上线');
    }
  },

  onNameInput(event) {
    this.setData({
      'form.name': event.detail.value,
    });
  },

  onRelationChange(event) {
    const relationIndex = Number(event.detail.value);
    const relation = RELATION_OPTIONS[relationIndex] || '';

    this.setData({
      relationIndex,
      'form.relation': relation,
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

    if (!name) {
      return '请填写姓名';
    }

    if (name.length > 20) {
      return '姓名不能超过 20 个字';
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
    const relation = (form.relation || '').trim();
    const gender = (form.gender || '').trim();
    const birthDate = (form.birthDate || '').trim();
    const note = (form.note || '').trim();

    if (relation) {
      payload.relation = relation;
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
      showToast('编辑功能将在后续阶段上线');
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

      store.setState({
        profiles: state.profiles.concat(result.profile),
        relationships: state.relationships.concat(result.relationship),
        currentProfileId: state.currentProfileId || null,
      });

      wx.showToast({
        title: '创建成功',
        icon: 'success',
      });
      goHome();
    } catch (error) {
      showToast(getCreateErrorMessage(error));
    } finally {
      this.setData({ isSaving: false });
    }
  },

  handleCancel() {
    goHome();
  },
});
