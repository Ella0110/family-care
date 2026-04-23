require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime } = require('./_helpers/fake-cloud');
const { createLoginHandler } = require('../cloudfunctions/login/handler');

function buildLogin(runtime) {
  const auth = createAuthService({ db: runtime.db, cloud: runtime.cloud });
  return createCloudFunction(
    createLoginHandler({
      db: runtime.db,
      cloud: runtime.cloud,
      auth,
      now: runtime.now,
    }),
  );
}

async function main() {
  const runtime = createFakeRuntime({ openId: 'user_login' });
  const login = buildLogin(runtime);

  const firstResult = await login({}, {});
  assert.strictEqual(firstResult.success, true);
  assert.strictEqual(firstResult.user._id, 'user_login');
  assert.deepStrictEqual(firstResult.relationships, []);

  const secondResult = await login({}, {});
  assert.strictEqual(secondResult.success, true);
  assert.strictEqual(secondResult.user._id, 'user_login');
  assert.strictEqual(secondResult.relationships.length, 0);

  console.log('[verify-login] pass');
  console.log(
    JSON.stringify(
      {
        userId: secondResult.user._id,
        relationshipCount: secondResult.relationships.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[verify-login] fail');
  console.error(error);
  process.exitCode = 1;
});
