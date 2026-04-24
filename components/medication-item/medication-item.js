const { getChinaDateString, isHistoricalMedication } = require('../../utils/medication');

Component({
  properties: {
    medication: {
      type: Object,
      value: null,
    },
    clickable: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    isHistorical: false,
    subtitle: '',
  },

  observers: {
    medication: function updateMedicationView(medication) {
      const frequency = medication && medication.frequency ? medication.frequency : '';
      const timing = medication && medication.timing ? medication.timing : '';
      const subtitle = [frequency, timing].filter(Boolean).join(' · ');

      this.setData({
        isHistorical: isHistoricalMedication(medication, getChinaDateString()),
        subtitle,
      });
    },
  },

  methods: {
    onTap() {
      if (!this.data.clickable || !this.data.medication) {
        return;
      }

      this.triggerEvent('tapitem', {
        medication: this.data.medication,
      });
    },
  },
});
