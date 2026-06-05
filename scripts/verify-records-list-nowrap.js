const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const wxml = read('pages/records-list/records-list.wxml');
const wxss = read('pages/records-list/records-list.wxss');

assert.match(
  wxml,
  /class="records-row__value"/,
  'records-list should render a dedicated blood-pressure value element',
);

assert.match(
  wxss,
  /\.records-row__value\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*flex-shrink:\s*0;/,
  'records-list blood-pressure values should stay on one line in large font sizes',
);

console.log('verify-records-list-nowrap: ok');
