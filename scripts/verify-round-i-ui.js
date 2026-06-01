const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyBackgrounds() {
  const appWxss = read('app.wxss');
  const files = [
    'pages/profile-edit/profile-edit.wxss',
    'pages/profile-selector/profile-selector.wxss',
    'pages/import-records/import-records.wxss',
    'pages/medication-edit/medication-edit.wxss',
    'pages/invite-accept/invite-accept.wxss',
    'pages/user-profile-edit/user-profile-edit.wxss',
    'pages/user-settings/user-settings.wxss',
    'pages/report/report.wxss',
    'pages/medication-detail/medication-detail.wxss',
    'pages/data/data.wxss',
    'pages/records-list/records-list.wxss',
  ];

  assert.match(appWxss, /--color-bg:\s*#f2f2f7;/i, 'app should use #F2F2F7 as the global page background');

  files.forEach((file) => {
    const content = read(file);
    assert.doesNotMatch(content, /#eef3fb|#eef4fe|#f0f4fa/i, `${file} should no longer use the old blue-gray page backgrounds`);
    assert.match(content, /#f2f2f7/i, `${file} should use #F2F2F7 for page background areas`);
  });
}

function verifyDataAndRecordStatusStyles() {
  const bpStatusJs = read('utils/bp-status.js');
  const fontScaleJs = read('utils/font-scale.js');
  const dataJs = read('pages/data/data.js');
  const dataWxml = read('pages/data/data.wxml');
  const dataWxss = read('pages/data/data.wxss');
  const recordsJs = read('pages/records-list/records-list.js');
  const recordsWxss = read('pages/records-list/records-list.wxss');
  const reportHelpersJs = read('utils/report-helpers.js');
  const reportWxss = read('pages/report/report.wxss');

  assert.match(bpStatusJs, /const BP_LEVELS = Object\.freeze\(/, 'bp-status should define a shared set of blood pressure levels');
  assert.match(bpStatusJs, /elevated:\s*Object\.freeze\(\{[\s\S]*tagText:\s*'临界偏高'[\s\S]*textColor:\s*'#F5A623'[\s\S]*backgroundColor:\s*'#FFF9EB'/, 'bp-status should define the amber 临界偏高 level');
  assert.match(bpStatusJs, /stage1:\s*Object\.freeze\(\{[\s\S]*tagText:\s*'偏高1级'[\s\S]*textColor:\s*'#FF9500'[\s\S]*backgroundColor:\s*'#FFF4EB'/, 'bp-status should define the orange 偏高1级 level');
  assert.match(bpStatusJs, /stage2:\s*Object\.freeze\(\{[\s\S]*tagText:\s*'偏高2级'[\s\S]*textColor:\s*'#FF3B30'[\s\S]*backgroundColor:\s*'#FFF0F0'/, 'bp-status should define the red 偏高2级 level');
  assert.match(bpStatusJs, /stage3:\s*Object\.freeze\(\{[\s\S]*tagText:\s*'血压过高（3级）'[\s\S]*textColor:\s*'#FF3B30'[\s\S]*backgroundColor:\s*'#FFF0F0'/, 'bp-status should define the red 3级 level');
  assert.match(bpStatusJs, /function getBPLevelForValue\(value,\s*type\)/, 'bp-status should expose separate systolic/diastolic grading');
  assert.match(bpStatusJs, /type === 'diastolic' \? 60 : 90/, 'bp-status should use 90\/60 as the low threshold');
  assert.match(bpStatusJs, /type === 'diastolic' \? 80 : 120/, 'bp-status should use 120\/80 as the 临界偏高 threshold');
  assert.match(bpStatusJs, /type === 'diastolic' \? 90 : 140/, 'bp-status should use 140\/90 as the 偏高1级 threshold');
  assert.match(bpStatusJs, /type === 'diastolic' \? 100 : 160/, 'bp-status should use 160\/100 as the 偏高2级 threshold');
  assert.match(bpStatusJs, /type === 'diastolic' \? 110 : 180/, 'bp-status should use 180\/110 as the 3级 threshold');

  assert.match(fontScaleJs, /bpSystolic:\s*Object\.freeze\(\[135,\s*140,\s*145\]\)/, 'font-scale should define dedicated systolic hero sizes');
  assert.match(fontScaleJs, /bpDiastolic:\s*Object\.freeze\(\[105,\s*110,\s*115\]\)/, 'font-scale should define dedicated diastolic hero sizes');

  assert.match(dataWxml, /wx:if="\{\{latestRecordDisplay\.showStatusTag\}\}"/, 'data page should hide the latest status tag for normal blood pressure');
  assert.match(dataJs, /showStatusTag:\s*status\.level !== ['"]normal['"]/, 'data page latest display should only show a tag for abnormal states');
  assert.match(dataJs, /getBPStatusDisplay\(/, 'data page should use the shared bp-status utility');
  assert.match(dataWxml, /data-latest__systolic[\s\S]*font-size:\{\{fs\.bpSystolic\}\}/, 'data page should use fs.bpSystolic for the latest systolic value');
  assert.match(dataWxml, /data-latest__diastolic[\s\S]*font-size:\{\{fs\.bpDiastolic\}\}/, 'data page should use fs.bpDiastolic for the latest diastolic value');
  assert.match(dataWxss, /\.data-latest__status\s*\{[\s\S]*padding:\s*0;/i, 'data page latest status tag should revert to a text-style layout instead of a pill');
  assert.match(dataWxss, /\.data-latest__status\.is-low \{[\s\S]*#007aff/i, 'data page low status should use iOS blue');
  assert.match(dataWxss, /\.data-latest__status\.is-elevated \{[\s\S]*#f5a623/i, 'data page elevated status should use amber');
  assert.match(dataWxss, /\.data-latest__status\.is-stage1 \{[\s\S]*#ff9500/i, 'data page stage 1 status should use orange');
  assert.match(dataWxss, /\.data-latest__status\.is-stage2[\s\S]*#ff3b30/i, 'data page stage 2 status should use red');
  assert.match(dataWxss, /\.data-latest__status\.is-stage3[\s\S]*#ff3b30/i, 'data page stage 3 status should use red');
  assert.match(dataWxss, /\.data-latest__systolic\s*\{[\s\S]*font-size:\s*135rpx;[\s\S]*font-weight:\s*800;/i, 'data page latest systolic fallback size should use the 135rpx baseline');
  assert.match(dataWxss, /\.data-latest__diastolic\s*\{[\s\S]*font-size:\s*105rpx;[\s\S]*font-weight:\s*700;/i, 'data page latest diastolic fallback size should use the 105rpx baseline');
  assert.match(dataWxss, /\.data-latest__systolic\.is-low[\s\S]*#007aff/i, 'data page low numbers should use blue');
  assert.match(dataWxss, /\.data-latest__systolic\.is-elevated[\s\S]*#f5a623/i, 'data page elevated numbers should use amber');
  assert.match(dataWxss, /\.data-latest__systolic\.is-stage1[\s\S]*#ff9500/i, 'data page stage 1 numbers should use orange');
  assert.match(dataWxss, /\.data-latest__systolic\.is-stage2[\s\S]*#ff3b30/i, 'data page stage 2 numbers should use red');
  assert.match(dataWxss, /\.data-latest__systolic\.is-normal[\s\S]*#0f172a/i, 'data page normal numbers should stay black');

  assert.match(recordsJs, /status\.recordsClassName/, 'records list should derive record tag classes from the shared bp-status metadata');
  assert.match(recordsWxss, /\.records-status--low \{[\s\S]*#007aff/i, 'records list low tags should use blue');
  assert.match(recordsWxss, /\.records-status--normal \{[\s\S]*#34c759/i, 'records list normal tags should use iOS green');
  assert.match(recordsWxss, /\.records-status--elevated \{[\s\S]*#f5a623/i, 'records list elevated tags should use amber');
  assert.match(recordsWxss, /\.records-status--stage1 \{[\s\S]*#ff9500/i, 'records list stage 1 tags should use orange');
  assert.match(recordsWxss, /\.records-status--stage2[\s\S]*#ff3b30/i, 'records list stage 2 tags should use red');
  assert.match(recordsWxss, /\.records-status--stage3[\s\S]*#ff3b30/i, 'records list stage 3 tags should use red');

  assert.match(reportHelpersJs, /getBPStatusDisplay\(/, 'report helpers should use the shared bp-status utility');
  assert.match(reportWxss, /\.report-alert-list__tags--low \{[\s\S]*#007aff/i, 'report low tags should use blue');
  assert.match(reportWxss, /\.report-alert-list__tags--elevated \{[\s\S]*#f5a623/i, 'report elevated tags should use amber');
  assert.match(reportWxss, /\.report-alert-list__tags--stage1 \{[\s\S]*#ff9500/i, 'report stage 1 tags should use orange');
  assert.match(reportWxss, /\.report-alert-list__tags--stage2[\s\S]*#ff3b30/i, 'report stage 2 tags should use red');
  assert.match(reportWxss, /\.report-alert-list__tags--stage3[\s\S]*#ff3b30/i, 'report stage 3 tags should use red');
}

function verifyReportChartHeadings() {
  const reportWxml = read('pages/report/report.wxml');
  const reportJs = read('pages/report/report.js');

  assert.doesNotMatch(reportWxml, /血压趋势图/, 'report page should remove the old duplicate blood pressure title');
  assert.match(reportWxml, /血压波动趋势/, 'report page should keep the new blood pressure title copy');
  assert.doesNotMatch(reportWxml, /心率变化图/, 'report page should remove the old duplicate heart rate title');
  assert.match(reportWxml, /心率变化/, 'report page should keep the simplified heart rate title');
  assert.match(reportJs, /drawBloodPressureTrendChart\([\s\S]*\{\s*hideTitle:\s*true\s*\}/, 'report page should hide canvas-internal blood pressure titles');
  assert.match(reportJs, /drawHeartRateChart\([\s\S]*\{\s*hideTitle:\s*true\s*\}/, 'report page should hide canvas-internal heart rate titles');
}

function verifyImportPlaceholder() {
  const importWxml = read('pages/import-records/import-records.wxml');
  assert.doesNotMatch(importWxml, /&#10;/, 'import page placeholder should no longer contain HTML entities');
  assert.match(
    importWxml,
    /placeholder="粘贴 CSV 格式的血压数据，支持从 Excel、备忘录等复制"/,
    'import page should use the new single-line placeholder',
  );
}

function verifyUserProfileEditStyles() {
  const wxml = read('pages/user-profile-edit/user-profile-edit.wxml');
  const wxss = read('pages/user-profile-edit/user-profile-edit.wxss');

  assert.match(wxml, /class="profile-edit-avatar__button"/, 'user profile edit should keep the choose-avatar button');
  assert.match(wxss, /\.profile-edit-avatar\s*\{[\s\S]*width:\s*120rpx;[\s\S]*height:\s*120rpx;/i, 'user profile avatar preview should be enlarged to 120rpx');
  assert.match(wxss, /\.profile-edit-avatar__button\s*\{[\s\S]*background:\s*transparent;[\s\S]*color:\s*#3478f6;[\s\S]*border-radius:\s*0/i, 'choose-avatar button should be a blue text link');
  assert.match(wxss, /\.profile-edit-cancel\s*\{[\s\S]*background:\s*transparent;[\s\S]*color:\s*#94a3b8;/i, 'user profile cancel action should be a gray text button');
}

function verifyMedicationEmptyGlassCard() {
  const wxss = read('pages/medication-edit/medication-edit.wxss');
  assert.match(wxss, /\.medication-empty\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.7\);[\s\S]*backdrop-filter:\s*blur\(20px\);[\s\S]*border-radius:\s*32rpx;/i, 'medication empty state should use the glass card treatment');
  assert.match(wxss, /\.medication-empty__button\s*\{[\s\S]*box-shadow:\s*0 8px 24px rgba\(49,\s*130,\s*247,\s*0\.3\)/i, 'medication empty state CTA should use the stronger blue shadow');
}

function verifyInviteAcceptCentering() {
  const wxss = read('pages/invite-accept/invite-accept.wxss');
  assert.match(wxss, /\.invite-accept-page\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*min-height:\s*100vh;/i, 'invite accept page should vertically center the card');
}

function verifyShareImage() {
  const homeJs = read('pages/profile-home/profile-home.js');
  const membersJs = read('pages/profile-members/profile-members.js');
  const inviteCreateJs = read('pages/invite-create/invite-create.js');
  const inviteCreateWxml = read('pages/invite-create/invite-create.wxml');
  assert.match(homeJs, /imageUrl:\s*['"]\/assets\/images\/share-card\.png['"]/, 'profile-home invite share config should use the provided custom share image');
  assert.match(membersJs, /imageUrl:\s*['"]\/assets\/images\/share-card\.png['"]/, 'profile-members invite share config should use the provided custom share image');
  assert.match(inviteCreateJs, /imageUrl:\s*['"]\/assets\/images\/share-card\.png['"]/, 'invite-create share config should use the provided custom share image');
  assert.match(inviteCreateWxml, /src="\/assets\/images\/share-card\.png"/, 'invite-create should reference the custom share image in markup so it is packaged for preview uploads');
}

verifyBackgrounds();
verifyDataAndRecordStatusStyles();
verifyReportChartHeadings();
verifyImportPlaceholder();
verifyUserProfileEditStyles();
verifyMedicationEmptyGlassCard();
verifyInviteAcceptCentering();
verifyShareImage();
console.log('verify-round-i-ui: ok');
