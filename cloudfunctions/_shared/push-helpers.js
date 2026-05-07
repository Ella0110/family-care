const SUBSCRIBE_ALERT_TEMPLATE_ID = 'lrhxG9oawoHDyh1AFVSgiv-cQE7-qTAn87-_nzBDxCY';

function truncateThing(value, maxLength = 20) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return Array.from(text).slice(0, maxLength).join('');
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

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatPushTime(value) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '1970-01-01 00:00';
  }

  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaTime.getUTCFullYear();
  const month = pad(chinaTime.getUTCMonth() + 1);
  const day = pad(chinaTime.getUTCDate());
  const hours = pad(chinaTime.getUTCHours());
  const minutes = pad(chinaTime.getUTCMinutes());

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getAlertType(payload, threshold) {
  const systolic = Number(payload && payload.systolic);
  const diastolic = Number(payload && payload.diastolic);
  const systolicThreshold = Number(threshold && threshold.systolic);
  const diastolicThreshold = Number(threshold && threshold.diastolic);

  if (systolic >= 180 || diastolic >= 120) {
    return {
      alertType: '血压过高·严重异常',
      alertLevel: 'critical-high',
    };
  }

  if (systolic >= systolicThreshold || diastolic >= diastolicThreshold) {
    return {
      alertType: '血压偏高',
      alertLevel: 'high',
    };
  }

  if (systolic < 90 || diastolic < 60) {
    return {
      alertType: '血压偏低',
      alertLevel: 'low',
    };
  }

  return {
    alertType: '',
    alertLevel: 'normal',
  };
}

function buildTipText(profileName, payload) {
  const safeName = truncateThing(profileName || '家人');
  const systolic = payload && payload.systolic;
  const diastolic = payload && payload.diastolic;
  const candidates = [
    `${safeName}的血压${systolic}/${diastolic} 请关注`,
    `${safeName}血压${systolic}/${diastolic}请关注`,
    `血压${systolic}/${diastolic} 请关注`,
  ];

  return candidates.find((candidate) => Array.from(candidate).length <= 20) || candidates[candidates.length - 1];
}

function buildPushData({ payload, threshold, profileName, measuredAt }) {
  const { alertType, alertLevel } = getAlertType(payload, threshold);
  const safeProfileName = truncateThing(profileName || '家人');
  const safeTip = buildTipText(safeProfileName || '家人', payload);

  return {
    alertType,
    alertLevel,
    templateData: {
      thing1: { value: truncateThing(alertType || '血压异常') },
      thing2: { value: safeProfileName || '家人' },
      time3: { value: formatPushTime(measuredAt) },
      thing4: { value: safeTip || '请关注血压变化' },
    },
  };
}

module.exports = {
  SUBSCRIBE_ALERT_TEMPLATE_ID,
  buildPushData,
  buildTipText,
  formatPushTime,
  getAlertType,
  truncateThing,
};
