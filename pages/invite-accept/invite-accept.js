const { store } = require('../../store/index');
const invitationService = require('../../services/invitation-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const {
  buildInvitationPermissionSummary,
  buildInvitationExpiryText,
  buildInvitationNicknameInitial,
  buildInvitationProfileLabel,
  buildLatestBpSummary,
} = require('../../utils/invitation');

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

function buildInvitationDisplay(invitation) {
  const permissionSummary = buildInvitationPermissionSummary(invitation.defaultRole);

  return {
    inviterNickname: invitation.inviterNickname || '家人',
    inviterAvatarUrl: invitation.inviterAvatarUrl || '',
    inviterInitial: buildInvitationNicknameInitial(invitation.inviterNickname, '家'),
    profiles: (invitation.profiles || []).map((profile) => ({
      _id: profile._id,
      label: buildInvitationProfileLabel(profile, new Date()),
      latestSummary: buildLatestBpSummary(profile.latestBp, new Date()),
    })),
    defaultRole: invitation.defaultRole,
    message: invitation.message || '',
    expiresAtText: buildInvitationExpiryText(invitation.expiresAt, new Date()),
    permissionSummary,
  };
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
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
    acceptedProfileId: '',
    successMessage: '',
  },

  onLoad(options = {}) {
    this.syncFontScale();
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
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  syncLoginState() {
    const app = getApp();
    const globalData = (app && app.globalData) || {};
    const state = store.getState();
    const isLoginReady = globalData.loginReady === true;
    const isLoginFailed = Boolean(globalData.loginError);
    const isJoinReady = isLoginReady && !isLoginFailed && Boolean(state.user);

    this.setData({
      isLoginReady,
      isLoginFailed,
      isJoinReady,
    });
  },

  async loadInvitation(token) {
    this.setData({
      viewState: 'loading',
      invalidCode: '',
      invalidMessage: '',
    });

    try {
      const result = await invitationService.getInvitationInfo(token);
      this.setData({
        viewState: 'ready',
        invitation: result.invitation,
        invitationDisplay: buildInvitationDisplay(result.invitation),
      });
    } catch (error) {
      this.setInvalidState(error.code, error.invitation || (error.result && error.result.invitation) || null);
    }
  },

  setInvalidState(code, invitation) {
    this.setData({
      viewState: 'invalid',
      invitation: invitation || null,
      invitationDisplay: invitation ? buildInvitationDisplay(invitation) : null,
      invalidCode: code || 'INVITATION_NOT_FOUND',
      invalidMessage: getErrorMessage({ code: code || 'INVITATION_NOT_FOUND' }),
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
      url: '/pages/home/home',
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

    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: '确定加入吗？',
        content: '加入后你将看到家人的健康记录。',
        confirmText: '确定加入',
        success: resolve,
        fail() {
          resolve({ confirm: false, cancel: true });
        },
      });
    });

    if (!modalResult || !modalResult.confirm) {
      return;
    }

    this.setData({
      viewState: 'accepting',
      isAccepting: true,
    });

    try {
      const result = await invitationService.acceptInvitation(this.data.token);
      const firstProfileId = result.relationships[0] && result.relationships[0].profileId
        ? result.relationships[0].profileId
        : '';
      const firstProfile = this.data.invitationDisplay && this.data.invitationDisplay.profiles[0];
      const app = getApp();

      if (app && typeof app.login === 'function') {
        await app.login();
      }

      if (firstProfileId) {
        store.setCurrentProfileId(firstProfileId);
      }

      this.syncLoginState();
      this.setData({
        viewState: 'success',
        isAccepting: false,
        acceptedProfileId: firstProfileId,
        successMessage: firstProfile
          ? `你现在可以查看${firstProfile.label.replace(/（.*$/, '')}的健康记录了`
          : '你现在可以查看家人的健康记录了',
      });
    } catch (error) {
      if (
        error
        && ['INVITATION_EXPIRED', 'INVITATION_USED', 'INVITATION_REVOKED', 'INVITATION_NOT_FOUND'].includes(error.code)
      ) {
        this.setInvalidState(error.code, error.invitation || (error.result && error.result.invitation) || null);
        return;
      }

      this.setData({
        viewState: 'ready',
        isAccepting: false,
      });
      showToast(getErrorMessage(error));
    }
  },

  handleCopyInviterNickname() {
    const nickname = this.data.invitationDisplay && this.data.invitationDisplay.inviterNickname;
    if (!nickname) {
      showToast('邀请人信息不可用');
      return;
    }

    wx.setClipboardData({
      data: nickname,
      success() {
        showToast('已复制邀请人昵称');
      },
      fail() {
        showToast('复制失败，请重试');
      },
    });
  },

  handleEnterView() {
    if (this.data.acceptedProfileId) {
      store.setCurrentProfileId(this.data.acceptedProfileId);
    }

    wx.reLaunch({
      url: '/pages/home/home',
    });
  },
});
