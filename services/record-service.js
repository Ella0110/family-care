const { call } = require('./request');

const recordCache = new Map();

function setCachedRecord(record) {
  if (record && record._id) {
    recordCache.set(record._id, record);
  }
}

function getCachedRecord(recordId) {
  return recordCache.get(recordId) || null;
}

/**
 * Saves a blood pressure record.
 *
 * @param {string} profileId
 * @param {{ systolic: number, diastolic: number, heartRate?: number }} payload
 * @param {number|string} measuredAt
 * @param {string} [note]
 * @returns {Promise<{ record: Object, alertTriggered: boolean, alertSentTo: string[] }>}
 */
async function saveRecord(profileId, payload, measuredAt, note) {
  const data = {
    profileId,
    type: 'bp',
    measuredAt,
    payload,
  };

  if (note) {
    data.note = note;
  }

  const result = await call('saveRecord', data, { silent: true });
  setCachedRecord(result.record);

  return {
    record: result.record,
    alertTriggered: result.alertTriggered === true,
    alertSentTo: Array.isArray(result.alertSentTo) ? result.alertSentTo : [],
  };
}

/**
 * Loads blood pressure records for a profile.
 *
 * @param {string} profileId
 * @param {{ limit?: number, since?: number|string, until?: number|string }} [options={}]
 * @returns {Promise<{ records: Object[], hasMore: boolean }>}
 */
async function getRecords(profileId, options = {}) {
  const data = {
    profileId,
    type: 'bp',
    limit: options.limit || 200,
  };

  if (options.since) {
    data.since = options.since;
  }
  if (options.until) {
    data.until = options.until;
  }

  const result = await call('getRecords', data, { silent: true });
  const records = Array.isArray(result.records) ? result.records : [];

  records.forEach((record) => setCachedRecord(record));

  return {
    records,
    hasMore: result.hasMore === true,
  };
}

/**
 * Resolves a record for edit mode. It prefers the in-memory cache populated by
 * records-list navigation and falls back to filtering getRecords when opened directly.
 *
 * @param {string} recordId
 * @param {{ profileId?: string }} [options={}]
 * @returns {Promise<Object|null>}
 */
async function getRecord(recordId, options = {}) {
  const cachedRecord = getCachedRecord(recordId);
  if (cachedRecord) {
    return cachedRecord;
  }

  if (!options.profileId) {
    return null;
  }

  const result = await getRecords(options.profileId, { limit: 200 });
  return result.records.find((record) => record && record._id === recordId) || null;
}

/**
 * Updates a blood pressure record.
 *
 * @param {string} recordId
 * @param {{ measuredAt?: number|string, payload?: Object, period?: string, note?: string|null }} patch
 * @returns {Promise<{ record: Object }>}
 */
async function updateRecord(recordId, patch) {
  const result = await call('updateRecord', { recordId, patch }, { silent: true });
  setCachedRecord(result.record);

  return {
    record: result.record,
  };
}

/**
 * Soft-deletes a blood pressure record.
 *
 * @param {string} recordId
 * @returns {Promise<{ success: boolean }>}
 */
async function deleteRecord(recordId) {
  await call('deleteRecord', { recordId }, { silent: true });
  recordCache.delete(recordId);

  return { success: true };
}

module.exports = {
  setCachedRecord,
  getCachedRecord,
  saveRecord,
  getRecords,
  getRecord,
  updateRecord,
  deleteRecord,
};
