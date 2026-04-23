Component({
  properties: {
    systolic: {
      type: Number,
      optionalTypes: [String],
      value: null,
    },
    diastolic: {
      type: Number,
      optionalTypes: [String],
      value: null,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    focusedField: '',
  },

  methods: {
    parseValue(value) {
      if (value === '') {
        return null;
      }

      const nextValue = Number(value);
      return Number.isFinite(nextValue) ? nextValue : value;
    },

    emitChange(nextValues) {
      this.triggerEvent('change', {
        systolic: Object.prototype.hasOwnProperty.call(nextValues, 'systolic')
          ? nextValues.systolic
          : this.data.systolic,
        diastolic: Object.prototype.hasOwnProperty.call(nextValues, 'diastolic')
          ? nextValues.diastolic
          : this.data.diastolic,
      });
    },

    onSystolicInput(event) {
      this.emitChange({
        systolic: this.parseValue(event.detail.value),
      });
    },

    onDiastolicInput(event) {
      this.emitChange({
        diastolic: this.parseValue(event.detail.value),
      });
    },

    onFocus(event) {
      this.setData({
        focusedField: event.currentTarget.dataset.field || '',
      });
    },

    onBlur() {
      this.setData({
        focusedField: '',
      });
    },
  },
});
