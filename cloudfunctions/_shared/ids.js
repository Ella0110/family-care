const crypto = require('crypto');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const INVITATION_TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const SEGMENT_LENGTH = 10;
const INVITATION_TOKEN_LENGTH = 8;

let createNanoId = null;
let createInvitationTokenId = null;

try {
  const { customAlphabet } = require('nanoid');
  createNanoId = customAlphabet(ALPHABET, SEGMENT_LENGTH);
  createInvitationTokenId = customAlphabet(
    INVITATION_TOKEN_ALPHABET,
    INVITATION_TOKEN_LENGTH,
  );
} catch (error) {
  createNanoId = null;
  createInvitationTokenId = null;
}

/**
 * Generates a short id segment with `nanoid` when available, or falls back to `crypto.randomBytes`.
 *
 * @returns {string}
 */
function generateSegment() {
  if (typeof createNanoId === 'function') {
    return createNanoId();
  }

  const bytes = crypto.randomBytes(SEGMENT_LENGTH);
  let result = '';

  for (let index = 0; index < SEGMENT_LENGTH; index += 1) {
    result += ALPHABET[bytes[index] % ALPHABET.length];
  }

  return result;
}

/**
 * @param {string} prefix
 * @returns {string}
 */
function generatePrefixedId(prefix) {
  return `${prefix}${generateSegment()}`;
}

/**
 * @returns {string}
 */
function generateProfileId() {
  return generatePrefixedId('p_');
}

/**
 * @returns {string}
 */
function generateRelationshipId() {
  return generatePrefixedId('rel_');
}

/**
 * @returns {string}
 */
function generateInvitationId() {
  return generatePrefixedId('inv_');
}

/**
 * @returns {string}
 */
function generateMedicationId() {
  return generatePrefixedId('m_');
}

function generateInvitationToken() {
  if (typeof createInvitationTokenId === 'function') {
    return createInvitationTokenId();
  }

  const bytes = crypto.randomBytes(INVITATION_TOKEN_LENGTH);
  let result = '';

  for (let index = 0; index < INVITATION_TOKEN_LENGTH; index += 1) {
    result += INVITATION_TOKEN_ALPHABET[
      bytes[index] % INVITATION_TOKEN_ALPHABET.length
    ];
  }

  return result;
}

module.exports = {
  generateProfileId,
  generateRelationshipId,
  generateInvitationId,
  generateMedicationId,
  generateInvitationToken,
};
