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
    /ctx\.font = '22px sans-serif';[\s\S]*ctx\.fillText\(summaryText,\s*EXPORT_CHART_CANVAS_WIDTH \/ 2,/,
    'chart export should render the summary line in 22px centered text',
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
