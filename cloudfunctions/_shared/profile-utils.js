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
const { invalidArgument } = require('./errors');

const PROFILE_EDITABLE_FIELDS = ['name', 'relation', 'gender', 'birthDate', 'note', 'emergencyContact'];
const SUPPORTED_GENDERS = ['male', 'female'];

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

  return {
    name: normalizeNullableString(nextValue.name, 'emergencyContact.name'),
    phone: normalizeNullableString(nextValue.phone, 'emergencyContact.phone'),
  };
}

/**
 * @param {Object} event
 * @returns {{ name: string, relation: string|null, gender: string|null, birthDate: string|null, note: string|null }}
 */
function normalizeCreateProfileInput(event) {
  return {
    name: assertNonEmptyString(event.name, 'name'),
    relation: normalizeNullableString(event.relation, 'relation'),
    gender: normalizeNullableEnum(event.gender, SUPPORTED_GENDERS, 'gender'),
    birthDate: normalizeBirthDate(event.birthDate, 'birthDate'),
    note: normalizeNullableString(event.note, 'note'),
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
    normalized.name = assertNonEmptyString(nextPatch.name, 'patch.name');
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
  normalizeEmergencyContact,
  normalizeCreateProfileInput,
  normalizeProfilePatch,
  normalizeProfileSettingsPatch,
  mergeProfileSettings,
};
