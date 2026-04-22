const TABLE_LEFT = 6
const TABLE_RIGHT = 729
const TITLE_Y = 54
const RANGE_Y = 132
const TABLE_TOP = 182
const HEADER_HEIGHT = 112
const ROW_HEIGHT = 82
const BOTTOM_PADDING = 8
const COLUMNS = [6, 282, 430, 580, 729]

function setFont(ctx, size, weight = '400') {
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, sans-serif`
}

function text(ctx, value, x, y, size, color = '#202124', weight = '400', align = 'left') {
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  setFont(ctx, size, weight)
  ctx.fillText(String(value), x, y)
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function recordsDataImageHeight(rowCount) {
  return TABLE_TOP + HEADER_HEIGHT + Math.max(rowCount, 1) * ROW_HEIGHT + BOTTOM_PADDING
}

function drawHeaderCell(ctx, label, x, y) {
  const parts = String(label).split('\n')
  text(ctx, parts[0], x, y + 43, 30)
  if (parts[1]) text(ctx, parts[1], x, y + 88, 28)
}

function drawRecordsDataImage(ctx, exportData, width, height) {
  const rows = exportData.rows || []
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  text(ctx, exportData.title || '血压心率数据记录', width / 2, TITLE_Y, 46, '#101418', '700', 'center')
  text(ctx, exportData.rangeText || '数据记录时间：暂无数据', width / 2, RANGE_Y, 31, '#5F6B7A', '500', 'center')

  const tableBottom = TABLE_TOP + HEADER_HEIGHT + Math.max(rows.length, 1) * ROW_HEIGHT

  ctx.fillStyle = '#F8FAFC'
  ctx.fillRect(TABLE_LEFT + 1, TABLE_TOP + 1, TABLE_RIGHT - TABLE_LEFT - 2, HEADER_HEIGHT - 1)

  ctx.strokeStyle = '#202124'
  ctx.lineWidth = 1
  COLUMNS.forEach(x => line(ctx, x, TABLE_TOP, x, tableBottom))
  line(ctx, TABLE_LEFT, TABLE_TOP, TABLE_RIGHT, TABLE_TOP)
  line(ctx, TABLE_LEFT, TABLE_TOP + HEADER_HEIGHT, TABLE_RIGHT, TABLE_TOP + HEADER_HEIGHT)
  line(ctx, TABLE_LEFT, tableBottom, TABLE_RIGHT, tableBottom)

  const headerY = TABLE_TOP
  drawHeaderCell(ctx, exportData.columns[0], 20, headerY)
  drawHeaderCell(ctx, exportData.columns[1], 292, headerY)
  drawHeaderCell(ctx, exportData.columns[2], 442, headerY)
  drawHeaderCell(ctx, exportData.columns[3], 592, headerY)

  if (!rows.length) {
    text(ctx, '暂无数据', 20, TABLE_TOP + HEADER_HEIGHT + 50, 29, '#5F6B7A')
    return
  }

  rows.forEach((record, index) => {
    const y = TABLE_TOP + HEADER_HEIGHT + index * ROW_HEIGHT
    line(ctx, TABLE_LEFT, y + ROW_HEIGHT, TABLE_RIGHT, y + ROW_HEIGHT)
    text(ctx, record.timeText, 20, y + 55, 29)
    text(ctx, record.systolic, 292, y + 55, 29)
    text(ctx, record.diastolic, 442, y + 55, 29)
    text(ctx, record.heartRate, 592, y + 55, 29)
  })
}

module.exports = {
  drawRecordsDataImage,
  recordsDataImageHeight,
}
