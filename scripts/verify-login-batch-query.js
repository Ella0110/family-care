require('./_helpers/ensure-cloudfunctions-built');

const assert = require('assert');

const { createCloudFunction } = require('../cloudfunctions/_shared/function');
const { createAuthService } = require('../cloudfunctions/_shared/auth');
const { createFakeRuntime, cloneValue } = require('./_helpers/fake-cloud');
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

function wrapProfilesQuery(query, metrics) {
  return {
    doc(id) {
      const ref = query.doc(id);
      return {
        get: async () => {
          metrics.profileDocGets += 1;
          return ref.get();
        },
        set: ref.set.bind(ref),
        update: ref.update.bind(ref),
        remove: ref.remove.bind(ref),
      };
    },
    where(whereQuery) {
      return wrapProfilesQuery(query.where(whereQuery), metrics);
    },
    orderBy(field, direction) {
      return wrapProfilesQuery(query.orderBy(field, direction), metrics);
    },
    limit(limitValue) {
      return wrapProfilesQuery(query.limit(limitValue), metrics);
    },
    async get() {
      const activeQuery = query.query;
      const idFilter = activeQuery && activeQuery._id;

      if (idFilter && idFilter.__op === 'in') {
        metrics.profileBatchGets += 1;
        metrics.lastProfileQuery = cloneValue(activeQuery);

        const collection = (query.store && query.store[query.collectionName]) || {};
        let docs = Object.values(collection).filter((document) => idFilter.value.includes(document._id));
        if (Object.prototype.hasOwnProperty.call(activeQuery, 'deletedAt')) {
          docs = docs.filter((document) => document.deletedAt === activeQuery.deletedAt);
        }
        if (typeof query.limitValue === 'number') {
          docs = docs.slice(0, query.limitValue);
        }

        return {
          data: docs.map((document) => cloneValue(document)),
        };
      }

      return query.get();
    },
    add: query.add.bind(query),
  };
}

function instrumentProfiles(runtime) {
  const metrics = {
    profileDocGets: 0,
    profileBatchGets: 0,
    lastProfileQuery: null,
  };
  const originalCollection = runtime.db.collection.bind(runtime.db);

  runtime.db.collection = (name) => {
    const query = originalCollection(name);
    if (name !== 'profiles') {
      return query;
    }
    return wrapProfilesQuery(query, metrics);
  };

  return metrics;
}

async function main() {
  const runtime = createFakeRuntime({
    openId: 'user_login_batch',
    seed: {
      profiles: [
        { _id: 'profile_a', name: '爸爸', deletedAt: null },
        { _id: 'profile_b', name: '妈妈', deletedAt: null },
        { _id: 'profile_deleted', name: '叔叔', deletedAt: new Date('2026-06-01T00:00:00.000Z') },
      ],
      relationships: [
        { _id: 'rel_a', userId: 'user_login_batch', profileId: 'profile_a', role: 'owner', permissions: {}, subscribeAlerts: false },
        { _id: 'rel_b', userId: 'user_login_batch', profileId: 'profile_b', role: 'viewer', permissions: {}, subscribeAlerts: false },
        { _id: 'rel_deleted', userId: 'user_login_batch', profileId: 'profile_deleted', role: 'viewer', permissions: {}, subscribeAlerts: false },
      ],
    },
  });
  const metrics = instrumentProfiles(runtime);
  const login = buildLogin(runtime);

  const result = await login({}, {});

  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(
    result.relationships.map((relationship) => relationship.profile.name),
    ['爸爸', '妈妈'],
  );
  assert.strictEqual(metrics.profileDocGets, 0, 'login should not query profiles via per-document doc().get() calls');
  assert.strictEqual(metrics.profileBatchGets, 1, 'login should query profiles in one batch');
  assert.deepStrictEqual(
    metrics.lastProfileQuery && metrics.lastProfileQuery._id && metrics.lastProfileQuery._id.value,
    ['profile_a', 'profile_b', 'profile_deleted'],
  );
  assert.strictEqual(
    metrics.lastProfileQuery && metrics.lastProfileQuery.deletedAt,
    null,
    'login should filter soft-deleted profiles with deletedAt: null',
  );

  console.log('[verify-login-batch-query] pass');
}

main().catch((error) => {
  console.error('[verify-login-batch-query] fail');
  console.error(error);
  process.exitCode = 1;
});
