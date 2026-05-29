const { getBPStatusDisplay } = require('../../utils/bp-status');
const { syncFontData } = require('../../utils/font-scale');

Component({
  properties: {
    systolic: {
      type: Number,
      value: 0,
    },
    diastolic: {
      type: Number,
      value: 0,
    },
    referenceLines: {
      type: Object,
      value: null,
    },
  },

  data: {
    fs: {},
    status: getBPStatusDisplay(0, 0),
  },

  observers: {
    'systolic, diastolic, referenceLines': function updateStatus(systolic, diastolic, referenceLines) {
      this.setData({
        status: getBPStatusDisplay(systolic, diastolic, referenceLines),
      });
    },
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
});
