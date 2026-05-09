function getAppLoginStatus() {
  const app = getApp();
  const globalData = (app && app.globalData) || {};

  return {
    isLoginReady: globalData.loginReady === true,
    isLoginFailed: Boolean(globalData.loginError),
    loginError: globalData.loginError || null,
  };
}

module.exports = {
  getAppLoginStatus,
};
