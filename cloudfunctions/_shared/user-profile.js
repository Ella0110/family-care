const { invalidArgument, createError } = require('./errors');
const { assertAllowedKeys, assertPlainObject } = require('./validation');
const { normalizeInvitationNicknameValue } = require('./invitation-utils');

const ALLOWED_PATCH_KEYS = Object.freeze(['nickname', 'avatarUrl']);
const FORBIDDEN_PATCH_KEYS = Object.freeze(['_id', 'openid', 'createdAt', 'updatedAt', 'settings']);
const MAX_NICKNAME_LENGTH = 20;

function normalizeAvatarUrl(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw invalidArgument('avatarUrl must be a string');
  }

  return value.trim();
}

function normalizeUserProfilePatch(value) {
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

  if (Object.prototype.hasOwnProperty.call(patch, 'nickname')) {
    if (typeof patch.nickname !== 'string' || !patch.nickname.trim()) {
      throw invalidArgument('nickname must be a non-empty string');
    }

    if (patch.nickname.trim().length > MAX_NICKNAME_LENGTH) {
      throw invalidArgument(`nickname must be at most ${MAX_NICKNAME_LENGTH} characters`);
    }

    const nickname = normalizeInvitationNicknameValue(patch.nickname);
    if (!nickname) {
      throw invalidArgument('nickname is invalid');
    }

    normalized.nickname = nickname;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'avatarUrl')) {
    normalized.avatarUrl = normalizeAvatarUrl(patch.avatarUrl);
  }

  if (Object.keys(normalized).length === 0) {
    throw invalidArgument('patch must contain at least one supported field');
  }

  return normalized;
}

function requireUserRecord(user) {
  if (!user || !user._id) {
    throw createError('USER_NOT_FOUND', 'Current user record does not exist');
  }

  return user;
}

module.exports = {
  normalizeUserProfilePatch,
  requireUserRecord,
};
