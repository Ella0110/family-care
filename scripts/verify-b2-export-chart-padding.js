const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const exporterJs = read('utils/report-exporter.js');

assert.match(
  exporterJs,
  /ctx\.translate\(PADDING_X,\s*y\);[\s\S]*drawBloodPressureTrendChart\([\s\S]*\{\s*width:\s*CONTENT_WIDTH,\s*height:\s*300\s*\}/,
  'blood-pressure export chart should align to the shared content padding instead of the old wide canvas frame',
);

assert.match(
  exporterJs,
  /ctx\.translate\(PADDING_X,\s*y\);[\s\S]*drawHeartRateChart\([\s\S]*\{\s*width:\s*CONTENT_WIDTH,\s*height:\s*260\s*\}/,
  'heart-rate export chart should align to the shared content padding instead of the old wide canvas frame',
);

assert.doesNotMatch(
  exporterJs,
  /ctx\.translate\(20,\s*y\)|width:\s*EXPORT_CANVAS_WIDTH\s*-\s*40/,
  'export charts should not keep the old 20px translate and 710px width hack',
);

console.log('verify-b2-export-chart-padding: ok');
