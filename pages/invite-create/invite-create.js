const { store } = require('../../store/index');
const invitationService = require('../../services/invitation-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const {
  INVITATION_MAX_PROFILE_SELECTION,
  buildInvitableProfiles,
  buildDefaultInvitationMessage,
  buildInvitationShareTitle,
  normalizeGrantedUserProfile,
} = require('../../utils/invitation');

const ROLE_OPTIONS = Object.freeze([
  { value: 'viewer', label: '只看（推荐）', description: '家人能查看血压和用药情况，但不能修改数据。' },
  { value: 'collaborator', label: '共同记录', description: '家人可以代为录入血压、添加用药，适合共同照顾。' },
]);
const MAX_MESSAGE_LENGTH = 50;

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

  wx.reLaunch({
    url: '/pages/home/home',
  });
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    profileId: '',
    invitableProfiles: [],
    selectedProfileIds: [],
    selectedCount: 0,
    defaultRole: 'viewer',
    roleOptions: ROLE_OPTIONS,
    roleDescription: ROLE_OPTIONS[0].description,
    message: '',
    isMessageDirty: false,
    isGenerating: false,
    isGenerated: false,
    generatedInvitation: null,
    generatedProfileSummary: '',
    shareCardTitle: '',
  },

  onLoad(options = {}) {
    this.defaultProfileId = options.profileId || '';
    this.syncFontScale();
    this.buildProfileOptions();
  },

  onShow() {
    this.syncFontScale();
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  getSelectedProfiles() {
    return (this.data.invitableProfiles || [])
      .filter((item) => item.checked)
      .map((item) => item.profile);
  },

  getGeneratedProfileSummary(selectedProfiles) {
    if (!Array.isArray(selectedProfiles) || selectedProfiles.length === 0) {
      return '健康记录';
    }

    if (selectedProfiles.length === 1) {
      return `${selectedProfiles[0].name}的健康记录`;
    }

    return `${selectedProfiles.length} 个家人的健康记录`;
  },

  buildProfileOptions() {
    const state = store.getState();
    const profiles = buildInvitableProfiles({
      profiles: state.profiles,
      relationships: state.relationships,
      selectedProfileIds: this.defaultProfileId ? [this.defaultProfileId] : [],
      getLatestRecord(profileId) {
        return store.getCachedLatestRecord(profileId);
      },
      now: new Date(),
    });

    if (profiles.length > 0 && !profiles.some((item) => item.checked)) {
      profiles[0].checked = true;
    }

    const selectedProfiles = profiles.filter((item) => item.checked).map((item) => item.profile);
    this.setData({
      profileId: this.defaultProfileId,
      invitableProfiles: profiles,
      selectedProfileIds: selectedProfiles.map((item) => item._id),
      selectedCount: selectedProfiles.length,
      message: buildDefaultInvitationMessage(selectedProfiles),
      isMessageDirty: false,
      isGenerated: false,
      generatedInvitation: null,
      generatedProfileSummary: '',
      shareCardTitle: '',
    });
  },

  updateSelectedProfiles(invitableProfiles) {
    const selectedProfiles = (invitableProfiles || [])
      .filter((item) => item.checked)
      .map((item) => item.profile);
    const nextData = {
      invitableProfiles,
      selectedProfileIds: selectedProfiles.map((item) => item._id),
      selectedCount: selectedProfiles.length,
    };

    if (!this.data.isMessageDirty) {
      nextData.message = buildDefaultInvitationMessage(selectedProfiles);
    }

    this.setData(nextData);
  },

  onToggleProfile(event) {
    const profileId = event.currentTarget.dataset.profileId;
    const invitableProfiles = (this.data.invitableProfiles || []).map((item) => Object.assign({}, item));
    const target = invitableProfiles.find((item) => item.profile && item.profile._id === profileId);

    if (!target) {
      return;
    }

    if (!target.checked && (this.data.selectedCount || 0) >= INVITATION_MAX_PROFILE_SELECTION) {
      showToast(`一次最多邀请 ${INVITATION_MAX_PROFILE_SELECTION} 个档案`);
      return;
    }

    target.checked = !target.checked;
    this.updateSelectedProfiles(invitableProfiles);
  },

  onRoleChange(event) {
    const role = event.currentTarget.dataset.role === 'collaborator' ? 'collaborator' : 'viewer';
    const option = ROLE_OPTIONS.find((item) => item.value === role) || ROLE_OPTIONS[0];

    this.setData({
      defaultRole: role,
      roleDescription: option.description,
    });
  },

  onMessageInput(event) {
    const nextMessage = String(event.detail.value || '').slice(0, MAX_MESSAGE_LENGTH);
    this.setData({
      message: nextMessage,
      isMessageDirty: true,
    });
  },

  validateForm() {
    if ((this.data.selectedCount || 0) < 1) {
      return '至少选择 1 个档案';
    }

    if (String(this.data.message || '').length > MAX_MESSAGE_LENGTH) {
      return `留言不能超过 ${MAX_MESSAGE_LENGTH} 个字`;
    }

    return '';
  },

  handleGenerateInvitation() {
    if (this.data.isGenerating) {
      return;
    }

    const validationError = this.validateForm();
    if (validationError) {
      showToast(validationError);
      return;
    }

    const app = getApp();
    if (app && app.globalData && app.globalData.userProfileGranted) {
      const inviterProfile = app.globalData.userProfile || null;
      this.continueGenerateInvitation(inviterProfile);
      return;
    }

    this.setData({ isGenerating: true });
    wx.getUserProfile({
      desc: '用于让家人识别邀请人',
      success: (result) => {
        const inviterProfile = normalizeGrantedUserProfile(result && result.userInfo);
        if (app && typeof app.cacheGrantedUserProfile === 'function') {
          app.cacheGrantedUserProfile(inviterProfile);
        }
        this.continueGenerateInvitation(inviterProfile);
      },
      fail: () => {
        this.setData({ isGenerating: false });
        showToast('需要授权才能邀请家人，请重试');
      },
    });
  },

  async continueGenerateInvitation(inviterProfile) {
    const app = getApp();
    const selectedProfiles = this.getSelectedProfiles();

    this.setData({ isGenerating: true });

    try {
      const payload = {
        profileIds: selectedProfiles.map((item) => item._id),
        defaultRole: this.data.defaultRole,
      };
      const message = String(this.data.message || '').trim();
      if (message) {
        payload.message = message;
      }

      const storeUser = store.getState().user || null;
      if ((!storeUser || !storeUser.nickname) && inviterProfile) {
        payload.inviterProfile = inviterProfile;
      }

      const result = await invitationService.createInvitation(payload);
      const shareCardTitle = buildInvitationShareTitle(
        result.invitation.inviterNickname || (inviterProfile && inviterProfile.nickname) || '家人',
        selectedProfiles,
      );

      this.setData({
        isGenerating: false,
        isGenerated: true,
        generatedInvitation: result.invitation,
        generatedProfileSummary: this.getGeneratedProfileSummary(selectedProfiles),
        shareCardTitle,
      });

      if (app && typeof app.cacheGrantedUserProfile === 'function' && inviterProfile) {
        app.cacheGrantedUserProfile(inviterProfile);
      }
    } catch (error) {
      if (error && error.code === 'NICKNAME_REQUIRED') {
        this.setData({ isGenerating: false });
        showToast(getErrorMessage(error));
        return;
      }

      this.setData({ isGenerating: false });
      showToast(getErrorMessage(error));
    }
  },

  handleCancel() {
    goBackOrHome();
  },

  handleCopyInvitationLink() {
    const token = this.data.generatedInvitation && this.data.generatedInvitation.token;
    if (!token) {
      showToast('邀请尚未生成');
      return;
    }

    wx.setClipboardData({
      data: `/pages/invite-accept/invite-accept?token=${encodeURIComponent(token)}`,
      success() {
        showToast('已复制邀请链接');
      },
      fail() {
        showToast('复制失败，请重试');
      },
    });
  },

  onShareAppMessage(options = {}) {
    const token = options.target && options.target.dataset ? options.target.dataset.token : '';
    const safeToken = encodeURIComponent(String(token || ''));

    return {
      title: this.data.shareCardTitle || '邀请你查看家人的健康记录',
      path: `/pages/invite-accept/invite-accept?token=${safeToken}`,
    };
  },
});
