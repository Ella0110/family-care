const { calculateAge, formatPhoneWithSpaces, getThreshold } = require('./profile-detail');

// 低血压阈值（硬编码，V1 不做用户可调）
const LOW_BP = {
  systolic: 90,
  diastolic: 60,
};

// 心率阈值（硬编码）
const HR_THRESHOLD = {
  high: 100,
  low: 50,
};

const REPORT_DISCLAIMER = '本报告仅供健康记录与就诊沟通参考，不作为诊断、治疗或用药依据。个体情况存在差异，请以医生诊疗结果及医嘱为准。';

function pad(value) {
  return String(value).padStart(2, '0');
}

function trimText(value) {
  return String(value || '').trim();
}

function toMeasuredDate(value) {
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

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatGeneratedAt(value) {
  const date = toMeasuredDate(value);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMonthDay(value) {
  const date = toMeasuredDate(value);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function formatMonthDayTime(value) {
  const date = toMeasuredDate(value);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getSinceForDays(days, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(startOfToday.getTime() - (Number(days) - 1) * 86400000);
}

function joinWithDot(parts) {
  return parts.filter(Boolean).join(' · ');
}

function joinMedicationNames(activeMedications) {
  const names = (Array.isArray(activeMedications) ? activeMedications : [])
    .slice(0, 3)
    .map((item) => trimText(item && item.drug))
    .filter(Boolean);

  return names.length ? names.join('、') : '暂无用药记录';
}

function normalizeReportRecords(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const payload = record && record.payload ? record.payload : {};
      const measuredAt = toMeasuredDate(record && record.measuredAt);
      const systolic = Number(payload.systolic);
      const diastolic = Number(payload.diastolic);
      const heartRate = payload.heartRate === '' || payload.heartRate === null || payload.heartRate === undefined
        ? null
        : Number(payload.heartRate);

      if (
        !record ||
        Number.isNaN(measuredAt.getTime()) ||
        !Number.isFinite(systolic) ||
        !Number.isFinite(diastolic)
      ) {
        return null;
      }

      return {
        _id: record._id,
        raw: record,
        measuredAt,
        label: formatMonthDay(measuredAt),
        systolic,
        diastolic,
        heartRate: Number.isFinite(heartRate) ? heartRate : null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());
}

function isHighRiskRecord(record) {
  return record.systolic >= 180 || record.diastolic >= 120;
}

function isHighRecord(record, threshold) {
  return record.systolic >= threshold.systolic || record.diastolic >= threshold.diastolic;
}

function isLowRecord(record) {
  return record.systolic < LOW_BP.systolic || record.diastolic < LOW_BP.diastolic;
}

function isBloodPressureAbnormal(record, threshold) {
  return isHighRecord(record, threshold) || isLowRecord(record);
}

function isHeartRateAbnormal(record) {
  if (!Number.isFinite(record.heartRate)) {
    return false;
  }

  return record.heartRate > HR_THRESHOLD.high || record.heartRate < HR_THRESHOLD.low;
}

function getAlertLabels(record, threshold) {
  const labels = [];

  if (isHighRiskRecord(record)) {
    labels.push('血压很高', '严重异常');
  } else if (isHighRecord(record, threshold)) {
    labels.push('血压偏高');
  }

  if (isLowRecord(record)) {
    labels.push('血压偏低');
  }

  if (Number.isFinite(record.heartRate) && record.heartRate > HR_THRESHOLD.high) {
    labels.push('心率偏快');
  }

  if (Number.isFinite(record.heartRate) && record.heartRate < HR_THRESHOLD.low) {
    labels.push('心率偏慢');
  }

  return labels;
}

function buildAlertBanner(records, threshold) {
  if ((records || []).some((record) => isHighRiskRecord(record))) {
    return {
      type: 'critical',
      title: '血压过高风险',
      text: '存在极高血压测量值，建议近期就医并遵医嘱调整用药。',
      pulse: true,
    };
  }

  if ((records || []).some((record) => isHighRecord(record, threshold))) {
    return {
      type: 'warning',
      title: '血压偏高提示',
      text: '部分测量值超出正常范围，建议持续监测。',
      pulse: false,
    };
  }

  if ((records || []).some((record) => isLowRecord(record))) {
    return {
      type: 'warning',
      title: '低血压提示',
      text: '存在血压偏低记录，注意避免体位性低血压引发跌倒。',
      pulse: false,
    };
  }

  return null;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function buildSummaryCards(records, threshold) {
  const systolicAverage = average(records.map((record) => record.systolic));
  const diastolicAverage = average(records.map((record) => record.diastolic));
  const bloodPressureAbnormalCount = records.filter((record) => isBloodPressureAbnormal(record, threshold)).length;
  const heartRateAbnormalCount = records.filter((record) => isHeartRateAbnormal(record)).length;

  return [
    {
      key: 'total',
      label: '测量总次数',
      value: String(records.length),
      unit: '次',
      accent: '',
      accentClassName: '',
    },
    {
      key: 'average',
      label: '血压均值',
      value: systolicAverage !== null && diastolicAverage !== null
        ? `${systolicAverage}/${diastolicAverage}`
        : '--',
      unit: 'mmHg',
      accent: '',
      accentClassName: '',
    },
    {
      key: 'bp-abnormal',
      label: '血压异常次数',
      value: String(bloodPressureAbnormalCount),
      unit: '次',
      accent: bloodPressureAbnormalCount > 0 ? 'danger' : '',
      accentClassName: bloodPressureAbnormalCount > 0 ? 'report-summary__value--danger' : '',
    },
    {
      key: 'hr-abnormal',
      label: '心率异常次数',
      value: String(heartRateAbnormalCount),
      unit: '次',
      accent: heartRateAbnormalCount > 0 ? 'warning' : '',
      accentClassName: heartRateAbnormalCount > 0 ? 'report-summary__value--warning' : '',
    },
  ];
}

function buildRecentAlerts(records, threshold) {
  return records
    .filter((record) => isBloodPressureAbnormal(record, threshold) || isHeartRateAbnormal(record))
    .slice()
    .sort((left, right) => right.measuredAt.getTime() - left.measuredAt.getTime())
    .slice(0, 5)
    .map((record) => ({
      key: record._id,
      measuredAtText: formatMonthDayTime(record.measuredAt),
      alertText: getAlertLabels(record, threshold).join(' · '),
      bloodPressureText: `${record.systolic}/${record.diastolic}`,
      heartRateText: Number.isFinite(record.heartRate) ? `${record.heartRate}bpm` : '未记录心率',
    }));
}

function buildPatientInfo(profile, activeMedications, hideSensitive, now = new Date()) {
  const name = trimText(profile && profile.name) || '未命名档案';
  const age = calculateAge(profile && profile.birthDate, now);
  const emergencyName = trimText(profile && profile.emergencyContact && profile.emergencyContact.name);
  const emergencyPhone = trimText(profile && profile.emergencyContact && profile.emergencyContact.phone);
  const emergencyDisplay = joinWithDot([
    emergencyName,
    emergencyPhone ? formatPhoneWithSpaces(emergencyPhone) : '',
  ]) || '未设置';

  return {
    nameText: hideSensitive
      ? '***'
      : age !== null
        ? `${name} (${age}岁)`
        : name,
    medicationText: joinMedicationNames(activeMedications),
    emergencyText: hideSensitive ? '***' : emergencyDisplay,
  };
}

function buildReportViewModel(options) {
  const profile = options && options.profile ? options.profile : null;
  const threshold = getThreshold(profile);
  const normalizedRecords = normalizeReportRecords(options && options.records);
  const patient = buildPatientInfo(
    profile,
    options && options.activeMedications,
    Boolean(options && options.hideSensitive),
    options && options.generatedAt ? options.generatedAt : new Date(),
  );
  const recentAlerts = buildRecentAlerts(normalizedRecords, threshold);

  return {
    threshold,
    patient,
    hasRecords: normalizedRecords.length > 0,
    generatedAtText: formatGeneratedAt(options && options.generatedAt ? options.generatedAt : new Date()),
    banner: buildAlertBanner(normalizedRecords, threshold),
    summaryCards: normalizedRecords.length ? buildSummaryCards(normalizedRecords, threshold) : [],
    chartRecords: normalizedRecords,
    hasHeartRateData: normalizedRecords.some((record) => Number.isFinite(record.heartRate)),
    recentAlerts,
    disclaimer: REPORT_DISCLAIMER,
  };
}

module.exports = {
  LOW_BP,
  HR_THRESHOLD,
  REPORT_DISCLAIMER,
  toMeasuredDate,
  formatGeneratedAt,
  formatMonthDay,
  formatMonthDayTime,
  getSinceForDays,
  normalizeReportRecords,
  isHighRiskRecord,
  isHighRecord,
  isLowRecord,
  isBloodPressureAbnormal,
  isHeartRateAbnormal,
  getAlertLabels,
  buildReportViewModel,
};
