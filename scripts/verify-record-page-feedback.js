const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const recordWxss = read('pages/record/record.wxss');

assert.match(
  recordWxss,
  /\.record-feedback-layer__mask,\s*\.record-dialog-layer__mask[\s\S]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.9\)/,
  'record page toast and dialog masks should use a unified dark overlay',
);

