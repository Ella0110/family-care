const { syncFontData } = require('../../utils/font-scale');

Component({
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
    handleCreate() {
      this.triggerEvent('create');
    },
  },
});
