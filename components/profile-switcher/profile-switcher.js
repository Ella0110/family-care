const { store } = require('../../store/index');
const { syncFontData } = require('../../utils/font-scale');

function buildDisplayProfiles(profiles) {
  const relationships = store.getState().relationships || [];
  const roleByProfileId = new Map(
    relationships
      .filter((item) => item && item.profileId)
      .map((item) => [item.profileId, item.role || '']),
  );

  return (Array.isArray(profiles) ? profiles : []).map((item) => {
    const relation = item && typeof item.relation === 'string' ? item.relation : '';
    const role = roleByProfileId.get(item && item._id) || '';

    return Object.assign({}, item, {
      displayRelation: role === 'owner' ? relation : '共同关注',
    });
  });
}

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    profiles: {
      type: Array,
      value: [],
    },
    currentProfileId: {
      type: String,
      value: '',
    },
    returnTab: {
      type: String,
      value: '/pages/data/data',
    },
  },

  data: {
    fs: {},
    displayProfiles: [],
  },

  observers: {
    show(visible) {
      if (visible) {
        syncFontData.call(this);
        this.syncDisplayProfiles();
      }

      this.triggerEvent('visibilitychange', {
        visible: visible === true,
      });
    },

    profiles() {
      this.syncDisplayProfiles();
    },
  },

  lifetimes: {
    attached() {
      syncFontData.call(this);
      this.syncDisplayProfiles();
    },
  },

  pageLifetimes: {
    show() {
      syncFontData.call(this);
      this.syncDisplayProfiles();
    },
  },

  methods: {
    syncDisplayProfiles() {
      this.setData({
        displayProfiles: buildDisplayProfiles(this.data.profiles),
      });
    },

    handleMaskTap() {
      this.triggerEvent('close');
    },

    handleSelectProfile(event) {
      const profileId = event.currentTarget.dataset.profileId;
      if (!profileId) {
        return;
      }

      this.triggerEvent('select', { profileId });
      this.triggerEvent('close');
    },

    handleCreateProfile() {
      const returnTab = encodeURIComponent(this.data.returnTab || '/pages/data/data');
      wx.navigateTo({
        url: `/pages/profile-edit/profile-edit?mode=create&returnTab=${returnTab}`,
      });
      this.triggerEvent('close');
    },

    handleOpenProfileSelector() {
      this.triggerEvent('openfullprofilelist');
    },

    noop() {},
  },
});
