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
  const date = toMeasuredDate(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizePeriodValue(value) {
  const normalized = trimText(value).toLowerCase();
  return PERIOD_ORDER.includes(normalized) ? normalized : 'other';
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

function selectSevenDayChartRecords(recordsForDay) {
  const sortedDesc = (Array.isArray(recordsForDay) ? recordsForDay : [])
    .slice()
    .sort((left, right) => right.measuredAt.getTime() - left.measuredAt.getTime());
  const latestByPeriod = new Map();

  sortedDesc.forEach((record) => {
    const period = normalizePeriodValue(record.period);
    if (!latestByPeriod.has(period)) {
      latestByPeriod.set(period, record);
    }
  });

  let selected = [];

  if (latestByPeriod.size >= 2) {
    selected = Array.from(latestByPeriod.values())
      .sort((left, right) => right.measuredAt.getTime() - left.measuredAt.getTime())
      .slice(0, 3);
  } else {
    selected = sortedDesc.slice(0, 3);
  }

  return selected
    .slice()
    .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());
}

function buildDailyAveragePoint(slot, recordsForDay, threshold) {
  const safeRecords = Array.isArray(recordsForDay) ? recordsForDay : [];
  const heartRateValues = safeRecords
    .map((record) => record.heartRate)
    .filter((value) => Number.isFinite(value));
  const latestRecord = safeRecords[safeRecords.length - 1];
  const averageRecord = {
    _id: `${slot.dateKey}-avg`,
    dateKey: slot.dateKey,
    label: slot.label,
    measuredAt: latestRecord ? latestRecord.measuredAt : slot.date,
    systolic: average(safeRecords.map((record) => record.systolic)),
    diastolic: average(safeRecords.map((record) => record.diastolic)),
    heartRate: heartRateValues.length ? average(heartRateValues) : null,
    period: 'other',
    sourceCount: safeRecords.length,
  };

  return decorateAlertFlags(
    averageRecord,
    threshold,
    safeRecords.some((record) => isHeartRateAbnormal(record)),
  );
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

    if (Number(days) <= 7) {
      slot.items = selectSevenDayChartRecords(recordsForDay)
        .map((record) => decorateAlertFlags(record, threshold));
      return;
    }

    slot.items = [buildDailyAveragePoint(slot, recordsForDay, threshold)];
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
  isHighRiskRecord,
  isHighRecord,
  isLowRecord,
  isBloodPressureAbnormal,
  isHeartRateAbnormal,
  getAlertLabels,
  buildReportViewModel,
};
