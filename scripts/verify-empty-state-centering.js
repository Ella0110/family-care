const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const dataWxss = read('pages/data/data.wxss');
const profileHomeWxss = read('pages/profile-home/profile-home.wxss');
const profileEmptyGuideWxss = read('components/profile-empty-guide/profile-empty-guide.wxss');
const medicationWxss = read('pages/medication-edit/medication-edit.wxss');

assert.match(
  dataWxss,
  /\.data-empty\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*min-height:\s*calc\(100vh\s*-\s*200rpx\s*-\s*env\(safe-area-inset-bottom\)\);/i,
  'data empty state should use the same centered viewport height as profile-home',
);

assert.match(
  profileHomeWxss,
  /\.profile-home__empty\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*min-height:\s*calc\(100vh\s*-\s*200rpx\s*-\s*env\(safe-area-inset-bottom\)\);/i,
  'profile-home empty state should vertically center the profile-empty-guide card in the available viewport',
);

assert.match(
  profileEmptyGuideWxss,
  /\.profile-empty-guide\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*inherit;[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/i,
  'profile-empty-guide component should fill the empty-state container and center its card',
);

assert.match(
  medicationWxss,
  /\.medication-list-page\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*box-sizing:\s*border-box;/i,
  'medication page root should use a column flex layout so the empty card can center vertically',
);

assert.match(
  medicationWxss,
  /\.medication-empty\s*\{[\s\S]*margin-top:\s*auto;[\s\S]*margin-bottom:\s*auto;/i,
  'medication empty state card should use auto margins to center vertically',
);

assert.match(
  medicationWxss,
  /\.medication-empty\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*620rpx;[\s\S]*align-self:\s*center;/i,
  'medication empty state card should keep horizontal breathing room like the profile empty guide card',
);

console.log('verify-empty-state-centering: ok');
