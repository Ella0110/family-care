const { store } = require('../../store/index');
const recordService = require('../../services/record-service');
const { getBPStatusDisplay, getReferenceLines } = require('../../utils/bp-status');
const { buildInvitationNicknameInitial } = require('../../utils/invitation');

const AVATAR_COLORS = ['#DBEAFE', '#E0E7FF', '#DCFCE7', '#FCE7F3', '#FEF3C7', '#E0F2FE'];
const PROFILE_SELECTOR_PADDING_TOP_FALLBACK = 20;

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    if (value.$date) {
      return new Date(value.$date);
    }
    if (value._date) {
      return new Date(value._date);
    }
  }

  return new Date(value);
}

function toTimestamp(value) {
  const date = toDate(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function buildAvatarColorSeed(value) {
  return String(value || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getProfileAvatarColor(profile) {
  const seed = buildAvatarColorSeed((profile && profile._id) || (profile && profile.name) || '');
  return AVATAR_COLORS[seed % AVATAR_COLORS.length];
}

function formatMeasuredAt(value) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeStatusDisplay(profile, latestRecord) {
  const payload = latestRecord && latestRecord.payload ? latestRecord.payload : null;
  if (!payload) {
    return null;
  }

  const systolic = Number(payload.systolic);
  const diastolic = Number(payload.diastolic);
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return null;
  }

  const status = getBPStatusDisplay(
    systolic,
    diastolic,
    getReferenceLines(
      profile
      && profile.settings
      && profile.settings.bp
      && profile.settings.bp.referenceLines,
    ),
  );

  return {
    text: status.tagText,
    className: status.selectorClassName,
  };
}

function getDisplayRelation(profile, relationships) {
  const relationship = (Array.isArray(relationships) ? relationships : []).find(
    (item) => item && item.profileId === (profile && profile._id),
  );
  const role = relationship && relationship.role ? relationship.role : 'owner';

  if (role === 'owner') {
    return profile && typeof profile.relation === 'string' ? profile.relation : '';
  }

  return '共同关注';
}

function buildCard(profile, latestRecord, lastSelectedProfileId, relationships) {
  const payload = latestRecord && latestRecord.payload ? latestRecord.payload : null;
  const systolic = payload ? Number(payload.systolic) : NaN;
  const diastolic = payload ? Number(payload.diastolic) : NaN;
  const hasRecord = Number.isFinite(systolic) && Number.isFinite(diastolic);
  const status = hasRecord ? normalizeStatusDisplay(profile, latestRecord) : null;

  return {
    _id: profile && profile._id ? profile._id : '',
    avatarText: buildInvitationNicknameInitial(profile && profile.name, '档'),
    avatarColor: getProfileAvatarColor(profile),
    nameText: (profile && profile.name) || '未命名档案',
    relationText: (profile && profile.relation) || '关系未填写',
    displayRelation: getDisplayRelation(profile, relationships),
    latestMeasuredAtText: hasRecord ? formatMeasuredAt(latestRecord.measuredAt) : '',
    latestValueText: hasRecord ? `${systolic}/${diastolic}` : '暂无记录',
    statusText: status ? status.text : '',
    statusClassName: status ? status.className : '',
    isCurrent: Boolean(lastSelectedProfileId && profile && profile._id === lastSelectedProfileId),
  };
}

Page({
  data: {
    statusBarInsetTop: PROFILE_SELECTOR_PADDING_TOP_FALLBACK,
    cards: [],
    isLoading: true,
    showCurrentBadge: false,
  },

  onLoad() {
    this.requestId = 0;
    this.initStatusBarInsetTop();
    this.loadProfiles();
  },

  onShow() {
    this.loadProfiles();
  },

  initStatusBarInsetTop() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      const statusBarHeight = Number(systemInfo.statusBarHeight) || 0;
      this.setData({
        statusBarInsetTop: statusBarHeight + PROFILE_SELECTOR_PADDING_TOP_FALLBACK,
      });
    } catch (error) {
      this.setData({
        statusBarInsetTop: PROFILE_SELECTOR_PADDING_TOP_FALLBACK,
      });
    }
  },

  async loadProfiles() {
    const state = store.getState();
    const profiles = state.profiles || [];
    const relationships = state.relationships || [];
    if (profiles.length <= 1) {
      wx.switchTab({
        url: '/pages/data/data',
      });
      return;
    }

    const app = getApp();
    const lastSelectedProfileId = app && typeof app.readLastSelectedProfileId === 'function'
      ? app.readLastSelectedProfileId()
      : wx.getStorageSync('lastSelectedProfileId');

    const requestId = ++this.requestId;
    this.setData({
      isLoading: true,
      showCurrentBadge: Boolean(lastSelectedProfileId),
      cards: profiles.map((profile) => buildCard(
        profile,
        store.getCachedLatestRecord(profile && profile._id),
        lastSelectedProfileId,
        relationships,
      )),
    });

    const latestRecords = await Promise.all(
      profiles.map(async (profile) => {
        const profileId = profile && profile._id;
        if (!profileId) {
          return null;
        }

        const cachedRecord = store.getCachedLatestRecord(profileId);
        if (cachedRecord) {
          return cachedRecord;
        }

        try {
          const latestResult = await recordService.fetchLatestRecord(profileId);
          return latestResult && latestResult.record ? latestResult.record : null;
        } catch (error) {
          return null;
        }
      }),
    );

    if (requestId !== this.requestId) {
      return;
    }

    this.setData({
      isLoading: false,
      cards: profiles.map((profile, index) => buildCard(
        profile,
        latestRecords[index],
        lastSelectedProfileId,
        relationships,
      )),
    });
  },

  handleSelectProfile(event) {
    const profileId = event.currentTarget.dataset.profileId || '';
    if (!profileId) {
      return;
    }

    const app = getApp();
    store.setCurrentProfileId(profileId);
    if (app && typeof app.persistLastSelectedProfileId === 'function') {
      app.persistLastSelectedProfileId(profileId);
    } else {
      wx.setStorageSync('lastSelectedProfileId', profileId);
    }

    wx.switchTab({
      url: '/pages/data/data',
    });
  },
});
