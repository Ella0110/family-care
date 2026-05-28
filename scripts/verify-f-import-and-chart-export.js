const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function verifyF1ImportPage() {
  const js = read('pages/import-records/import-records.js');
  const wxml = read('pages/import-records/import-records.wxml');
  const wxss = read('pages/import-records/import-records.wxss');

  assert.doesNotMatch(
    wxml,
    /预览解析|<view class="import-card__actions">[\s\S]*清空/,
    'import page should remove the old side-by-side preview/clear buttons',
  );

  assert.match(
    wxml,
    /wx:if="\{\{csvText\.length > 0\}\}"[\s\S]*bindtap="handleClear"/,
    'import page should show a small clear button only when textarea has content',
  );

  assert.match(
    wxml,
    /placeholder="粘贴 CSV 格式的血压数据&#10;支持从 Excel、备忘录等复制的数据"/,
    'import textarea should move the import instructions into the placeholder',
  );

  assert.match(
    js,
    /const PARSE_DEBOUNCE_MS = 500;/,
    'import page should use a 500ms parse debounce',
  );

  assert.match(
    js,
    /const IMPORT_FEEDBACK_DURATION_MS = 1000;/,
    'import page should keep import feedback visible for one second',
  );

  assert.match(
    js,
    /handleInput\([\s\S]*schedulePreviewParse\(/,
    'import page input should trigger the debounced auto-parse flow',
  );

  assert.match(
    js,
    /schedulePreviewParse\([\s\S]*setTimeout\([\s\S]*parseCSV\(/,
    'import page should parse CSV through the debounced scheduler',
  );

  assert.match(
    js,
    /handleInputBlur\([\s\S]*flushPreviewParse\(/,
    'import page blur should flush any pending parse immediately',
  );

  assert.match(
    wxml,
    /解析中\.\.\.|parseStatusText/,
    'import page should expose an inline parse status message',
  );

  assert.match(
    wxss,
    /\.import-textarea__clear[\s\S]*width:\s*48rpx;[\s\S]*height:\s*48rpx;[\s\S]*border-radius:\s*50%;/i,
    'import page should style the inline clear control as a small round button',
  );

  assert.match(
    wxss,
    /\.import-footer__button[\s\S]*min-height:\s*96rpx;[\s\S]*border-radius:\s*24rpx;/i,
    'import page footer CTA should use the standard large blue button treatment',
  );

  assert.match(
    js,
    /console\.log\('\[import-records\] entered handleImport'\)/,
    'import page should log when the import flow starts',
  );

  assert.match(
    js,
    /console\.log\('\[import-records\] start getRecords for dedupe'/,
    'import page should log before querying existing records for dedupe',
  );

  assert.match(
    js,
    /const IMPORT_DEDUPE_FETCH_LIMIT = 500;/,
    'import page should cap dedupe record queries at the cloud function maximum limit',
  );

  assert.match(
    js,
    /const since = floorToMinuteTimestamp\([\s\S]*const until = ceilToMinuteTimestamp\([\s\S]*recordService\.fetchRecords\(profileId,\s*\{[\s\S]*since,\s*[\s\S]*until,\s*[\s\S]*limit:\s*IMPORT_DEDUPE_FETCH_LIMIT/s,
    'import page should query existing records using minute-bounded timestamp filters and the cloud function limit cap',
  );

  assert.match(
    js,
    /function toMinuteKey\(measuredAt\)/,
    'import page should normalize measuredAt values into minute-level timestamps before dedupe',
  );

  assert.match(
    js,
    /normalizeDate\(measuredAt\)/,
    'import page dedupe should use the shared normalizeDate helper for mixed measuredAt payload shapes',
  );

  assert.match(
    js,
    /console\.log\('待导入记录 measuredAt:', typeof importRecord\.measuredAt, importRecord\.measuredAt\);/,
    'import page should log the measuredAt shape of each imported record during dedupe debugging',
  );

  assert.match(
    js,
    /console\.log\('已有记录 measuredAt:', typeof existingRecord\.measuredAt, existingRecord\.measuredAt\);/,
    'import page should log the measuredAt shape of each existing record during dedupe debugging',
  );

  assert.match(
    js,
    /console\.log\('去重 key 对比 - 待导入:', importKey, '已有 Set:', Array\.from\(existingKeys\)\);/,
    'import page should log dedupe key comparisons for repeated CSV imports',
  );

  assert.match(
    js,
    /console\.log\('去重 key 对比 - 待导入:', importKey, '已有:', existingKeys\.has\(importKey\) \? importKey : ''\);/,
    'import page should log the exact matched dedupe key when a duplicate is found',
  );

  assert.match(
    js,
    /在已有 Set 中找到，标记为重复/,
    'import page should log when an import key is matched against existing records',
  );

  assert.match(
    js,
    /console\.warn\('\[import-records\] getRecords dedupe failed, fallback to direct import'/,
    'import page should fall back to direct import when the dedupe query fails',
  );

  assert.match(
    js,
    /wx\.showLoading\(\{[\s\S]*title:\s*'正在导入'[\s\S]*mask:\s*true[\s\S]*\}\)/,
    'import page should show a blocking loading indicator during import',
  );

  assert.match(
    js,
    /const hideImportLoading = \(\) => \{[\s\S]*wx\.hideLoading\(\);[\s\S]*loadingVisible = false;[\s\S]*\};/,
    'import page should guard loading teardown so hideLoading runs before feedback toasts and only once',
  );

  assert.doesNotMatch(
    js,
    /if \(duplicateCount > 0\) \{\s*wx\.showToast\(/,
    'import page should not show an intermediate duplicate toast that gets immediately replaced by the final result toast',
  );

  assert.match(
    js,
    /wx\.showToast\(\{[\s\S]*title:\s*duplicateOnlyText[\s\S]*duration:\s*IMPORT_FEEDBACK_DURATION_MS[\s\S]*\}\)/,
    'duplicate-only imports should keep the feedback toast visible for the shared duration',
  );

  assert.match(
    js,
    /hideImportLoading\(\);\s*wx\.showToast\(\{[\s\S]*title:\s*duplicateOnlyText[\s\S]*duration:\s*IMPORT_FEEDBACK_DURATION_MS[\s\S]*\}\)/,
    'duplicate-only imports should hide the loading overlay before showing the final toast',
  );

  assert.match(
    js,
    /wx\.showToast\(\{[\s\S]*title:\s*resultToastText[\s\S]*duration:\s*IMPORT_FEEDBACK_DURATION_MS[\s\S]*\}\)/,
    'successful imports should use a single final toast with the shared feedback duration',
  );

  assert.match(
    js,
    /hideImportLoading\(\);\s*wx\.showToast\(\{[\s\S]*title:\s*resultToastText[\s\S]*duration:\s*IMPORT_FEEDBACK_DURATION_MS[\s\S]*\}\)/,
    'successful imports should hide the loading overlay before showing the final toast',
  );

  assert.match(
    js,
    /wx\.hideLoading\(\)/,
    'import page should always hide the loading indicator after import completes',
  );

  assert.match(
    js,
    /console\.log\('\[import-records\] saveRecord completed'/,
    'import page should log each record save completion during import',
  );

  assert.match(
    js,
    /console\.log\('\[import-records\] all saveRecord completed'/,
    'import page should log when the full save batch finishes',
  );
}

function verifyF3ChartExportSummary() {
  const js = read('pages/data/data.js');

  assert.match(
    js,
    /function buildChartExportSummaryText\(chartType,\s*selectedDays,\s*rangeSummary,\s*heartRateSummary\)/,
    'data page should extract chart export summary building into a helper',
  );

  assert.match(
    js,
    /近 \$\{selectedDays\}天 \| 均值 \$\{rangeSummary\.averageText \|\| '--'\} mmHg \| 异常\$?\{rangeSummary\.abnormalCount\}次/,
    'blood pressure chart export should append the required summary line',
  );

  assert.match(
    js,
    /近 \$\{selectedDays\}天 \| 均值 \$\{heartRateSummary\.averageText \|\| '--'\} bpm \| 异常\$?\{heartRateSummary\.abnormalCount\}次/,
    'heart rate chart export should append the required summary line',
  );

  assert.match(
    js,
    /const EXPORT_CHART_SUMMARY_FONT_SIZE = 28;[\s\S]*ctx\.font = `\$\{EXPORT_CHART_SUMMARY_FONT_SIZE\}px sans-serif`;[\s\S]*ctx\.fillText\(summaryText,\s*EXPORT_CHART_CANVAS_WIDTH \/ 2,/,
    'chart export should render the summary line in 28px centered text',
  );

  assert.match(
    js,
    /const exportScale = Math\.max\(1,\s*Number\(this\.pixelRatio\)\s*\|\|\s*1\);[\s\S]*canvas\.width = Math\.max\(1,\s*Math\.round\(EXPORT_CHART_CANVAS_WIDTH \* exportScale\)\);[\s\S]*canvas\.height = Math\.max\(1,\s*Math\.round\(exportHeight \* exportScale\)\);[\s\S]*ctx\.scale\(exportScale,\s*exportScale\);/,
    'chart export should scale the canvas by DPR before drawing',
  );

  assert.match(
    js,
    /destWidth:\s*Math\.max\(1,\s*Math\.round\(EXPORT_CHART_CANVAS_WIDTH \* exportScale\)\),[\s\S]*destHeight:\s*Math\.max\(1,\s*Math\.round\(exportHeight \* exportScale\)\)/,
    'chart export should export DPR-scaled dimensions',
  );

  assert.match(
    js,
    /function buildChartExportHeight\(\)\s*\{[\s\S]*return \d+;/,
    'chart export should still compute an explicit export height',
  );
}

function main() {
  verifyF1ImportPage();
  verifyF3ChartExportSummary();
  console.log('verify-f-import-and-chart-export: ok');
}

main();
