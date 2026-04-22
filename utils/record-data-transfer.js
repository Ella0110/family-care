const TITLE = '血压心率数据记录'
const COLUMNS = ['测量时间', '高压\n(mmHg)', '低压\n(mmHg)', '心率\n(bpm)']

function pad(n) {
  return String(n).padStart(2, '0')
}

function toDate(value) {
  if (value instanceof Date) return value
  if (value && value.$date) return new Date(value.$date)
  if (value && value._date) return new Date(value._date)
  return new Date(value)
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
}

function formatRecordTime(value) {
  const date = toDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatRangeDate(value, includeYear) {
  const date = toDate(value)
  const prefix = includeYear ? `${date.getFullYear()}年` : ''
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日`
}

function buildRangeText(records) {
  if (!records.length) return '数据记录时间：暂无数据'
  const dates = records.map(record => toDate(record.measuredAt)).filter(isValidDate)
  if (!dates.length) return '数据记录时间：暂无数据'
  const min = new Date(Math.min(...dates.map(date => date.getTime())))
  const max = new Date(Math.max(...dates.map(date => date.getTime())))
  const crossYear = min.getFullYear() !== max.getFullYear()
  return `数据记录时间：${formatRangeDate(min, true)}-${formatRangeDate(max, crossYear)}`
}

function normalizeRecord(record) {
  const measuredAt = toDate(record.measuredAt)
  return {
    ...record,
    measuredAt: measuredAt.toISOString(),
    systolic: Number(record.systolic),
    diastolic: Number(record.diastolic),
    heartRate: Number(record.heartRate),
  }
}

function isValidRecord(record) {
  const measuredAt = toDate(record.measuredAt)
  return isValidDate(measuredAt) &&
    Number(record.systolic) >= 60 && Number(record.systolic) <= 300 &&
    Number(record.diastolic) >= 40 && Number(record.diastolic) <= 200 &&
    Number(record.heartRate) >= 30 && Number(record.heartRate) <= 250
}

function buildRecordsExportData(records = []) {
  const normalized = (records || [])
    .filter(isValidRecord)
    .map(normalizeRecord)
    .sort((a, b) => toDate(b.measuredAt) - toDate(a.measuredAt))

  return {
    title: TITLE,
    rangeText: buildRangeText(normalized),
    columns: COLUMNS,
    rows: normalized.map(record => ({
      timeText: formatRecordTime(record.measuredAt),
      systolic: record.systolic,
      diastolic: record.diastolic,
      heartRate: record.heartRate,
    })),
  }
}

function inferYear(text, fallbackYear) {
  const match = String(text || '').match(/数据记录时间[：:]\s*(\d{4})\s*年/)
  if (match) return Number(match[1])
  const anyYear = String(text || '').match(/(\d{4})\s*年\s*\d{1,2}\s*月/)
  if (anyYear) return Number(anyYear[1])
  return fallbackYear || new Date().getFullYear()
}

function normalizeLine(line) {
  return String(line || '')
    .replace(/[|,，]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRecordLine(line, defaultYear) {
  const normalized = normalizeLine(line)
  const match = normalized.match(/(?:(\d{4})\s*[年\/.-]\s*)?(\d{1,2})\s*(?:月|[\/.-])\s*(\d{1,2})\s*(?:日)?\s+(\d{1,2})\s*[:：]\s*(\d{1,2})\s+(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})/)
  if (!match) return null

  const year = Number(match[1] || defaultYear)
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const record = {
    measuredAt: new Date(year, month - 1, day, hour, minute, 0, 0).toISOString(),
    systolic: Number(match[6]),
    diastolic: Number(match[7]),
    heartRate: Number(match[8]),
    period: null,
  }

  return isValidRecord(record) ? record : null
}

function parseRecordsDataText(text, options = {}) {
  const defaultYear = inferYear(text, options.fallbackYear)
  const records = []
  const invalidLines = []

  String(text || '').split(/\r?\n/).forEach((line) => {
    const normalized = normalizeLine(line)
    if (!normalized) return
    const record = parseRecordLine(normalized, defaultYear)
    if (record) {
      records.push(record)
      return
    }
    if (/\d{1,2}\s*(?:月|[\/.-])\s*\d{1,2}/.test(normalized)) {
      invalidLines.push(normalized)
    }
  })

  return { records, invalidLines }
}

function recordKey(record) {
  const date = toDate(record.measuredAt)
  const minuteTime = isValidDate(date) ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()).getTime() : ''
  return [
    minuteTime,
    Number(record.systolic),
    Number(record.diastolic),
    Number(record.heartRate),
  ].join('|')
}

function dedupeImportedRecords(importedRecords = [], existingRecords = []) {
  const existingKeys = new Set((existingRecords || []).map(recordKey))
  const seenImportKeys = new Set()
  const newRecords = []
  let duplicateCount = 0

  ;(importedRecords || []).forEach((record) => {
    const key = recordKey(record)
    if (existingKeys.has(key) || seenImportKeys.has(key)) {
      duplicateCount += 1
      return
    }
    seenImportKeys.add(key)
    newRecords.push(record)
  })

  return { newRecords, duplicateCount }
}

module.exports = {
  TITLE,
  COLUMNS,
  buildRecordsExportData,
  dedupeImportedRecords,
  formatRecordTime,
  parseRecordsDataText,
}
