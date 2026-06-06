const SUBSCRIBE_ALERT_TEMPLATE_ID = 'EntTrzNRVv1RDKy5AvLgxsUrGJzislhyAPovjgrXJ4U';

function requestAlertSubscription(onComplete) {
  if (typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(typeof onComplete === 'function' ? onComplete() : null);
  }

  console.log('About to request subscribe');
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_ALERT_TEMPLATE_ID],
      success(res) {
        console.log('Subscribe result:', JSON.stringify(res));
      },
      fail(err) {
        console.warn('Subscribe request failed:', err);
      },
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
