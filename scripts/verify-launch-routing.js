const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function main() {
  const appJson = readJson('app.json');
  const appJs = read('app.js');
  const launchJs = read('pages/launch/launch.js');
  const launchWxml = read('pages/launch/launch.wxml');
  const launchWxss = read('pages/launch/launch.wxss');
  const launchJson = readJson('pages/launch/launch.json');

  assert.strictEqual(
    appJson.pages[0],
    'pages/launch/launch',
    'app.json should use pages/launch/launch as the default entry page',
  );

  assert.strictEqual(
    launchJson.navigationStyle,
    'custom',
    'launch page should use custom navigation style',
  );

  assert.match(
    launchWxml,
    /class="launch-page__container"|class="container"/,
    'launch page should render a dedicated loading container',
  );

  assert.match(
    launchWxml,
    /加载中|loading/i,
    'launch page should show a visible loading state',
  );

  assert.match(
    launchWxss,
    /display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/i,
    'launch page should vertically center its loading content',
  );

  assert.match(
    launchJs,
    /Page\(\{\s*onLoad\(\)\s*\{\s*\},?\s*\}\);?/,
    'launch page should stay passive and let app.js drive post-login routing',
  );

  assert.match(
    appJs,
    /const LAUNCH_ROUTE = 'pages\/launch\/launch';[\s\S]*const LAUNCH_URL = '\/pages\/launch\/launch';/,
    'app.js should declare launch route constants',
  );

  assert.match(
    appJs,
    /currentRoute !== 'pages\/data\/data'/,
    'routeToProfileSelectorIfNeeded should allow the data tab through routing checks',
  );
  assert.match(
    appJs,
    /currentRoute !== 'pages\/profile-home\/profile-home'/,
    'routeToProfileSelectorIfNeeded should allow the profile-home tab through routing checks',
  );
  assert.match(
    appJs,
    /currentRoute !== LAUNCH_ROUTE/,
    'routeToProfileSelectorIfNeeded should allow the launch page through routing checks',
  );
  assert.match(
    appJs,
    /currentRoute !== PROFILE_SELECTOR_ROUTE/,
    'routeToProfileSelectorIfNeeded should allow the profile-selector page through routing checks',
  );

  assert.match(
    appJs,
    /const nextState = await this\.login\(\);\s*const wentToSelector = this\.routeToProfileSelectorIfNeeded\(nextState\);[\s\S]*if \(!wentToSelector\) \{[\s\S]*const currentRoute = getCurrentRoute\(\);[\s\S]*currentRoute === LAUNCH_ROUTE[\s\S]*wx\.switchTab\(\{\s*url:\s*'\/pages\/data\/data'/,
    'app.js should leave launch by switching to the data tab when login completes without requiring profile-selector',
  );

  console.log('verify-launch-routing: ok');
}

main();
