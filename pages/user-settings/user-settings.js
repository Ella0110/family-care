const userService = require('../../services/user-service');
const profileService = require('../../services/profile-service');
const memberService = require('../../services/member-service');
const { store } = require('../../store/index');
const { getErrorMessage } = require('../../utils/error-messages');
const {
  buildInvitationNicknameInitial,
  normalizeGrantedUserProfile,
} = require('../../utils/invitation');
const {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_OPTIONS,
  FONT_SCALE_LABELS,
  buildFontScaleStyle,
  isValidFontScale,
  normalizeFontScale,
} = require('../../utils/font-scale');
const {
  getCurrentRelationship,
  isOwner,
} = require('../../utils/permission-helpers');

const SETTINGS_DEBOUNCE_MS = 800;

const DEFAULT_BP_THRESHOLD = Object.freeze({
  systolic: 140,
  diastolic: 90,
});

const DEFAULT_BP_REFERENCE_LINES = Object.freeze({
  systolicElevated: 140,
  diastolicElevated: 90,
});

const DEFAULT_HR_REFERENCE_LINES = Object.freeze({
  low: 60,
  high: 100,
});

const THRESHOLD_LIMITS = Object.freeze({
  systolic: { min: 100, max: 200, step: 5 },
  diastolic: { min: 60, max: 120, step: 5 },
});

const BP_REFERENCE_LIMITS = Object.freeze({
  systolicElevated: { min: 100, max: 180, step: 5 },
  diastolicElevated: { min: 60, max: 110, step: 5 },
});

const HR_REFERENCE_LIMITS = Object.freeze({
  low: { min: 40, max: 80, step: 5 },
  high: { min: 70, max: 120, step: 5 },
});

const MEMBER_ROLE_ORDER = {
  owner: 0,
  collaborator: 1,
  viewer: 2,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getAppFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function getSelectedLabel(fontScale) {
  return FONT_SCALE_LABELS[normalizeFontScale(fontScale)] || FONT_SCALE_LABELS[DEFAULT_FONT_SCALE];
}

function getCurrentUserProfileSummary() {
  const state = store.getState();
  const user = state.user || {};
  const normalized = normalizeGrantedUserProfile({
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  });

  return {
    nickname: normalized ? normalized.nickname : '未填写昵称',
    avatarUrl: normalized ? normalized.avatarUrl || '' : '',
    avatarFallback: buildInvitationNicknameInitial(normalized ? normalized.nickname : '', '我'),
    hasValidProfile: Boolean(normalized),
  };
}

function getCurrentProfile() {
  const state = store.getState();
  const profileId = state.currentProfileId || '';
  const profile = (state.profiles || []).find((item) => item && item._id === profileId) || null;
  return {
    state,
    profileId,
    profile,
  };
}

function extractSettingsViewModel(profile) {
  const settings = (profile && profile.settings) || {};
  const bp = settings.bp || {};
  const threshold = bp.threshold || {};
  const referenceLines = bp.referenceLines || {};
  const hr = settings.hr || {};
  const hrReferenceLines = hr.referenceLines || {};

  return {
    thresholdSystolic: Number(threshold.systolic) || DEFAULT_BP_THRESHOLD.systolic,
    thresholdDiastolic: Number(threshold.diastolic) || DEFAULT_BP_THRESHOLD.diastolic,
    referenceSystolicElevated:
      Number(referenceLines.systolic && referenceLines.systolic.elevated) ||
      DEFAULT_BP_REFERENCE_LINES.systolicElevated,
    referenceDiastolicElevated:
      Number(referenceLines.diastolic && referenceLines.diastolic.elevated) ||
      DEFAULT_BP_REFERENCE_LINES.diastolicElevated,
    hrReferenceLow:
      Number(hrReferenceLines.low) || DEFAULT_HR_REFERENCE_LINES.low,
    hrReferenceHigh:
      Number(hrReferenceLines.high) || DEFAULT_HR_REFERENCE_LINES.high,
  };
}

function buildMemberFallback(member) {
  return buildInvitationNicknameInitial(member && member.user && member.user.nickname, '家');
}

function decorateMembers(members, currentUserId) {
  return (Array.isArray(members) ? members : [])
    .map((member) => {
      const relationship = member.relationship || {};
      const user = member.user || {};
      const isSelf = Boolean(currentUserId && user._id === currentUserId);
      return {
        relationshipId: relationship._id || '',
        userId: user._id || '',
        nickname: user.nickname || '未命名',
        avatarUrl: user.avatarUrl || '',
        avatarFallback: buildMemberFallback(member),
        subscribeAlerts: Boolean(relationship.subscribeAlerts),
        role: relationship.role || '',
        isSelf,
        updating: false,
      };
    })
    .sort((left, right) => {
      const leftOrder = Object.prototype.hasOwnProperty.call(MEMBER_ROLE_ORDER, left.role)
        ? MEMBER_ROLE_ORDER[left.role]
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = Object.prototype.hasOwnProperty.call(MEMBER_ROLE_ORDER, right.role)
        ? MEMBER_ROLE_ORDER[right.role]
        : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      if (left.isSelf !== right.isSelf) {
        return left.isSelf ? -1 : 1;
      }

      return left.nickname.localeCompare(right.nickname);
    });
}

function updateProfileInStore(profile) {
  if (!profile || !profile._id) {
    return;
  }

  const state = store.getState();
  store.setState({
    profiles: (state.profiles || []).map((item) =>
      item && item._id === profile._id ? profile : item
    ),
  });
}

function showToast(title, icon = 'none') {
  wx.showToast({
    title,
    icon,
  });
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fontScaleStyle: buildFontScaleStyle(DEFAULT_FONT_SCALE),
    selectedFontScale: DEFAULT_FONT_SCALE,
    selectedLabel: getSelectedLabel(DEFAULT_FONT_SCALE),
    fontScaleOptions: FONT_SCALE_OPTIONS.map((value) => ({
      value,
      label: FONT_SCALE_LABELS[value],
    })),
    profileSummary: getCurrentUserProfileSummary(),
    profileId: '',
    profileName: '',
    hasProfile: false,
    isOwnerProfile: false,
    currentRelationshipId: '',
    currentSubscribeAlerts: false,
    notifySubscriberCount: 0,
    showReferenceLineSettings: false,
    thresholdSystolic: DEFAULT_BP_THRESHOLD.systolic,
    thresholdDiastolic: DEFAULT_BP_THRESHOLD.diastolic,
    referenceSystolicElevated: DEFAULT_BP_REFERENCE_LINES.systolicElevated,
    referenceDiastolicElevated: DEFAULT_BP_REFERENCE_LINES.diastolicElevated,
    hrReferenceLow: DEFAULT_HR_REFERENCE_LINES.low,
    hrReferenceHigh: DEFAULT_HR_REFERENCE_LINES.high,
    thresholdSystolicMin: THRESHOLD_LIMITS.systolic.min,
    thresholdSystolicMax: THRESHOLD_LIMITS.systolic.max,
    thresholdDiastolicMin: THRESHOLD_LIMITS.diastolic.min,
    thresholdDiastolicMax: THRESHOLD_LIMITS.diastolic.max,
    referenceSystolicMin: BP_REFERENCE_LIMITS.systolicElevated.min,
    referenceSystolicMax: BP_REFERENCE_LIMITS.systolicElevated.max,
    referenceDiastolicMin: BP_REFERENCE_LIMITS.diastolicElevated.min,
    referenceDiastolicMax: BP_REFERENCE_LIMITS.diastolicElevated.max,
    hrLowMin: HR_REFERENCE_LIMITS.low.min,
    hrLowMax: HR_REFERENCE_LIMITS.low.max,
    hrHighMin: HR_REFERENCE_LIMITS.high.min,
    hrHighMax: HR_REFERENCE_LIMITS.high.max,
    isMemberSheetVisible: false,
    memberSheetItems: [],
    isMemberSheetLoading: false,
    memberSheetErrorText: '',
  },

  onLoad() {
    this.fontScaleRequestId = 0;
    this.memberSheetRequestId = 0;
    this.settingsDebounceTimers = {};
    this.profileSettingsRequestIds = {
      threshold: 0,
      referenceLines: 0,
      hrReferenceLines: 0,
    };
    this.syncFontScale();
    this.syncProfileSummary();
    this.syncProfileContext();
  },

  onShow() {
    this.syncFontScale();
    this.syncProfileSummary();
    this.syncProfileContext();
  },

  onUnload() {
    this.clearAllSettingsDebounceTimers();
  },

  clearAllSettingsDebounceTimers() {
    Object.keys(this.settingsDebounceTimers || {}).forEach((key) => {
      clearTimeout(this.settingsDebounceTimers[key]);
    });
    this.settingsDebounceTimers = {};
  },

  syncFontScale() {
    const fontScale = getAppFontScale();
    this.setData({
      fontScale,
      fontScaleStyle: buildFontScaleStyle(fontScale),
      selectedFontScale: fontScale,
      selectedLabel: getSelectedLabel(fontScale),
    });
  },

  syncProfileSummary() {
    this.setData({
      profileSummary: getCurrentUserProfileSummary(),
    });
  },

  syncProfileContext() {
    const { state, profileId, profile } = getCurrentProfile();
    const relationship = getCurrentRelationship(state, profileId);
    const settingsViewModel = extractSettingsViewModel(profile);

    this.setData({
      profileId,
      profileName: profile ? profile.name || '' : '',
      hasProfile: Boolean(profileId && profile),
      isOwnerProfile: Boolean(profileId && isOwner(state, profileId)),
      currentRelationshipId: relationship ? relationship._id || '' : '',
      currentSubscribeAlerts: Boolean(relationship && relationship.subscribeAlerts),
      thresholdSystolic: settingsViewModel.thresholdSystolic,
      thresholdDiastolic: settingsViewModel.thresholdDiastolic,
      referenceSystolicElevated: settingsViewModel.referenceSystolicElevated,
      referenceDiastolicElevated: settingsViewModel.referenceDiastolicElevated,
      hrReferenceLow: settingsViewModel.hrReferenceLow,
      hrReferenceHigh: settingsViewModel.hrReferenceHigh,
    });

    if (profileId && isOwner(state, profileId)) {
      this.ensureMembersLoaded({ force: false });
      return;
    }

    this.setData({
      notifySubscriberCount: 0,
      memberSheetItems: [],
      memberSheetErrorText: '',
      isMemberSheetVisible: false,
    });
  },

  async ensureMembersLoaded({ force = false } = {}) {
    if (!this.data.profileId || !this.data.isOwnerProfile) {
      return;
    }

    if (!force && this.data.memberSheetItems.length && !this.data.memberSheetErrorText) {
      this.updateNotifySubscriberCount(this.data.memberSheetItems);
      return;
    }

    const requestId = this.memberSheetRequestId + 1;
    this.memberSheetRequestId = requestId;
    this.setData({
      isMemberSheetLoading: true,
      memberSheetErrorText: '',
    });

    try {
      const result = await memberService.listProfileMembers(this.data.profileId);
      if (requestId !== this.memberSheetRequestId) {
        return;
      }

      const currentUserId = store.getState().user && store.getState().user._id;
      const items = decorateMembers(result.members, currentUserId);
      this.setData({
        memberSheetItems: items,
        isMemberSheetLoading: false,
        memberSheetErrorText: '',
      });
      this.updateNotifySubscriberCount(items);
    } catch (error) {
      if (requestId !== this.memberSheetRequestId) {
        return;
      }

      this.setData({
        isMemberSheetLoading: false,
        memberSheetErrorText: getErrorMessage(error),
      });
    }
  },

  updateNotifySubscriberCount(items) {
    const count = (Array.isArray(items) ? items : []).filter((item) => item.subscribeAlerts).length;
    this.setData({
      notifySubscriberCount: count,
    });
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  handleOpenUserProfileEdit() {
    wx.navigateTo({
      url: '/pages/user-profile-edit/user-profile-edit',
    });
  },

  applyScaleLocally(fontScale) {
    const app = getApp();
    const nextScale = normalizeFontScale(fontScale);

    app.applyFontScale(nextScale, {
      persist: true,
      syncStoreUser: true,
    });

    this.setData({
      fontScale: nextScale,
      fontScaleStyle: buildFontScaleStyle(nextScale),
      selectedFontScale: nextScale,
      selectedLabel: getSelectedLabel(nextScale),
    });
  },

  async handleSelectScale(event) {
    const fontScale = Number(event.currentTarget.dataset.scale);
    if (!isValidFontScale(fontScale)) {
      return;
    }

    if (normalizeFontScale(this.data.selectedFontScale) === fontScale) {
      return;
    }

    this.fontScaleRequestId += 1;
    const requestId = this.fontScaleRequestId;
    this.applyScaleLocally(fontScale);

    try {
      const result = await userService.updateSettings({ fontScale });
      if (requestId !== this.fontScaleRequestId) {
        return;
      }

      store.setState({
        user: result.user,
      });
      this.applyScaleLocally(result.user.settings && result.user.settings.fontScale);
    } catch (error) {
      if (requestId !== this.fontScaleRequestId) {
        return;
      }

      showToast(getErrorMessage(error));
    }
  },

  async handleToggleCurrentAlert(event) {
    const value = Boolean(event.detail.value);
    const relationshipId = this.data.currentRelationshipId;
    if (!relationshipId) {
      this.setData({
        currentSubscribeAlerts: !value,
      });
      return;
    }

    const previousValue = this.data.currentSubscribeAlerts;
    this.setData({
      currentSubscribeAlerts: value,
    });

    try {
      const result = await memberService.updateRelationship(relationshipId, {
        subscribeAlerts: value,
      });
      const nextValue = Boolean(result.relationship && result.relationship.subscribeAlerts);
      this.setData({
        currentSubscribeAlerts: nextValue,
      });
      this.patchMemberSubscribeState(relationshipId, nextValue);
    } catch (error) {
      this.setData({
        currentSubscribeAlerts: previousValue,
      });
      showToast(getErrorMessage(error));
    }
  },

  patchMemberSubscribeState(relationshipId, subscribeAlerts) {
    if (!relationshipId || !this.data.memberSheetItems.length) {
      return;
    }

    const nextItems = this.data.memberSheetItems.map((item) =>
      item.relationshipId === relationshipId
        ? Object.assign({}, item, { subscribeAlerts: Boolean(subscribeAlerts) })
        : item
    );

    this.setData({
      memberSheetItems: nextItems,
    });
    this.updateNotifySubscriberCount(nextItems);
  },

  async handleOpenMemberSheet() {
    if (!this.data.isOwnerProfile || !this.data.profileId) {
      return;
    }

    this.setData({
      isMemberSheetVisible: true,
    });
    await this.ensureMembersLoaded({ force: false });
  },

  handleCloseMemberSheet() {
    this.setData({
      isMemberSheetVisible: false,
    });
  },

  handleRetryLoadMembers() {
    this.ensureMembersLoaded({ force: true });
  },

  async handleToggleMemberAlert(event) {
    const relationshipId = event.currentTarget.dataset.relationshipId || '';
    const value = Boolean(event.detail.value);
    if (!relationshipId) {
      return;
    }

    const items = this.data.memberSheetItems || [];
    const targetItem = items.find((item) => item.relationshipId === relationshipId);
    if (!targetItem) {
      return;
    }

    const nextItems = items.map((item) =>
      item.relationshipId === relationshipId
        ? Object.assign({}, item, { subscribeAlerts: value, updating: true })
        : item
    );
    this.setData({
      memberSheetItems: nextItems,
    });
    this.updateNotifySubscriberCount(nextItems);

    try {
      const result = await memberService.updateRelationship(relationshipId, {
        subscribeAlerts: value,
      });
      const finalValue = Boolean(result.relationship && result.relationship.subscribeAlerts);
      const resolvedItems = (this.data.memberSheetItems || []).map((item) =>
        item.relationshipId === relationshipId
          ? Object.assign({}, item, { subscribeAlerts: finalValue, updating: false })
          : item
      );
      this.setData({
        memberSheetItems: resolvedItems,
      });
      this.updateNotifySubscriberCount(resolvedItems);

      if (relationshipId === this.data.currentRelationshipId) {
        this.setData({
          currentSubscribeAlerts: finalValue,
        });
      }
    } catch (error) {
      const rolledBackItems = (this.data.memberSheetItems || []).map((item) =>
        item.relationshipId === relationshipId
          ? Object.assign({}, item, {
            subscribeAlerts: Boolean(targetItem.subscribeAlerts),
            updating: false,
          })
          : item
      );
      this.setData({
        memberSheetItems: rolledBackItems,
      });
      this.updateNotifySubscriberCount(rolledBackItems);

      if (relationshipId === this.data.currentRelationshipId) {
        this.setData({
          currentSubscribeAlerts: Boolean(targetItem.subscribeAlerts),
        });
      }

      showToast(getErrorMessage(error));
    }
  },

  handleAdjustThreshold(event) {
    const field = event.currentTarget.dataset.field;
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    if (!Object.prototype.hasOwnProperty.call(THRESHOLD_LIMITS, field)) {
      return;
    }

    const key = field === 'systolic' ? 'thresholdSystolic' : 'thresholdDiastolic';
    const limits = THRESHOLD_LIMITS[field];
    const nextValue = clamp(this.data[key] + delta, limits.min, limits.max);
    if (nextValue === this.data[key]) {
      return;
    }

    this.setData({
      [key]: nextValue,
    });
    this.scheduleSettingsFlush('threshold');
  },

  handleAdjustBloodPressureReference(event) {
    const field = event.currentTarget.dataset.field;
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    if (!Object.prototype.hasOwnProperty.call(BP_REFERENCE_LIMITS, field)) {
      return;
    }

    const key = field === 'systolicElevated'
      ? 'referenceSystolicElevated'
      : 'referenceDiastolicElevated';
    const limits = BP_REFERENCE_LIMITS[field];
    const nextValue = clamp(this.data[key] + delta, limits.min, limits.max);
    if (nextValue === this.data[key]) {
      return;
    }

    this.setData({
      [key]: nextValue,
    });
    this.scheduleSettingsFlush('referenceLines');
  },

  handleAdjustHeartRateReference(event) {
    const field = event.currentTarget.dataset.field;
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    if (!Object.prototype.hasOwnProperty.call(HR_REFERENCE_LIMITS, field)) {
      return;
    }

    const key = field === 'low' ? 'hrReferenceLow' : 'hrReferenceHigh';
    const limits = HR_REFERENCE_LIMITS[field];
    const nextValue = clamp(this.data[key] + delta, limits.min, limits.max);
    if (nextValue === this.data[key]) {
      return;
    }

    this.setData({
      [key]: nextValue,
    });
    this.scheduleSettingsFlush('hrReferenceLines');
  },

  scheduleSettingsFlush(section) {
    if (!this.data.profileId) {
      return;
    }

    clearTimeout(this.settingsDebounceTimers[section]);
    this.settingsDebounceTimers[section] = setTimeout(() => {
      delete this.settingsDebounceTimers[section];
      if (section === 'threshold') {
        this.flushThresholdSettings();
        return;
      }

      if (section === 'referenceLines') {
        this.flushBloodPressureReferenceLines();
        return;
      }

      if (section === 'hrReferenceLines') {
        this.flushHeartRateReferenceLines();
      }
    }, SETTINGS_DEBOUNCE_MS);
  },

  async flushThresholdSettings() {
    const profileId = this.data.profileId;
    if (!profileId) {
      return;
    }

    const requestId = (this.profileSettingsRequestIds.threshold || 0) + 1;
    this.profileSettingsRequestIds.threshold = requestId;

    try {
      const result = await profileService.updateProfileSettings(profileId, {
        bp: {
          threshold: {
            systolic: this.data.thresholdSystolic,
            diastolic: this.data.thresholdDiastolic,
          },
        },
      });
      if (requestId !== this.profileSettingsRequestIds.threshold) {
        return;
      }

      updateProfileInStore(result.profile);
      this.syncProfileContext();
      wx.showToast({
        title: '阈值已保存',
        icon: 'success',
      });
    } catch (error) {
      if (requestId !== this.profileSettingsRequestIds.threshold) {
        return;
      }

      this.syncProfileContext();
      showToast(getErrorMessage(error));
    }
  },

  async flushBloodPressureReferenceLines() {
    const profileId = this.data.profileId;
    if (!profileId) {
      return;
    }

    const requestId = (this.profileSettingsRequestIds.referenceLines || 0) + 1;
    this.profileSettingsRequestIds.referenceLines = requestId;

    try {
      const result = await profileService.updateProfileSettings(profileId, {
        bp: {
          referenceLines: {
            systolic: {
              elevated: this.data.referenceSystolicElevated,
            },
            diastolic: {
              elevated: this.data.referenceDiastolicElevated,
            },
          },
        },
      });
      if (requestId !== this.profileSettingsRequestIds.referenceLines) {
        return;
      }

      updateProfileInStore(result.profile);
      this.syncProfileContext();
      wx.showToast({
        title: '参考线已保存',
        icon: 'success',
      });
    } catch (error) {
      if (requestId !== this.profileSettingsRequestIds.referenceLines) {
        return;
      }

      this.syncProfileContext();
      showToast(getErrorMessage(error));
    }
  },

  async flushHeartRateReferenceLines() {
    const profileId = this.data.profileId;
    if (!profileId) {
      return;
    }

    if (this.data.hrReferenceHigh <= this.data.hrReferenceLow) {
      showToast('心率上限必须大于下限');
      this.syncProfileContext();
      return;
    }

    const requestId = (this.profileSettingsRequestIds.hrReferenceLines || 0) + 1;
    this.profileSettingsRequestIds.hrReferenceLines = requestId;

    try {
      const result = await profileService.updateProfileSettings(profileId, {
        hr: {
          referenceLines: {
            low: this.data.hrReferenceLow,
            high: this.data.hrReferenceHigh,
          },
        },
      });
      if (requestId !== this.profileSettingsRequestIds.hrReferenceLines) {
        return;
      }

      updateProfileInStore(result.profile);
      this.syncProfileContext();
      wx.showToast({
        title: '心率参考线已保存',
        icon: 'success',
      });
    } catch (error) {
      if (requestId !== this.profileSettingsRequestIds.hrReferenceLines) {
        return;
      }

      this.syncProfileContext();
      showToast(getErrorMessage(error));
    }
  },
});
