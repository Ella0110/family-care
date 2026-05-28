const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function main() {
  const wxml = read('pages/records-list/records-list.wxml');
  const wxss = read('pages/records-list/records-list.wxss');

  assert.match(
    wxml,
    /records-export-preview__title[\s\S]*records-export-preview__subtitle/,
    'export preview should expose a title and subtitle block aligned to the app shell',
  );

  assert.match(
    wxml,
    /records-export-preview__card/,
    'export preview should wrap the image inside a white preview card',
  );

  assert.match(
    wxss,
    /\.records-export-preview[\s\S]*background:\s*#eef3fb;/i,
    'export preview shell should use the shared light-blue background',
  );

  assert.match(
    wxss,
    /\.records-export-preview__card[\s\S]*border-radius:\s*32rpx;[\s\S]*background:\s*#ffffff;/i,
    'export preview image should sit inside a rounded white card',
  );

  assert.match(
    wxss,
    /\.records-export-preview__button--primary[\s\S]*background:\s*#3478f6;/i,
    'export preview primary button should align to the standard blue CTA',
  );

  assert.match(
    wxss,
    /\.records-export-preview__button--secondary[\s\S]*background:\s*#ffffff;[\s\S]*color:\s*#64748b;/i,
    'export preview secondary button should use the quieter white secondary style',
  );
  assert.match(
    wxss,
    /\.records-export-preview__button[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*center;[\s\S]*align-items:\s*center;/i,
    'export preview buttons should center their text horizontally and vertically',
  );

  console.log('verify-c4-export-preview-shell: ok');
}

main();
