const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  requestAlertSubscription,
  SUBSCRIBE_ALERT_TEMPLATE_ID,
} = require('../utils/alert-subscription');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const alertSubscription = read('utils/alert-subscription.js');
const updateRelationshipHandler = read('cloudfunctions/updateRelationship/handler.js');
const userSettingsJs = read('pages/user-settings/user-settings.js');
const userSettingsWxml = read('pages/user-settings/user-settings.wxml');
const dataJs = read('pages/data/data.js');
const dataWxml = read('pages/data/data.wxml');
const profileHomeJs = read('pages/profile-home/profile-home.js');
const profileHomeWxml = read('pages/profile-home/profile-home.wxml');
const subscribeGuideJs = read('components/subscribe-guide/subscribe-guide.js');
const subscribeGuideWxml = read('components/subscribe-guide/subscribe-guide.wxml');
const subscribeGuideWxss = read('components/subscribe-guide/subscribe-guide.wxss');

assert.match(
  alertSubscription,
  /res\[tmplId\]|res\[templateId\]|status\s*===\s*['"]accept['"]/,
  'alert-subscription should inspect the subscribe message result instead of relying on complete only',
);

assert.match(
  updateRelationshipHandler,
  /subscribeAuthStatus/,
  'updateRelationship handler should accept and persist subscribeAuthStatus',
);

assert.match(
  userSettingsJs,
  /subscribeAuthStatus/,
  'user-settings logic should track subscribeAuthStatus in member items and toggle flows',
);

assert.match(
  userSettingsWxml,
  /等待对方确认/,
  'member notification sheet should show a pending auth hint',
);

assert.match(
  userSettingsWxml,
  /当前提醒阈值：高压/,
  'non-owner settings view should show a read-only threshold summary',
);

assert.match(
  userSettingsWxml,
  /wx:if="\{\{hasProfile && isOwnerProfile\}\}"/,
  'owner threshold steppers should be gated by hasProfile && isOwnerProfile',
);

assert.match(
  dataWxml,
  /<subscribe-guide[\s\S]*bind:result=/,
  'data page should mount subscribe-guide and handle auth results',
);

assert.match(
  profileHomeWxml,
  /<subscribe-guide[\s\S]*bind:result=/,
  'profile-home page should mount subscribe-guide and handle auth results',
);

assert.match(
  dataJs,
  /subscribeAuthStatus/,
  'data page should inspect subscribeAuthStatus for pending and authorized flows',
);

assert.match(
  profileHomeJs,
  /subscribeAuthStatus/,
  'profile-home page should inspect subscribeAuthStatus for pending and authorized flows',
);

assert.match(
  subscribeGuideJs,
  /wx\.requestSubscribeMessage\(/,
  'subscribe-guide should request subscription directly in its tap handler',
);

assert.match(
  subscribeGuideJs,
  /triggerEvent\(['"]result['"],\s*\{\s*status\s*\}\)/,
  'subscribe-guide should emit result statuses back to the page',
);

assert.match(
  subscribeGuideWxml,
  /请开启[\s\S]*指标异常提醒[\s\S]*开关[\s\S]*再点击[\s\S]*允许[\s\S]*按钮[\s\S]*并勾选[\s\S]*总是保持以上选择/,
  'subscribe-guide should explain the real subscribe-message permission steps',
);

assert.ok(
  !/class="btn-secondary"/.test(subscribeGuideWxml),
  'subscribe-guide secondary button should avoid the shared .btn-secondary style',
);

assert.match(
  subscribeGuideWxss,
  /border:\s*none/i,
  'subscribe-guide secondary button style should explicitly clear borders',
);

assert.ok(
  /invitedBy/.test(dataJs) || /memberService\.listProfileMembers/.test(dataJs),
  'data page should resolve inviter nickname from relationship.invitedBy when inviterNickname is missing',
);

assert.ok(
  /invitedBy/.test(profileHomeJs) || /memberService\.listProfileMembers/.test(profileHomeJs),
  'profile-home page should resolve inviter nickname from relationship.invitedBy when inviterNickname is missing',
);

assert.match(
  alertSubscription,
  /typeof wx\.requestSubscribeMessage !== 'function'[\s\S]*status:\s*'reject'/,
  'alert-subscription should treat unavailable subscribe-message API like a decline instead of defaulting to accept',
);

assert.match(
  dataJs,
  /_silentSubscribeDone/,
  'data page should keep a session-level guard for silent subscribe refresh',
);

assert.match(
  profileHomeJs,
  /_silentSubscribeDone/,
  'profile-home page should keep a session-level guard for silent subscribe refresh',
);

assert.match(
  userSettingsJs,
  /关闭通知[\s\S]*将不再收到血压异常提醒/,
  'user-settings should confirm before an owner disables another member alert subscription',
);

async function main() {
  const originalWx = global.wx;
  const calls = [];
  global.wx = {};

  try {
    await requestAlertSubscription({
      onAccept: () => {
        calls.push('accept');
      },
      onReject: (detail) => {
        calls.push(`reject:${detail && detail.status}:${detail && detail.tmplId}`);
      },
      onFail: () => {
        calls.push('fail');
      },
    });
  } finally {
    global.wx = originalWx;
  }

  assert.deepStrictEqual(
    calls,
    [`reject:reject:${SUBSCRIBE_ALERT_TEMPLATE_ID}`],
    'alert-subscription should call the reject branch when subscribe-message API is unavailable',
  );

  console.log('verify-subscribe-auth-flow: ok');
}

main().catch((error) => {
  console.error('verify-subscribe-auth-flow: fail');
  console.error(error);
  process.exitCode = 1;
});
