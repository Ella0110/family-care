const { toErrorResult } = require('./errors');

/**
 * Wraps a cloud function handler in the common success/error contract.
 *
 * @param {(event: Object, context: Object) => Promise<Object>} handler
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createCloudFunction(handler) {
  return async function main(event = {}, context = {}) {
    try {
      const result = await handler(event || {}, context || {});
      return Object.assign({ success: true }, result || {});
    } catch (error) {
      return toErrorResult(error);
    }
  };
}

module.exports = {
  createCloudFunction,
};
