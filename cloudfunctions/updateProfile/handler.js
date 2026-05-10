const { db, COLLECTIONS } = require('./_shared/db');
const authModule = require('./_shared/auth');
const { assertNonEmptyString } = require('./_shared/validation');
const { normalizeProfilePatch } = require('./_shared/profile-utils');

function buildProfileDocumentData(profile) {
  return {
    name: profile.name,
    relation: profile.relation,
    gender: profile.gender,
    birthDate: profile.birthDate,
    note: profile.note,
    emergencyContact: profile.emergencyContact,
    longTermMedication: profile.longTermMedication,
    createdBy: profile.createdBy,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: profile.deletedAt,
    settings: profile.settings,
  };
}

function mergeEmergencyContact(currentEmergencyContact, patchEmergencyContact) {
  if (patchEmergencyContact === undefined) {
    return currentEmergencyContact === undefined ? null : currentEmergencyContact;
  }

  if (patchEmergencyContact === null) {
    return null;
  }

  const current = currentEmergencyContact && typeof currentEmergencyContact === 'object'
    ? currentEmergencyContact
    : {};

  const next = {
    name: Object.prototype.hasOwnProperty.call(patchEmergencyContact, 'name')
      ? patchEmergencyContact.name
      : (current.name || null),
    phone: Object.prototype.hasOwnProperty.call(patchEmergencyContact, 'phone')
      ? patchEmergencyContact.phone
      : (current.phone || null),
  };

  if (!next.name && !next.phone) {
    return null;
  }

  return next;
}

/**
 * @param {{ db?: any, auth?: any, now?: () => Date }} [deps]
 * @returns {(event: Object, context: Object) => Promise<Object>}
 */
function createUpdateProfileHandler(deps = {}) {
  const database = deps.db || db;
  const auth = deps.auth || authModule;
  const now = deps.now || (() => new Date());

  return async function updateProfileHandler(event, context) {
    const user = await auth.requireCurrentUser(event, context);
    const profileId = assertNonEmptyString(event.profileId, 'profileId');
    const patch = normalizeProfilePatch(event.patch);

    await auth.requireOwnerOrPermission(user._id, profileId, 'canEditProfile');
    const profile = await auth.getActiveProfile(profileId);

    const nextPatch = Object.assign({}, patch);

    if (Object.prototype.hasOwnProperty.call(nextPatch, 'emergencyContact')) {
      nextPatch.emergencyContact = mergeEmergencyContact(profile.emergencyContact, nextPatch.emergencyContact);
    }

    const nextProfile = Object.assign({}, profile, nextPatch, {
      emergencyContact: mergeEmergencyContact(profile.emergencyContact, nextPatch.emergencyContact),
      longTermMedication: Object.prototype.hasOwnProperty.call(nextPatch, 'longTermMedication')
        ? nextPatch.longTermMedication
        : (profile.longTermMedication === undefined ? null : profile.longTermMedication),
      updatedAt: now(),
    });

    await database.collection(COLLECTIONS.PROFILES).doc(profileId).set({
      data: buildProfileDocumentData(nextProfile),
    });

    return {
      profile: nextProfile,
    };
  };
}

module.exports = {
  createUpdateProfileHandler,
};
