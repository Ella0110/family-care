const { store } = require('../../store/index');
const invitationService = require('../../services/invitation-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const { buildInvitationNicknameInitial } = require('../../utils/invitation');

const INVALID_INVITATION_CODES = new Set([
  'INVITATION_EXPIRED',
  'INVITATION_USED',
  'INVITATION_REVOKED',
  'INVITATION_NOT_FOUND',
]);

function showToast(title, duration = 1500) {
  wx.showToast({
    title,
    icon: 'none',
    duration,
  });
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function normalizeProfileName(profile) {
  const name = String((profile && profile.name) || '').trim();
  return name || '家人';
}

function buildPrimaryProfileTitle(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return '「家人」的血压健康';
  }

  if (profiles.length > 1) {
    return '多位家人的健康记录';
  }

  return `「${normalizeProfileName(profiles[0])}」的血压健康`;
}

function buildInvitationDisplay(invitation) {
  const profiles = Array.isArray(invitation && invitation.profiles) ? invitation.profiles : [];
  const primaryProfile = profiles[0] || null;

  return {
    inviterNickname: String((invitation && invitation.inviterNickname) || '').trim() || '家人',
    inviterAvatarUrl: (invitation && invitation.inviterAvatarUrl) || '',
    inviterInitial: buildInvitationNicknameInitial(
      invitation && invitation.inviterNickname,
      '家',
    ),
    primaryProfileId: primaryProfile && primaryProfile._id ? primaryProfile._id : '',
    primaryProfileTitle: buildPrimaryProfileTitle(profiles),
    hasMultipleProfiles: profiles.length > 1,
    secondaryText: profiles.length > 1
      ? '该邀请包含多个档案，接受后会一起加入。'
      : '',
  };
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    token: '',
    viewState: 'loading',
    invitation: null,
    invitationDisplay: null,
    invalidCode: '',
    invalidMessage: '',
    isLoginReady: false,
    isLoginFailed: false,
    isJoinReady: false,
    isAccepting: false,
  },

  onLoad(options = {}) {
    this.syncFontScale();
    this.lastLoginStateSignature = '';
    this.syncLoginState();
    this.unsubscribeStore = store.subscribe(() => {
      this.syncLoginState();
    });

    const token = options.token || '';
    this.setData({ token });

    if (!token) {
      this.setInvalidState('INVITATION_NOT_FOUND', null);
      return;
    }

    this.loadInvitation(token);
  },

  onShow() {
    this.syncFontScale();
    this.syncLoginState();
  },

  onUnload() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  },

  syncFontScale() {
    const fontScale = getCurrentFontScale();
    syncFontData.call(this);
    this.setData({
      fontScale,
    });
  },

  syncLoginState() {
    const app = getApp();
    const globalData = (app && app.globalData) || {};
    const state = store.getState();
    const isLoginReady = globalData.loginReady === true;
    const isLoginFailed = Boolean(globalData.loginError);
    const isJoinReady = isLoginReady && !isLoginFailed && Boolean(state.user);

    const nextState = {
      isLoginReady,
      isLoginFailed,
      isJoinReady,
    };
    const nextSignature = [
      nextState.isLoginReady ? '1' : '0',
      nextState.isLoginFailed ? '1' : '0',
      nextState.isJoinReady ? '1' : '0',
    ].join('|');

    if (nextSignature === this.lastLoginStateSignature) {
      return;
    }

    this.lastLoginStateSignature = nextSignature;
    this.setData(nextState);
  },

  async loadInvitation(token) {
    this.setData({
      viewState: 'loading',
      invalidCode: '',
      invalidMessage: '',
      isAccepting: false,
    });

    try {
      const result = await invitationService.getInvitationInfo(token);
      this.setData({
        viewState: 'ready',
        invitation: result.invitation,
        invitationDisplay: buildInvitationDisplay(result.invitation),
      });
    } catch (error) {
      this.setInvalidState(
        error.code,
        error.invitation || (error.result && error.result.invitation) || null,
      );
    }
  },

  setInvalidState(code, invitation) {
    this.setData({
      viewState: 'invalid',
      invitation: invitation || null,
      invitationDisplay: invitation ? buildInvitationDisplay(invitation) : null,
      invalidCode: code || 'INVITATION_NOT_FOUND',
      invalidMessage: '该链接已过期或已被使用',
      isAccepting: false,
    });
  },

  async ensureLoginReady() {
    if (this.data.isJoinReady) {
      return true;
    }

    const app = getApp();
    if (app && typeof app.login === 'function') {
      try {
        await app.login();
        this.syncLoginState();
      } catch (error) {
        this.syncLoginState();
        showToast(getErrorMessage(error));
        return false;
      }
    }

    if (!store.getState().user) {
      showToast(getErrorMessage({ code: 'AUTH_REQUIRED' }));
      return false;
    }

    return true;
  },

  handleDecline() {
    wx.reLaunch({
      url: '/pages/data/data',
    });
  },

  async handleAcceptInvitation() {
    if (this.data.viewState !== 'ready' || this.data.isAccepting) {
      return;
    }

    const canAccept = await this.ensureLoginReady();
    if (!canAccept) {
      return;
    }

    this.setData({
      isAccepting: true,
    });

    let acceptedProfileId = this.data.invitationDisplay
      ? this.data.invitationDisplay.primaryProfileId
      : '';

    try {
      const result = await invitationService.acceptInvitation(this.data.token);
      acceptedProfileId = result.relationships[0] && result.relationships[0].profileId
        ? result.relationships[0].profileId
        : acceptedProfileId;
    } catch (error) {
      if (error && INVALID_INVITATION_CODES.has(error.code)) {
        this.setInvalidState(
          error.code,
          error.invitation || (error.result && error.result.invitation) || null,
        );
        return;
      }

      this.setData({
        isAccepting: false,
      });
      showToast(getErrorMessage(error));
      return;
    }

    const app = getApp();

    try {
      if (app && typeof app.login === 'function') {
        await app.login();
      }

      this.syncLoginState();

      if (acceptedProfileId) {
        if (app && typeof app.persistLastSelectedProfileId === 'function') {
          app.persistLastSelectedProfileId(acceptedProfileId);
        } else {
          wx.setStorageSync('lastSelectedProfileId', acceptedProfileId);
        }
        store.setCurrentProfileId(acceptedProfileId);
      }

      this.setData({
        isAccepting: false,
      });

      wx.reLaunch({
        url: '/pages/data/data',
      });
    } catch (error) {
      this.syncLoginState();
      this.setData({
        isAccepting: false,
      });
      wx.showModal({
        title: '已接受邀请',
        content: '已接受邀请，但同步档案列表失败。请返回首页后稍候重试，或重新打开小程序。',
        showCancel: false,
        confirmText: '知道了',
      });
    }
  },
});
