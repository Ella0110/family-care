const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyProfileHomeInviteDialog() {
  const js = read('pages/profile-home/profile-home.js');
  const wxml = read('pages/profile-home/profile-home.wxml');
  const wxss = read('pages/profile-home/profile-home.wxss');

  assert.match(
    wxml,
    /wx:if="\{\{showInviteDialog\}\}" class="profile-home__invite-dialog"/,
    'profile-home should render an invite dialog overlay',
  );

  assert.match(
    wxml,
    /open-type="share"[\s\S]*bindtap="handleInviteShareTap"[\s\S]*data-share-type="invite"[\s\S]*>[\s\S]*分享给家人[\s\S]*<\/button>/,
    'profile-home invite dialog should use an open-type share button',
  );

  assert.match(
    wxml,
    /邀请家人关注「\{\{profileName\}\}」的健康/,
    'profile-home invite dialog should mention the current profile name',
  );

  assert.match(
    wxml,
    /wx:if="\{\{showNicknameInput\}\}"[\s\S]*请先设置你的昵称，让家人知道是谁邀请的/,
    'profile-home invite dialog should show the nickname setup state when nickname is missing',
  );

  assert.match(
    wxml,
    /type="nickname"[\s\S]*placeholder="你的昵称"/,
    'profile-home invite dialog should use a nickname input inside the dialog',
  );

  assert.match(
    wxml,
    /确认并分享/,
    'profile-home invite dialog should include the confirm-and-share CTA',
  );

  assert.match(
    wxml,
    /wx:else[\s\S]*分享给家人/,
    'profile-home invite dialog should show the ready-to-share state after nickname setup',
  );

  assert.doesNotMatch(
    wxml,
    /以 \{\{inviteNickname\}\} 的名义邀请/,
    'profile-home invite dialog should no longer show the old inviter-name helper copy',
  );

  assert.match(
    js,
    /await invitationService\.createInvitation\(\{[\s\S]*profileIds:\s*\[this\.data\.currentProfileId\][\s\S]*defaultRole:\s*["']viewer["']/,
    'profile-home should create a viewer invitation for the current profile',
  );

  assert.match(
    js,
    /if\s*\(!isValidInviteNickname\(inviteNickname\)\)\s*\{[\s\S]*showInviteDialog:\s*true[\s\S]*showNicknameInput:\s*true[\s\S]*pendingInvitationToken:\s*["']["']/,
    'profile-home should open the nickname gate UI directly instead of requesting an invite when nickname is missing',
  );

  assert.match(
    js,
    /showNicknameInput:\s*false[\s\S]*inviteNickname:\s*["'][^"']*["'][\s\S]*inviteNicknameDraft:\s*["'][^"']*["'][\s\S]*isSavingInviteNickname:\s*false/,
    'profile-home should track nickname gating state in dialog data',
  );

  assert.match(
    js,
    /function isValidInviteNickname\(/,
    'profile-home should share invite nickname validation with the dialog flow',
  );

  assert.match(
    js,
    /if\s*\(!isValidInviteNickname\(inviteNickname\)\)\s*\{[\s\S]*showInviteDialog:\s*true[\s\S]*showNicknameInput:\s*true[\s\S]*return;[\s\S]*await invitationService\.createInvitation/,
    'profile-home should gate nickname-less users into the dialog UI before creating an invitation',
  );

  assert.match(
    js,
    /await userService\.updateProfile\(\{[\s\S]*nickname:/,
    'profile-home should persist a newly entered invite nickname through updateUserProfile',
  );

  assert.match(
    js,
    /await invitationService\.createInvitation\(\{[\s\S]*profileIds:\s*\[this\.data\.currentProfileId\][\s\S]*defaultRole:\s*["']viewer["']/,
    'profile-home should prepare an invitation after nickname is available',
  );

  assert.match(
    js,
    /store\.setState\(\{[\s\S]*user:/,
    'profile-home should update the local store after saving the invite nickname',
  );

  assert.match(
    js,
    /onShareAppMessage\(options = \{\}\)[\s\S]*options\.from !== ["']button["'][\s\S]*dataset\.shareType !== ["']invite["'][\s\S]*pendingInvitationToken/,
    'profile-home should only share invite cards from the dedicated share button',
  );

  assert.match(
    js,
    /handleInviteShareTap\(\)[\s\S]*setTimeout\(/,
    'profile-home should close the invite dialog from the share button flow',
  );

  assert.doesNotMatch(
    js,
    /showLoading\(\{[\s\S]*title:\s*["']准备中["']/,
    'profile-home invite preparation loading should no longer show the old text',
  );

  assert.doesNotMatch(
    js,
    /navigateTo\(\{\s*url:\s*`\/pages\/invite-create\/invite-create\?/,
    'profile-home should no longer navigate to invite-create',
  );

  assert.match(
    wxss,
    /\.profile-home__invite-sheet \{[\s\S]*border-radius:\s*32rpx;[\s\S]*padding:\s*48rpx;/i,
    'profile-home invite sheet should use the new centered card layout',
  );
}

function verifyInviteAccept() {
  const js = read('pages/invite-accept/invite-accept.js');
  const wxml = read('pages/invite-accept/invite-accept.wxml');
  const wxss = read('pages/invite-accept/invite-accept.wxss');

  assert.match(
    wxml,
    /class="invite-accept-card__headline"[\s\S]*「\{\{invitationDisplay\.inviterNickname\}\}」邀请你一起关注[\s\S]*<\/view>/,
    'invite-accept should use the new first-line invite copy',
  );

  assert.match(
    wxml,
    /class="invite-accept-card__title"[\s\S]*\{\{invitationDisplay\.primaryProfileTitle\}\}[\s\S]*<\/view>/,
    'invite-accept should show the simplified profile title',
  );

  assert.match(
    wxml,
    /class="btn-primary invite-accept-card__button"[\s\S]*接受邀请并查看/,
    'invite-accept should use the new accept CTA copy',
  );

  assert.match(
    wxml,
    /class="invite-accept-card__secondary"[\s\S]*bindtap="handleDecline"[\s\S]*暂不加入[\s\S]*<\/button>/,
    'invite-accept should render decline as a plain text action',
  );

  assert.match(
    wxml,
    /邀请链接已失效/,
    'invite-accept should keep the simplified invalid title',
  );

  assert.doesNotMatch(
    wxml,
    /确定加入吗？|成功加入|进入查看|复制邀请人昵称|你将获得的权限|邀请将在/,
    'invite-accept should remove the old multi-step and permission-heavy UI',
  );

  assert.match(
    wxss,
    /\.invite-accept-card \{[\s\S]*border-radius:\s*32rpx;[\s\S]*padding:\s*60rpx 40rpx;/i,
    'invite-accept should use the new compact card spacing',
  );

  assert.match(
    js,
    /await invitationService\.acceptInvitation\(this\.data\.token\)/,
    'invite-accept should still accept invitations via token',
  );

  assert.match(
    js,
    /wx\.reLaunch\(\{\s*url:\s*['"]\/pages\/data\/data['"]/,
    'invite-accept should return to the data tab with reLaunch',
  );
}

function verifyProfileMembersInviteEntry() {
  const js = read('pages/profile-members/profile-members.js');
  const wxml = read('pages/profile-members/profile-members.wxml');

  assert.doesNotMatch(
    js,
    /navigateTo\(\{\s*url:\s*`\/pages\/invite-create\/invite-create\?/,
    'profile-members should no longer navigate to invite-create',
  );

  assert.match(
    js,
    /handleInviteShareTap|open-type="share"|onShareAppMessage|showInviteDialog|createInvitation/,
    'profile-members should handle invite sharing without the old page jump',
  );

  assert.match(
    wxml,
    /wx:if="\{\{showNicknameInput\}\}"[\s\S]*请先设置你的昵称，让家人知道是谁邀请的/,
    'profile-members invite dialog should show the nickname setup state when nickname is missing',
  );

  assert.match(
    wxml,
    /type="nickname"[\s\S]*placeholder="你的昵称"/,
    'profile-members invite dialog should use a nickname input inside the dialog',
  );

  assert.match(
    wxml,
    /确认并分享[\s\S]*wx:else[\s\S]*分享给家人/,
    'profile-members invite dialog should support both nickname setup and ready-to-share states',
  );

  assert.doesNotMatch(
    wxml,
    /以 \{\{inviteNickname\}\} 的名义邀请/,
    'profile-members invite dialog should no longer show the old inviter-name helper copy',
  );

  assert.match(
    js,
    /showNicknameInput:\s*false[\s\S]*inviteNickname:\s*["'][^"']*["'][\s\S]*inviteNicknameDraft:\s*["'][^"']*["'][\s\S]*isSavingInviteNickname:\s*false/,
    'profile-members should track nickname gating state in dialog data',
  );

  assert.match(
    js,
    /if\s*\(!isValidInviteNickname\(inviteNickname\)\)\s*\{[\s\S]*showInviteDialog:\s*true[\s\S]*showNicknameInput:\s*true[\s\S]*return;[\s\S]*await invitationService\.createInvitation/,
    'profile-members should gate nickname-less users into the dialog UI before creating an invitation',
  );

  assert.match(
    js,
    /if\s*\(!isValidInviteNickname\(inviteNickname\)\)\s*\{[\s\S]*showInviteDialog:\s*true[\s\S]*showNicknameInput:\s*true[\s\S]*pendingInvitationToken:\s*["']["']/,
    'profile-members should open the nickname gate UI directly instead of requesting an invite when nickname is missing',
  );

  assert.match(
    js,
    /await userService\.updateProfile\(\{[\s\S]*nickname:/,
    'profile-members should persist a newly entered invite nickname through updateUserProfile',
  );

  assert.match(
    js,
    /handleInviteShareTap\(\)[\s\S]*setTimeout\(/,
    'profile-members should close the invite dialog from the share button flow',
  );

  assert.doesNotMatch(
    js,
    /showLoading\(\{[\s\S]*title:\s*["']准备中["']/,
    'profile-members invite preparation loading should no longer show the old text',
  );
}

verifyProfileHomeInviteDialog();
verifyInviteAccept();
verifyProfileMembersInviteEntry();
console.log('verify-h2-invite-ui: ok');
