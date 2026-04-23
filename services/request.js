/**
 * @typedef {Object} CallOptions
 * @property {boolean} [silent=false] Whether to suppress loading and toast feedback.
 * @property {string} [loadingText='加载中'] Loading copy shown while the cloud function is running.
 */

/**
 * Normalizes unknown thrown values into a standard Error instance.
 *
 * @param {unknown} error
 * @returns {Error}
 */
function toError(error) {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === 'object' && typeof error.message === 'string') {
    const nextError = new Error(error.message);
    if (typeof error.code === 'string') {
      nextError.code = error.code;
    }
    return nextError;
  }

  return new Error('网络异常');
}

/**
 * Calls a cloud function through the unified request layer.
 *
 * @param {string} name Cloud function name.
 * @param {Object} [data={}] Cloud function payload.
 * @param {CallOptions} [options={}] UI feedback options.
 * @returns {Promise<Object>} Cloud function result payload.
 * @throws {Error} When the request fails or `res.result.success` is not `true`.
 */
async function call(name, data = {}, options = {}) {
  const { silent = false, loadingText = '加载中' } = options;

  if (!silent) {
    wx.showLoading({
      title: loadingText,
      mask: true,
    });
  }

  try {
    const res = await wx.cloud.callFunction({ name, data });
    const result = res && res.result;

    if (!result || result.success !== true) {
      const error = new Error((result && result.message) || '服务异常');
      if (result && typeof result.code === 'string') {
        error.code = result.code;
      }
      error.result = result;
      throw error;
    }

    return result;
  } catch (error) {
    const normalizedError = toError(error);

    if (!silent) {
      wx.showToast({
        title: normalizedError.message || '网络异常',
        icon: 'none',
      });
    }

    throw normalizedError;
  } finally {
    if (!silent) {
      wx.hideLoading();
    }
  }
}

/**
 * Calls a cloud function without loading and toast feedback.
 *
 * @param {string} name Cloud function name.
 * @param {Object} [data={}] Cloud function payload.
 * @returns {Promise<Object>} Cloud function result payload.
 */
async function callSilent(name, data = {}) {
  return call(name, data, { silent: true });
}

module.exports = {
  call,
  callSilent,
};
