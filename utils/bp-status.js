const { getBPStatus } = require('./health-rules');

const DEFAULT_REFERENCE_LINES = {
  systolic: { normal: 120, elevated: 140, high: 160 },
  diastolic: { normal: 80, elevated: 90, high: 100 },
};

function numberOrDefault(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function getReferenceLines(referenceLines) {
  const source = referenceLines || {};

  return {
    systolic: {
      normal: numberOrDefault(source.systolic && source.systolic.normal, DEFAULT_REFERENCE_LINES.systolic.normal),
      elevated: numberOrDefault(source.systolic && source.systolic.elevated, DEFAULT_REFERENCE_LINES.systolic.elevated),
      high: numberOrDefault(source.systolic && source.systolic.high, DEFAULT_REFERENCE_LINES.systolic.high),
    },
    diastolic: {
      normal: numberOrDefault(source.diastolic && source.diastolic.normal, DEFAULT_REFERENCE_LINES.diastolic.normal),
      elevated: numberOrDefault(source.diastolic && source.diastolic.elevated, DEFAULT_REFERENCE_LINES.diastolic.elevated),
      high: numberOrDefault(source.diastolic && source.diastolic.high, DEFAULT_REFERENCE_LINES.diastolic.high),
    },
  };
}

function getHighGrade(systolic, diastolic, referenceLines) {
  const lines = getReferenceLines(referenceLines);

  if (systolic >= 180 || diastolic >= 110) {
    return '3级';
  }

  if (systolic >= lines.systolic.high || diastolic >= lines.diastolic.high) {
    return '2级';
  }

  if (systolic >= lines.systolic.elevated || diastolic >= lines.diastolic.elevated) {
    return '1级';
  }

  return '';
}

/**
 * Adapts the legacy health-rules status to the T2 display contract.
 * The legacy util is kept unchanged; referenceLines.elevated is passed as the status target.
 *
 * @param {number|string} systolic
 * @param {number|string} diastolic
 * @param {Object} [referenceLines]
 * @returns {{ level: string, label: string, detail: string, className: string, attention: boolean }}
 */
function getBPStatusDisplay(systolic, diastolic, referenceLines) {
  const sys = Number(systolic);
  const dia = Number(diastolic);
  const lines = getReferenceLines(referenceLines);
  const legacyStatus = getBPStatus(sys, dia, {
    systolic: lines.systolic.elevated,
    diastolic: lines.diastolic.elevated,
  });

  if (legacyStatus.level === 'low') {
    return {
      level: 'low',
      label: '偏低',
      detail: '',
      className: 'is-low',
      attention: true,
    };
  }

  if (legacyStatus.attention) {
    return {
      level: 'high',
      label: '偏高',
      detail: getHighGrade(sys, dia, lines),
      className: 'is-high',
      attention: true,
    };
  }

  return {
    level: 'normal',
    label: '正常',
    detail: '',
    className: 'is-normal',
    attention: false,
  };
}

module.exports = {
  DEFAULT_REFERENCE_LINES,
  getReferenceLines,
  getBPStatusDisplay,
};
