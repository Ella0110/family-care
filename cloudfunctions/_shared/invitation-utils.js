const {
  assertAllowedKeys,
  assertNonEmptyString,
  assertPlainObject,
  normalizeNullableString,
} = require('./validation');
const { invalidArgument } = require('./errors');

const INVITATION_STATUSES = Object.freeze({
  ACTIVE: 'active',
  USED: 'used',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

const INVITATION_ERROR_CODES = Object.freeze({
  active: null,
  used: 'INVITATION_USED',
  expired: 'INVITATION_EXPIRED',
  revoked: 'INVITATION_REVOKED',
});

const INVITATION_ROLE_OPTIONS = Object.freeze(['viewer', 'collaborator']);
const MAX_INVITATION_PROFILES = 10;
const MAX_INVITATION_MESSAGE_LENGTH = 100;
const MAX_NICKNAME_LENGTH = 50;

function normalizeInvitationProfileIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidArgument('profileIds must be a non-empty string array');
  }

  const normalized = [];
  const seen = new Set();

  value.forEach((item, index) => {
    const profileId = assertNonEmptyString(item, `profileIds[${index}]`);
    if (seen.has(profileId)) {
      return;
    }

    normalized.push(profileId);
    seen.add(profileId);
  });

  if (normalized.length === 0) {
    throw invalidArgument('profileIds must contain at least one profileId');
  }

  if (normalized.length > MAX_INVITATION_PROFILES) {
    throw invalidArgument(`profileIds must contain at most ${MAX_INVITATION_PROFILES} items`);
  }

  return normalized;
}

function normalizeInvitationRole(value) {
  if (value === undefined || value === null || value === '') {
    return 'viewer';
  }

  const role = assertNonEmptyString(value, 'defaultRole');
  if (!INVITATION_ROLE_OPTIONS.includes(role)) {
    throw invalidArgument(
      `defaultRole must be one of: ${INVITATION_ROLE_OPTIONS.join(', ')}`,
    );
  }

  return role;
}

function normalizeInvitationMessage(value) {
  const message = normalizeNullableString(value, 'message');
  if (message && message.length > MAX_INVITATION_MESSAGE_LENGTH) {
    throw invalidArgument(`message must be at most ${MAX_INVITATION_MESSAGE_LENGTH} characters`);
  }

  return message;
}

function normalizeInviterProfile(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const profile = assertPlainObject(value, 'inviterProfile');
  assertAllowedKeys(profile, ['nickname', 'avatarUrl'], 'inviterProfile');

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(profile, 'nickname')) {
    const nickname = assertNonEmptyString(profile.nickname, 'inviterProfile.nickname');
    if (nickname.length > MAX_NICKNAME_LENGTH) {
      throw invalidArgument(
        `inviterProfile.nickname must be at most ${MAX_NICKNAME_LENGTH} characters`,
      );
    }
    normalized.nickname = nickname;
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'avatarUrl')) {
    normalized.avatarUrl = normalizeNullableString(profile.avatarUrl, 'inviterProfile.avatarUrl');
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function getEffectiveInvitationStatus(invitation, currentTime = new Date()) {
  if (!invitation) {
    return null;
  }

  if (invitation.status === INVITATION_STATUSES.USED) {
    return INVITATION_STATUSES.USED;
  }

  if (invitation.status === INVITATION_STATUSES.REVOKED) {
    return INVITATION_STATUSES.REVOKED;
  }

  if (invitation.status === INVITATION_STATUSES.EXPIRED) {
    return INVITATION_STATUSES.EXPIRED;
  }

  if (invitation.expiresAt instanceof Date && invitation.expiresAt.getTime() < currentTime.getTime()) {
    return INVITATION_STATUSES.EXPIRED;
  }

  return INVITATION_STATUSES.ACTIVE;
}

function getInvitationErrorCodeByStatus(status) {
  return INVITATION_ERROR_CODES[status] || null;
}

/**
 * @param {{ collection: (name: string) => { where: (query: Object) => { limit: (count: number) => { get: () => Promise<{ data?: Object[] }> } } } }} database
 * @param {string} collectionName
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
async function findInvitationByToken(database, collectionName, token) {
  const result = await database.collection(collectionName).where({ token }).limit(1).get();
  return result && Array.isArray(result.data) && result.data[0] ? result.data[0] : null;
}

module.exports = {
  INVITATION_STATUSES,
  INVITATION_ROLE_OPTIONS,
  normalizeInvitationProfileIds,
  normalizeInvitationRole,
  normalizeInvitationMessage,
  normalizeInviterProfile,
  getEffectiveInvitationStatus,
  getInvitationErrorCodeByStatus,
  findInvitationByToken,
};
