const { invalidArgument } = require('./errors');

const MIN_CLIENT_TIMESTAMP = 946684800000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Accepts either a millisecond timestamp or an ISO string and normalizes it to Date.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {Date}
 */
function parseClientDateInput(value, fieldName) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidArgument(`${fieldName} must be a valid timestamp`);
    }

    const maxAllowed = Date.now() + MAX_FUTURE_SKEW_MS;
    if (value < MIN_CLIENT_TIMESTAMP || value > maxAllowed) {
      throw invalidArgument(
        `${fieldName} timestamp must be between ${MIN_CLIENT_TIMESTAMP} and ${maxAllowed}`,
      );
    }

    return new Date(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw invalidArgument(`${fieldName} must be a valid ISO date string`);
    }

    if (date.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      throw invalidArgument(`${fieldName} cannot be more than 5 minutes in the future`);
    }

    return date;
  }

  throw invalidArgument(`${fieldName} must be a millisecond timestamp or ISO date string`);
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {Date|null}
 */
function parseOptionalClientDateInput(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseClientDateInput(value, fieldName);
}

module.exports = {
  MIN_CLIENT_TIMESTAMP,
  MAX_FUTURE_SKEW_MS,
  parseClientDateInput,
  parseOptionalClientDateInput,
};
