const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const exporterJs = read('utils/report-exporter.js');

assert.match(
  exporterJs,
  /const EXPORT_CANVAS_WIDTH = CARD_X \* 2 \+ CARD_WIDTH;/,
  'report exporter should derive total canvas width from the outer card width instead of keeping a wider fixed canvas',
);

assert.match(
  exporterJs,
  /const CONTENT_X = \d+;/,
  'report exporter should keep a dedicated content start x constant',
);

assert.match(
  exporterJs,
  /const CONTENT_WIDTH = \d+;/,
  'report exporter should keep a dedicated content width constant',
);

assert.match(
  exporterJs,
  /const CARD_X = \d+;[\s\S]*const CARD_WIDTH = \d+;/,
  'report exporter should keep a dedicated outer card frame constant',
);

assert.match(
  exporterJs,
  /ctx\.fillStyle = "#FFFFFF";[\s\S]*ctx\.fillRect\(0,\s*0,\s*EXPORT_CANVAS_WIDTH,\s*layout\.height\);[\s\S]*drawRoundedRect\([\s\S]*CARD_X,[\s\S]*CARD_WIDTH,[\s\S]*"#FFFFFF"/,
  'report exporter should draw on a white background without the old gray page backdrop',
);

assert.match(
  exporterJs,
  /ctx\.translate\(CONTENT_X,\s*y\);[\s\S]*drawBloodPressureTrendChart\([\s\S]*\{\s*width:\s*CONTENT_WIDTH,\s*height:\s*300\s*\}/,
  'blood-pressure export chart should align to the shared content padding instead of the old wide canvas frame',
);

assert.match(
  exporterJs,
  /ctx\.translate\(CONTENT_X,\s*y\);[\s\S]*drawHeartRateChart\([\s\S]*\{\s*width:\s*CONTENT_WIDTH,\s*height:\s*260\s*\}/,
  'heart-rate export chart should align to the shared content padding instead of the old wide canvas frame',
);

assert.doesNotMatch(
  exporterJs,
  /\bPADDING_X\b|\bPAGE_BACKGROUND\b|CONTENT_WIDTH = EXPORT_CANVAS_WIDTH - PADDING_X \* 2/,
  'export layout should no longer use the old 40px side padding grid or gray page background constant',
);

console.log('verify-b2-export-chart-padding: ok');
