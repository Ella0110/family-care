const {
  LOW_BP,
  HR_THRESHOLD,
  isHighRecord,
  isLowRecord,
} = require('./report-helpers');

const CHART_COLORS = {
  systolic: '#3182F7',
  diastolic: '#10B981',
  heartRate: '#3182F7',
  alert: '#EF4444',
  text: '#475569',
  title: '#0F172A',
  grid: '#E2E8F0',
  bg: '#FFFFFF',
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function safeRecords(records) {
  return Array.isArray(records) ? records : [];
}

function pointX(index, total, plot) {
  if (total <= 1) {
    return (plot.left + plot.right) / 2;
  }

  return plot.left + (index / (total - 1)) * (plot.right - plot.left);
}

function roundRange(value, direction) {
  const step = 10;
  if (direction === 'min') {
    return Math.floor(value / step) * step;
  }

  return Math.ceil(value / step) * step;
}

function getLabelIndices(count, mode) {
  if (count <= 1) {
    return [0];
  }

  const desired = mode <= 7 ? count : mode <= 30 ? 5 : 6;
  const step = Math.max(1, Math.ceil((count - 1) / Math.max(desired - 1, 1)));
  const indices = [];

  for (let index = 0; index < count; index += step) {
    indices.push(index);
  }

  if (indices[indices.length - 1] !== count - 1) {
    indices.push(count - 1);
  }

  return indices;
}

function getBloodPressureRange(records, threshold) {
  const values = [];

  safeRecords(records).forEach((record) => {
    values.push(record.systolic, record.diastolic);
  });

  values.push(threshold.systolic, threshold.diastolic);

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const rangeMin = roundRange(min - 10, 'min');
  const rangeMax = roundRange(max + 10, 'max');

  return {
    min: rangeMin,
    max: rangeMax <= rangeMin ? rangeMin + 20 : rangeMax,
  };
}

function getHeartRateRange(records) {
  const values = safeRecords(records)
    .filter((record) => Number.isFinite(record.heartRate))
    .map((record) => record.heartRate)
    .concat([HR_THRESHOLD.high, HR_THRESHOLD.low]);

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const rangeMin = roundRange(Math.max(0, min - 10), 'min');
  const rangeMax = roundRange(max + 10, 'max');

  return {
    min: rangeMin,
    max: rangeMax <= rangeMin ? rangeMin + 20 : rangeMax,
  };
}

function valueToY(value, range, plot) {
  const span = range.max - range.min || 1;
  return plot.bottom - ((value - range.min) / span) * (plot.bottom - plot.top);
}

function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = CHART_COLORS.bg;
  ctx.fillRect(0, 0, width, height);
}

function drawTitle(ctx, leftTitle, rightTitle, canvasSize) {
  ctx.save();
  ctx.fillStyle = CHART_COLORS.title;
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(leftTitle, 0, 0);

  if (rightTitle) {
    ctx.fillStyle = CHART_COLORS.text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(rightTitle, canvasSize.width, 2);
  }
  ctx.restore();
}

function drawGrid(ctx, range, plot) {
  const stepCount = 4;

  ctx.save();
  ctx.strokeStyle = CHART_COLORS.grid;
  ctx.fillStyle = CHART_COLORS.text;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let index = 0; index <= stepCount; index += 1) {
    const ratio = index / stepCount;
    const value = Math.round(range.max - (range.max - range.min) * ratio);
    const y = plot.top + (plot.bottom - plot.top) * ratio;

    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(String(value), plot.left - 10, y);
  }

  ctx.restore();
}

function drawXAxisLabels(ctx, records, plot, mode) {
  const indices = getLabelIndices(records.length, mode);

  ctx.save();
  ctx.fillStyle = CHART_COLORS.text;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  indices.forEach((index) => {
    const record = records[index];
    if (!record) {
      return;
    }
    ctx.fillText(record.label, pointX(index, records.length, plot), plot.bottom + 12);
  });

  ctx.restore();
}

function drawReferenceLine(ctx, value, color, plot, range) {
  const y = valueToY(value, range, plot);

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.moveTo(plot.left, y);
  ctx.lineTo(plot.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPolyline(ctx, records, key, color, plot, range) {
  if (!records.length) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  records.forEach((record, index) => {
    const x = pointX(index, records.length, plot);
    const y = valueToY(record[key], range, plot);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawSinglePoint(ctx, x, y, color, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNormalPoints(ctx, records, key, color, plot, range) {
  records.forEach((record, index) => {
    drawSinglePoint(
      ctx,
      pointX(index, records.length, plot),
      valueToY(record[key], range, plot),
      color,
      2.5,
    );
  });
}

function drawAbnormalPoints(ctx, records, key, isAbnormal, plot, range) {
  records.forEach((record, index) => {
    if (!isAbnormal(record)) {
      return;
    }

    drawSinglePoint(
      ctx,
      pointX(index, records.length, plot),
      valueToY(record[key], range, plot),
      CHART_COLORS.alert,
      4,
    );
  });
}

function drawSegmentedPolyline(ctx, records, key, color, isAbnormal, plot, range) {
  if (!records.length) {
    return;
  }

  if (records.length === 1) {
    const record = records[0];
    drawSinglePoint(
      ctx,
      pointX(0, 1, plot),
      valueToY(record[key], range, plot),
      isAbnormal(record) ? CHART_COLORS.alert : color,
      3,
    );
    return;
  }

  for (let index = 0; index < records.length - 1; index += 1) {
    const current = records[index];
    const next = records[index + 1];
    const abnormal = isAbnormal(current) || isAbnormal(next);
    const x1 = pointX(index, records.length, plot);
    const y1 = valueToY(current[key], range, plot);
    const x2 = pointX(index + 1, records.length, plot);
    const y2 = valueToY(next[key], range, plot);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = abnormal ? CHART_COLORS.alert : color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRoundedBar(ctx, x, y, width, bottom, color) {
  const radius = Math.min(width / 2, 6, (bottom - y) / 2);

  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.moveTo(x, bottom);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function isSystolicAbnormal(record, threshold) {
  return record.systolic >= threshold.systolic || record.systolic < LOW_BP.systolic;
}

function isDiastolicAbnormal(record, threshold) {
  return record.diastolic >= threshold.diastolic || record.diastolic < LOW_BP.diastolic;
}

function drawBloodPressureTrendChart(ctx, records, threshold, canvasSize, mode) {
  const chartRecords = safeRecords(records);
  const plot = {
    left: 48,
    right: canvasSize.width - 10,
    top: 38,
    bottom: canvasSize.height - 34,
  };
  const range = getBloodPressureRange(chartRecords, threshold);

  clearCanvas(ctx, canvasSize.width, canvasSize.height);
  drawTitle(ctx, '血压波动趋势', '单位: mmHg', canvasSize);

  if (!chartRecords.length) {
    return;
  }

  drawGrid(ctx, range, plot);
  drawReferenceLine(ctx, threshold.systolic, CHART_COLORS.alert, plot, range);
  drawReferenceLine(ctx, threshold.diastolic, CHART_COLORS.diastolic, plot, range);
  drawXAxisLabels(ctx, chartRecords, plot, mode);

  if (mode <= 7) {
    drawPolyline(ctx, chartRecords, 'systolic', CHART_COLORS.systolic, plot, range);
    drawPolyline(ctx, chartRecords, 'diastolic', CHART_COLORS.diastolic, plot, range);
    drawNormalPoints(ctx, chartRecords, 'systolic', CHART_COLORS.systolic, plot, range);
    drawNormalPoints(ctx, chartRecords, 'diastolic', CHART_COLORS.diastolic, plot, range);
    drawAbnormalPoints(
      ctx,
      chartRecords,
      'systolic',
      (record) => isSystolicAbnormal(record, threshold),
      plot,
      range,
    );
    drawAbnormalPoints(
      ctx,
      chartRecords,
      'diastolic',
      (record) => isDiastolicAbnormal(record, threshold),
      plot,
      range,
    );
    return;
  }

  drawSegmentedPolyline(
    ctx,
    chartRecords,
    'systolic',
    CHART_COLORS.systolic,
    (record) => isSystolicAbnormal(record, threshold),
    plot,
    range,
  );
  drawSegmentedPolyline(
    ctx,
    chartRecords,
    'diastolic',
    CHART_COLORS.diastolic,
    (record) => isDiastolicAbnormal(record, threshold),
    plot,
    range,
  );
}

function drawHeartRateChart(ctx, records, threshold, canvasSize, mode) {
  const chartRecords = safeRecords(records).filter((record) => Number.isFinite(record.heartRate));
  const plot = {
    left: 48,
    right: canvasSize.width - 10,
    top: 38,
    bottom: canvasSize.height - 34,
  };

  clearCanvas(ctx, canvasSize.width, canvasSize.height);
  drawTitle(ctx, '心率变化 (bpm)', '', canvasSize);

  if (!chartRecords.length) {
    return;
  }

  const range = getHeartRateRange(chartRecords);
  const step = chartRecords.length <= 1 ? 0 : (plot.right - plot.left) / (chartRecords.length - 1);
  const barWidth = chartRecords.length <= 1
    ? Math.min(40, plot.right - plot.left)
    : Math.max(8, Math.min(24, step * 0.56));

  drawGrid(ctx, range, plot);
  drawXAxisLabels(ctx, chartRecords, plot, mode);

  chartRecords.forEach((record, index) => {
    const xCenter = pointX(index, chartRecords.length, plot);
    const y = valueToY(record.heartRate, range, plot);
    const color = record.heartRate > HR_THRESHOLD.high || record.heartRate < HR_THRESHOLD.low
      ? CHART_COLORS.alert
      : CHART_COLORS.heartRate;

    drawRoundedBar(ctx, xCenter - barWidth / 2, y, barWidth, plot.bottom, color);
  });
}

module.exports = {
  drawBloodPressureTrendChart,
  drawHeartRateChart,
};
