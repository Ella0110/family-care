const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const exporterJs = read('utils/report-exporter.js');
const reportJs = read('pages/report/report.js');

assert.match(
  exporterJs,
  /const EXPORT_PADDING = 60;/,
  'report exporter should define a shared 60px export padding constant',
);

assert.match(
  exporterJs,
  /y = EXPORT_PADDING;/,
  'report export drawing should start at the shared top padding',
);

assert.match(
  reportJs,
  /const\s*\{[\s\S]*EXPORT_PADDING[\s\S]*\}\s*=\s*require\(['"]..\/..\/utils\/report-exporter['"]\)|const\s*\{[\s\S]*EXPORT_PADDING[\s\S]*\}\s*=\s*require\(['"]..\/..\/utils\/report-exporter['"]\)/,
  'report page should import the shared export padding constant',
);

assert.match(
  reportJs,
  /const exportScale = Math\.max\(1,\s*Number\(this\.pixelRatio\)\s*\|\|\s*1\);/,
  'report export should derive a DPR-aware export scale from system pixel ratio',
);

assert.match(
  reportJs,
  /prepareExportCanvas\(canvas,\s*logicalHeight,\s*exportScale\)\s*\{[\s\S]*canvas\.width = Math\.max\(1,\s*Math\.round\(EXPORT_CANVAS_WIDTH \* exportScale\)\);/,
  'report export helper should scale canvas width by DPR',
);

assert.match(
  reportJs,
  /prepareExportCanvas\(canvas,\s*logicalHeight,\s*exportScale\)\s*\{[\s\S]*canvas\.height = Math\.max\(1,\s*Math\.round\(logicalHeight \* exportScale\)\);/,
  'report export helper should scale canvas height by DPR',
);

assert.match(
  reportJs,
  /prepareExportCanvas\(canvas,\s*logicalHeight,\s*exportScale\)\s*\{[\s\S]*ctx\.scale\(exportScale,\s*exportScale\);/,
  'report export helper should scale the canvas context by DPR',
);

assert.match(
  reportJs,
  /const exportPixelHeight = Math\.max\([\s\S]*Math\.ceil\(\(Number\(lastY\) \|\| 0\) \+ EXPORT_PADDING\)[\s\S]*\);/,
  'report export should use symmetric bottom padding without capping to the estimated height',
);

assert.doesNotMatch(
  reportJs,
  /Math\.min\(exportLayout\.height,\s*Math\.ceil\(\(Number\(lastY\) \|\| 0\) \+ 80\)\)/,
  'report export should drop the old min-capped lastY trimming logic',
);

assert.match(
  reportJs,
  /destWidth:\s*Math\.max\(1,\s*Math\.round\(EXPORT_CANVAS_WIDTH \* exportScale\)\)/,
  'canvasToTempFilePath should export at DPR-scaled width',
);

assert.match(
  reportJs,
  /destHeight:\s*Math\.max\(1,\s*Math\.round\(exportPixelHeight \* exportScale\)\)/,
  'canvasToTempFilePath should export at DPR-scaled height',
);

console.log('verify-b2-export-quality: ok');
