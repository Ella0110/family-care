const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function main() {
  const profileHomeJs = read('pages/profile-home/profile-home.js');
  const profileMembersJs = read('pages/profile-members/profile-members.js');
  const userProfileEditJs = read('pages/user-profile-edit/user-profile-edit.js');
  const appJs = read('app.js');

  assert.match(
    profileHomeJs,
    /memberListDirty/,
    'profile-home should react to the memberListDirty app flag',
  );

  assert.match(
    profileHomeJs,
    /console\.log\([\s\S]*memberListDirty|membersStale/,
    'profile-home should log member refresh decisions while debugging this avatar issue',
  );

  assert.match(
    userProfileEditJs,
    /console\.log\(['"]clearRefresh members called['"]\)/,
    'saving nickname or avatar should log the member refresh invalidation step',
  );

  assert.match(
    userProfileEditJs,
    /app\.globalData\.memberListDirty = true/,
    'saving nickname or avatar should mark the member list dirty in app global state',
  );

  assert.match(
    appJs,
    /memberListDirty:\s*false/,
    'app globalData should initialize the memberListDirty flag',
  );

  assert.match(
    profileMembersJs,
    /memberListDirty/,
    'profile-members should also respect the memberListDirty flag on show',
  );

  console.log('verify-c3-member-avatar-refresh: ok');
}

main();
