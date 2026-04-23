const { getBPStatusDisplay } = require('../../utils/bp-status');

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
    status: getBPStatusDisplay(0, 0),
  },

  observers: {
    'systolic, diastolic, referenceLines': function updateStatus(systolic, diastolic, referenceLines) {
      this.setData({
        status: getBPStatusDisplay(systolic, diastolic, referenceLines),
      });
    },
  },
});
