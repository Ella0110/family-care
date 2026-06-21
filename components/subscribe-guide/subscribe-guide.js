const {
  SUBSCRIBE_ALERT_TEMPLATE_ID,
  resolveSubscribeAlertStatus,
} = require('../../utils/alert-subscription');
const { DEFAULT_FONT_SCALE, syncFontData } = require('../../utils/font-scale');

Component({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
  },

  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    inviterName: {
      type: String,
      value: '',
    },
    profileName: {
      type: String,
      value: '',
    },
  },

  lifetimes: {
    attached() {
      this.syncFontScale();
    },
  },

  pageLifetimes: {
    show() {
      this.syncFontScale();
    },
  },

  observers: {
    show(value) {
      if (value) {
        this.syncFontScale();
      }
    },
  },

  methods: {
    syncFontScale() {
      syncFontData.call(this);
    },

    onSubscribe() {
      if (typeof wx.requestSubscribeMessage !== 'function') {
        wx.showToast({
          title: '暂时无法开启',
          icon: 'none',
        });
        return;
      }

      wx.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_ALERT_TEMPLATE_ID],
        success: (response) => {
          const status = resolveSubscribeAlertStatus(response);
          if (!status) {
            wx.showToast({
              title: '暂时无法开启',
              icon: 'none',
            });
            return;
          }

          this.triggerEvent('result', { status });
        },
        fail: () => {
          wx.showToast({
            title: '暂时无法开启',
            icon: 'none',
          });
        },
      });
    },

    onReject() {
      this.triggerEvent('reject');
    },
  },
});
