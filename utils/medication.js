const OTHER_OPTION = '其他';

const FREQUENCY_OPTIONS = ['每日一次', '每日两次', '每日三次', '每周一次', '按需', OTHER_OPTION];
const TIMING_OPTIONS = ['早餐前', '早餐后', '午餐前', '午餐后', '晚餐前', '晚餐后', '睡前', '空腹', OTHER_OPTION];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && value.$date) {
    return new Date(value.$date);
  }

  return new Date(value);
}

function getChinaDateString(value = new Date()) {
  const date = toDate(value);
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) {
    return '';
  }

  const chinaDate = new Date(timestamp + 8 * 60 * 60 * 1000);
  return [
    chinaDate.getUTCFullYear(),
    pad(chinaDate.getUTCMonth() + 1),
    pad(chinaDate.getUTCDate()),
  ].join('-');
}

function isHistoricalMedication(medication, todayInChina = getChinaDateString()) {
  return Boolean(medication && medication.endDate && medication.endDate <= todayInChina);
}

function sortMedicationsByCreatedAtDesc(medications) {
  return (Array.isArray(medications) ? medications.slice() : []).sort((left, right) => {
    const timestampDiff = toDate(right && right.createdAt).getTime() - toDate(left && left.createdAt).getTime();
    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    return String(right && right._id || '').localeCompare(String(left && left._id || ''));
  });
}

function normalizeMedicationGroups(groups = {}) {
  return {
    active: sortMedicationsByCreatedAtDesc(groups.active),
    historical: sortMedicationsByCreatedAtDesc(groups.historical),
  };
}

function upsertMedicationGroups(groups = {}, medication, todayInChina = getChinaDateString()) {
  const nextGroups = normalizeMedicationGroups(groups);
  const filteredActive = nextGroups.active.filter((item) => item && item._id !== medication._id);
  const filteredHistorical = nextGroups.historical.filter((item) => item && item._id !== medication._id);

  if (isHistoricalMedication(medication, todayInChina)) {
    filteredHistorical.push(medication);
  } else {
    filteredActive.push(medication);
  }

  return {
    active: sortMedicationsByCreatedAtDesc(filteredActive),
    historical: sortMedicationsByCreatedAtDesc(filteredHistorical),
  };
}

function removeMedicationFromGroups(groups = {}, medicationId) {
  const nextGroups = normalizeMedicationGroups(groups);

  return {
    active: nextGroups.active.filter((item) => item && item._id !== medicationId),
    historical: nextGroups.historical.filter((item) => item && item._id !== medicationId),
  };
}

function resolveMedicationOptionState(value, options) {
  const nextValue = String(value || '').trim();

  if (!nextValue) {
    return {
      selection: '',
      customValue: '',
      pickerIndex: -1,
    };
  }

  const pickerIndex = (options || []).indexOf(nextValue);

  if (pickerIndex >= 0) {
    return {
      selection: nextValue,
      customValue: '',
      pickerIndex,
    };
  }

  return {
    selection: OTHER_OPTION,
    customValue: nextValue,
    pickerIndex: (options || []).indexOf(OTHER_OPTION),
  };
}

module.exports = {
  OTHER_OPTION,
  FREQUENCY_OPTIONS,
  TIMING_OPTIONS,
  getChinaDateString,
  isHistoricalMedication,
  sortMedicationsByCreatedAtDesc,
  normalizeMedicationGroups,
  upsertMedicationGroups,
  removeMedicationFromGroups,
  resolveMedicationOptionState,
};
