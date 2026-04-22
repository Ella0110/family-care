const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const COLLECTIONS = Object.freeze({
  USERS: 'users',
  PROFILES: 'profiles',
  RELATIONSHIPS: 'relationships',
  RECORDS: 'records',
  MEDICATIONS: 'medications',
  INVITATIONS: 'invitations',
});

const db = cloud.database();

module.exports = {
  cloud,
  db,
  COLLECTIONS,
};
