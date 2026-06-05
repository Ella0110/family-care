const { getBPStatusDisplay, BP_LEVELS } = require('./bp-status')

const BP_STATUS = {
  LOW: { level: 'low', label: '血压偏低', color: '#007AFF', attention: true },
  IN_RANGE: { level: 'inRange', label: '正常', color: '#34C759', attention: false },
  ELEVATED: { level: 'elevated', label: '临界偏高', color: '#F5A623', attention: true },
  HIGH: { level: 'high', label: '偏高1级', color: '#FF9500', attention: true },
  VERY_HIGH: { level: 'veryHigh', label: '偏高2级', color: '#FF3B30', attention: true },
  CRITICAL: { level: 'critical', label: '过高3级', color: '#FF3B30', attention: true },
}

const HR_STATUS = {
  SLOW: { level: 'slow', label: '偏慢', color: '#FF9500', attention: true },
  VERY_SLOW: { level: 'verySlow', label: '明显偏慢', color: '#C81E1E', attention: true },
  IN_RANGE: { level: 'inRange', label: '参考范围内', color: '#34C759', attention: false },
  FAST: { level: 'fast', label: '偏快', color: '#FF9500', attention: true },
  VERY_FAST: { level: 'veryFast', label: '明显偏快', color: '#FF3B30', attention: true },
}

function cloneStatus(status) {
  return { ...status }
}

function getBPStatus(systolic, diastolic, target) {
  void target

  const status = getBPStatusDisplay(systolic, diastolic)

  if (status.level === BP_LEVELS.LOW) return cloneStatus(BP_STATUS.LOW)
  if (status.level === BP_LEVELS.STAGE3) return cloneStatus(BP_STATUS.CRITICAL)
  if (status.level === BP_LEVELS.STAGE2) return cloneStatus(BP_STATUS.VERY_HIGH)
  if (status.level === BP_LEVELS.STAGE1) return cloneStatus(BP_STATUS.HIGH)
  if (status.level === BP_LEVELS.ELEVATED) return cloneStatus(BP_STATUS.ELEVATED)
  return cloneStatus(BP_STATUS.IN_RANGE)
}

function getHRStatus(heartRate, target) {
  const hr = Number(heartRate)
  const min = Number(target && target.min) || 60
  const max = Number(target && target.max) || 80

  if (hr < 50) return cloneStatus(HR_STATUS.VERY_SLOW)
  if (hr < min) return cloneStatus(HR_STATUS.SLOW)
  if (hr > 100) return cloneStatus(HR_STATUS.VERY_FAST)
  if (hr > max) return cloneStatus(HR_STATUS.FAST)
  return cloneStatus(HR_STATUS.IN_RANGE)
}

function calcAverage(records) {
  if (!records.length) return { systolic: '--', diastolic: '--', heartRate: '--' }
  const avg = key => Math.round(records.reduce((sum, record) => sum + Number(record[key]), 0) / records.length)
  return {
    systolic: avg('systolic'),
    diastolic: avg('diastolic'),
    heartRate: avg('heartRate'),
  }
}

function countReferenceStats(records, profile) {
  const bpTarget = {
    systolic: profile && profile.targetSystolic,
    diastolic: profile && profile.targetDiastolic,
  }
  const hrTarget = {
    min: profile && profile.targetHRMin,
    max: profile && profile.targetHRMax,
  }

  let bpInRange = 0
  let hrInRange = 0
  records.forEach(record => {
    if (!getBPStatus(record.systolic, record.diastolic, bpTarget).attention) bpInRange += 1
    if (!getHRStatus(record.heartRate, hrTarget).attention) hrInRange += 1
  })

  return {
    bp: { inRange: bpInRange, attention: records.length - bpInRange },
    hr: { inRange: hrInRange, attention: records.length - hrInRange },
  }
}

module.exports = {
  getBPStatus,
  getHRStatus,
  calcAverage,
  countReferenceStats,
}
