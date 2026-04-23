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

  methods: {
    onButtonTap() {
      this.triggerEvent('buttontap');
    },
  },
});
