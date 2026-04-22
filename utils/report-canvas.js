const { drawBloodPressureChart, drawHeartRateChart } = require('./canvas-charts')
const { getBPStatus, getHRStatus } = require('./health-rules')

// ── Layout constants ──────────────────────────────────────────────────────────
const PAD = 32          // horizontal padding
const INNER = 686       // 750 - PAD*2

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#FFFFFF',
  title:   '#0F172A',
  text:    '#334155',
  muted:   '#64748B',
  faint:   '#94A3B8',
  divider: '#E2E8F0',
  surface: '#F8FAFC',
  warn:    '#EF4444',
  // Status card palettes
  normalBg:    '#DCFCE7', normalText:    '#15803D', normalDot:    '#22C55E',
  attentionBg: '#FEF3C7', attentionText: '#92400E', attentionDot: '#F59E0B',
  warningBg:   '#FFEDD5', warningText:   '#9A3412', warningDot:   '#FB923C',
  dangerBg:    '#FEE2E2', dangerText:    '#991B1B', dangerDot:    '#EF4444',
  // Range bar zone fill colors (lighter, inside bars)
  zLow:    '#CBD5E1',
  zNormal: '#86EFAC',
  zAtt:    '#FCD34D',
  zWarn:   '#FDBA74',
  zDanger: '#FCA5A5',
}

// ── Drawing primitives ────────────────────────────────────────────────────────

function sf(ctx, c) { if (ctx.setFillStyle) ctx.setFillStyle(c); else ctx.fillStyle = c }
function ss(ctx, c) { if (ctx.setStrokeStyle) ctx.setStrokeStyle(c); else ctx.strokeStyle = c }
function sfont(ctx, sz, w) {
  w = w || '400'
  if (ctx.setFontSize) ctx.setFontSize(sz)
  else ctx.font = w + ' ' + sz + 'px -apple-system, BlinkMacSystemFont, sans-serif'
}
function txt(ctx, v, x, y, sz, c, w) {
  sz = sz || 24; c = c || C.text; w = w || '400'
  sf(ctx, c); sfont(ctx, sz, w)
  ctx.fillText(String(v), x, y)
}
function hline(ctx, x1, x2, y, c) {
  c = c || C.divider
  ss(ctx, c); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
}
function block(ctx, x, y, w, h, c) { sf(ctx, c); ctx.fillRect(x, y, w, h) }
function mw(ctx, v, sz, w) {
  sfont(ctx, sz || 24, w || '400')
  return ctx.measureText(String(v)).width
}

function wrapTxt(ctx, v, x, y, maxW, lh, sz, c) {
  const chars = String(v).split('')
  let line = ''
  chars.forEach(function(ch) {
    const next = line + ch
    if (mw(ctx, next, sz) > maxW && line) {
      txt(ctx, line, x, y, sz, c); y += lh; line = ch
    } else { line = next }
  })
  if (line) txt(ctx, line, x, y, sz, c)
  return y + lh
}

// ── Date helper ───────────────────────────────────────────────────────────────

function toDate(v) {
  if (v instanceof Date) return v
  if (v && v.$date) return new Date(v.$date)
  if (v && v._date) return new Date(v._date)
  return new Date(v)
}

function shortTime(measuredAt) {
  const d = toDate(measuredAt)
  const mo = d.getMonth() + 1
  const dy = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return mo + '月' + dy + '日 ' + hh + ':' + mm
}

// ── Status card ───────────────────────────────────────────────────────────────

function worstLevel(records, refLines) {
  if (!records || !records.length) return -1
  const bpT = { systolic: refLines.systolic, diastolic: refLines.diastolic }
  const hrT = { min: refLines.hrMin, max: refLines.hrMax }
  let w = 0
  records.forEach(function(r) {
    const bp = getBPStatus(r.systolic, r.diastolic, bpT)
    const hr = getHRStatus(r.heartRate, hrT)
    const bn = bp.level === 'critical' ? 3 : bp.level === 'veryHigh' ? 2 : bp.attention ? 1 : 0
    const hn = (hr.level === 'veryFast' || hr.level === 'verySlow') ? 2 : hr.attention ? 1 : 0
    w = Math.max(w, bn, hn)
  })
  return w
}

function statusPalette(level) {
  if (level < 0) return { title: '暂无数据', desc: '当前周期尚无记录', bg: C.surface, tc: C.muted, dot: C.faint }
  const L = [
    { title: '整体正常',   desc: '所有测量均在参考范围内',         bg: C.normalBg,    tc: C.normalText,    dot: C.normalDot    },
    { title: '轻微偏高',   desc: '部分测量超出参考值，请继续观察', bg: C.attentionBg, tc: C.attentionText, dot: C.attentionDot },
    { title: '明显偏高',   desc: '存在明显偏高测量，建议近期就医', bg: C.warningBg,   tc: C.warningText,   dot: C.warningDot   },
    { title: '血压过高',   desc: '存在极高血压测量，请尽快就医',   bg: C.dangerBg,    tc: C.dangerText,    dot: C.dangerDot    },
  ]
  return L[Math.min(level, 3)]
}

// ── Range bar zones ───────────────────────────────────────────────────────────

function bpSysZones(ref) {
  return [
    { from: 60,  to: 90,  c: C.zLow    },
    { from: 90,  to: ref, c: C.zNormal },
    { from: ref, to: 160, c: C.zAtt    },
    { from: 160, to: 180, c: C.zWarn   },
    { from: 180, to: 220, c: C.zDanger },
  ]
}

function bpDiaZones(ref) {
  return [
    { from: 40,  to: 60,  c: C.zLow    },
    { from: 60,  to: ref, c: C.zNormal },
    { from: ref, to: 100, c: C.zAtt    },
    { from: 100, to: 110, c: C.zWarn   },
    { from: 110, to: 140, c: C.zDanger },
  ]
}

function hrZones(hrMin, hrMax) {
  return [
    { from: 30,    to: 50,    c: C.zDanger },
    { from: 50,    to: hrMin, c: C.zAtt    },
    { from: hrMin, to: hrMax, c: C.zNormal },
    { from: hrMax, to: 100,   c: C.zAtt    },
    { from: 100,   to: 160,   c: C.zDanger },
  ]
}

// Draw one labelled range bar row. Returns y after this row.
// Layout: [label 64px][8px][bar][8px][value unit]
function drawBarRow(ctx, x, y, label, value, unit, minV, maxV, zones) {
  const LABEL_W = 64
  const VAL_W   = 88   // enough for "180 mmHg"
  const BAR_W   = INNER - LABEL_W - 8 - 8 - VAL_W
  const BAR_H   = 14
  const bx = x + LABEL_W + 8
  const by = y + 10   // bar sits 10px below row top

  // Label (vertically centred with bar)
  txt(ctx, label, x, by + BAR_H - 1, 20, C.muted)

  // Bar background
  block(ctx, bx, by, BAR_W, BAR_H, C.divider)

  // Coloured zones
  const scale = function(v) {
    return bx + Math.min(Math.max((v - minV) / (maxV - minV), 0), 1) * BAR_W
  }
  zones.forEach(function(z) {
    const x1 = scale(z.from), x2 = scale(z.to)
    if (x2 > x1) block(ctx, x1, by, x2 - x1, BAR_H, z.c)
  })

  // Marker tick
  const mx = Math.min(Math.max(scale(value), bx + 3), bx + BAR_W - 3)
  block(ctx, mx - 3, by - 3, 6, BAR_H + 6, C.title)

  // Value + unit (right of bar)
  const vs = String(value)
  const vx = bx + BAR_W + 10
  txt(ctx, vs, vx, by + BAR_H - 1, 22, C.text, '700')
  txt(ctx, unit, vx + mw(ctx, vs, 22, '700') + 5, by + BAR_H - 1, 18, C.faint)

  return y + BAR_H + 24   // row height = 14 + 24 = 38 total
}

// ── Section renderers ─────────────────────────────────────────────────────────

function drawHeader(ctx, report, W, y) {
  txt(ctx, report.title, PAD, y, 36, C.title, '700')
  y += 46
  txt(ctx, report.familyName, PAD, y, 24, C.text)
  y += 34
  txt(ctx, report.periodTitle + ' · 生成时间 ' + report.generatedAt, PAD, y, 22, C.muted)
  y += 36
  hline(ctx, PAD, W - PAD, y)
  return y + 32
}

function drawProfile(ctx, report, W, y, hidePrivacy) {
  const MASK = '***'
  txt(ctx, '患者档案', PAD, y, 26, C.title, '700')
  y += 38

  // Name + age
  const nameRaw  = report.profileName || '未设置'
  const nameDisp = hidePrivacy ? MASK : (report.profileAge ? nameRaw + '（' + report.profileAge + '）' : nameRaw)
  txt(ctx, '姓名', PAD, y, 22, C.muted)
  txt(ctx, nameDisp, PAD + 88, y, 22, nameRaw !== '未设置' ? C.text : C.faint)
  y += 34

  // Medications
  txt(ctx, '用药', PAD, y, 22, C.muted)
  if (report.profileMedications) {
    y = wrapTxt(ctx, report.profileMedications, PAD + 88, y, INNER - 88, 30, 22, C.text)
  } else {
    txt(ctx, '未填写', PAD + 88, y, 22, C.faint)
    y += 34
  }

  // Emergency contact
  const hasContact = report.profileEmergencyName || report.profileEmergencyPhone
  if (hasContact) {
    const contactRaw = [report.profileEmergencyName, report.profileEmergencyPhone].filter(Boolean).join('  ')
    txt(ctx, '联系人', PAD, y, 22, C.muted)
    txt(ctx, hidePrivacy ? MASK : contactRaw, PAD + 88, y, 22, C.text)
    y += 34
  }

  hline(ctx, PAD, W - PAD, y + 4)
  return y + 32
}

function drawStatusCard(ctx, report, W, y) {
  const level  = worstLevel(report.rawRecords, report.refLines)
  const p      = statusPalette(level)
  const cardH  = 84

  block(ctx, PAD, y, INNER, cardH, p.bg)
  // Dot
  block(ctx, PAD + 20, y + 37, 10, 10, p.dot)
  // Title
  txt(ctx, p.title, PAD + 44, y + 46, 26, p.tc, '700')
  // Desc
  txt(ctx, p.desc, PAD + 44, y + 70, 20, p.tc)

  return y + cardH + 28
}

function drawSummary(ctx, report, W, y) {
  txt(ctx, '摘要', PAD, y, 26, C.title, '700')
  y += 38

  const avgBp  = report.avg.systolic === '--' ? '--' : report.avg.systolic + '/' + report.avg.diastolic
  const total  = report.totalCount
  const bpAtt  = Number(report.stats.bp.attention)
  const hrAtt  = Number(report.stats.hr.attention)

  const items = [
    { v: avgBp,                            l: '血压均值 (mmHg)', warn: false },
    { v: String(report.avg.heartRate),     l: '心率均值 (bpm)',  warn: false },
    { v: bpAtt + '/' + total + '次',       l: '血压超参考',      warn: bpAtt > 0 },
    { v: hrAtt + '/' + total + '次',       l: '心率超参考',      warn: hrAtt > 0 },
  ]

  const colW = INNER / 2
  items.forEach(function(item, i) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const ix  = PAD + col * colW
    const iy  = y + row * 70
    txt(ctx, item.v, ix, iy, 30, item.warn ? C.warn : C.title, '700')
    txt(ctx, item.l, ix, iy + 28, 20, C.muted)
  })

  return y + 2 * 70 + 20
}

function drawBPSection(ctx, report, W, y) {
  txt(ctx, '血压趋势', PAD, y, 26, C.title, '700')
  y += 36

  const n = report.rawRecords.length

  if (n === 0) {
    block(ctx, PAD, y, INNER, 72, C.surface)
    txt(ctx, '当前周期暂无记录', PAD + INNER / 2 - 72, y + 44, 22, C.muted)
    return y + 72 + 24
  }

  if (n < 3) {
    report.rawRecords.forEach(function(record, i) {
      if (i > 0) { hline(ctx, PAD, W - PAD, y + 4); y += 20 }
      txt(ctx, shortTime(record.measuredAt), PAD, y, 20, C.muted)
      y += 28
      y = drawBarRow(ctx, PAD, y, '高压', record.systolic, 'mmHg', 60, 220, bpSysZones(report.refLines.systolic))
      y = drawBarRow(ctx, PAD, y, '低压', record.diastolic, 'mmHg', 40, 140, bpDiaZones(report.refLines.diastolic))
    })
    return y + 20
  }

  const chartH = 240
  drawBloodPressureChart(ctx, report.bpChart, INNER, chartH, { title: '', x: PAD, y: y })
  return y + chartH + 24
}

function drawHRSection(ctx, report, W, y) {
  txt(ctx, '心率趋势', PAD, y, 26, C.title, '700')
  y += 36

  const n = report.rawRecords.length

  if (n === 0) {
    block(ctx, PAD, y, INNER, 72, C.surface)
    txt(ctx, '当前周期暂无记录', PAD + INNER / 2 - 72, y + 44, 22, C.muted)
    return y + 72 + 24
  }

  if (n < 3) {
    report.rawRecords.forEach(function(record, i) {
      if (i > 0) { hline(ctx, PAD, W - PAD, y + 4); y += 20 }
      txt(ctx, shortTime(record.measuredAt), PAD, y, 20, C.muted)
      y += 28
      y = drawBarRow(ctx, PAD, y, '心率', record.heartRate, '次/分', 30, 160, hrZones(report.refLines.hrMin, report.refLines.hrMax))
    })
    return y + 20
  }

  const chartH = 220
  drawHeartRateChart(ctx, report.hrChart, INNER, chartH, { title: '', x: PAD, y: y })
  return y + chartH + 24
}

function drawRefLineNote(ctx, report, W, y) {
  if (!report.refLineText) return y
  block(ctx, PAD, y, INNER, 42, C.surface)
  txt(ctx, report.refLineText, PAD + 12, y + 28, 20, C.muted)
  return y + 56
}

function drawRecentRecords(ctx, report, W, y) {
  txt(ctx, '最近记录', PAD, y, 26, C.title, '700')
  y += 36

  if (!report.recentRecords.length) {
    txt(ctx, '当前周期暂无记录', PAD, y, 22, C.muted)
    return y + 40
  }

  report.recentRecords.forEach(function(record) {
    txt(ctx, record.time, PAD, y, 20, C.muted)
    txt(ctx, record.bpText + ' · ' + record.heartRateText, PAD + 230, y, 22, C.text, '700')
    y += 26
    txt(ctx, '血压' + record.bpStatus + ' · 心率' + record.hrStatus, PAD + 230, y, 20, C.muted)
    y += 28
    hline(ctx, PAD, W - PAD, y + 2)
    y += 14
  })
  return y
}

function drawDisclaimer(ctx, report, W, y) {
  hline(ctx, PAD, W - PAD, y)
  y += 32
  return wrapTxt(ctx, report.disclaimer, PAD, y, INNER, 30, 20, C.muted)
}

// ── Public API ────────────────────────────────────────────────────────────────

function reportImageHeight(report) {
  const n  = report.rawRecords.length
  const rc = report.recentRecords.length
  let y = 48

  // Header: title + familyName + periodTitle + divider
  y += 46 + 34 + 36 + 32

  // Profile: section title + name + meds (1 line est.) + optional contact + divider
  y += 38 + 34 + 34
  if (report.profileEmergencyName || report.profileEmergencyPhone) y += 34
  y += 32

  // Status card
  y += 84 + 28

  // Summary: title + 2 rows × 70 + pad
  y += 38 + 2 * 70 + 20

  // BP section
  y += 36
  if (n === 0)    y += 72 + 24
  else if (n < 3) y += 104 + (n - 1) * 124 + 20
  else            y += 240 + 24

  // HR section
  y += 36
  if (n === 0)    y += 72 + 24
  else if (n < 3) y += 66 + (n - 1) * 86 + 20
  else            y += 220 + 24

  // RefLineNote
  if (report.refLineText) y += 56

  // Recent records
  y += rc > 0 ? 36 + rc * 68 : 36 + 40

  // Disclaimer: divider + ~2 lines of Chinese text
  y += 32 + 60

  // Bottom padding
  y += 48

  return y
}

function drawReportImage(ctx, report, width, height, options) {
  options = options || {}
  const hidePrivacy = options.hidePrivacy === true
  const W = width

  block(ctx, 0, 0, W, height, C.bg)

  let y = 48
  y = drawHeader(ctx, report, W, y)
  y = drawProfile(ctx, report, W, y, hidePrivacy)
  y = drawStatusCard(ctx, report, W, y)
  y = drawSummary(ctx, report, W, y)
  y = drawBPSection(ctx, report, W, y)
  y = drawHRSection(ctx, report, W, y)
  y = drawRefLineNote(ctx, report, W, y)
  y = drawRecentRecords(ctx, report, W, y)
  drawDisclaimer(ctx, report, W, y)
}

module.exports = {
  drawReportImage,
  reportImageHeight,
}
