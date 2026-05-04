const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { store } = require('../store/index');
const {
  getCurrentRelationship,
  isOwner,
  canWrite,
  canManage,
  canInvite,
} = require('../utils/permission-helpers');
const memberService = require('../services/member-service');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

async function main() {
  store.setState({
    user: { _id: 'user_owner' },
    profiles: [
      { _id: 'profile_a', name: '爸爸' },
      { _id: 'profile_b', name: '妈妈' },
    ],
    relationships: [
      {
        _id: 'rel_owner',
        profileId: 'profile_a',
        userId: 'user_owner',
        role: 'owner',
        permissions: {
          canView: true,
          canWrite: true,
          canEditProfile: true,
          canManage: true,
          canInvite: true,
        },
        subscribeAlerts: true,
      },
      {
        _id: 'rel_viewer',
        profileId: 'profile_b',
        userId: 'user_owner',
        role: 'viewer',
        permissions: {
          canView: true,
          canWrite: false,
          canEditProfile: false,
          canManage: false,
          canInvite: false,
        },
        subscribeAlerts: true,
      },
    ],
    currentProfileId: 'profile_a',
  });

  const state = store.getState();
  assert.strictEqual(getCurrentRelationship(state, 'profile_a').role, 'owner');
  assert.strictEqual(getCurrentRelationship(state, 'profile_b').role, 'viewer');
  assert.strictEqual(isOwner(state, 'profile_a'), true);
  assert.strictEqual(isOwner(state, 'profile_b'), false);
  assert.strictEqual(canWrite(state, 'profile_a'), true);
  assert.strictEqual(canWrite(state, 'profile_b'), false);
  assert.strictEqual(canManage(state, 'profile_a'), true);
  assert.strictEqual(canManage(state, 'profile_b'), false);
  assert.strictEqual(canInvite(state, 'profile_a'), true);
  assert.strictEqual(canInvite(state, 'profile_b'), false);

  assert.match(read('pages/home/home.wxml'), /管理成员/);
  assert.match(read('pages/home/home.wxml'), /退出此档案/);
  assert.match(read('pages/home/home.wxml'), /canWriteCurrentProfile/);
  assert.match(read('pages/home/home.wxml'), /canManageCurrentProfile/);
  assert.match(read('pages/records-list/records-list.wxml'), /查看者身份访问/);
  assert.match(read('pages/profile-members/profile-members.js'), /pageTitle: '档案成员'/);
  assert.match(read('pages/profile-members/profile-members.js'), /pageTitle: '选择新管理员'/);
  assert.match(read('pages/profile-members/profile-members.wxml'), /邀请新成员/);
  assert.match(read('pages/profile-members/profile-members.wxml'), /转让管理员/);
  assert.match(read('pages/profile-members/profile-members.wxml'), /异常时通知/);

  const updated = memberService.applyRelationshipUpdateToStore({
    _id: 'rel_viewer',
    profileId: 'profile_b',
    userId: 'user_owner',
    role: 'collaborator',
    permissions: {
      canView: true,
      canWrite: true,
      canEditProfile: false,
      canManage: false,
      canInvite: false,
    },
    subscribeAlerts: false,
  });
  assert.strictEqual(
    updated.relationships.find((relationship) => relationship._id === 'rel_viewer').role,
    'collaborator',
  );

  const transferred = memberService.applyTransferOwnershipToStore({
    profileId: 'profile_a',
    currentOwnerUserId: 'user_owner',
  });
  assert.strictEqual(
    transferred.relationships.find((relationship) => relationship._id === 'rel_owner').role,
    'collaborator',
  );

  const removed = memberService.applyRelationshipRemovalToStore({
    relationshipId: 'rel_viewer',
    profileId: 'profile_b',
    userId: 'user_owner',
  });
  assert.strictEqual(
    removed.relationships.some((relationship) => relationship._id === 'rel_viewer'),
    false,
  );
  assert.strictEqual(
    removed.profiles.some((profile) => profile._id === 'profile_b'),
    false,
  );

  console.log('[verify-t4.2b] pass');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
