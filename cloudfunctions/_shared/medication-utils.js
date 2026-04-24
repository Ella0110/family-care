const { invalidArgument } = require('./errors');
const {
  assertAllowedKeys,
  assertNonEmptyString,
  assertPlainObject,
} = require('./validation');

const CREATE_ALLOWED_KEYS = ['drug', 'dose', 'frequency', 'timing', 'startDate', 'endDate', 'note'];
const UPDATE_ALLOWED_KEYS = ['drug', 'dose', 'frequency', 'timing', 'startDate', 'endDate', 'note'];
const PROTECTED_PATCH_KEYS = ['_id', 'profileId', 'addedBy', 'createdAt', 'deletedAt'];

function normalizeTextField(value, fieldName, options = {}) {
  const {
    required = false,
    maxLength = Number.POSITIVE_INFINITY,
    allowEmptyToNull = false,
  } = options;

  if (value === undefined) {
    if (required) {
      throw invalidArgument(`${fieldName} is required`);
    }
    return null;
  }

  if (value === null || value === '') {
    if (required) {
      throw invalidArgument(`${fieldName} is required`);
    }
    return allowEmptyToNull ? null : null;
  }

  const nextValue = assertNonEmptyString(value, fieldName);
  if (nextValue.length > maxLength) {
    throw invalidArgument(`${fieldName} must be at most ${maxLength} characters`);
  }

  return nextValue;
}

function normalizeDateString(value, fieldName) {
  if (value === undefined) {
    return null;
  }

  if (value === null || value === '') {
    return null;
  }

  const nextValue = assertNonEmptyString(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextValue)) {
    throw invalidArgument(`${fieldName} must be in YYYY-MM-DD format`);
  }

  const [yearText, monthText, dayText] = nextValue.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw invalidArgument(`${fieldName} must be a valid date`);
  }

  return nextValue;
}

function validateMedicationDateRange(startDate, endDate) {
  if (startDate && endDate && endDate <= startDate) {
    throw invalidArgument('endDate must be later than startDate');
  }
}

function normalizeCreateMedicationData(value) {
  const data = assertPlainObject(value, 'data');
  assertAllowedKeys(data, CREATE_ALLOWED_KEYS, 'data');

  const normalized = {
    drug: normalizeTextField(data.drug, 'drug', { required: true, maxLength: 50 }),
    dose: normalizeTextField(data.dose, 'dose', { required: true, maxLength: 20 }),
    frequency: normalizeTextField(data.frequency, 'frequency', { required: true, maxLength: 30 }),
    timing: normalizeTextField(data.timing, 'timing', { maxLength: 30, allowEmptyToNull: true }),
    startDate: normalizeDateString(data.startDate, 'startDate'),
    endDate: normalizeDateString(data.endDate, 'endDate'),
    note: normalizeTextField(data.note, 'note', { maxLength: 200, allowEmptyToNull: true }),
  };

  validateMedicationDateRange(normalized.startDate, normalized.endDate);

  return normalized;
}

function normalizeMedicationPatch(value) {
  const patch = assertPlainObject(value, 'patch');
  const keys = Object.keys(patch);

  PROTECTED_PATCH_KEYS.forEach((key) => {
    if (keys.includes(key)) {
      throw invalidArgument(`patch cannot modify ${key}`);
    }
  });

  assertAllowedKeys(patch, UPDATE_ALLOWED_KEYS, 'patch');

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(patch, 'drug')) {
    normalized.drug = normalizeTextField(patch.drug, 'drug', { required: true, maxLength: 50 });
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'dose')) {
    normalized.dose = normalizeTextField(patch.dose, 'dose', { required: true, maxLength: 20 });
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'frequency')) {
    normalized.frequency = normalizeTextField(patch.frequency, 'frequency', { required: true, maxLength: 30 });
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'timing')) {
    normalized.timing = normalizeTextField(patch.timing, 'timing', {
      maxLength: 30,
      allowEmptyToNull: true,
    });
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'startDate')) {
    normalized.startDate = normalizeDateString(patch.startDate, 'startDate');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'endDate')) {
    normalized.endDate = normalizeDateString(patch.endDate, 'endDate');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
    normalized.note = normalizeTextField(patch.note, 'note', {
      maxLength: 200,
      allowEmptyToNull: true,
    });
  }

  if (Object.keys(normalized).length === 0) {
    throw invalidArgument('patch must contain at least one supported field');
  }

  return normalized;
}

module.exports = {
  normalizeDateString,
  validateMedicationDateRange,
  normalizeCreateMedicationData,
  normalizeMedicationPatch,
};
