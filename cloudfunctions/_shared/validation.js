const { invalidArgument } = require('./errors');

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {Object}
 */
function assertPlainObject(value, fieldName) {
  if (!isPlainObject(value)) {
    throw invalidArgument(`${fieldName} must be an object`);
  }

  return value;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidArgument(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string|null}
 */
function normalizeNullableString(value, fieldName) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  return assertNonEmptyString(value, fieldName);
}

/**
 * @param {unknown} value
 * @param {string[]} allowedValues
 * @param {string} fieldName
 * @returns {string|null}
 */
function normalizeNullableEnum(value, allowedValues, fieldName) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  const nextValue = assertNonEmptyString(value, fieldName);

  if (!allowedValues.includes(nextValue)) {
    throw invalidArgument(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }

  return nextValue;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string|null}
 */
function normalizeBirthDate(value, fieldName) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  const nextValue = assertNonEmptyString(value, fieldName);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextValue)) {
    throw invalidArgument(`${fieldName} must be in YYYY-MM-DD format`);
  }

  const date = new Date(`${nextValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw invalidArgument(`${fieldName} must be a valid date`);
  }

  return nextValue;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {number}
 */
function toFiniteNumber(value, fieldName) {
  const nextValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(nextValue)) {
    throw invalidArgument(`${fieldName} must be a valid number`);
  }

  return nextValue;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {{ min?: number, max?: number, integer?: boolean }} [options={}]
 * @returns {number}
 */
function normalizeNumberInRange(value, fieldName, options = {}) {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = options;
  const nextValue = toFiniteNumber(value, fieldName);

  if (integer && !Number.isInteger(nextValue)) {
    throw invalidArgument(`${fieldName} must be an integer`);
  }

  if (nextValue < min || nextValue > max) {
    throw invalidArgument(`${fieldName} must be between ${min} and ${max}`);
  }

  return nextValue;
}

/**
 * @param {Object} source
 * @param {string[]} allowedKeys
 * @param {string} fieldName
 * @returns {void}
 */
function assertAllowedKeys(source, allowedKeys, fieldName) {
  const invalidKeys = Object.keys(source).filter((key) => !allowedKeys.includes(key));

  if (invalidKeys.length > 0) {
    throw invalidArgument(`${fieldName} contains unsupported keys: ${invalidKeys.join(', ')}`);
  }
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function clonePlainData(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clonePlainData(item));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).reduce((accumulator, key) => {
      accumulator[key] = clonePlainData(value[key]);
      return accumulator;
    }, {});
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  throw invalidArgument('patch contains unsupported value types');
}

/**
 * @param {Object} target
 * @param {Object} patch
 * @returns {Object}
 */
function deepMerge(target, patch) {
  const nextTarget = clonePlainData(target);

  Object.keys(patch).forEach((key) => {
    const patchValue = patch[key];
    if (isPlainObject(nextTarget[key]) && isPlainObject(patchValue)) {
      nextTarget[key] = deepMerge(nextTarget[key], patchValue);
      return;
    }

    nextTarget[key] = clonePlainData(patchValue);
  });

  return nextTarget;
}

module.exports = {
  isPlainObject,
  assertPlainObject,
  assertNonEmptyString,
  normalizeNullableString,
  normalizeNullableEnum,
  normalizeBirthDate,
  toFiniteNumber,
  normalizeNumberInRange,
  assertAllowedKeys,
  clonePlainData,
  deepMerge,
};
