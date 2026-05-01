const { invalidArgument, createError } = require('./errors');
const { assertAllowedKeys, assertPlainObject } = require('./validation');
const { getDefaultUserSettings } = require('./defaults');

const ALLOWED_FONT_SCALES = Object.freeze([1.0, 1.15, 1.3]);
const ALLOWED_PATCH_KEYS = Object.freeze(['fontScale', 'theme']);
const FORBIDDEN_PATCH_KEYS = Object.freeze(['_id', 'openid', 'createdAt', 'updatedAt', 'settings']);

function isValidFontScale(value) {
  return ALLOWED_FONT_SCALES.includes(Number(value));
}

function normalizeUserSettingsPatch(value) {
  const patch = assertPlainObject(value, 'patch');
  const keys = Object.keys(patch);

  if (keys.length === 0) {
    throw invalidArgument('patch must contain at least one field');
  }

  const forbiddenKeys = keys.filter((key) => FORBIDDEN_PATCH_KEYS.includes(key));
  if (forbiddenKeys.length > 0) {
    throw invalidArgument(`patch must not contain protected fields: ${forbiddenKeys.join(', ')}`);
  }

  assertAllowedKeys(patch, ALLOWED_PATCH_KEYS, 'patch');

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(patch, 'fontScale')) {
    if (!isValidFontScale(patch.fontScale)) {
      throw invalidArgument('fontScale must be one of: 1, 1.15, 1.3');
    }
    normalized.fontScale = Number(patch.fontScale);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
    if (patch.theme !== null && typeof patch.theme !== 'string') {
      throw invalidArgument('theme must be a string');
    }
    normalized.theme = patch.theme === null ? null : patch.theme;
  }

  if (Object.keys(normalized).length === 0) {
    throw invalidArgument('patch must contain at least one supported field');
  }

  return normalized;
}

function mergeUserSettings(currentSettings, patch) {
  const nextSettings = Object.assign({}, getDefaultUserSettings(), currentSettings || {});
  Object.keys(patch || {}).forEach((key) => {
    nextSettings[key] = patch[key];
  });
  return nextSettings;
}

function requireUserRecord(user) {
  if (!user || !user._id) {
    throw createError('USER_NOT_FOUND', 'Current user record does not exist');
  }
  return user;
}

module.exports = {
  ALLOWED_FONT_SCALES,
  isValidFontScale,
  normalizeUserSettingsPatch,
  mergeUserSettings,
  requireUserRecord,
};
