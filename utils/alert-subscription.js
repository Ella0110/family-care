const SUBSCRIBE_ALERT_TEMPLATE_ID = 'EntTrzNRVv1RDKy5AvLgxsUrGJzislhyAPovjgrXJ4U';

function resolveSubscribeAlertStatus(response, tmplId = SUBSCRIBE_ALERT_TEMPLATE_ID) {
  const status = response && response[tmplId];
  if (status === 'accept' || status === 'reject' || status === 'ban') {
    return status;
  }

  return '';
}

function showSubscribeBanModal() {
  wx.showModal({
    title: '通知已被关闭',
    content: '如需重新接收提醒：\n1. 回到本页面\n2. 关闭通知开关\n3. 重新打开通知开关',
    showCancel: false,
    confirmText: '我知道了',
  });
}

function requestAlertSubscription(handlers = {}) {
  const nextHandlers = typeof handlers === 'function'
    ? { onAccept: handlers }
    : (handlers || {});
  const rejectHandler = typeof nextHandlers.onReject === 'function'
    ? nextHandlers.onReject
    : nextHandlers.onDecline;

  if (typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(
      typeof rejectHandler === 'function'
        ? rejectHandler({
          status: 'reject',
          response: null,
          tmplId: SUBSCRIBE_ALERT_TEMPLATE_ID,
        })
        : null,
    );
  }

  const tmplIds = [SUBSCRIBE_ALERT_TEMPLATE_ID];
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, detail = null) => {
      if (settled) {
        return;
      }

      settled = true;
      Promise.resolve()
        .then(() => {
          if (typeof handler === 'function') {
            return handler(detail);
          }

          if (detail && detail.error) {
            throw detail.error;
          }

          return null;
        })
        .then(resolve)
        .catch(reject);
    };

    wx.requestSubscribeMessage({
      tmplIds,
      success: (response) => {
        const status = resolveSubscribeAlertStatus(response);
        const detail = {
          status,
          response,
          tmplId: SUBSCRIBE_ALERT_TEMPLATE_ID,
        };

        if (status === 'accept') {
          finish(nextHandlers.onAccept, detail);
          return;
        }

        if (status === 'ban') {
          finish(nextHandlers.onBan, detail);
          return;
        }

        if (status === 'reject') {
          finish(rejectHandler, detail);
          return;
        }

        const error = new Error('订阅消息返回了未知状态');
        error.code = 'UNKNOWN_SUBSCRIBE_STATUS';
        finish(nextHandlers.onFail, Object.assign({}, detail, { error }));
      },
      fail: (error) => {
        finish(nextHandlers.onFail, {
          error,
          tmplId: SUBSCRIBE_ALERT_TEMPLATE_ID,
        });
      },
      complete: () => {
        if (!settled) {
          resolve(null);
        }
      },
    });
  });
}

module.exports = {
  SUBSCRIBE_ALERT_TEMPLATE_ID,
  resolveSubscribeAlertStatus,
  showSubscribeBanModal,
  requestAlertSubscription,
};
