const SUBSCRIBE_ALERT_TEMPLATE_ID = 'EntTrzNRVv1RDKy5AvLgxsUrGJzislhyAPovjgrXJ4U';

function requestAlertSubscription(onComplete) {
  if (typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(typeof onComplete === 'function' ? onComplete() : null);
  }

  const tmplIds = [SUBSCRIBE_ALERT_TEMPLATE_ID];
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      complete: () => {
        Promise.resolve(typeof onComplete === 'function' ? onComplete() : null).finally(resolve);
      },
    });
  });
}

module.exports = {
  SUBSCRIBE_ALERT_TEMPLATE_ID,
  requestAlertSubscription,
};
