const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const PAGES = [
  'pages/data/data',
  'pages/records-list/records-list',
  'pages/profile-home/profile-home',
  'pages/report/report',
  'pages/profile-edit/profile-edit',
  'pages/profile-members/profile-members',
  'pages/medication-edit/medication-edit',
  'pages/medication-detail/medication-detail',
  'pages/invite-create/invite-create',
  'pages/invite-accept/invite-accept',
  'pages/import-records/import-records',
  'pages/user-profile-edit/user-profile-edit',
  'pages/user-settings/user-settings',
  'pages/profile-threshold-edit/profile-threshold-edit',
];

PAGES.forEach((pagePath) => {
  const js = read(`${pagePath}.js`);
  const wxml = read(`${pagePath}.wxml`);

  assert.match(js, /syncFontData/, `${pagePath} should import or use syncFontData`);

  assert.match(
    js,
    /fontScale:\s*DEFAULT_FONT_SCALE[\s\S]*fs:\s*\{\}/,
    `${pagePath} should initialize fontScale and fs in page data`,
  );

  assert.match(
    js,
    /onShow\(\) \{[\s\S]*(this\.syncFontScale\(\)|syncFontData\.call\(this\);)[\s\S]*\}/,
    `${pagePath} should refresh fontScale data in onShow`,
  );

  if (/syncFontScale\(\)/.test(js)) {
    assert.match(
      js,
      /syncFontScale\(\) \{[\s\S]*syncFontData\.call\(this\);[\s\S]*\}/,
      `${pagePath} should sync precomputed font sizes`,
    );
  } else {
    assert.match(
      js,
      /onShow\(\) \{[\s\S]*syncFontData\.call\(this\);[\s\S]*\}/,
      `${pagePath} should sync precomputed font sizes directly in onShow`,
    );
  }

  assert.doesNotMatch(
    wxml,
    /--font-scale/,
    `${pagePath} should not pass the old font-scale CSS variable`,
  );

  assert.match(
    wxml,
    /font-size:\{\{fs\./,
    `${pagePath} should bind precomputed font sizes inline`,
  );
});

console.log('verify-h1-font-scale-pages: ok');
