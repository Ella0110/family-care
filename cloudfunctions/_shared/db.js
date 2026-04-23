let cloud = null;
let db = null;
let command = null;

try {
  // `wx-server-sdk` exists in cloud runtime. Local verification scripts inject their own db/cloud deps.
  // This fallback keeps Node-only verification runnable without forcing dependency installation first.
  cloud = require('wx-server-sdk');
  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
  });
  db = cloud.database();
  command = db.command;
} catch (error) {
  cloud = {
    getWXContext() {
      throw new Error('wx-server-sdk is unavailable in the current environment');
    },
  };
  db = {
    collection() {
      throw new Error('cloud database is unavailable in the current environment');
    },
    startTransaction() {
      throw new Error('cloud database transaction is unavailable in the current environment');
    },
  };
  command = {
    gte(value) {
      return { __op: 'gte', value };
    },
    lte(value) {
      return { __op: 'lte', value };
    },
    and(value) {
      return { __op: 'and', value };
    },
  };
}

const COLLECTIONS = Object.freeze({
  USERS: 'users',
  PROFILES: 'profiles',
  RELATIONSHIPS: 'relationships',
  RECORDS: 'records',
  MEDICATIONS: 'medications',
  INVITATIONS: 'invitations',
});

module.exports = {
  cloud,
  db,
  command,
  COLLECTIONS,
};
