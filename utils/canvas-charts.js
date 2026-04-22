const COLORS = {
  systolic: '#3182F7',
  diastolic: '#2FB67C',
  heartRate: '#FF9500',
  abnormal: '#E53935',
  grid: '#E2E8F0',
  text: '#64748B',
  title: '#0F172A',
  ref: '#94A3B8',
  background: '#FFFFFF',
}

function setFill(ctx, color) {
  if (ctx.setFillStyle) ctx.setFillStyle(color)
  else ctx.fillStyle = color
}

function setStroke(ctx, color) {
  if (ctx.setStrokeStyle) ctx.setStrokeStyle(color)
  else ctx.strokeStyle = color
}

function setLineWidth(ctx, width) {
  if (ctx.setLineWidth) ctx.setLineWidth(width)
  else ctx.lineWidth = width
}

function setFontSize(ctx, size) {
  if (ctx.setFontSize) ctx.setFontSize(size)
  else ctx.font = `${size}px -apple-system, BlinkMacSystemFont, sans-serif`
}

function setLineDash(ctx, dash) {
  if (ctx.setLineDash) ctx.setLineDash(dash, 0)
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height)
  setFill(ctx, COLORS.background)
  ctx.fillRect(0, 0, width, height)
}

function drawChartArea(ctx, width, height, options, draw) {
  const x = options.x || 0
  const y = options.y || 0
  ctx.clearRect(x, y, width, height)
  setFill(ctx, COLORS.background)
  ctx.fillRect(x, y, width, height)
  if (ctx.save) ctx.save()
  if (x || y) ctx.translate(x, y)
  draw()
  if (ctx.restore) ctx.restore()
}

function valueToY(value, range, plot) {
  const span = range.max - range.min || 1
  return plot.bottom - ((value - range.min) / span) * (plot.bottom - plot.top)
}

function pointX(index, total, plot) {
  if (total <= 1) return (plot.left + plot.right) / 2
  return plot.left + (index / (total - 1)) * (plot.right - plot.left)
}

function drawGrid(ctx, chart, plot) {
  setStroke(ctx, COLORS.grid)
  setLineWidth(ctx, 1)
  ;[0, 0.25, 0.5, 0.75, 1].forEach(ratio => {
    const y = plot.top + ratio * (plot.bottom - plot.top)
    ctx.beginPath()
    ctx.moveTo(plot.left, y)
    ctx.lineTo(plot.right, y)
    ctx.stroke()
  })

  setFill(ctx, COLORS.text)
  setFontSize(ctx, 10)
  chart.refs.forEach(ref => {
    const y = valueToY(ref, chart.range, plot)
    setLineDash(ctx, [6, 4])
    setStroke(ctx, COLORS.ref)
    ctx.beginPath()
    ctx.moveTo(plot.left, y)
    ctx.lineTo(plot.right, y)
    ctx.stroke()
    setLineDash(ctx, [])
    ctx.fillText(String(ref), 4, y + 3)
  })
}

function drawLabels(ctx, records, plot) {
  setFill(ctx, COLORS.text)
  setFontSize(ctx, 10)
  const step = records.length > 10 ? Math.ceil(records.length / 6) : 1
  records.forEach((record, index) => {
    if (index % step !== 0 && index !== records.length - 1) return
    ctx.fillText(record.label, pointX(index, records.length, plot) - 10, plot.bottom + 18)
  })
}

function drawLegend(ctx, items, x, y) {
  setFontSize(ctx, 11)
  items.forEach(item => {
    setFill(ctx, item.color)
    ctx.fillRect(x, y - 8, 12, 3)
    setFill(ctx, COLORS.text)
    ctx.fillText(item.label, x + 18, y)
    x += item.width
  })
}

function drawLine(ctx, records, key, chart, plot, color) {
  if (!records.length) return

  setStroke(ctx, color)
  setLineWidth(ctx, 3)
  ctx.beginPath()
  records.forEach((record, index) => {
    const x = pointX(index, records.length, plot)
    const y = valueToY(record[key], chart.range, plot)
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  records.forEach((record, index) => {
    const x = pointX(index, records.length, plot)
    const y = valueToY(record[key], chart.range, plot)
    setFill(ctx, record.abnormal ? COLORS.abnormal : color)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, 2 * Math.PI)
    ctx.fill()
  })
}

function drawTitle(ctx, title) {
  if (!title) return
  setFill(ctx, COLORS.title)
  setFontSize(ctx, 18)
  ctx.fillText(title, 16, 24)
}

function drawBloodPressureChart(ctx, chart, width, height, options = {}) {
  drawChartArea(ctx, width, height, options, () => {
    if (!chart || !chart.records.length) return

    const plot = { left: 32, right: width - 16, top: options.title ? 42 : 16, bottom: height - 36 }
    drawTitle(ctx, options.title)
    drawGrid(ctx, chart, plot)
    drawLine(ctx, chart.records, 'systolic', chart, plot, COLORS.systolic)
    drawLine(ctx, chart.records, 'diastolic', chart, plot, COLORS.diastolic)
    drawLabels(ctx, chart.records, plot)
    drawLegend(ctx, [
      { label: '高压', color: COLORS.systolic, width: 58 },
      { label: '低压', color: COLORS.diastolic, width: 58 },
      { label: '异常点', color: COLORS.abnormal, width: 72 },
    ], 16, height - 8)
  })
}

function drawHeartRateChart(ctx, chart, width, height, options = {}) {
  drawChartArea(ctx, width, height, options, () => {
    if (!chart || !chart.records.length) return

    const plot = { left: 32, right: width - 16, top: options.title ? 42 : 16, bottom: height - 36 }
    drawTitle(ctx, options.title)
    drawGrid(ctx, chart, plot)
    const barWidth = Math.max(6, Math.min(18, (plot.right - plot.left) / Math.max(chart.records.length * 1.8, 1)))
    chart.records.forEach((record, index) => {
      const x = pointX(index, chart.records.length, plot) - barWidth / 2
      const y = valueToY(record.heartRate, chart.range, plot)
      setFill(ctx, record.abnormal ? COLORS.abnormal : COLORS.heartRate)
      ctx.fillRect(x, y, barWidth, plot.bottom - y)
    })
    drawLabels(ctx, chart.records, plot)
    drawLegend(ctx, [
      { label: '心率', color: COLORS.heartRate, width: 58 },
      { label: '异常', color: COLORS.abnormal, width: 58 },
    ], 16, height - 8)
  })
}

module.exports = {
  drawBloodPressureChart,
  drawHeartRateChart,
}
