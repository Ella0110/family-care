const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyProfileHomeEntry() {
  const js = read('pages/profile-home/profile-home.js');

  assert.match(
    js,
    /\/pages\/medication-edit\/medication-edit\?profileId=\$\{this\.data\.currentProfileId\}/,
    'profile home medication shortcut should route to the medication list page',
  );

  assert.doesNotMatch(
    js,
    /mode=edit&profileId=.*medicationId|mode=create&profileId=/,
    'profile home medication shortcut should no longer deep-link into the old form mode',
  );
}

function verifyMedicationListPage() {
  const json = JSON.parse(read('pages/medication-edit/medication-edit.json'));
  const wxml = read('pages/medication-edit/medication-edit.wxml');
  const js = read('pages/medication-edit/medication-edit.js');
  const wxss = read('pages/medication-edit/medication-edit.wxss');

  assert.strictEqual(json.navigationBarTitleText, '药物管理', 'medication list page should use the new native title');
  assert.doesNotMatch(
    wxml,
    /medication-list__hero|先看看当前和历史用药情况/,
    'medication list page should remove the old hero copy',
  );

  assert.match(
    wxml,
    /当前用药/,
    'medication list page should show an active medications section',
  );
  assert.match(
    wxml,
    /历史用药/,
    'medication list page should show a historical medications section',
  );
  assert.match(
    wxml,
    /暂无用药记录/,
    'medication list page should expose the empty-state copy',
  );
  assert.match(
    wxml,
    /添加用药/,
    'medication list page should keep the primary add-medication action',
  );
  assert.match(
    wxml,
    /bindtouchstart="handleCardTouchStart"[\s\S]*bindtouchmove="handleCardTouchMove"[\s\S]*bindtouchend="handleCardTouchEnd"/,
    'medication list cards should support swipe-to-delete gestures',
  );
  assert.match(
    js,
    /showModal\([\s\S]*确定删除这条用药/,
    'medication list delete action should confirm before deleting',
  );
  assert.match(
    js,
    /onShow\(\)\s*\{[\s\S]*loadMedications|onShow\(\)\s*\{[\s\S]*fetchMedications/,
    'medication list page should refresh medications on show',
  );
  assert.match(
    wxss,
    /\.medication-list-page[\s\S]*background:\s*#f2f2f7;/i,
    'medication list page should align to the shared neutral page background',
  );
}

function verifyMedicationDetailPage() {
  const appJson = JSON.parse(read('app.json'));
  const json = JSON.parse(read('pages/medication-detail/medication-detail.json'));
  const wxml = read('pages/medication-detail/medication-detail.wxml');
  const js = read('pages/medication-detail/medication-detail.js');
  const wxss = read('pages/medication-detail/medication-detail.wxss');

  assert.ok(
    appJson.pages.includes('pages/medication-detail/medication-detail'),
    'app.json should register the medication detail page',
  );
  assert.strictEqual(json.navigationBarTitleText, '添加用药', 'medication detail page should default to native navigation');

  assert.match(
    js,
    /wx\.setNavigationBarTitle\(/,
    'medication detail page should switch the native nav title for add vs edit mode',
  );
  assert.match(
    wxml,
    /药物名称[\s\S]*剂量[\s\S]*频率[\s\S]*服用时间[\s\S]*开始日期[\s\S]*停药日期/,
    'medication detail page should keep the full medication form fields',
  );
  assert.doesNotMatch(
    wxml,
    /备注|medication-detail__hero|medication-detail__profile/,
    'medication detail page should remove the internal hero/profile chrome and the note field',
  );
  assert.match(
    wxml,
    /服用时间[\s\S]*placeholder="例如：早餐后、早晚各一次"/,
    'medication detail page should use a free-text timing input',
  );
  assert.match(
    wxml,
    /保存/,
    'medication detail page should keep the save action',
  );
  assert.match(
    wxml,
    /删除/,
    'medication detail page should expose delete in edit mode',
  );
  assert.doesNotMatch(
    wxml,
    /medication-header__back|sticky/,
    'medication detail page should remove the legacy sticky custom header',
  );
  assert.doesNotMatch(
    js,
    /TIMING_OPTIONS|onTimingChange|onTimingCustomInput/,
    'medication detail logic should no longer rely on timing picker options',
  );
  assert.match(
    wxss,
    /\.medication-detail-page[\s\S]*background:\s*#f2f2f7;/i,
    'medication detail page should align to the shared neutral page background',
  );
}

function main() {
  verifyProfileHomeEntry();
  verifyMedicationListPage();
  verifyMedicationDetailPage();
  console.log('verify-c2-medication-management: ok');
}

main();
