require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { getRoleDefaults } = require('../cloudfunctions/_shared/defaults');
const { COLLECTIONS } = require('../cloudfunctions/_shared/db');
const { createFakeRuntime } = require('./_helpers/fake-cloud');

const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createCreateProfileHandler } = require('../cloudfunctions/createProfile/handler');
const { createSaveRecordHandler } = require('../cloudfunctions/saveRecord/handler');
const { createDeleteRecordHandler } = require('../cloudfunctions/deleteRecord/handler');
const { createSaveMedicationHandler } = require('../cloudfunctions/saveMedication/handler');
const { createUpdateProfileHandler } = require('../cloudfunctions/updateProfile/handler');
const { createUpdateProfileSettingsHandler } = require('../cloudfunctions/updateProfileSettings/handler');
const { createDeleteProfileHandler } = require('../cloudfunctions/deleteProfile/handler');
const { createGetRecordsHandler } = require('../cloudfunctions/getRecords/handler');

const { createCreateInvitationHandler } = require('../cloudfunctions/createInvitation/handler');
const { createGetInvitationInfoHandler } = require('../cloudfunctions/getInvitationInfo/handler');
const { createAcceptInvitationHandler } = require('../cloudfunctions/acceptInvitation/handler');
const { createUpdateRelationshipHandler } = require('../cloudfunctions/updateRelationship/handler');
const { createRemoveRelationshipHandler } = require('../cloudfunctions/removeRelationship/handler');
const { createTransferOwnershipHandler } = require('../cloudfunctions/transferOwnership/handler');
const { createListProfileMembersHandler } = require('../cloudfunctions/listProfileMembers/handler');

function buildFunction(factory, runtime, extra = {}) {
  const auth = createAuthService({ db: runtime.db, cloud: runtime.cloud });
  return createCloudFunction(
    factory(
      Object.assign(
        {
          db: runtime.db,
          cloud: runtime.cloud,
          command: runtime.command,
          auth,
          now: runtime.now,
        },
        extra,
      ),
    ),
  );
}

async function ensureUser(runtime, login, openId, profile = {}) {
  runtime.setOpenId(openId);
  await login({}, {});
  await runtime.db.collection(COLLECTIONS.USERS).doc(openId).update({
    data: Object.assign({}, profile, { updatedAt: runtime.now() }),
  });
}

async function main() {
  let tick = 0;
  const runtime = createFakeRuntime({
    openId: 'owner_user',
    now: () => new Date(Date.UTC(2026, 4, 1, 1, 0, tick++)),
  });

  const login = buildFunction(createLoginHandler, runtime);
  const createProfile = buildFunction(createCreateProfileHandler, runtime);
  const saveRecord = buildFunction(createSaveRecordHandler, runtime);
  const deleteRecord = buildFunction(createDeleteRecordHandler, runtime);
  const saveMedication = buildFunction(createSaveMedicationHandler, runtime);
  const updateProfile = buildFunction(createUpdateProfileHandler, runtime);
  const updateProfileSettings = buildFunction(createUpdateProfileSettingsHandler, runtime);
  const deleteProfile = buildFunction(createDeleteProfileHandler, runtime);
  const getRecords = buildFunction(createGetRecordsHandler, runtime);

  const createInvitation = buildFunction(createCreateInvitationHandler, runtime);
  const getInvitationInfo = buildFunction(createGetInvitationInfoHandler, runtime);
  const acceptInvitation = buildFunction(createAcceptInvitationHandler, runtime);
  const updateRelationship = buildFunction(createUpdateRelationshipHandler, runtime);
  const removeRelationship = buildFunction(createRemoveRelationshipHandler, runtime);
  const transferOwnership = buildFunction(createTransferOwnershipHandler, runtime);
  const listProfileMembers = buildFunction(createListProfileMembersHandler, runtime);

  await ensureUser(runtime, login, 'owner_user');
  await ensureUser(runtime, login, 'viewer_user');
  await ensureUser(runtime, login, 'collaborator_user');
  await ensureUser(runtime, login, 'viewer_two_user');

  runtime.setOpenId('owner_user');
  const profileA = (await createProfile({ name: '爸爸' }, {})).profile;
  const profileB = (await createProfile({ name: '妈妈' }, {})).profile;
  const profileC = (await createProfile({ name: '外婆' }, {})).profile;

  await saveRecord({
    profileId: profileA._id,
    measuredAt: '2026-05-01T00:15:00.000Z',
    payload: { systolic: 138, diastolic: 86 },
  }, {});

  const requiresNickname = await createInvitation({
    profileIds: [profileA._id, profileB._id],
  }, {});
  assert.strictEqual(requiresNickname.success, false);
  assert.strictEqual(requiresNickname.code, 'NICKNAME_REQUIRED');

  runtime.db.store.users.owner_user.nickname = '微信用户';
  const placeholderNicknameRejected = await createInvitation({
    profileIds: [profileA._id],
  }, {});
  assert.strictEqual(placeholderNicknameRejected.success, false);
  assert.strictEqual(placeholderNicknameRejected.code, 'NICKNAME_REQUIRED');
  runtime.db.store.users.owner_user.nickname = null;

  const invitationCreated = await createInvitation({
    profileIds: [profileA._id, profileB._id],
    defaultRole: 'viewer',
    message: '请一起照看爸妈',
    inviterProfile: {
      nickname: '新一',
      avatarUrl: 'https://example.com/avatar.png',
    },
  }, {});
  assert.strictEqual(invitationCreated.success, true);
  assert.ok(invitationCreated.invitation.token);
  assert.strictEqual(invitationCreated.invitation.profileIds.length, 2);
  assert.strictEqual(invitationCreated.invitation.inviterNickname, '新一');

  const invitationToken = invitationCreated.invitation.token;

  const invitationInfo = await getInvitationInfo({ token: invitationToken }, {});
  assert.strictEqual(invitationInfo.success, true);
  assert.strictEqual(invitationInfo.invitation.status, 'active');
  assert.strictEqual(invitationInfo.invitation.profiles.length, 2);
  assert.strictEqual(
    invitationInfo.invitation.profiles.find((item) => item._id === profileA._id).latestBp.systolic,
    138,
  );

  const selfAccept = await acceptInvitation({ token: invitationToken }, {});
  assert.strictEqual(selfAccept.success, false);
  assert.strictEqual(selfAccept.code, 'CANNOT_INVITE_SELF');

  runtime.setOpenId('viewer_user');
  const accepted = await acceptInvitation({ token: invitationToken }, {});
  assert.strictEqual(accepted.success, true);
  assert.strictEqual(accepted.relationships.length, 2);
  assert.ok(accepted.relationships.every((item) => item.role === 'viewer'));
  assert.ok(accepted.relationships.every((item) => item.subscribeAlerts === true));

  const viewerSaveRecord = await saveRecord({
    profileId: profileA._id,
    measuredAt: '2026-05-01T00:18:00.000Z',
    payload: { systolic: 130, diastolic: 80 },
  }, {});
  assert.strictEqual(viewerSaveRecord.success, false);
  assert.strictEqual(viewerSaveRecord.code, 'PERMISSION_DENIED');

  const ownerRecordId = Object.values(runtime.db.store.records).find(
    (item) => item.profileId === profileA._id && item.recordedBy === 'owner_user',
  )._id;
  const viewerDeleteRecord = await deleteRecord({ recordId: ownerRecordId }, {});
  assert.strictEqual(viewerDeleteRecord.success, false);
  assert.strictEqual(viewerDeleteRecord.code, 'PERMISSION_DENIED');

  const viewerUpdateProfile = await updateProfile({
    profileId: profileA._id,
    patch: { note: 'viewer 无权更新档案' },
  }, {});
  assert.strictEqual(viewerUpdateProfile.success, false);
  assert.strictEqual(viewerUpdateProfile.code, 'PERMISSION_DENIED');

  const invitationDoc = runtime.db.store.invitations[Object.keys(runtime.db.store.invitations)[0]];
  assert.strictEqual(invitationDoc.status, 'used');
  assert.strictEqual(invitationDoc.inviteeUserId, 'viewer_user');
  assert.ok(invitationDoc.acceptedAt instanceof Date);

  const usedInfo = await getInvitationInfo({ token: invitationToken }, {});
  assert.strictEqual(usedInfo.success, false);
  assert.strictEqual(usedInfo.code, 'INVITATION_USED');
  assert.strictEqual(usedInfo.invitation.status, 'used');

  runtime.setOpenId('owner_user');
  const alreadyMemberInvite = await createInvitation({
    profileIds: [profileA._id],
    inviterProfile: { nickname: '新一', avatarUrl: 'https://example.com/avatar.png' },
  }, {});
  runtime.setOpenId('viewer_user');
  const alreadyMember = await acceptInvitation({ token: alreadyMemberInvite.invitation.token }, {});
  assert.strictEqual(alreadyMember.success, false);
  assert.strictEqual(alreadyMember.code, 'ALREADY_MEMBER');

  runtime.setOpenId('owner_user');
  const expiredInvite = await createInvitation({
    profileIds: [profileA._id],
    inviterProfile: { nickname: '新一' },
  }, {});
  const expiredDocId = Object.keys(runtime.db.store.invitations).find(
    (id) => runtime.db.store.invitations[id].token === expiredInvite.invitation.token,
  );
  runtime.db.store.invitations[expiredDocId].expiresAt = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));

  runtime.setOpenId('collaborator_user');
  const expiredInfo = await getInvitationInfo({ token: expiredInvite.invitation.token }, {});
  assert.strictEqual(expiredInfo.success, false);
  assert.strictEqual(expiredInfo.code, 'INVITATION_EXPIRED');
  assert.strictEqual(expiredInfo.invitation.inviterNickname, '新一');

  runtime.setOpenId('owner_user');
  const revokedInvite = await createInvitation({
    profileIds: [profileA._id],
    inviterProfile: { nickname: '新一' },
  }, {});
  const revokedDocId = Object.keys(runtime.db.store.invitations).find(
    (id) => runtime.db.store.invitations[id].token === revokedInvite.invitation.token,
  );
  runtime.db.store.invitations[revokedDocId].status = 'revoked';
  runtime.db.store.invitations[revokedDocId].revokedAt = runtime.now();

  runtime.setOpenId('collaborator_user');
  const revokedInfo = await getInvitationInfo({ token: revokedInvite.invitation.token }, {});
  assert.strictEqual(revokedInfo.success, false);
  assert.strictEqual(revokedInfo.code, 'INVITATION_REVOKED');

  runtime.setOpenId('owner_user');
  const membersBeforeUpdate = await listProfileMembers({ profileId: profileA._id }, {});
  assert.strictEqual(membersBeforeUpdate.success, true);
  assert.deepStrictEqual(
    membersBeforeUpdate.members.map((item) => item.relationship.role),
    ['owner', 'viewer'],
  );

  const viewerRelationship = membersBeforeUpdate.members.find((item) => item.user._id === 'viewer_user');
  const promoted = await updateRelationship({
    relationshipId: viewerRelationship.relationship._id,
    patch: {
      role: 'collaborator',
      subscribeAlerts: false,
    },
  }, {});
  assert.strictEqual(promoted.success, true);
  assert.strictEqual(promoted.relationship.role, 'collaborator');
  assert.strictEqual(promoted.relationship.permissions.canWrite, true);
  assert.strictEqual(promoted.relationship.subscribeAlerts, false);

  runtime.setOpenId('viewer_user');
  const collaboratorSave = await saveRecord({
    profileId: profileA._id,
    measuredAt: '2026-05-01T00:20:00.000Z',
    payload: { systolic: 132, diastolic: 82 },
  }, {});
  assert.strictEqual(collaboratorSave.success, true);

  const collaboratorEditProfile = await updateProfile({
    profileId: profileA._id,
    patch: { note: '无权编辑档案信息' },
  }, {});
  assert.strictEqual(collaboratorEditProfile.success, false);
  assert.strictEqual(collaboratorEditProfile.code, 'PERMISSION_DENIED');

  const collaboratorSettings = await updateProfileSettings({
    profileId: profileA._id,
    patch: { bp: { threshold: { systolic: 145, diastolic: 95 } } },
  }, {});
  assert.strictEqual(collaboratorSettings.success, false);
  assert.strictEqual(collaboratorSettings.code, 'PERMISSION_DENIED');

  runtime.setOpenId('owner_user');
  const removed = await removeRelationship({ relationshipId: viewerRelationship.relationship._id }, {});
  assert.strictEqual(removed.success, true);

  runtime.setOpenId('viewer_user');
  const readAfterRemoval = await getRecords({ profileId: profileA._id }, {});
  assert.strictEqual(readAfterRemoval.success, false);
  assert.strictEqual(readAfterRemoval.code, 'RELATIONSHIP_NOT_FOUND');

  runtime.setOpenId('owner_user');
  const lastOwnerCannotLeave = await removeRelationship({
    relationshipId: Object.values(runtime.db.store.relationships).find(
      (item) => item.profileId === profileB._id && item.userId === 'owner_user',
    )._id,
  }, {});
  assert.strictEqual(lastOwnerCannotLeave.success, false);
  assert.strictEqual(lastOwnerCannotLeave.code, 'LAST_OWNER_CANNOT_LEAVE');

  const collaboratorInvite = await createInvitation({
    profileIds: [profileC._id],
    defaultRole: 'collaborator',
    inviterProfile: { nickname: '新一' },
  }, {});
  runtime.setOpenId('collaborator_user');
  const collaboratorAccepted = await acceptInvitation({ token: collaboratorInvite.invitation.token }, {});
  assert.strictEqual(collaboratorAccepted.success, true);

  runtime.setOpenId('owner_user');
  const viewerTwoInvite = await createInvitation({
    profileIds: [profileC._id],
    defaultRole: 'viewer',
    inviterProfile: { nickname: '新一' },
  }, {});
  runtime.setOpenId('viewer_two_user');
  const viewerTwoAccepted = await acceptInvitation({ token: viewerTwoInvite.invitation.token }, {});
  assert.strictEqual(viewerTwoAccepted.success, true);

  const viewerTwoRelationshipId = viewerTwoAccepted.relationships[0]._id;
  const viewerMedicationCreate = await saveMedication({
    profileId: profileC._id,
    data: {
      drug: '阿司匹林',
      dose: '100mg',
      frequency: '每日一次',
    },
  }, {});
  assert.strictEqual(viewerMedicationCreate.success, false);
  assert.strictEqual(viewerMedicationCreate.code, 'PERMISSION_DENIED');

  const viewerSelfRoleUpdate = await updateRelationship({
    relationshipId: viewerTwoRelationshipId,
    patch: { role: 'collaborator' },
  }, {});
  assert.strictEqual(viewerSelfRoleUpdate.success, false);
  assert.strictEqual(viewerSelfRoleUpdate.code, 'PERMISSION_DENIED');

  const viewerSelfAlerts = await updateRelationship({
    relationshipId: viewerTwoRelationshipId,
    patch: { subscribeAlerts: false },
  }, {});
  assert.strictEqual(viewerSelfAlerts.success, true);
  assert.strictEqual(viewerSelfAlerts.relationship.subscribeAlerts, false);

  runtime.setOpenId('owner_user');
  const membersBeforeTransfer = await listProfileMembers({ profileId: profileC._id }, {});
  assert.strictEqual(membersBeforeTransfer.success, true);
  assert.deepStrictEqual(
    membersBeforeTransfer.members.map((item) => item.relationship.role),
    ['owner', 'collaborator', 'viewer'],
  );

  const transfer = await transferOwnership({
    profileId: profileC._id,
    newOwnerUserId: 'collaborator_user',
  }, {});
  assert.strictEqual(transfer.success, true);

  const relationshipsForProfileC = Object.values(runtime.db.store.relationships).filter(
    (item) => item.profileId === profileC._id,
  );
  assert.strictEqual(
    relationshipsForProfileC.find((item) => item.userId === 'owner_user').role,
    'collaborator',
  );
  assert.strictEqual(
    relationshipsForProfileC.find((item) => item.userId === 'collaborator_user').role,
    'owner',
  );

  const oldOwnerDelete = await deleteProfile({ profileId: profileC._id }, {});
  assert.strictEqual(oldOwnerDelete.success, false);
  assert.strictEqual(oldOwnerDelete.code, 'PERMISSION_DENIED');

  runtime.setOpenId('collaborator_user');
  const newOwnerDelete = await deleteProfile({ profileId: profileC._id }, {});
  assert.strictEqual(newOwnerDelete.success, true);

  runtime.setOpenId('viewer_two_user');
  console.log('[verify-t4.1-collaboration] pass');
  console.log(JSON.stringify({
    invitationToken,
    acceptedRelationshipCount: accepted.relationships.length,
    profileCMemberRoles: relationshipsForProfileC.map((item) => item.role),
  }, null, 2));
}

main().catch((error) => {
  console.error('[verify-t4.1-collaboration] fail');
  console.error(error);
  process.exitCode = 1;
});
