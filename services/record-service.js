const { call } = require('./request');

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

  return {
    records: Array.isArray(result.records) ? result.records : [],
    hasMore: result.hasMore === true,
  };
}

module.exports = {
  saveRecord,
  getRecords,
};
