const SUBSCRIBE_ALERT_TEMPLATE_ID = 'EntTrzNRVv1RDKy5AvLgxsUrGJzislhyAPovjgrXJ4U';

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

function getBpAlertLevel(payload) {
  const systolic = Number(payload && payload.systolic);
  const diastolic = Number(payload && payload.diastolic);

  if (systolic >= 180 || diastolic >= 110) {
    return '血压偏高3级';
  }

  if (systolic >= 160 || diastolic >= 100) {
    return '血压偏高2级';
  }

  if (systolic >= 140 || diastolic >= 90) {
    return '血压偏高1级';
  }

  if (systolic >= 120 || diastolic >= 80) {
    return '血压临界偏高';
  }

  if (systolic < 90 || diastolic < 60) {
    return '血压偏低';
  }

  return '血压异常';
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

function buildPushData({ payload, profileName, measuredAt }) {
  const alertLevel = getBpAlertLevel(payload);
  const safeProfileName = truncateThing(profileName || '家人');

  return {
    alertType: alertLevel,
    alertLevel,
    templateData: {
      thing2: { value: truncateThing(alertLevel) || '血压异常' },
      character_string3: { value: `高压${payload.systolic}/低压${payload.diastolic} mmHg` },
      thing5: { value: safeProfileName || '家人' },
      time8: { value: formatPushTime(measuredAt) },
    },
  };
}

module.exports = {
  SUBSCRIBE_ALERT_TEMPLATE_ID,
  buildPushData,
  buildTipText,
  formatPushTime,
  getBpAlertLevel,
  truncateThing,
};
