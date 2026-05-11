const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const panelJs = read('components/record-panel/record-panel.js');
const panelWxml = read('components/record-panel/record-panel.wxml');
const dataWxml = read('pages/data/data.wxml');

assert.match(panelJs, /editRecord/, 'record-panel should support editRecord property');
assert.match(panelJs, /activeField/, 'record-panel should track the active keypad field');
assert.match(panelJs, /handleDigitTap/, 'record-panel should handle keypad digit taps');
assert.match(panelJs, /handleBackspaceTap/, 'record-panel should handle keypad backspace');
assert.match(panelJs, /handleClearTap/, 'record-panel should handle keypad clear');
assert.match(panelJs, /return 'error'/, 'record-panel should reject out-of-range 3-digit values before auto-advance');
assert.match(panelJs, /label:\s*'清除'/, 'record-panel should define a clear keypad key');
assert.match(panelJs, /label:\s*'⌫'/, 'record-panel should define a backspace keypad key');

assert.match(panelWxml, /收缩压/, 'record-panel should render a systolic label');
assert.match(panelWxml, /舒张压/, 'record-panel should render a diastolic label');
assert.match(panelWxml, /心率/, 'record-panel should render a heart-rate label');
assert.doesNotMatch(panelWxml, /<input[\s\S]*高压|<input[\s\S]*低压|<input[\s\S]*心率/, 'record-panel should not use native numeric inputs for pressure values');
assert.doesNotMatch(panelWxml, /is-alert/, 'record-panel should not apply realtime alert styling while typing');

assert.match(dataWxml, /edit-record="\{\{editingRecord\}\}"/, 'data page should pass editingRecord through edit-record binding');
