const DEFAULT_BP_THRESHOLD = Object.freeze({
  systolic: 140,
  diastolic: 90,
});

const THRESHOLD_LIMITS = Object.freeze({
  systolic: { min: 100, max: 200, step: 5 },
  diastolic: { min: 60, max: 130, step: 5 },
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function trimText(value) {
  return String(value || '').trim();
}

function parseBirthDate(value) {
  const text = trimText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateAge(birthDate, now = new Date()) {
  const date = parseBirthDate(birthDate);
  if (!date) {
    return null;
  }

  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const dayDiff = now.getDate() - date.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function formatPhoneWithSpaces(phone) {
  const text = trimText(phone);
  if (!/^1\d{10}$/.test(text)) {
    return text;
  }

  return `${text.slice(0, 3)} ${text.slice(3, 7)} ${text.slice(7)}`;
}

function getThreshold(profile) {
  const threshold = profile
    && profile.settings
    && profile.settings.bp
    && profile.settings.bp.threshold;

  return {
    systolic: Number(threshold && threshold.systolic) || DEFAULT_BP_THRESHOLD.systolic,
    diastolic: Number(threshold && threshold.diastolic) || DEFAULT_BP_THRESHOLD.diastolic,
  };
}

function buildProfileDetailDisplay(profile, now = new Date()) {
  const name = trimText(profile && profile.name) || '未命名档案';
  const relation = trimText(profile && profile.relation);
  const age = calculateAge(profile && profile.birthDate, now);
  const longTermMedication = profile && profile.longTermMedication === true;
  const emergencyName = trimText(profile && profile.emergencyContact && profile.emergencyContact.name);
  const emergencyPhone = trimText(profile && profile.emergencyContact && profile.emergencyContact.phone);
  const threshold = getThreshold(profile);
  const metaItems = [];

  if (relation) {
    metaItems.push(relation);
  }
  if (longTermMedication) {
    metaItems.push('长期服药');
  }

  return {
    title: age !== null ? `${name}（${age} 岁）` : name,
    metaLine: metaItems.join(' · '),
    emergencyLine: emergencyName && emergencyPhone
      ? `${emergencyName} · ${formatPhoneWithSpaces(emergencyPhone)}`
      : '',
    thresholdLine: `高压 ${threshold.systolic} / 低压 ${threshold.diastolic}`,
    threshold,
  };
}

function clampThresholdValue(type, value) {
  const limits = THRESHOLD_LIMITS[type];
  if (!limits) {
    return Number(value) || 0;
  }

  const nextValue = Number(value) || 0;
  if (nextValue < limits.min) {
    return limits.min;
  }
  if (nextValue > limits.max) {
    return limits.max;
  }
  return nextValue;
}

function validateThresholdValues(systolic, diastolic) {
  const nextSystolic = Number(systolic);
  const nextDiastolic = Number(diastolic);

  if (!Number.isFinite(nextSystolic) || !Number.isFinite(nextDiastolic)) {
    return '阈值设置有误';
  }

  if (nextSystolic <= nextDiastolic) {
    return '高压阈值必须高于低压阈值';
  }

  return '';
}

function isDeleteNameMatched(profileName, inputValue) {
  return trimText(profileName) !== '' && trimText(profileName) === trimText(inputValue);
}

module.exports = {
  DEFAULT_BP_THRESHOLD,
  THRESHOLD_LIMITS,
  calculateAge,
  formatPhoneWithSpaces,
  getThreshold,
  buildProfileDetailDisplay,
  clampThresholdValue,
  validateThresholdValues,
  isDeleteNameMatched,
};
