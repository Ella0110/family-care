const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyD1EmptyGuideGlassCard() {
  const wxss = read('components/profile-empty-guide/profile-empty-guide.wxss');
  const wxml = read('components/profile-empty-guide/profile-empty-guide.wxml');

  assert.match(
    wxss,
    /\.profile-empty-guide__card[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.7\);/i,
    'empty-profile guide should use a translucent glass background',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__card[\s\S]*backdrop-filter:\s*blur\(20px\);[\s\S]*-webkit-backdrop-filter:\s*blur\(20px\);/i,
    'empty-profile guide should blur the glass card backdrop',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__card[\s\S]*border-radius:\s*32rpx;/i,
    'empty-profile guide should use the shared glass-card radius',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__card[\s\S]*box-shadow:\s*0 8px 32px rgba\(49,\s*130,\s*247,\s*0\.08\);/i,
    'empty-profile guide should use the shared glass-card shadow',
  );

  assert.doesNotMatch(
    wxss,
    /border:\s*1rpx solid rgba\(255,\s*255,\s*255,\s*0\.3\);/i,
    'empty-profile guide should remove the extra glass-card border in the final style pass',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__card[\s\S]*padding:\s*80rpx 48rpx;/i,
    'empty-profile guide should use the larger shared padding',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__subtitle[\s\S]*font-size:\s*26rpx;/i,
    'empty-profile guide subtitle should keep a readable fallback font size',
  );

  assert.match(
    wxml,
    /class="profile-empty-guide__subtitle"[^>]*style="font-size:\{\{fs\.secondary\}\}"/,
    'empty-profile guide subtitle should bind to JS-precomputed font sizes',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__subtitle[\s\S]*color:\s*#94a3b8;/i,
    'empty-profile guide subtitle should align to the shared secondary color',
  );

  assert.match(
    wxss,
    /\.profile-empty-guide__button[\s\S]*box-shadow:\s*0 8px 24px rgba\(49,\s*130,\s*247,\s*0\.3\)/i,
    'empty-profile guide primary button should add the elevated blue shadow',
  );
}

function verifyD2MedicationSwipeRadius() {
  const wxss = read('pages/medication-edit/medication-edit.wxss');

  assert.match(
    wxss,
    /\.medication-card-swipe__delete[\s\S]*border-radius:\s*0 32rpx 32rpx 0;/i,
    'medication swipe delete action should keep only the right-side rounded corners',
  );
}

function verifyD3RecordsExportImage() {
  const exporterJs = read('utils/records-export-helpers.js');
  const pageJs = read('pages/records-list/records-list.js');

  assert.doesNotMatch(
    exporterJs,
    /align:\s*'right'/,
    'records export table should left-align every column',
  );

  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_TITLE_FONT_SIZE = 36;[\s\S]*ctx\.font = `bold \$\{EXPORT_IMAGE_TITLE_FONT_SIZE\}px sans-serif`;[\s\S]*fillText\('血压心率数据记录'/,
    'records export title should use the larger 36px title font',
  );

  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_SUBTITLE_FONT_SIZE = 22;[\s\S]*ctx\.font = `\$\{EXPORT_IMAGE_SUBTITLE_FONT_SIZE\}px sans-serif`;[\s\S]*fillText\(range\.subtitle/,
    'records export subtitle should use the readable 22px subtitle font',
  );

  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE = 26;[\s\S]*ctx\.font = `bold \$\{EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE\}px sans-serif`;/,
    'records export table header labels should use the new 26px font',
  );

  assert.match(
    exporterJs,
    /const EXPORT_IMAGE_HEADER_UNIT_FONT_SIZE = 20;[\s\S]*ctx\.font = `\$\{EXPORT_IMAGE_HEADER_UNIT_FONT_SIZE\}px sans-serif`;/,
    'records export table header units should use the new 20px font',
  );

  assert.match(
    exporterJs,
    /ctx\.font = '26px sans-serif';/,
    'records export table rows should use the larger 26px row font',
  );

  assert.match(
    pageJs,
    /function resolveExportScale\(logicalHeight,\s*systemDpr\) \{[\s\S]*let exportScale = Math\.max\(1,\s*Number\(systemDpr\)\s*\|\|\s*1\);/,
    'records export should derive a DPR-aware export scale from system pixel ratio',
  );

  assert.match(
    pageJs,
    /canvas\.width = Math\.max\(1,\s*Math\.round\(EXPORT_IMAGE_CANVAS_WIDTH \* exportScale\)\);/,
    'records export canvas width should scale by DPR',
  );

  assert.match(
    pageJs,
    /canvas\.height = Math\.max\(1,\s*Math\.round\(exportHeight \* exportScale\)\);/,
    'records export canvas height should scale by DPR',
  );

  assert.match(
    pageJs,
    /ctx\.scale\(exportScale,\s*exportScale\);/,
    'records export context should scale by DPR',
  );

  assert.match(
    pageJs,
    /destWidth:\s*Math\.max\(1,\s*Math\.round\(EXPORT_IMAGE_CANVAS_WIDTH \* exportScale\)\)/,
    'records export temp image should use DPR-scaled width',
  );

  assert.match(
    pageJs,
    /destHeight:\s*Math\.max\(1,\s*Math\.round\(exportHeight \* exportScale\)\)/,
    'records export temp image should use DPR-scaled height',
  );
}

function main() {
  verifyD1EmptyGuideGlassCard();
  verifyD2MedicationSwipeRadius();
  verifyD3RecordsExportImage();
  console.log('verify-d-final-ui-polish: ok');
}

main();
