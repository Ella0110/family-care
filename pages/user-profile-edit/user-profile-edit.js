const { store } = require('../../store/index');
const userService = require('../../services/user-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, syncFontData } = require('../../utils/font-scale');
const {
  buildUserProfileForm,
  normalizeNicknameInput,
  trimText,
  uploadAvatarIfNeeded,
  validateUserProfileForm,
} = require('../../utils/user-profile-form');

function getInitialForm() {
  return buildUserProfileForm(store.getState().user || {});
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    isSaving: false,
    errorText: '',
    form: getInitialForm(),
  },

  onLoad() {
    this.syncFontScale();
    this.syncFormFromStore();
  },

  onShow() {
    this.syncFontScale();
  },

  syncFontScale() {
    syncFontData.call(this);
  },

  syncFormFromStore() {
    this.setData({
      form: getInitialForm(),
      errorText: '',
    });
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  onNicknameInput(event) {
    const nickname = normalizeNicknameInput(event.detail.value);
    const nextForm = buildUserProfileForm(Object.assign({}, this.data.form, {
      nickname,
      avatarUrl: this.data.form.avatarUrl,
    }));
    this.setData({
      form: nextForm,
      errorText: '',
    });
  },

  onChooseAvatar(event) {
    const avatarUrl = trimText(event.detail && event.detail.avatarUrl);
    const nextForm = buildUserProfileForm(Object.assign({}, this.data.form, {
      nickname: this.data.form.nickname,
      avatarUrl,
    }));
    this.setData({
      form: nextForm,
      errorText: '',
    });
  },

  validateForm() {
    return validateUserProfileForm(this.data.form);
  },

  async handleSave() {
    const validationMessage = this.validateForm();
    if (validationMessage) {
      this.setData({ errorText: validationMessage });
      wx.showToast({
        title: validationMessage,
        icon: 'none',
      });
      return;
    }

    this.setData({
      isSaving: true,
      errorText: '',
    });

    try {
      const currentUserId = (store.getState().user && store.getState().user._id) || '';
      const avatarUrl = await uploadAvatarIfNeeded(
        trimText(this.data.form.avatarUrl) || '',
        currentUserId,
      );
      const result = await userService.updateProfile({
        nickname: trimText(this.data.form.nickname),
        avatarUrl,
      });
      this.setData({ form: buildUserProfileForm(result.user) });
      store.setState({
        user: result.user,
      });
      store.clearRefresh('members');
      const app = getApp();
      if (app && typeof app.markMemberListDirty === 'function') {
        app.markMemberListDirty();
      } else if (app && app.globalData) {
        app.globalData.memberListDirty = true;
      }
      if (app && typeof app.syncInviterProfileState === 'function') {
        app.syncInviterProfileState(result.user);
      }
      wx.showToast({
        title: '已保存',
        icon: 'success',
        duration: 800,
      });
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 800);
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
});
