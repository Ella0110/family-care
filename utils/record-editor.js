const recordService = require('../services/record-service');

const MIN_MEASURED_AT_MS = 946684800000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const PAGE_RECORD_LIMITS = {
  systolic: { min: 60, max: 300 },
  diastolic: { min: 30, max: 200 },
  heartRate: { min: 30, max: 250 },
};

const PANEL_RECORD_LIMITS = {
  systolic: { min: 40, max: 300 },
  diastolic: { min: 20, max: 200 },
  heartRate: { min: 20, max: 300 },
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (!/^\d+$/.test(String(value))) {
    return Number.NaN;
  }

  return Number(value);
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    if (value.$date) {
      return new Date(value.$date);
    }

    if (value._date) {
      return new Date(value._date);
    }
  }

  return new Date(value);
}

function parseMeasuredAt(dateValue, timeValue) {
  const dateParts = String(dateValue || '').split('-').map(Number);
  const timeParts = String(timeValue || '').split(':').map(Number);

  if (dateParts.length !== 3 || timeParts.length !== 2) {
    return new Date(Number.NaN);
  }

  return new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0],
    timeParts[1],
    0,
    0,
  );
}

function getNowParts(now = new Date()) {
  const maxDate = new Date(now.getTime() + MAX_FUTURE_SKEW_MS);

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    minDate: '2000-01-01',
    maxDate: `${maxDate.getFullYear()}-${pad(maxDate.getMonth() + 1)}-${pad(maxDate.getDate())}`,
  };
}

function getDateTimeParts(value) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return getNowParts();
  }

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function validateRecordForm(options = {}) {
  const profileId = options.profileId || '';
  const form = options.form || {};
  const limits = options.limits || PAGE_RECORD_LIMITS;
  const systolic = parseInteger(form.systolic);
  const diastolic = parseInteger(form.diastolic);
  const heartRate = parseInteger(form.heartRate);
  const measuredAt = parseMeasuredAt(form.measuredDate, form.measuredTime);
  const maxMeasuredAt = Date.now() + MAX_FUTURE_SKEW_MS;

  if (!profileId) {
    return '档案不存在';
  }

  if (
    !Number.isInteger(systolic)
    || systolic < limits.systolic.min
    || systolic > limits.systolic.max
  ) {
    return `收缩压需为 ${limits.systolic.min}-${limits.systolic.max} 之间的整数`;
  }

  if (
    !Number.isInteger(diastolic)
    || diastolic < limits.diastolic.min
    || diastolic > limits.diastolic.max
  ) {
    return `舒张压需为 ${limits.diastolic.min}-${limits.diastolic.max} 之间的整数`;
  }

  if (systolic <= diastolic) {
    return '收缩压必须高于舒张压';
  }

  if (
    form.heartRate !== ''
    && form.heartRate !== null
    && form.heartRate !== undefined
    && (
      !Number.isInteger(heartRate)
      || heartRate < limits.heartRate.min
      || heartRate > limits.heartRate.max
    )
  ) {
    return `心率需为 ${limits.heartRate.min}-${limits.heartRate.max} 之间的整数`;
  }

  if (Number.isNaN(measuredAt.getTime())) {
    return '请选择有效的测量时间';
  }

  if (measuredAt.getTime() < MIN_MEASURED_AT_MS) {
    return '测量时间不能早于 2000 年';
  }

  if (measuredAt.getTime() > maxMeasuredAt) {
    return '测量时间不能是未来时间';
  }

  return '';
}

function buildRecordSaveData(form = {}) {
  const payload = {
    systolic: parseInteger(form.systolic),
    diastolic: parseInteger(form.diastolic),
  };
  const heartRate = parseInteger(form.heartRate);

  if (Number.isInteger(heartRate)) {
    payload.heartRate = heartRate;
  }

  return {
    payload,
    measuredAt: parseMeasuredAt(form.measuredDate, form.measuredTime).getTime(),
    note: String(form.note || '').trim(),
  };
}

function buildRecordUpdatePatch(form = {}) {
  const data = buildRecordSaveData(form);

  return {
    measuredAt: data.measuredAt,
    payload: data.payload,
    note: data.note || null,
  };
}

async function saveRecordFromForm(profileId, form) {
  const data = buildRecordSaveData(form);
  const result = await recordService.saveRecord(
    profileId,
    data.payload,
    data.measuredAt,
    null,
  );

  return {
    data,
    result,
  };
}

async function updateRecordFromForm(recordId, form) {
  const patch = buildRecordUpdatePatch(form);
  const result = await recordService.updateRecord(recordId, patch);

  return {
    patch,
    result,
  };
}

async function deleteRecordById(recordId, profileId) {
  return recordService.deleteRecord(recordId, { profileId });
}

module.exports = {
  PAGE_RECORD_LIMITS,
  PANEL_RECORD_LIMITS,
  MAX_FUTURE_SKEW_MS,
  MIN_MEASURED_AT_MS,
  pad,
  parseInteger,
  parseMeasuredAt,
  toDate,
  getNowParts,
  getDateTimeParts,
  validateRecordForm,
  buildRecordSaveData,
  buildRecordUpdatePatch,
  saveRecordFromForm,
  updateRecordFromForm,
  deleteRecordById,
};
