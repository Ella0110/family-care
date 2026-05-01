require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');
const { createUpdateUserSettingsHandler } = require('../cloudfunctions/updateUserSettings/handler');
const {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_OPTIONS,
  FONT_SCALE_STORAGE_KEY,
  buildFontScaleStyle,
  isValidFontScale,
  resolveFontScaleSync,
} = require('../utils/font-scale');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function buildFunction(factory, runtime, extra = {}) {
  const auth = createAuthService({ db: runtime.db, cloud: runtime.cloud });
  return createCloudFunction(
    factory(
      Object.assign(
        {
          db: runtime.db,
          cloud: runtime.cloud,
          command: runtime.command,
          auth,
          now: runtime.now,
        },
        extra,
      ),
    ),
  );
}

async function verifyCloudHandler() {
  const runtime = createFakeRuntime({
    openId: 'user_owner',
    now: () => new Date('2026-05-01T08:00:00.000Z'),
  });
  const login = buildFunction(createLoginHandler, runtime);
  const updateUserSettings = buildFunction(createUpdateUserSettingsHandler, runtime);

  await login({}, {});

  const updated = await updateUserSettings({
    patch: {
      fontScale: 1.15,
      theme: 'calm-blue',
    },
  }, {});
  assert.strictEqual(updated.success, true);
  assert.strictEqual(updated.user.settings.fontScale, 1.15);
  assert.strictEqual(updated.user.settings.theme, 'calm-blue');

  const invalidScale = await updateUserSettings({
    patch: { fontScale: 1.2 },
  }, {});
  assert.strictEqual(invalidScale.success, false);
  assert.strictEqual(invalidScale.code, 'INVALID_ARGUMENT');

  const invalidProtectedField = await updateUserSettings({
    patch: { _id: 'hack' },
  }, {});
  assert.strictEqual(invalidProtectedField.success, false);
  assert.strictEqual(invalidProtectedField.code, 'INVALID_ARGUMENT');
}

function verifyFontScaleLogic() {
  assert.deepStrictEqual(FONT_SCALE_OPTIONS, [1.0, 1.15, 1.3]);
  assert.strictEqual(DEFAULT_FONT_SCALE, 1.0);
  assert.strictEqual(FONT_SCALE_STORAGE_KEY, 'fontScale');
  assert.strictEqual(isValidFontScale(1.15), true);
  assert.strictEqual(isValidFontScale(1.2), false);
  assert.strictEqual(buildFontScaleStyle(1.3), '--font-scale: 1.3;');

  assert.deepStrictEqual(resolveFontScaleSync({
    localFontScale: null,
    remoteFontScale: null,
  }), {
    fontScale: 1.0,
    shouldPersistLocal: false,
    shouldSyncRemote: false,
  });

  assert.deepStrictEqual(resolveFontScaleSync({
    localFontScale: 1.15,
    remoteFontScale: null,
  }), {
    fontScale: 1.15,
    shouldPersistLocal: false,
    shouldSyncRemote: true,
  });

  assert.deepStrictEqual(resolveFontScaleSync({
    localFontScale: null,
    remoteFontScale: 1.3,
  }), {
    fontScale: 1.3,
    shouldPersistLocal: true,
    shouldSyncRemote: false,
  });

  assert.deepStrictEqual(resolveFontScaleSync({
    localFontScale: 1.0,
    remoteFontScale: 1.3,
  }), {
    fontScale: 1.3,
    shouldPersistLocal: true,
    shouldSyncRemote: false,
  });
}

function verifyServiceContract() {
  const requestPath = path.resolve(root, 'services/request.js');
  const userServicePath = path.resolve(root, 'services/user-service.js');
  delete require.cache[requestPath];
  delete require.cache[userServicePath];

  let captured = null;
  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      async call(name, data) {
        captured = { name, data };
        return {
          user: {
            _id: 'user_owner',
            settings: {
              fontScale: data.patch.fontScale,
              theme: data.patch.theme || null,
            },
          },
        };
      },
    },
  };

  const userService = require('../services/user-service');
  return userService.updateSettings({
    fontScale: 1.15,
    theme: 'calm-blue',
  }).then((result) => {
    assert.deepStrictEqual(captured, {
      name: 'updateUserSettings',
      data: {
        patch: {
          fontScale: 1.15,
          theme: 'calm-blue',
        },
      },
    });
    assert.strictEqual(result.user.settings.fontScale, 1.15);
  });
}

function verifyViewBindingsAndWxss() {
  const targetWxmlFiles = [
    'pages/home/home.wxml',
    'pages/record/record.wxml',
    'pages/records-list/records-list.wxml',
    'pages/user-settings/user-settings.wxml',
  ];
  targetWxmlFiles.forEach((relativePath) => {
    assert.match(read(relativePath), /--font-scale:\s*\{\{fontScale\}\}/, `${relativePath} should bind fontScale style`);
  });

  const targetWxssFiles = [
    'pages/home/home.wxss',
    'pages/record/record.wxss',
    'pages/records-list/records-list.wxss',
    'pages/user-settings/user-settings.wxss',
    'components/bp-input/bp-input.wxss',
    'components/bp-status-tag/bp-status-tag.wxss',
    'components/medication-item/medication-item.wxss',
    'components/empty-state/empty-state.wxss',
  ];

  targetWxssFiles.forEach((relativePath) => {
    const content = read(relativePath);
    assert.doesNotMatch(content, /font-size:\s*\d+rpx;/, `${relativePath} should use font variables instead of fixed font-size`);
    assert.match(content, /var\(--font-/, `${relativePath} should reference font CSS variables`);
  });
}

async function main() {
  verifyFontScaleLogic();
  await verifyCloudHandler();
  await verifyServiceContract();
  verifyViewBindingsAndWxss();
  console.log('[verify-t3.3] pass');
}

main().catch((error) => {
  console.error('[verify-t3.3] fail');
  console.error(error);
  process.exitCode = 1;
});
