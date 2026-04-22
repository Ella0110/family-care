const { getBPStatus, getHRStatus } = require('./health-rules')

function toDate(value) {
  return value instanceof Date ? value : new Date(value)
}

function labelDate(value) {
  const date = toDate(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function sortRecords(records) {
  return [...records].sort((a, b) => toDate(a.measuredAt) - toDate(b.measuredAt))
}

function roundRange(min, max, step) {
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
  }
}

function buildBloodPressureChart(records, refLines) {
  const refSys = (refLines && refLines.systolic) || 135
  const refDia = (refLines && refLines.diastolic) || 85
  const target = { systolic: refSys, diastolic: refDia }
  const sorted = sortRecords(records)
  const values = sorted.flatMap(record => [Number(record.systolic), Number(record.diastolic), refSys, refDia])
  const range = values.length ? roundRange(Math.min(...values) - 8, Math.max(...values) + 8, 10) : { min: 60, max: 170 }
  return {
    records: sorted.map(record => {
      const bpStatus = getBPStatus(record.systolic, record.diastolic, target)
      return {
        id: record._id,
        label: labelDate(record.measuredAt),
        systolic: Number(record.systolic),
        diastolic: Number(record.diastolic),
        abnormal: Boolean(bpStatus.attention),
      }
    }),
    range,
    refs: [refSys, refDia],
  }
}

function buildHeartRateChart(records, refLines) {
  const refMin = (refLines && refLines.hrMin) || 60
  const refMax = (refLines && refLines.hrMax) || 80
  const target = { min: refMin, max: refMax }
  const sorted = sortRecords(records)
  const values = sorted.map(record => Number(record.heartRate)).concat([refMin, refMax])
  const range = values.length ? roundRange(Math.min(...values) - 8, Math.max(...values) + 8, 10) : { min: 40, max: 110 }
  return {
    records: sorted.map(record => {
      const hrStatus = getHRStatus(record.heartRate, target)
      return {
        id: record._id,
        label: labelDate(record.measuredAt),
        heartRate: Number(record.heartRate),
        abnormal: Boolean(hrStatus.attention),
      }
    }),
    range,
    refs: [refMin, refMax],
  }
}

module.exports = {
  buildBloodPressureChart,
  buildHeartRateChart,
  labelDate,
  sortRecords,
}
