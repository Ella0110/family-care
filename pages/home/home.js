const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const medicationService = require('../../services/medication-service');
const profileService = require('../../services/profile-service');
const memberService = require('../../services/member-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');
const { DEFAULT_FONT_SCALE, normalizeFontScale } = require('../../utils/font-scale');
const {
  getCurrentRelationship,
  isOwner,
  isViewer,
  canWrite,
  canManage,
  canInvite,
  canEditProfile,
} = require('../../utils/permission-helpers');
const {
  buildProfileDetailDisplay,
  isDeleteNameMatched,
} = require('../../utils/profile-detail');

const STALE_THRESHOLD = 30 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && value.$date) {
    return new Date(value.$date);
  }

  return new Date(value);
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatMeasuredAt(value) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = new Date();

  if (isSameDay(date, today)) {
    return `今天 ${time}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

function getLoginStatus() {
  const app = getApp();
  const globalData = (app && app.globalData) || {};

  return {
    isLoginReady: globalData.loginReady === true,
    isLoginFailed: Boolean(globalData.loginError),
    loginError: globalData.loginError || null,
  };
}

function getCurrentFontScale() {
  const app = getApp();
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    profiles: [],
    activeProfile: null,
    profileCards: [],
    referenceLines: getReferenceLines(),
    hasProfiles: false,
    viewState: 'loading',
    isEmptyState: false,
    isMultiProfileList: false,
    isSingleProfileView: false,
    canReturnToProfileList: false,
    hasLatestRecord: false,
    latestRecord: null,
    latestRecordDisplay: null,
    isLoadingLatestRecord: false,
    isLoadingProfileCards: false,
    latestRecordError: '',
    activeMedications: [],
    visibleActiveMedications: [],
    historicalMedications: [],
    hasAnyMedications: false,
    hasHistoricalMedications: false,
    showMedicationExpandButton: false,
    medicationExpandText: '',
    historicalMedicationCount: 0,
    medicationError: '',
    isLoadingMedications: false,
    isShowAllMedications: false,
    isShowHistoricalMedications: false,
    isLoginReady: false,
    isLoginFailed: false,
    loginErrorText: '',
    isRetrying: false,
    showProfileCompletionPrompt: false,
    activeRelationshipId: '',
    activeRelationshipRole: '',
    canInviteCurrentProfile: false,
    canWriteCurrentProfile: false,
    canManageCurrentProfile: false,
    canEditCurrentProfile: false,
    canExitCurrentProfile: false,
    isViewerCurrentProfile: false,
    activeRelationshipSubscribeAlerts: true,
    profileDetail: {
      title: '',
      metaLine: '',
      emergencyLine: '',
      thresholdLine: '',
      threshold: null,
    },
    advancedSettingsItems: [],
    activeProfileMemberCount: null,
    isDangerZoneExpanded: false,
    isDeleteConfirmVisible: false,
    isDeletingProfile: false,
    deleteConfirmName: '',
    deleteConfirmInput: '',
    deleteConfirmMessage: '',
    isDeleteConfirmReady: false,
  },

  onLoad() {
    this.isPageVisible = false;
    this.profileMemberCounts = {};
    this.profileMemberCountErrors = {};
    this.isRefreshingProfiles = false;
    this.syncFontScale();
    this.lastHomeStateKey = this.getHomeStateKey(store.getState());
    this.unsubscribeStore = store.subscribe((nextState) => {
      const nextHomeStateKey = this.getHomeStateKey(nextState);

      if (nextHomeStateKey === this.lastHomeStateKey) {
        return;
      }

      this.lastHomeStateKey = nextHomeStateKey;
      this.renderState(nextState);

      if (this.isPageVisible) {
        this.loadRecordsForCurrentView();
      }
    });
    this.renderState();
  },

  onShow() {
    this.isPageVisible = true;
    this.syncFontScale();
    this.lastHomeStateKey = this.getHomeStateKey(store.getState());
    this.renderState();
    this.loadRecordsForCurrentView();
    this.refreshProfilesOnShow();
  },

  syncFontScale() {
    this.setData({
      fontScale: getCurrentFontScale(),
    });
  },

  onHide() {
    this.isPageVisible = false;
    this.clearMedicationLoadingTimer();
    this.setData({
      isShowAllMedications: false,
      isShowHistoricalMedications: false,
      isDangerZoneExpanded: false,
      isDeleteConfirmVisible: false,
      deleteConfirmName: '',
      deleteConfirmInput: '',
      deleteConfirmMessage: '',
      isDeleteConfirmReady: false,
    });
  },

  onUnload() {
    this.isPageVisible = false;
    this.clearMedicationLoadingTimer();
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  },

  getHomeStateKey(state) {
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const loginStatus = getLoginStatus();
    const dismissedHints = state && state.session && state.session.dismissedProfileCompletionHints
      ? Object.keys(state.session.dismissedProfileCompletionHints).sort().join('|')
      : '';

    return [
      loginStatus.isLoginReady ? 'ready' : 'pending',
      loginStatus.isLoginFailed ? 'failed' : 'ok',
      state.currentProfileId || 'none',
      (state.relationships || [])
        .map((relationship) => [
          relationship && relationship._id,
          relationship && relationship.profileId,
          relationship && relationship.role,
          relationship && relationship.permissions && relationship.permissions.canWrite ? 'w1' : 'w0',
          relationship && relationship.permissions && relationship.permissions.canManage ? 'm1' : 'm0',
          relationship && relationship.permissions && relationship.permissions.canInvite ? 'i1' : 'i0',
          relationship && relationship.subscribeAlerts ? 's1' : 's0',
        ].join(':'))
        .join('|'),
      profiles
        .map((profile) => [
          profile && profile._id,
          profile && profile.name,
          profile && profile.relation,
          profile && profile.birthDate,
          profile && profile.longTermMedication === true ? 'ltm1' : 'ltm0',
          profile && profile.emergencyContact && profile.emergencyContact.name,
          profile && profile.emergencyContact && profile.emergencyContact.phone,
          profile && profile.settings && profile.settings.bp && profile.settings.bp.threshold && profile.settings.bp.threshold.systolic,
          profile && profile.settings && profile.settings.bp && profile.settings.bp.threshold && profile.settings.bp.threshold.diastolic,
        ].join(':'))
        .join('|'),
      dismissedHints,
    ].join('||');
  },

  renderState(nextState) {
    const state = nextState || store.getState();
    const view = this.resolveHomeView(state);
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const loginStatus = getLoginStatus();
    const activeProfileId = view.activeProfile && view.activeProfile._id;
    const activeRelationship = activeProfileId
      ? getCurrentRelationship(state, activeProfileId)
      : null;
    const canWriteCurrentProfile = activeProfileId ? canWrite(state, activeProfileId) : false;
    const canManageCurrentProfile = activeProfileId ? canManage(state, activeProfileId) : false;
    const canEditCurrentProfile = activeProfileId ? canEditProfile(state, activeProfileId) : false;
    const canInviteCurrentProfile = activeProfileId ? canInvite(state, activeProfileId) : false;
    const isOwnerCurrentProfile = activeProfileId ? isOwner(state, activeProfileId) : false;
    const isViewerCurrentProfile = activeProfileId ? isViewer(state, activeProfileId) : false;
    const activeProfileMemberCount = activeProfileId && Object.prototype.hasOwnProperty.call(this.profileMemberCounts || {}, activeProfileId)
      ? this.profileMemberCounts[activeProfileId]
      : null;

    this.setData({
      profiles,
      activeProfile: view.activeProfile,
      profileDetail: buildProfileDetailDisplay(view.activeProfile),
      profileCards: view.profileCards,
      referenceLines: getReferenceLines(view.activeProfile && view.activeProfile.settings && view.activeProfile.settings.bp && view.activeProfile.settings.bp.referenceLines),
      hasProfiles: profiles.length > 0,
      viewState: view.viewState,
      isEmptyState: view.viewState === 'empty',
      isMultiProfileList: view.viewState === 'multi',
      isSingleProfileView: view.viewState === 'single',
      canReturnToProfileList: view.canReturnToProfileList,
      isLoginReady: loginStatus.isLoginReady,
      isLoginFailed: loginStatus.isLoginFailed,
      loginErrorText: loginStatus.loginError ? getErrorMessage(loginStatus.loginError) : '',
      activeRelationshipId: activeRelationship ? activeRelationship._id : '',
      activeRelationshipRole: activeRelationship ? activeRelationship.role : '',
      canInviteCurrentProfile,
      canWriteCurrentProfile,
      canManageCurrentProfile,
      canEditCurrentProfile,
      canExitCurrentProfile: Boolean(activeRelationship && !isOwnerCurrentProfile),
      isViewerCurrentProfile,
      activeRelationshipSubscribeAlerts: Boolean(activeRelationship ? activeRelationship.subscribeAlerts : true),
      activeProfileMemberCount,
      advancedSettingsItems: this.computeAdvancedSettings(
        view.activeProfile,
        activeProfileMemberCount,
        activeRelationship,
      ),
      showProfileCompletionPrompt: this.shouldShowProfileCompletionPrompt(
        view.activeProfile,
        view.viewState,
        isOwnerCurrentProfile,
      ),
    });
  },

  shouldShowProfileCompletionPrompt(profile, viewState, isOwnerCurrentProfile) {
    if (!profile || viewState === 'multi' || !isOwnerCurrentProfile) {
      return false;
    }

    if (store.isProfileCompletionHintDismissed(profile._id)) {
      return false;
    }

    return !profile.relation || !profile.birthDate;
  },

  async refreshProfilesOnShow() {
    if (!this.isPageVisible) {
      return;
    }

    const loginStatus = getLoginStatus();
    if (!loginStatus.isLoginReady) {
      return;
    }

    const state = store.getState();
    const activeProfileId = state.currentProfileId;
    const activeRelationship = activeProfileId
      ? getCurrentRelationship(state, activeProfileId)
      : null;
    const shouldForceRefresh = store.isStale('profiles', null, STALE_THRESHOLD)
      || Boolean(activeRelationship && activeRelationship.role !== 'owner');

    if (!shouldForceRefresh) {
      return;
    }

    await this.refreshProfiles({ skipCache: true });
  },

  async refreshProfiles() {
    if (this.isRefreshingProfiles) {
      return;
    }

    const app = getApp();
    if (!app || typeof app.login !== 'function') {
      return;
    }

    this.isRefreshingProfiles = true;
    try {
      await app.login({ preserveCurrentProfileId: true });
      store.markRefreshed('profiles');
    } catch (error) {
      console.warn('Profile refresh failed in collaboration flow.', error);
    } finally {
      this.isRefreshingProfiles = false;
    }
  },

  computeAdvancedSettings(profile, memberCount, relationship) {
    if (!profile || !profile._id) {
      return [];
    }

    const profileId = profile._id;
    const state = store.getState();
    const activeRelationship = relationship || getCurrentRelationship(state, profileId);

    if (!activeRelationship) {
      return [];
    }

    if (isOwner(state, profileId)) {
      const items = [
        {
          type: 'invite',
          label: '邀请家人查看',
          desc: '让家人共同关注 TA 的健康',
        },
        {
          type: 'manageMembers',
          label: '管理成员',
          desc: '查看与管理协作家人',
        },
      ];

      if (typeof memberCount === 'number' && memberCount >= 2) {
        items.push({
          type: 'transfer',
          label: '转让管理员',
          desc: '把档案管理权转给其他家人',
        });
      }

      items.push({
        type: 'delete',
        label: '删除档案',
        desc: '删除后所有记录无法恢复',
        danger: true,
      });

      return items;
    }

    return [
      {
        type: 'notificationSetting',
        label: '我的通知设置',
        desc: '异常时通知',
        toggle: true,
        checked: Boolean(activeRelationship.subscribeAlerts),
      },
      {
        type: 'leave',
        label: '退出此档案',
        desc: '退出后无法继续查看',
        danger: true,
      },
    ];
  },

  resolveHomeView(state) {
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const loginStatus = getLoginStatus();

    if (!loginStatus.isLoginReady) {
      return {
        viewState: 'loading',
        activeProfile: null,
        profileCards: [],
        canReturnToProfileList: false,
      };
    }

    if (loginStatus.isLoginFailed) {
      return {
        viewState: 'failed',
        activeProfile: null,
        profileCards: [],
        canReturnToProfileList: false,
      };
    }

    if (profiles.length === 0) {
      return {
        viewState: 'empty',
        activeProfile: null,
        profileCards: [],
        canReturnToProfileList: false,
      };
    }

    if (profiles.length === 1) {
      return {
        viewState: 'single',
        activeProfile: profiles[0],
        profileCards: [],
        canReturnToProfileList: false,
      };
    }

    const activeProfile = state.currentProfileId
      ? profiles.find((profile) => profile && profile._id === state.currentProfileId) || null
      : null;

    if (!activeProfile) {
      return {
        viewState: 'multi',
        activeProfile: null,
        profileCards: profiles.map((profile) =>
          this.createProfileCard(
            profile,
            store.hasCachedLatestRecord(profile._id)
              ? { record: store.getCachedLatestRecord(profile._id) }
              : null,
          ),
        ),
        canReturnToProfileList: false,
      };
    }

    return {
      viewState: 'single',
      activeProfile,
      profileCards: [],
      canReturnToProfileList: true,
    };
  },

  createProfileCard(profile, latestRecordResult) {
    const failed = latestRecordResult && latestRecordResult.failed;
    const latestRecord = latestRecordResult && latestRecordResult.record;
    const failedMessage = latestRecordResult && latestRecordResult.failedMessage;

    return {
      profile,
      relationText: profile.relation || '关系未填写',
      isLoading: latestRecordResult === undefined || latestRecordResult === null,
      latestRecord,
      hasLatestRecord: Boolean(latestRecord),
      latestRecordDisplay: latestRecord ? this.formatLatestRecord(latestRecord, profile) : null,
      latestRecordError: failed ? (failedMessage || '暂时无法加载') : '',
    };
  },

  getLatestRecordSignature(record) {
    if (!record) {
      return 'null';
    }

    const payload = record.payload || {};
    return [
      record._id,
      record.profileId,
      record.measuredAt && String(record.measuredAt),
      payload.systolic,
      payload.diastolic,
      payload.heartRate || '',
      record.updatedAt && String(record.updatedAt),
    ].join('|');
  },

  setLatestRecordState(record, profile) {
    const nextSignature = this.getLatestRecordSignature(record);
    if (this.latestRecordSignature === nextSignature) {
      this.setData({ isLoadingLatestRecord: false });
      return;
    }

    this.latestRecordSignature = nextSignature;
    this.setData({
      hasLatestRecord: Boolean(record),
      latestRecord: record || null,
      latestRecordDisplay: record ? this.formatLatestRecord(record, profile) : null,
      latestRecordError: '',
      isLoadingLatestRecord: false,
    });
  },

  formatLatestRecord(record, profile) {
    const payload = (record && record.payload) || {};
    const referenceLines = getReferenceLines(profile && profile.settings && profile.settings.bp && profile.settings.bp.referenceLines);
    const status = getBPStatusDisplay(payload.systolic, payload.diastolic, referenceLines);

    return {
      systolic: payload.systolic,
      diastolic: payload.diastolic,
      heartRate: payload.heartRate || null,
      measuredAtText: formatMeasuredAt(record.measuredAt),
      statusLabel: status.detail ? `${status.label}${status.detail}` : status.label,
      statusLevel: status.level,
      statusClassName: status.className,
    };
  },

  clearMedicationLoadingTimer() {
    if (this.medicationLoadingTimer) {
      clearTimeout(this.medicationLoadingTimer);
      this.medicationLoadingTimer = null;
    }
  },

  resetMedicationState() {
    this.clearMedicationLoadingTimer();
    this.medicationRequestId = (this.medicationRequestId || 0) + 1;
    this.setData({
      activeMedications: [],
      visibleActiveMedications: [],
      historicalMedications: [],
      hasAnyMedications: false,
      hasHistoricalMedications: false,
      showMedicationExpandButton: false,
      medicationExpandText: '',
      historicalMedicationCount: 0,
      medicationError: '',
      isLoadingMedications: false,
      isShowAllMedications: false,
      isShowHistoricalMedications: false,
    });
  },

  applyMedicationGroups(activeMedications, historicalMedications) {
    const active = Array.isArray(activeMedications) ? activeMedications : [];
    const historical = Array.isArray(historicalMedications) ? historicalMedications : [];
    const visibleActiveMedications = this.data.isShowAllMedications ? active : active.slice(0, 3);
    const hiddenActiveCount = Math.max(active.length - 3, 0);
    const showMedicationExpandButton = !this.data.isShowAllMedications && (hiddenActiveCount > 0 || historical.length > 0);
    let medicationExpandText = '';

    if (showMedicationExpandButton) {
      medicationExpandText = hiddenActiveCount > 0
        ? `查看全部（${active.length}）`
        : `查看历史用药（${historical.length}）`;
    }

    this.setData({
      activeMedications: active,
      visibleActiveMedications,
      historicalMedications: historical,
      hasAnyMedications: active.length > 0 || historical.length > 0,
      hasHistoricalMedications: historical.length > 0,
      showMedicationExpandButton,
      medicationExpandText,
      historicalMedicationCount: historical.length,
      medicationError: '',
      isLoadingMedications: false,
    });
  },

  async loadMedicationsForActiveProfile() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id || this.data.viewState !== 'single' || this.data.isLoginFailed) {
      this.resetMedicationState();
      return;
    }

    const profileId = profile._id;
    const requestId = (this.medicationRequestId || 0) + 1;
    const hasCache = store.hasCachedMedications(profileId);
    this.medicationRequestId = requestId;
    this.clearMedicationLoadingTimer();
    this.setData({
      medicationError: '',
      isShowAllMedications: false,
      isShowHistoricalMedications: false,
    });

    if (hasCache) {
      const cachedGroups = store.getCachedMedications(profileId);
      this.applyMedicationGroups(cachedGroups.active, cachedGroups.historical);
    } else {
      this.setData({
        activeMedications: [],
        visibleActiveMedications: [],
        historicalMedications: [],
        hasAnyMedications: false,
        hasHistoricalMedications: false,
        showMedicationExpandButton: false,
        medicationExpandText: '',
        historicalMedicationCount: 0,
        isLoadingMedications: false,
      });

      this.medicationLoadingTimer = setTimeout(() => {
        if (
          this.medicationRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId ||
          this.data.viewState !== 'single'
        ) {
          return;
        }

        this.setData({ isLoadingMedications: true });
      }, 300);
    }

    await medicationService.loadMedications(profileId, {
      onCacheHit: (groups) => {
        if (
          this.medicationRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId
        ) {
          return;
        }

        this.applyMedicationGroups(groups.active, groups.historical);
      },
      onFresh: (groups) => {
        if (
          this.medicationRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId
        ) {
          return;
        }

        this.clearMedicationLoadingTimer();
        this.applyMedicationGroups(groups.active, groups.historical);
      },
      onError: (error) => {
        if (
          this.medicationRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId
        ) {
          return;
        }

        this.clearMedicationLoadingTimer();
        if (!hasCache) {
          this.setData({
            medicationError: getErrorMessage(error),
            isLoadingMedications: false,
          });
        }
      },
    });
  },

  async loadLatestRecord() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id || this.data.isLoginFailed || this.data.viewState !== 'single') {
      this.latestRecordRequestId = (this.latestRecordRequestId || 0) + 1;
      this.latestRecordSignature = '';
      this.setData({
        hasLatestRecord: false,
        latestRecord: null,
        latestRecordDisplay: null,
        latestRecordError: '',
        isLoadingLatestRecord: false,
      });
      return;
    }

    const requestId = (this.latestRecordRequestId || 0) + 1;
    this.latestRecordRequestId = requestId;
    const profileId = profile._id;
    const hasCache = store.hasCachedLatestRecord(profileId);
    this.setData({
      isLoadingLatestRecord: !hasCache,
      latestRecordError: '',
    });

    await recordService.loadLatestRecord(profileId, {
      onCacheHit: (data) => {
        if (
          this.latestRecordRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId
        ) {
          return;
        }

        this.setLatestRecordState(data.record, profile);
      },
      onFresh: (data) => {
        if (
          this.latestRecordRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId
        ) {
          return;
        }

        this.setLatestRecordState(data.record, profile);
      },
      onError: (error) => {
        if (
          this.latestRecordRequestId !== requestId ||
          !this.data.activeProfile ||
          this.data.activeProfile._id !== profileId
        ) {
          return;
        }

        if (!hasCache) {
          this.setData({
            hasLatestRecord: false,
            latestRecord: null,
            latestRecordDisplay: null,
            latestRecordError: getErrorMessage(error),
            isLoadingLatestRecord: false,
          });
        }
      },
    });
  },

  updateProfileCard(profileId, latestRecordResult, requestId) {
    if (
      this.multiLatestRecordRequestId !== requestId ||
      this.data.viewState !== 'multi' ||
      !(this.data.profiles || []).some((profile) => profile && profile._id === profileId)
    ) {
      return;
    }

    this.setData({
      profileCards: (this.data.profileCards || []).map((card) => {
        if (!card.profile || card.profile._id !== profileId) {
          return card;
        }

        return this.createProfileCard(card.profile, latestRecordResult);
      }),
    });
  },

  async loadLatestRecordsForProfiles() {
    const profiles = this.data.profiles || [];

    if (this.data.viewState !== 'multi' || profiles.length < 2) {
      this.multiLatestRecordRequestId = (this.multiLatestRecordRequestId || 0) + 1;
      this.setData({
        isLoadingProfileCards: false,
      });
      return;
    }

    const requestId = (this.multiLatestRecordRequestId || 0) + 1;
    this.multiLatestRecordRequestId = requestId;
    const hasAnyCache = profiles.some((profile) => store.hasCachedLatestRecord(profile._id));
    this.setData({
      isLoadingProfileCards: !hasAnyCache,
      profileCards: profiles.map((profile) =>
        this.createProfileCard(
          profile,
          store.hasCachedLatestRecord(profile._id)
            ? { record: store.getCachedLatestRecord(profile._id) }
            : null,
        ),
      ),
    });

    profiles.forEach((profile) => {
      const profileId = profile._id;
      const hasCache = store.hasCachedLatestRecord(profileId);
      recordService.loadLatestRecord(profileId, {
        onCacheHit: (data) => {
          this.updateProfileCard(profileId, { record: data.record }, requestId);
        },
        onFresh: (data) => {
          this.updateProfileCard(profileId, { record: data.record }, requestId);
          this.setData({ isLoadingProfileCards: false });
        },
        onError: (error) => {
          if (!hasCache) {
            this.updateProfileCard(
              profileId,
              { failed: true, failedMessage: getErrorMessage(error), record: null },
              requestId,
            );
          }
          this.setData({ isLoadingProfileCards: false });
        },
      });
    });
  },

  loadDataForCurrentView() {
    if (this.data.viewState === 'multi') {
      this.loadLatestRecordsForProfiles();
      this.resetMedicationState();
      return;
    }

    if (this.data.viewState !== 'single') {
      this.loadLatestRecord();
      this.resetMedicationState();
      return;
    }

    this.loadLatestRecord();
    this.loadMedicationsForActiveProfile();
  },

  loadRecordsForCurrentView() {
    this.loadDataForCurrentView();
  },

  handleCreateProfile() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit?mode=create',
    });
  },

  handleAddRecord() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '请先创建档案',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canWriteCurrentProfile) {
      wx.showToast({
        title: '你没有权限录入血压',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/record/record?mode=create&profileId=${profile._id}`,
    });
  },

  handleAddMedication() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '请先创建档案',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canWriteCurrentProfile) {
      wx.showToast({
        title: '你没有权限管理用药',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/medication-edit/medication-edit?mode=create&profileId=${profile._id}`,
    });
  },

  handleCreateInvitation() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canInviteCurrentProfile) {
      wx.showToast({
        title: '你没有权限邀请家人',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/invite-create/invite-create?profileId=${profile._id}`,
    });
  },

  handleOpenThresholdEditor() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canManageCurrentProfile) {
      wx.showToast({
        title: '你没有权限调整阈值',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/profile-threshold-edit/profile-threshold-edit?profileId=${profile._id}`,
    });
  },

  handleCompleteProfile() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canEditCurrentProfile) {
      wx.showToast({
        title: '你没有权限编辑档案',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/profile-edit/profile-edit?mode=edit&profileId=${profile._id}`,
    });
  },

  handleEditProfile() {
    this.handleCompleteProfile();
  },

  handleDismissProfileCompletionPrompt() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      return;
    }

    store.dismissProfileCompletionHint(profile._id);
  },

  handleViewRecords() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '请先创建档案',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/records-list/records-list?profileId=${profile._id}`,
    });
  },

  handleOpenReport() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '请先创建档案',
        icon: 'none',
      });
      return;
    }

    if (!this.data.hasLatestRecord && !this.data.isLoadingLatestRecord && !this.data.latestRecordError) {
      wx.showToast({
        title: '暂无测量记录，无法生成报告',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/report/report?profileId=${profile._id}`,
    });
  },

  handleProfileCardTap(event) {
    const profileId = event.currentTarget.dataset.profileId;
    this.setData({
      isShowAllMedications: false,
      isShowHistoricalMedications: false,
      isDangerZoneExpanded: false,
      isDeleteConfirmVisible: false,
    });
    store.setCurrentProfileId(profileId);
    this.refreshProfilesOnShow();
  },

  handleReturnToProfileList() {
    this.setData({
      isShowAllMedications: false,
      isShowHistoricalMedications: false,
      isDangerZoneExpanded: false,
      isDeleteConfirmVisible: false,
    });
    store.setCurrentProfileId(null);
  },

  handleViewAllMedications() {
    this.setData({
      isShowAllMedications: true,
    });
    this.applyMedicationGroups(this.data.activeMedications, this.data.historicalMedications);
  },

  handleToggleHistoricalMedications() {
    this.setData({
      isShowHistoricalMedications: !this.data.isShowHistoricalMedications,
    });
  },

  handleMedicationTap(event) {
    const medication = event.detail && event.detail.medication;
    const profile = this.data.activeProfile;

    if (!medication || !medication._id || !profile || !profile._id) {
      wx.showToast({
        title: '用药不存在，请刷新',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canWriteCurrentProfile) {
      return;
    }

    wx.navigateTo({
      url: `/pages/medication-edit/medication-edit?mode=edit&profileId=${profile._id}&medicationId=${medication._id}`,
    });
  },

  handleOpenUserSettings() {
    wx.navigateTo({
      url: '/pages/user-settings/user-settings',
    });
  },

  async handleToggleDangerZone() {
    const nextExpanded = !this.data.isDangerZoneExpanded;
    this.setData({
      isDangerZoneExpanded: nextExpanded,
    });

    if (nextExpanded) {
      await this.ensureAdvancedSettingsReady();
    }
  },

  handleManageMembers() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/profile-members/profile-members?profileId=${profile._id}`,
    });
  },

  handleTransferOwnership() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/profile-members/profile-members?profileId=${profile._id}&mode=transfer`,
    });
  },

  async ensureAdvancedSettingsReady() {
    const profile = this.data.activeProfile;
    if (!profile || !profile._id || !this.data.canManageCurrentProfile) {
      return;
    }

    const profileId = profile._id;
    const hasMemberCount = Object.prototype.hasOwnProperty.call(this.profileMemberCounts || {}, profileId);
    const shouldRefresh = !hasMemberCount || store.isStale('members', profileId, STALE_THRESHOLD);

    if (!shouldRefresh) {
      return;
    }

    try {
      const result = await memberService.listProfileMembers(profileId);
      this.profileMemberCounts[profileId] = Array.isArray(result.members) ? result.members.length : 0;
      this.renderState();
    } catch (error) {
      this.profileMemberCountErrors[profileId] = true;
      delete this.profileMemberCounts[profileId];
      this.renderState();
    }
  },

  handleAdvancedSettingTap(event) {
    const type = event.currentTarget.dataset.type;

    switch (type) {
      case 'invite':
        this.handleCreateInvitation();
        break;
      case 'manageMembers':
        this.handleManageMembers();
        break;
      case 'transfer':
        this.handleTransferOwnership();
        break;
      case 'delete':
        this.handleDeleteProfile();
        break;
      case 'leave':
        this.handleExitProfile();
        break;
      default:
        break;
    }
  },

  async handleToggleOwnSubscribeAlerts(event) {
    const subscribeAlerts = !!event.detail.value;
    const relationshipId = this.data.activeRelationshipId;
    const previousValue = this.data.activeRelationshipSubscribeAlerts;

    if (!relationshipId || this.data.canManageCurrentProfile) {
      return;
    }

    this.setData({
      activeRelationshipSubscribeAlerts: subscribeAlerts,
      advancedSettingsItems: (this.data.advancedSettingsItems || []).map((item) =>
        item.type === 'notificationSetting'
          ? Object.assign({}, item, { checked: subscribeAlerts })
          : item
      ),
    });

    try {
      await memberService.updateRelationship(relationshipId, { subscribeAlerts });
    } catch (error) {
      this.setData({
        activeRelationshipSubscribeAlerts: previousValue,
        advancedSettingsItems: (this.data.advancedSettingsItems || []).map((item) =>
          item.type === 'notificationSetting'
            ? Object.assign({}, item, { checked: previousValue })
            : item
        ),
      });
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    }
  },

  async handleExitProfile() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id || !this.data.activeRelationshipId) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: `确定退出「${profile.name}」的档案？`,
        content: '退出后你将无法继续查看，可以请管理员重新邀请你',
        confirmText: '确定退出',
        confirmColor: '#b42318',
        success: resolve,
        fail() {
          resolve({ confirm: false, cancel: true });
        },
      });
    });

    if (!result || !result.confirm) {
      return;
    }

    try {
      await memberService.removeRelationship(this.data.activeRelationshipId, {
        relationship: {
          _id: this.data.activeRelationshipId,
          profileId: profile._id,
          userId: store.getState().user && store.getState().user._id,
        },
      });

      wx.showToast({
        title: '已退出此档案',
        icon: 'success',
        duration: 800,
      });

      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/home/home',
        });
      }, 800);
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    }
  },

  async getDeleteSummary(profileId) {
    let recordCount = null;
    let medicationCount = null;

    if (store.hasCachedRecords(profileId)) {
      const cachedRecords = store.getCachedRecords(profileId) || [];
      recordCount = cachedRecords.length;
    } else {
      try {
        const result = await recordService.fetchRecords(profileId, { limit: 200 });
        recordCount = result.hasMore ? `${result.records.length}+` : result.records.length;
      } catch (error) {
        recordCount = '所有';
      }
    }

    if (store.hasCachedMedications(profileId)) {
      const cachedMedications = store.getCachedMedications(profileId);
      medicationCount = (cachedMedications.active || []).length + (cachedMedications.historical || []).length;
    } else {
      try {
        const result = await medicationService.fetchMedications(profileId);
        medicationCount = (result.activeMedications || []).length + (result.historicalMedications || []).length;
      } catch (error) {
        medicationCount = '所有';
      }
    }

    return {
      recordCount: recordCount === null ? '所有' : recordCount,
      medicationCount: medicationCount === null ? '所有' : medicationCount,
    };
  },

  async handleDeleteProfile() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canManageCurrentProfile) {
      wx.showToast({
        title: '你没有权限删除档案',
        icon: 'none',
      });
      return;
    }

    const summary = await this.getDeleteSummary(profile._id);
    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: `确定删除「${profile.name}」的档案？`,
        content: `· 此档案的 ${summary.recordCount} 条血压记录将被删除\n· 此档案的 ${summary.medicationCount} 条用药记录将被删除\n· 删除后无法恢复`,
        confirmText: '继续删除',
        confirmColor: '#b42318',
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
      isDeleteConfirmVisible: true,
      deleteConfirmName: profile.name,
      deleteConfirmInput: '',
      deleteConfirmMessage: `请输入档案名“${profile.name}”以继续删除`,
      isDangerZoneExpanded: true,
      isDeleteConfirmReady: false,
    });
  },

  onDeleteConfirmInput(event) {
    const value = event.detail.value;
    this.setData({
      deleteConfirmInput: value,
      isDeleteConfirmReady: isDeleteNameMatched(this.data.deleteConfirmName, value),
    });
  },

  isDeleteConfirmReady() {
    return isDeleteNameMatched(this.data.deleteConfirmName, this.data.deleteConfirmInput);
  },

  handleCancelDeleteProfile() {
    this.setData({
      isDeleteConfirmVisible: false,
      deleteConfirmInput: '',
      deleteConfirmMessage: '',
      isDeleteConfirmReady: false,
    });
  },

  async handleConfirmDeleteProfile() {
    const profile = this.data.activeProfile;

    if (!profile || !profile._id) {
      wx.showToast({
        title: '档案不存在',
        icon: 'none',
      });
      return;
    }

    if (!this.isDeleteConfirmReady()) {
      return;
    }

    this.setData({ isDeletingProfile: true });

    try {
      await profileService.deleteProfile(profile._id);
      const state = store.getState();
      const nextProfiles = (state.profiles || []).filter((item) => item && item._id !== profile._id);
      const nextRelationships = (state.relationships || []).filter((item) => item && item.profileId !== profile._id);
      const nextCurrentProfileId = nextProfiles.length === 1 ? nextProfiles[0]._id : null;

      store.setState({
        profiles: nextProfiles,
        relationships: nextRelationships,
        currentProfileId: nextCurrentProfileId,
      });

      wx.showToast({
        title: `已删除「${profile.name}」`,
        icon: 'none',
        duration: 1200,
      });

      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/home/home',
        });
      }, 1200);
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    } finally {
      this.setData({
        isDeletingProfile: false,
        isDeleteConfirmVisible: false,
        deleteConfirmInput: '',
        deleteConfirmMessage: '',
        isDeleteConfirmReady: false,
      });
    }
  },

  async handleRetryLogin() {
    const app = getApp();

    if (!app || typeof app.login !== 'function') {
      wx.showToast({
        title: '请重新打开小程序',
        icon: 'none',
      });
      return;
    }

    this.setData({ isRetrying: true });

    try {
      await app.login();
      this.renderState();
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    } finally {
      this.setData({ isRetrying: false });
    }
  },
});
