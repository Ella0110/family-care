const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const wxml = read('pages/report/report.wxml');
const wxss = read('pages/report/report.wxss');
const js = read('pages/report/report.js');

assert.match(
  wxml,
  /<view wx:else class="report-content">/,
  'report page should wrap the main report body in a single report-content container',
);

[
  /class="card report-header"/,
  /class="card report-profile"/,
  /class="card report-chart-card"/,
  /class="card report-alert-list"/,
  /class="card report-disclaimer"/,
].forEach((pattern) => {
  assert.doesNotMatch(
    wxml,
    pattern,
    'report body sections should no longer render as separate standalone cards',
  );
});

assert.match(
  wxml,
  /class="report-section report-section--header"[\s\S]*血压心率就诊报告/,
  'report body should start with the title section inside the single card',
);

assert.match(
  wxml,
  /class="report-section report-section--patient"[\s\S]*患者档案/,
  'report body should keep a patient section inside the single card',
);

assert.match(
  wxml,
  /class="report-summary__item"/,
  'summary items should still render, but as inner blocks instead of outer cards',
);

assert.doesNotMatch(
  wxml,
  /report-alert--pulse/,
  'report alert block should drop the pulse animation class',
);

assert.match(
  wxss,
  /\.report-content\s*\{[\s\S]*background:\s*#ffffff;[\s\S]*border-radius:\s*32rpx;[\s\S]*padding:\s*48rpx;[\s\S]*box-shadow:\s*0 4px 20px rgba\(0,\s*0,\s*0,\s*0\.02\);/i,
  'report-content should match the shared single-card visual container',
);

assert.match(
  wxss,
  /\.report-section\s*\{[\s\S]*border-bottom:\s*1rpx solid #f1f5f9;/i,
  'report sections should be separated by inner dividers instead of outer card gaps',
);

assert.match(
  wxss,
  /\.report-alert\s*\{[\s\S]*border-left:\s*6rpx solid #ef4444;/i,
  'alert block should use the left-border warning style',
);

assert.doesNotMatch(
  wxss,
  /@keyframes report-alert-pulse|report-alert--pulse/,
  'alert pulse animation styles should be removed from the page CSS',
);

assert.match(
  js,
  /drawBloodPressureTrendChart[\s\S]*drawHeartRateChart/,
  'report page should still use the shared chart renderer',
);

assert.match(
  js,
  /measureReportExportHeight[\s\S]*drawReportExportCanvas/,
  'report page should keep the export logic wiring unchanged',
);

console.log('verify-b2-report-single-card: ok');
