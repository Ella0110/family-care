const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function assertIncludes(content, fragment, message) {
  assert.ok(content.includes(fragment), message);
}

const fontScaleUtil = read('utils/font-scale.js');
[
  'FONT_SIZES_RPX',
  'function getScaleIndex(scale)',
  'function getFontSizes(scale)',
  'function getCurrentFontScale()',
  'function syncFontData()',
].forEach((fragment) => {
  assertIncludes(fontScaleUtil, fragment, `utils/font-scale.js should include ${fragment}`);
});

const appWxss = read('app.wxss');
assert.ok(!appWxss.includes('--fs-'), 'app.wxss should remove the old --fs-* variables');
assert.ok(!appWxss.includes('--font-scale'), 'app.wxss should remove the old --font-scale variable');
assert.ok(!appWxss.includes('--font-sm'), 'app.wxss should remove the old --font-* variables');

[
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
  'components/profile-empty-guide/profile-empty-guide',
  'components/profile-switcher/profile-switcher',
  'components/record-panel/record-panel',
  'components/profile-edit-panel/profile-edit-panel',
  'components/member-panel/member-panel',
  'components/bp-input/bp-input',
  'components/bp-status-tag/bp-status-tag',
  'components/medication-item/medication-item',
  'components/empty-state/empty-state',
  'custom-tab-bar/index',
].forEach((basePath) => {
  const wxml = read(`${basePath}.wxml`);
  const wxss = read(`${basePath}.wxss`);

  assert.ok(!wxml.includes('--font-scale'), `${basePath}.wxml should not pass --font-scale`);
  assert.ok(/font-size:\{\{fs\./.test(wxml), `${basePath}.wxml should bind fs sizes inline`);
  assert.ok(!wxss.includes('var(--fs-'), `${basePath}.wxss should not depend on --fs-* variables`);
  assert.ok(!wxss.includes('var(--font-scale)'), `${basePath}.wxss should not depend on --font-scale`);
});

[
  'components/record-panel/record-panel.js',
  'components/profile-edit-panel/profile-edit-panel.js',
  'components/member-panel/member-panel.js',
  'components/profile-switcher/profile-switcher.js',
].forEach((relativePath) => {
  const js = read(relativePath);
  assert.match(
    js,
    /show\(visible\)\s*\{[\s\S]*(if\s*\(visible\)[\s\S]*syncFontData\.call\(this\);|if\s*\(!visible\)[\s\S]*return;[\s\S]*syncFontData\.call\(this\);)/,
    `${relativePath} should resync font sizes when reopened on the same page`,
  );
});

console.log('verify-h1-font-scale-styles: ok');
