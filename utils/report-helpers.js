const { calculateAge, formatPhoneWithSpaces, getThreshold } = require('./profile-detail');
const {
  formatEast8DateYMD,
  getEast8StartOfDay,
  toEast8Parts,
} = require('./csv-helpers');

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

const PERIOD_ORDER = ['morning', 'afternoon', 'evening', 'other'];

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

function toDateKey(value) {
  return formatEast8DateYMD(toMeasuredDate(value));
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizePeriodValue(value) {
  const normalized = trimText(value).toLowerCase();
  return PERIOD_ORDER.includes(normalized) ? normalized : 'other';
}

function formatGeneratedAt(value) {
  const parts = toEast8Parts(toMeasuredDate(value));
  if (!parts) {
    return '';
  }

  return `${parts.year}/${pad(parts.month)}/${pad(parts.day)} ${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function formatMonthDay(value) {
  const parts = toEast8Parts(toMeasuredDate(value));
  if (!parts) {
    return '';
  }

  return `${pad(parts.month)}/${pad(parts.day)}`;
}

function formatMonthDayTime(value) {
  const parts = toEast8Parts(toMeasuredDate(value));
  if (!parts) {
    return '';
  }

  return `${pad(parts.month)}/${pad(parts.day)} ${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function getSinceForDays(days, now = new Date()) {
  const safeDays = Math.max(1, Number(days) || 1);
  const startOfToday = getEast8StartOfDay(now);
  return new Date(startOfToday.getTime() - (safeDays - 1) * 86400000);
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

function decorateAlertFlags(record, threshold, heartRateAlertOverride) {
  const systolicAlert = record.systolic >= threshold.systolic || record.systolic < LOW_BP.systolic;
  const diastolicAlert = record.diastolic >= threshold.diastolic || record.diastolic < LOW_BP.diastolic;
  const heartRateAlert = heartRateAlertOverride === undefined
    ? isHeartRateAbnormal(record)
    : Boolean(heartRateAlertOverride);

  return Object.assign({}, record, {
    hasHeartRate: Number.isFinite(record.heartRate),
    systolicAlert,
    diastolicAlert,
    bpAlert: systolicAlert || diastolicAlert,
    heartRateAlert,
  });
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
        dateKey: toDateKey(measuredAt),
        label: formatMonthDay(measuredAt),
        systolic,
        diastolic,
        heartRate: Number.isFinite(heartRate) ? heartRate : null,
        period: normalizePeriodValue(record.period || payload.period),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());
}

function average(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function buildNaturalDaySlots(days, now = new Date()) {
  const slotCount = Math.max(1, Number(days) || 1);
  const start = getSinceForDays(slotCount, now);
  const slots = [];

  for (let index = 0; index < slotCount; index += 1) {
    const date = new Date(start.getTime() + index * 86400000);
    slots.push({
      index,
      date,
      dateKey: toDateKey(date),
      label: formatMonthDay(date),
    });
  }

  return slots;
}

function groupRecordsByDate(records) {
  const grouped = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record || !record.dateKey) {
      return;
    }

    if (!grouped.has(record.dateKey)) {
      grouped.set(record.dateKey, []);
    }

    grouped.get(record.dateKey).push(record);
  });

  return grouped;
}

function countUniqueMeasuredDays(records) {
  const normalizedRecords = Array.isArray(records) && records.length && records[0] && records[0].dateKey
    ? records
    : normalizeReportRecords(records);

  return new Set((normalizedRecords || []).map((record) => record.dateKey)).size;
}

function getLatestPerDay(recordsForDay) {
  const safeRecords = (Array.isArray(recordsForDay) ? recordsForDay : [])
    .slice()
    .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());

  return safeRecords.length ? safeRecords[safeRecords.length - 1] : null;
}

function selectSevenDayRecords(recordsForDay) {
  const safeRecords = (Array.isArray(recordsForDay) ? recordsForDay : [])
    .slice()
    .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());

  if (!safeRecords.length) {
    return [];
  }

  const periodBuckets = new Map();

  safeRecords.forEach((record) => {
    const period = normalizePeriodValue(record.period);
    if (!periodBuckets.has(period)) {
      periodBuckets.set(period, []);
    }
    periodBuckets.get(period).push(record);
  });

  const activePeriods = PERIOD_ORDER.filter((period) => {
    const bucket = periodBuckets.get(period);
    return Array.isArray(bucket) && bucket.length > 0;
  });

  if (activePeriods.length >= 2) {
    return activePeriods
      .slice(0, 3)
      .map((period) => {
        const bucket = periodBuckets.get(period);
        return bucket[bucket.length - 1];
      })
      .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());
  }

  return safeRecords.slice(-3);
}

function buildChartTimeline(records, days, threshold, now = new Date()) {
  const normalizedRecords = Array.isArray(records) && records.length && records[0] && records[0].dateKey
    ? records
    : normalizeReportRecords(records);
  const slots = buildNaturalDaySlots(days, now).map((slot) => Object.assign({}, slot, { items: [] }));
  const slotMap = new Map(slots.map((slot) => [slot.dateKey, slot]));
  const grouped = groupRecordsByDate(normalizedRecords);

  grouped.forEach((recordsForDay, dateKey) => {
    const slot = slotMap.get(dateKey);
    if (!slot) {
      return;
    }

    const selectedRecords = Number(days) <= 7
      ? selectSevenDayRecords(recordsForDay)
      : (getLatestPerDay(recordsForDay) ? [getLatestPerDay(recordsForDay)] : []);

    slot.items = selectedRecords.map((record) => decorateAlertFlags(Object.assign({}, record, {
      label: slot.label,
      dateKey: slot.dateKey,
    }), threshold));
  });

  const points = [];

  slots.forEach((slot) => {
    slot.items.forEach((item, itemIndex) => {
      points.push(Object.assign({}, item, {
        slotIndex: slot.index,
        slotCount: slot.items.length,
        positionInSlot: itemIndex,
      }));
    });
  });

  return {
    mode: Number(days) || 7,
    slots,
    points,
    hasHeartRateData: points.some((point) => point.hasHeartRate),
  };
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
      heartRateText: Number.isFinite(record.heartRate) ? `${record.heartRate}bpm` : '',
      hasHeartRate: Number.isFinite(record.heartRate),
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
  const generatedAt = options && options.generatedAt ? options.generatedAt : new Date();
  const normalizedRecords = normalizeReportRecords(options && options.records);
  const patient = buildPatientInfo(
    profile,
    options && options.activeMedications,
    Boolean(options && options.hideSensitive),
    generatedAt,
  );
  const recentAlerts = buildRecentAlerts(normalizedRecords, threshold);
  const chartData = buildChartTimeline(
    normalizedRecords,
    options && options.days ? options.days : 7,
    threshold,
    generatedAt,
  );

  return {
    threshold,
    patient,
    hasRecords: normalizedRecords.length > 0,
    generatedAtText: formatGeneratedAt(generatedAt),
    banner: buildAlertBanner(normalizedRecords, threshold),
    summaryCards: normalizedRecords.length ? buildSummaryCards(normalizedRecords, threshold) : [],
    chartData,
    hasHeartRateData: chartData.hasHeartRateData,
    recentAlerts,
    disclaimer: REPORT_DISCLAIMER,
  };
}

module.exports = {
  LOW_BP,
  HR_THRESHOLD,
  REPORT_DISCLAIMER,
  toMeasuredDate,
  toDateKey,
  formatGeneratedAt,
  formatMonthDay,
  formatMonthDayTime,
  getSinceForDays,
  normalizeReportRecords,
  countUniqueMeasuredDays,
  buildChartTimeline,
  getLatestPerDay,
  isHighRiskRecord,
  isHighRecord,
  isLowRecord,
  isBloodPressureAbnormal,
  isHeartRateAbnormal,
  getAlertLabels,
  buildReportViewModel,
};
