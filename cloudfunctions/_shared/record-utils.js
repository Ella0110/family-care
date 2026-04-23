const { invalidArgument, notImplemented } = require('./errors');
const {
  assertPlainObject,
  normalizeNullableString,
  normalizeNumberInRange,
} = require('./validation');

const SUPPORTED_PERIODS = ['morning', 'evening'];

/**
 * T1 only implements bp. glucose is reserved and must return NOT_IMPLEMENTED.
 *
 * @param {unknown} type
 * @returns {'bp'}
 */
function normalizeRecordType(type) {
  if (type === undefined || type === null || type === '') {
    return 'bp';
  }

  if (type === 'bp') {
    return 'bp';
  }

  if (type === 'glucose') {
    throw notImplemented('glucose recording is planned but not yet implemented');
  }

  throw invalidArgument('type must be one of: bp, glucose');
}

/**
 * @param {unknown} period
 * @returns {'morning'|'evening'|null}
 */
function normalizePeriod(period) {
  if (period === undefined || period === null || period === '') {
    return null;
  }

  if (!SUPPORTED_PERIODS.includes(period)) {
    throw invalidArgument(`period must be one of: ${SUPPORTED_PERIODS.join(', ')}`);
  }

  return period;
}

/**
 * @param {unknown} payload
 * @returns {{ systolic: number, diastolic: number, heartRate?: number }}
 */
function normalizeBpPayload(payload) {
  const nextPayload = assertPlainObject(payload, 'payload');
  const normalized = {
    systolic: normalizeNumberInRange(nextPayload.systolic, 'payload.systolic', {
      min: 60,
      max: 300,
      integer: true,
    }),
    diastolic: normalizeNumberInRange(nextPayload.diastolic, 'payload.diastolic', {
      min: 30,
      max: 200,
      integer: true,
    }),
  };

  if (nextPayload.heartRate !== undefined && nextPayload.heartRate !== null && nextPayload.heartRate !== '') {
    normalized.heartRate = normalizeNumberInRange(nextPayload.heartRate, 'payload.heartRate', {
      min: 30,
      max: 250,
      integer: true,
    });
  }

  return normalized;
}

/**
 * @param {unknown} note
 * @returns {string|null}
 */
function normalizeRecordNote(note) {
  return normalizeNullableString(note, 'note');
}

/**
 * @param {unknown} patch
 * @param {unknown} parseDateInput
 * @returns {Object}
 */
function normalizeRecordPatch(patch, parseDateInput) {
  const nextPatch = assertPlainObject(patch, 'patch');
  const allowedKeys = ['measuredAt', 'payload', 'period', 'note'];
  const unsupportedKeys = Object.keys(nextPatch).filter((key) => !allowedKeys.includes(key));

  if (unsupportedKeys.length > 0) {
    throw invalidArgument(`patch contains unsupported keys: ${unsupportedKeys.join(', ')}`);
  }

  if (Object.keys(nextPatch).length === 0) {
    throw invalidArgument('patch must contain at least one editable field');
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(nextPatch, 'measuredAt')) {
    normalized.measuredAt = parseDateInput(nextPatch.measuredAt, 'patch.measuredAt');
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'payload')) {
    normalized.payload = normalizeBpPayload(nextPatch.payload);
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'period')) {
    normalized.period = normalizePeriod(nextPatch.period);
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'note')) {
    normalized.note = normalizeRecordNote(nextPatch.note);
  }

  return normalized;
}

module.exports = {
  normalizeRecordType,
  normalizePeriod,
  normalizeBpPayload,
  normalizeRecordNote,
  normalizeRecordPatch,
};
