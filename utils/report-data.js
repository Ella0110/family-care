const { calcAverage, countReferenceStats, getBPStatus, getHRStatus } = require('./health-rules')
const { formatDateTime } = require('./date')
const { buildBloodPressureChart, buildHeartRateChart } = require('./chart-data')
const { calcAge } = require('./family-settings')

const REPORT_TITLE = '血压心率就诊报告'
const DISCLAIMER = '本报告仅供健康记录与就诊沟通参考，不作为诊断、治疗或用药依据。个体情况存在差异，请以医生诊疗结果及医嘱为准。'

function toDate(value) {
  return value instanceof Date ? value : new Date(value)
}

function periodTitle(period) {
  return `近${String(period || '30天').replace('天', '')}天`
}

function sortDesc(records) {
  return [...records].sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt))
}

function buildRefLines(profile) {
  return {
    systolic: profile.targetSystolic || 135,
    diastolic: profile.targetDiastolic || 85,
    hrMin: profile.targetHRMin || 60,
    hrMax: profile.targetHRMax || 80,
  }
}

function buildRefLineText(profile) {
  const r = buildRefLines(profile)
  const isDefault = r.systolic === 135 && r.diastolic === 85 && r.hrMin === 60 && r.hrMax === 80
  return `参考线：血压 ${r.systolic}/${r.diastolic} mmHg，心率 ${r.hrMin}–${r.hrMax} 次/分（${isDefault ? '默认' : '自定义'}）`
}

function buildRecentRecords(records, profile) {
  const bpTarget = { systolic: profile && profile.targetSystolic, diastolic: profile && profile.targetDiastolic }
  const hrTarget = { min: profile && profile.targetHRMin, max: profile && profile.targetHRMax }
  return sortDesc(records).slice(0, 10).map(record => {
    const bpStatus = getBPStatus(record.systolic, record.diastolic, bpTarget)
    const hrStatus = getHRStatus(record.heartRate, hrTarget)
    return {
      id: record._id,
      time: formatDateTime(record.measuredAt),
      bpText: `${record.systolic}/${record.diastolic} mmHg`,
      heartRateText: `${record.heartRate} bpm`,
      bpStatus: bpStatus.label,
      hrStatus: hrStatus.label,
    }
  })
}

function buildReportData({ family = {}, records = [], period = '30天', generatedAt = new Date() }) {
  const safeRecords = records || []
  const profile = family.profile || {}
  const refLines = buildRefLines(profile)
  // rawRecords: chronological order (oldest first) for trend charts
  const rawRecords = [...safeRecords].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt))
  const age = profile.birthYear ? calcAge(profile.birthYear) : null
  return {
    title: REPORT_TITLE,
    familyName: family.displayName || '家庭健康记录',
    profileName: profile.name || '未设置',
    profileAge: age && age !== '--' ? `${age}岁` : '',
    profileMedications: profile.medicationsText || '',
    profileEmergencyName: profile.emergencyContactName || '',
    profileEmergencyPhone: profile.emergencyContactPhone || '',
    period,
    periodTitle: periodTitle(period),
    generatedAt: formatDateTime(generatedAt),
    totalCount: safeRecords.length,
    stats: countReferenceStats(safeRecords, profile),
    avg: calcAverage(safeRecords),
    bpChart: buildBloodPressureChart(safeRecords, refLines),
    hrChart: buildHeartRateChart(safeRecords, refLines),
    recentRecords: buildRecentRecords(safeRecords, profile),
    rawRecords,
    refLines,
    refLineText: buildRefLineText(profile),
    disclaimer: DISCLAIMER,
  }
}

module.exports = {
  DISCLAIMER,
  REPORT_TITLE,
  buildRecentRecords,
  buildReportData,
  periodTitle,
}
