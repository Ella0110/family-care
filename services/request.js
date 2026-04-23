const { getErrorMessage } = require('../utils/error-messages');

/**
 * @typedef {Object} CallOptions
 * @property {boolean} [silent=false] Whether to suppress loading and toast feedback.
 * @property {string} [loadingText='加载中'] Loading copy shown while the cloud function is running.
 */

const REQUEST_WINDOW_MS = 10 * 1000;
const REQUEST_WARNING_THRESHOLD = 5;
const requestHistory = Object.create(null);

function isDevelopEnv() {
  try {
    return (
      typeof __wxConfig !== 'undefined' &&
      __wxConfig &&
      __wxConfig.accountInfo &&
      __wxConfig.accountInfo.envVersion === 'develop'
    );
  } catch (error) {
    return false;
  }
}

function trackRequestFrequency(name) {
  if (!isDevelopEnv()) {
    return;
  }

  const now = Date.now();
  const recentCalls = (requestHistory[name] || []).filter((timestamp) => now - timestamp <= REQUEST_WINDOW_MS);
  recentCalls.push(now);
  requestHistory[name] = recentCalls;

  if (recentCalls.length > REQUEST_WARNING_THRESHOLD) {
    console.warn(
      `[REQUEST STORM WARNING] Function ${name} called ${recentCalls.length} times in 10 seconds. Check for subscription loops or duplicate requests.`,
    );
  }
}

/**
 * Normalizes unknown thrown values into a standard Error instance.
 *
 * @param {unknown} error
 * @returns {Error}
 */
function toError(error) {
  if (error instanceof Error) {
    if (!error.code) {
      error.code = inferErrorCode(error.message);
    }
    return error;
  }

  if (error && typeof error === 'object' && typeof error.message === 'string') {
    const nextError = new Error(error.message);
    nextError.code = typeof error.code === 'string' ? error.code : inferErrorCode(error.message);
    return nextError;
  }

  const networkError = new Error('网络异常');
  networkError.code = 'NETWORK';
  return networkError;
}

/**
 * @param {string} [message='']
 * @returns {string}
 */
function inferErrorCode(message = '') {
  if (/network|timeout|fail|interrupted|断网|网络/i.test(message)) {
    return 'NETWORK';
  }

  return 'INTERNAL_ERROR';
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
    trackRequestFrequency(name);
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
        title: getErrorMessage(normalizedError),
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
