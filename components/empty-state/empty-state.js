const { syncFontData } = require('../../utils/font-scale');

Component({
  properties: {
    icon: {
      type: String,
      value: '💙',
    },
    title: {
      type: String,
      value: '',
    },
    subtitle: {
      type: String,
      value: '',
    },
    buttonText: {
      type: String,
      value: '',
    },
  },

  data: {
    fs: {},
  },

  lifetimes: {
    attached() {
      syncFontData.call(this);
    },
  },

  pageLifetimes: {
    show() {
      syncFontData.call(this);
    },
  },

  methods: {
    onButtonTap() {
      this.triggerEvent('buttontap');
    },
  },
});
