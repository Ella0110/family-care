const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function expectMatch(source, pattern, message) {
  assert(
    pattern.test(source),
    message,
  );
}

const userProfileEditSource = read('pages/user-profile-edit/user-profile-edit.js');
const dataPageSource = read('pages/data/data.js');
const dataPageWxmlSource = read('pages/data/data.wxml');
const recordsListSource = read('pages/records-list/records-list.js');
const recordsListWxmlSource = read('pages/records-list/records-list.wxml');
const profileHomeSource = read('pages/profile-home/profile-home.js');
const profileMembersSource = read('pages/profile-members/profile-members.js');
const importRecordsSource = read('pages/import-records/import-records.js');

expectMatch(
  userProfileEditSource,
  /async function uploadAvatarIfNeeded\(/,
  'user-profile-edit should define an avatar upload helper for chooseAvatar temp files',
);

expectMatch(
  userProfileEditSource,
  /wx\.cloud\.uploadFile\(/,
  'user-profile-edit should upload chooseAvatar temp files to cloud storage',
);

expectMatch(
  userProfileEditSource,
  /const avatarUrl = await uploadAvatarIfNeeded\(/,
  'user-profile-edit should upload local avatar paths before saving the profile',
);

expectMatch(
  dataPageSource,
  /const exportScale = Math\.max\(1,\s*Number\(this\.pixelRatio\)\s*\|\|\s*1\);/,
  'data page single-chart export should derive a DPR export scale',
);

expectMatch(
  dataPageSource,
  /canvas\.width = Math\.max\(1,\s*Math\.round\(EXPORT_CHART_CANVAS_WIDTH \* exportScale\)\);/,
  'data page single-chart export should scale canvas width by DPR',
);

expectMatch(
  dataPageSource,
  /canvas\.height = Math\.max\(1,\s*Math\.round\(exportHeight \* exportScale\)\);/,
  'data page single-chart export should scale canvas height by DPR',
);

expectMatch(
  dataPageSource,
  /ctx\.scale\(exportScale,\s*exportScale\);/,
  'data page single-chart export should scale drawing operations by DPR',
);

expectMatch(
  dataPageSource,
  /destWidth:\s*Math\.max\(1,\s*Math\.round\(EXPORT_CHART_CANVAS_WIDTH \* exportScale\)\)/,
  'data page single-chart export should export DPR-scaled width',
);

expectMatch(
  dataPageSource,
  /destHeight:\s*Math\.max\(1,\s*Math\.round\(exportHeight \* exportScale\)\)/,
  'data page single-chart export should export DPR-scaled height',
);

expectMatch(
  dataPageSource,
  /const EXPORT_CHART_SUMMARY_FONT_SIZE = 28;/,
  'data page single-chart export summary font should be increased to 28px',
);

expectMatch(
  recordsListSource,
  /const isAndroid = systemInfo\.platform === 'android';/,
  'records-list should detect Android when deciding which delete confirmation UI to show',
);

expectMatch(
  recordsListSource,
  /if \(isAndroid\) \{[\s\S]*wx\.showModal\(/,
  'records-list should use wx.showModal for delete confirmation on Android',
);

expectMatch(
  recordsListSource,
  /showDeleteDialog:\s*true/,
  'records-list should preserve the custom iOS delete dialog path',
);

expectMatch(
  recordsListSource,
  /function canDeleteRecord\(/,
  'records-list should define per-record delete gating for owner and self-recorded collaborator entries',
);

expectMatch(
  recordsListWxmlSource,
  /wx:if="\{\{record\.canDelete\}\}"[\s\S]*records-row-swipe__delete/,
  'records-list should only render the swipe delete button for records the current user can delete',
);

expectMatch(
  recordsListSource,
  /function buildRecorderText\(/,
  'records-list should derive recorder labels for collaborative profiles',
);

expectMatch(
  recordsListWxmlSource,
  /wx:if="\{\{record\.recorderText\}\}"[\s\S]*records-row__recorder/,
  'records-list should render a recorder label when a collaborative record has displayable attribution',
);

expectMatch(
  recordsListSource,
  /const MAX_EXPORT_CANVAS_HEIGHT = 4096;/,
  'records-list export should clamp export DPR against a safe canvas height ceiling',
);

expectMatch(
  recordsListSource,
  /function resolveExportScale\(logicalHeight,\s*systemDpr\) \{[\s\S]*while \(logicalHeight \* exportScale > MAX_EXPORT_CANVAS_HEIGHT && exportScale > 1\) \{/,
  'records-list export should dynamically lower DPR for long 90-day exports',
);

expectMatch(
  recordsListSource,
  /title: '生成失败，请稍后重试'/,
  'records-list should use a friendlier fallback export failure message after DPR downscaling',
);

expectMatch(
  importRecordsSource,
  /function buildImportDedupKey\(/,
  'import-records should build a stable dedupe key from minute-level time and blood pressure values',
);

expectMatch(
  importRecordsSource,
  /await recordService\.fetchRecords\(/,
  'import-records should fetch existing records within the import range before saving',
);

expectMatch(
  importRecordsSource,
  /发现 \$\{duplicateCount\} 条重复记录已跳过，实际导入 \$\{results\.success\} 条/,
  'import-records should tell the user how many duplicates were skipped before import',
);

expectMatch(
  importRecordsSource,
  /所有记录已存在，无需重复导入/,
  'import-records should stop early when every parsed row is already present',
);

expectMatch(
  dataPageSource,
  /function buildRecorderText\(/,
  'data page should derive recorder labels for the latest record card when collaboration is present',
);

expectMatch(
  dataPageWxmlSource,
  /wx:if="\{\{latestRecordDisplay\.recorderText\}\}"[\s\S]*data-latest__recorder/,
  'data page should render the latest record recorder label when it is available',
);

expectMatch(
  profileHomeSource,
  /store\.isStale\("members",\s*profileId,\s*MEMBER_STALE_THRESHOLD\)/,
  'profile-home should continue to refresh members with a 30-second staleness gate',
);

expectMatch(
  profileMembersSource,
  /store\.isStale\('members',\s*this\.data\.profileId,\s*STALE_THRESHOLD\)/,
  'profile-members should continue to refresh members with a 30-second staleness gate',
);

console.log('verify-g-round-fixes: ok');
