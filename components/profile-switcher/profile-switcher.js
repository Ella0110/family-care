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

  observers: {
    show(visible) {
      this.triggerEvent('visibilitychange', {
        visible: visible === true,
      });
    },
  },

  methods: {
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

    noop() {},
  },
});
