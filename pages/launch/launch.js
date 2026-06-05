Page({
  onLoad() {},

  onShow() {
    const app = getApp();
    if (app && typeof app.resumeLaunchRouting === 'function') {
      app.resumeLaunchRouting();
    }
  },
});
