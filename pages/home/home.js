const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');

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

Page({
  data: {
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
    isLoginReady: false,
    isLoginFailed: false,
    loginErrorText: '',
    isRetrying: false,
  },

  onLoad() {
    this.isPageVisible = false;
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
    this.lastHomeStateKey = this.getHomeStateKey(store.getState());
    this.renderState();
    this.loadRecordsForCurrentView();
  },

  onHide() {
    this.isPageVisible = false;
  },

  onUnload() {
    this.isPageVisible = false;
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  },

  getHomeStateKey(state) {
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const loginStatus = getLoginStatus();

    return [
      loginStatus.isLoginReady ? 'ready' : 'pending',
      loginStatus.isLoginFailed ? 'failed' : 'ok',
      state.currentProfileId || 'none',
      profiles
        .map((profile) => [profile && profile._id, profile && profile.name, profile && profile.relation].join(':'))
        .join('|'),
    ].join('||');
  },

  renderState(nextState) {
    const state = nextState || store.getState();
    const view = this.resolveHomeView(state);
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const loginStatus = getLoginStatus();

    this.setData({
      profiles,
      activeProfile: view.activeProfile,
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
    });
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

  loadRecordsForCurrentView() {
    if (this.data.viewState === 'multi') {
      this.loadLatestRecordsForProfiles();
      return;
    }

    this.loadLatestRecord();
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

    wx.navigateTo({
      url: `/pages/record/record?mode=create&profileId=${profile._id}`,
    });
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

  handleProfileCardTap(event) {
    const profileId = event.currentTarget.dataset.profileId;
    store.setCurrentProfileId(profileId);
  },

  handleReturnToProfileList() {
    store.setCurrentProfileId(null);
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
