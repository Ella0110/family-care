const { store } = require('../../store/index');
const userService = require('../../services/user-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const {
  normalizeGrantedUserProfile,
  isAnonymousInvitationNickname,
  buildInvitationNicknameInitial,
} = require('../../utils/invitation');

function trimText(value) {
  return String(value || '').trim();
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function getInitialForm() {
  const state = store.getState();
  const user = state.user || {};
  const normalized = normalizeGrantedUserProfile({
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  });

  return {
    nickname: normalized ? normalized.nickname : '',
    avatarUrl: normalized ? normalized.avatarUrl || '' : '',
    avatarFallback: buildInvitationNicknameInitial(normalized ? normalized.nickname : '', '我'),
  };
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
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
    this.setData({
      fontScale: getCurrentFontScale(),
    });
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
    const nickname = trimText(event.detail.value).slice(0, 20);
    this.setData({
      'form.nickname': nickname,
      'form.avatarFallback': buildInvitationNicknameInitial(nickname, '我'),
      errorText: '',
    });
  },

  onChooseAvatar(event) {
    const avatarUrl = trimText(event.detail && event.detail.avatarUrl);
    this.setData({
      'form.avatarUrl': avatarUrl,
      errorText: '',
    });
  },

  validateForm() {
    const nickname = trimText(this.data.form.nickname);
    if (!nickname || isAnonymousInvitationNickname(nickname)) {
      return '请填写有效昵称';
    }

    if (nickname.length > 20) {
      return '昵称不能超过 20 个字';
    }

    return '';
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
      const result = await userService.updateProfile({
        nickname: trimText(this.data.form.nickname),
        avatarUrl: trimText(this.data.form.avatarUrl) || '',
      });
      store.setState({
        user: result.user,
      });
      console.log('clearRefresh members called');
      store.clearRefresh('members');
      const app = getApp();
      if (app && typeof app.markMemberListDirty === 'function') {
        app.markMemberListDirty();
        console.log('[user-profile-edit] memberListDirty = true');
      } else if (app && app.globalData) {
        app.globalData.memberListDirty = true;
        console.log('[user-profile-edit] memberListDirty = true');
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
