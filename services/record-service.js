const { call } = require('./request');
const { store } = require('../store/index');

const recordCache = new Map();

function recordSignature(record) {
  if (!record) {
    return 'null';
  }

  const payload = record.payload || {};
  return [
    record._id,
    record.profileId,
    record.measuredAt && String(record.measuredAt),
    payload.systolic,
    payload.diastolic,
    payload.heartRate || '',
    record.note || '',
    record.updatedAt && String(record.updatedAt),
  ].join('|');
}

function recordsSignature(records) {
  return (records || []).map((record) => recordSignature(record)).join('||');
}

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
  store.invalidateRecords(profileId);
  store.setCachedLatestRecord(profileId, result.record);

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
  return fetchRecords(profileId, options);
}

/**
 * Fetches records directly from cloud functions without reading cache.
 *
 * @param {string} profileId
 * @param {{ limit?: number, since?: number|string, until?: number|string }} [options={}]
 * @returns {Promise<{ records: Object[], hasMore: boolean }>}
 */
async function fetchRecords(profileId, options = {}) {
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
  if ((options.limit || 200) === 1 && !options.since && !options.until) {
    store.setCachedLatestRecord(profileId, records[0] || null);
  } else {
    store.setCachedRecords(profileId, records);
  }

  return {
    records,
    hasMore: result.hasMore === true,
  };
}

/**
 * Fetches the latest blood pressure record directly.
 *
 * @param {string} profileId
 * @returns {Promise<{ record: Object|null }>}
 */
async function fetchLatestRecord(profileId) {
  const result = await fetchRecords(profileId, { limit: 1 });
  return {
    record: result.records[0] || null,
  };
}

/**
 * Loads records with stale-while-revalidate semantics.
 *
 * @param {string} profileId
 * @param {{ limit?: number, since?: number|string, until?: number|string }} [options={}]
 * @param {{ onCacheHit?: Function, onFresh?: Function, onError?: Function }} [callbacks={}]
 * @returns {Promise<{ records: Object[], hasMore: boolean }|null>}
 */
async function loadRecords(profileId, options = {}, callbacks = {}) {
  const cachedRecords = store.getCachedRecords(profileId);
  const hasCache = store.hasCachedRecords(profileId);
  const cachedSignature = hasCache ? recordsSignature(cachedRecords) : '';

  if (hasCache && callbacks.onCacheHit) {
    callbacks.onCacheHit({ records: cachedRecords || [], hasMore: false, fromCache: true });
  }

  try {
    const fresh = await fetchRecords(profileId, options);
    if (!hasCache || recordsSignature(fresh.records) !== cachedSignature) {
      if (callbacks.onFresh) {
        callbacks.onFresh(Object.assign({}, fresh, { fromCache: false }));
      }
    }
    return fresh;
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error, { hasCache });
    }
    return null;
  }
}

/**
 * Loads the latest record with stale-while-revalidate semantics.
 *
 * @param {string} profileId
 * @param {{ onCacheHit?: Function, onFresh?: Function, onError?: Function }} [callbacks={}]
 * @returns {Promise<{ record: Object|null }|null>}
 */
async function loadLatestRecord(profileId, callbacks = {}) {
  const cachedRecord = store.getCachedLatestRecord(profileId);
  const hasCache = store.hasCachedLatestRecord(profileId);
  const cachedSignature = hasCache ? recordSignature(cachedRecord) : '';

  if (hasCache && callbacks.onCacheHit) {
    callbacks.onCacheHit({ record: cachedRecord, fromCache: true });
  }

  try {
    const fresh = await fetchLatestRecord(profileId);
    if (!hasCache || recordSignature(fresh.record) !== cachedSignature) {
      if (callbacks.onFresh) {
        callbacks.onFresh(Object.assign({}, fresh, { fromCache: false }));
      }
    }
    return fresh;
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error, { hasCache });
    }
    return null;
  }
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
  if (options.profileId) {
    const cachedRecords = store.getCachedRecords(options.profileId);
    const cachedRecord = (cachedRecords || []).find((record) => record && record._id === recordId);
    if (cachedRecord) {
      return cachedRecord;
    }
  }

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
  if (result.record && result.record.profileId) {
    store.invalidateRecords(result.record.profileId);
  }

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
async function deleteRecord(recordId, options = {}) {
  const cachedRecord = getCachedRecord(recordId);
  const profileId = options.profileId || (cachedRecord && cachedRecord.profileId);
  await call('deleteRecord', { recordId }, { silent: true });
  recordCache.delete(recordId);
  if (profileId) {
    store.invalidateRecords(profileId);
  }

  return { success: true };
}

module.exports = {
  setCachedRecord,
  getCachedRecord,
  saveRecord,
  fetchRecords,
  fetchLatestRecord,
  getRecords,
  loadRecords,
  loadLatestRecord,
  getRecord,
  updateRecord,
  deleteRecord,
};
