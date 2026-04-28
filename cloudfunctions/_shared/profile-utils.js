const {
  assertAllowedKeys,
  assertNonEmptyString,
  assertPlainObject,
  deepMerge,
  normalizeBirthDate,
  normalizeNullableEnum,
  normalizeNullableString,
  clonePlainData,
} = require('./validation');
const { createError, invalidArgument } = require('./errors');

const PROFILE_EDITABLE_FIELDS = ['name', 'relation', 'gender', 'birthDate', 'note', 'emergencyContact', 'longTermMedication'];
const SUPPORTED_GENDERS = ['male', 'female'];
const CHINA_PHONE_PATTERN = /^1\d{10}$/;

function normalizeProfileName(value, fieldName) {
  const nextValue = assertNonEmptyString(value, fieldName);

  if (nextValue.length > 20) {
    throw invalidArgument(`${fieldName} must be at most 20 characters`);
  }

  return nextValue;
}

function normalizeOptionalBoolean(value, fieldName) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw invalidArgument(`${fieldName} must be a boolean`);
  }

  return value;
}

function normalizeEmergencyContactField(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return assertNonEmptyString(value, fieldName);
}

/**
 * @param {unknown} value
 * @returns {{ name: string|null, phone: string|null }|null}
 */
function normalizeEmergencyContact(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  const nextValue = assertPlainObject(value, 'emergencyContact');
  assertAllowedKeys(nextValue, ['name', 'phone'], 'emergencyContact');

  if (Object.keys(nextValue).length === 0) {
    return null;
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(nextValue, 'name')) {
    normalized.name = normalizeEmergencyContactField(nextValue.name, 'emergencyContact.name');
  }

  if (Object.prototype.hasOwnProperty.call(nextValue, 'phone')) {
    normalized.phone = normalizeEmergencyContactField(nextValue.phone, 'emergencyContact.phone');

    if (normalized.phone && !CHINA_PHONE_PATTERN.test(normalized.phone)) {
      throw createError('INVALID_PHONE', 'emergencyContact.phone must be a valid China mobile number');
    }
  }

  if (
    Object.keys(normalized).length === 0 ||
    Object.keys(normalized).every((key) => !normalized[key])
  ) {
    return null;
  }

  return normalized;
}

/**
 * @param {Object} event
 * @returns {{ name: string, relation: string|null, gender: string|null, birthDate: string|null, note: string|null, emergencyContact: { name: string|null, phone: string|null }|null, longTermMedication: boolean|null }}
 */
function normalizeCreateProfileInput(event) {
  return {
    name: normalizeProfileName(event.name, 'name'),
    relation: normalizeNullableString(event.relation, 'relation'),
    gender: normalizeNullableEnum(event.gender, SUPPORTED_GENDERS, 'gender'),
    birthDate: normalizeBirthDate(event.birthDate, 'birthDate'),
    note: normalizeNullableString(event.note, 'note'),
    emergencyContact: normalizeEmergencyContact(event.emergencyContact),
    longTermMedication: normalizeOptionalBoolean(event.longTermMedication, 'longTermMedication'),
  };
}

/**
 * @param {unknown} patch
 * @returns {Object}
 */
function normalizeProfilePatch(patch) {
  const nextPatch = assertPlainObject(patch, 'patch');
  assertAllowedKeys(nextPatch, PROFILE_EDITABLE_FIELDS, 'patch');

  if (Object.keys(nextPatch).length === 0) {
    throw invalidArgument('patch must contain at least one editable field');
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(nextPatch, 'name')) {
    normalized.name = normalizeProfileName(nextPatch.name, 'patch.name');
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'relation')) {
    normalized.relation = normalizeNullableString(nextPatch.relation, 'patch.relation');
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'gender')) {
    normalized.gender = normalizeNullableEnum(nextPatch.gender, SUPPORTED_GENDERS, 'patch.gender');
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'birthDate')) {
    normalized.birthDate = normalizeBirthDate(nextPatch.birthDate, 'patch.birthDate');
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'note')) {
    normalized.note = normalizeNullableString(nextPatch.note, 'patch.note');
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'emergencyContact')) {
    normalized.emergencyContact = normalizeEmergencyContact(nextPatch.emergencyContact);
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'longTermMedication')) {
    normalized.longTermMedication = normalizeOptionalBoolean(nextPatch.longTermMedication, 'patch.longTermMedication');
  }

  return normalized;
}

/**
 * @param {unknown} patch
 * @returns {Object}
 */
function normalizeProfileSettingsPatch(patch) {
  const nextPatch = assertPlainObject(patch, 'patch');

  if (Object.keys(nextPatch).length === 0) {
    throw invalidArgument('patch must contain at least one settings field');
  }

  return clonePlainData(nextPatch);
}

/**
 * @param {Object} currentSettings
 * @param {Object} patch
 * @returns {Object}
 */
function mergeProfileSettings(currentSettings, patch) {
  return deepMerge(currentSettings || {}, patch);
}

module.exports = {
  PROFILE_EDITABLE_FIELDS,
  normalizeProfileName,
  normalizeOptionalBoolean,
  normalizeEmergencyContact,
  normalizeCreateProfileInput,
  normalizeProfilePatch,
  normalizeProfileSettingsPatch,
  mergeProfileSettings,
};
