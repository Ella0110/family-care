const BP_LEVELS = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  ELEVATED: 'elevated',
  STAGE1: 'stage1',
  STAGE2: 'stage2',
  STAGE3: 'stage3',
});

const LOW_BP = Object.freeze({
  systolic: 90,
  diastolic: 60,
});

const DISPLAY_BP_THRESHOLD = Object.freeze({
  systolic: 140,
  diastolic: 90,
});

const DEFAULT_REFERENCE_LINES = Object.freeze({
  systolic: Object.freeze({ normal: 120, elevated: 140, high: 160 }),
  diastolic: Object.freeze({ normal: 80, elevated: 90, high: 100 }),
});

const BP_LEVEL_ORDER = Object.freeze({
  [BP_LEVELS.NORMAL]: 0,
  [BP_LEVELS.LOW]: 1,
  [BP_LEVELS.ELEVATED]: 2,
  [BP_LEVELS.STAGE1]: 3,
  [BP_LEVELS.STAGE2]: 4,
  [BP_LEVELS.STAGE3]: 5,
});

const BP_LEVEL_META = Object.freeze({
  low: Object.freeze({
    level: BP_LEVELS.LOW,
    label: '偏低',
    detail: '',
    summaryText: '血压偏低',
    tagText: '血压偏低',
    className: 'is-low',
    textColor: '#007AFF',
    numberColor: '#007AFF',
    backgroundColor: '#EFF6FF',
    recordsClassName: 'records-status--low',
    reportTagClassName: 'report-alert-list__tags--low',
    selectorClassName: 'is-low',
    attention: true,
  }),
  normal: Object.freeze({
    level: BP_LEVELS.NORMAL,
    label: '正常',
    detail: '',
    summaryText: '血压正常',
    tagText: '正常',
    className: 'is-normal',
    textColor: '#34C759',
    numberColor: '#0F172A',
    backgroundColor: '#F0FFF4',
    recordsClassName: 'records-status--normal',
    reportTagClassName: 'report-alert-list__tags--normal',
    selectorClassName: 'is-normal',
    attention: false,
  }),
  elevated: Object.freeze({
    level: BP_LEVELS.ELEVATED,
    label: '临界偏高',
    detail: '',
    summaryText: '血压临界偏高',
    tagText: '临界偏高',
    className: 'is-elevated',
    textColor: '#F5A623',
    numberColor: '#F5A623',
    backgroundColor: '#FFF9EB',
    recordsClassName: 'records-status--elevated',
    reportTagClassName: 'report-alert-list__tags--elevated',
    selectorClassName: 'is-elevated',
    attention: true,
  }),
  stage1: Object.freeze({
    level: BP_LEVELS.STAGE1,
    label: '偏高',
    detail: '1级',
    summaryText: '血压偏高1级',
    tagText: '偏高1级',
    className: 'is-stage1',
    textColor: '#FF9500',
    numberColor: '#FF9500',
    backgroundColor: '#FFF4EB',
    recordsClassName: 'records-status--stage1',
    reportTagClassName: 'report-alert-list__tags--stage1',
    selectorClassName: 'is-stage1',
    attention: true,
  }),
  stage2: Object.freeze({
    level: BP_LEVELS.STAGE2,
    label: '偏高',
    detail: '2级',
    summaryText: '血压偏高2级',
    tagText: '偏高2级',
    className: 'is-stage2',
    textColor: '#FF3B30',
    numberColor: '#FF3B30',
    backgroundColor: '#FFF0F0',
    recordsClassName: 'records-status--stage2',
    reportTagClassName: 'report-alert-list__tags--stage2',
    selectorClassName: 'is-stage2',
    attention: true,
  }),
  stage3: Object.freeze({
    level: BP_LEVELS.STAGE3,
    label: '过高',
    detail: '（3级）',
    summaryText: '过高3级',
    tagText: '过高3级',
    className: 'is-stage3',
    textColor: '#FF3B30',
    numberColor: '#FF3B30',
    backgroundColor: '#FFF0F0',
    recordsClassName: 'records-status--stage3',
    reportTagClassName: 'report-alert-list__tags--stage3',
    selectorClassName: 'is-stage3',
    attention: true,
  }),
});

function cloneMeta(meta) {
  return Object.assign({}, meta);
}

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

function getBPLevelForValue(value, type) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return BP_LEVELS.NORMAL;
  }

  const lowThreshold = type === 'diastolic' ? 60 : 90;
  const elevatedThreshold = type === 'diastolic' ? 80 : 120;
  const stage1Threshold = type === 'diastolic' ? 90 : 140;
  const stage2Threshold = type === 'diastolic' ? 100 : 160;
  const stage3Threshold = type === 'diastolic' ? 110 : 180;

  if (nextValue < lowThreshold) {
    return BP_LEVELS.LOW;
  }

  if (nextValue >= stage3Threshold) {
    return BP_LEVELS.STAGE3;
  }

  if (nextValue >= stage2Threshold) {
    return BP_LEVELS.STAGE2;
  }

  if (nextValue >= stage1Threshold) {
    return BP_LEVELS.STAGE1;
  }

  if (nextValue >= elevatedThreshold) {
    return BP_LEVELS.ELEVATED;
  }

  return BP_LEVELS.NORMAL;
}

function getMoreSevereLevel(leftLevel, rightLevel) {
  return BP_LEVEL_ORDER[leftLevel] >= BP_LEVEL_ORDER[rightLevel] ? leftLevel : rightLevel;
}

function getBPLevelMeta(level) {
  return cloneMeta(BP_LEVEL_META[level] || BP_LEVEL_META.normal);
}

function getBPStatusDisplay(systolic, diastolic, referenceLines) {
  void referenceLines;

  const systolicLevel = getBPLevelForValue(systolic, 'systolic');
  const diastolicLevel = getBPLevelForValue(diastolic, 'diastolic');
  const overallLevel = getMoreSevereLevel(systolicLevel, diastolicLevel);
  const meta = getBPLevelMeta(overallLevel);

  return Object.assign(meta, {
    systolicLevel,
    diastolicLevel,
    systolicClassName: getBPLevelMeta(systolicLevel).className,
    diastolicClassName: getBPLevelMeta(diastolicLevel).className,
  });
}

module.exports = {
  BP_LEVELS,
  BP_LEVEL_ORDER,
  LOW_BP,
  DISPLAY_BP_THRESHOLD,
  DEFAULT_REFERENCE_LINES,
  getReferenceLines,
  getBPLevelForValue,
  getBPLevelMeta,
  getBPStatusDisplay,
  getMoreSevereLevel,
};
