const {
  HR_THRESHOLD,
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

function safeChartData(chartData, mode) {
  if (chartData && Array.isArray(chartData.slots) && Array.isArray(chartData.points)) {
    return {
      mode: Number(chartData.mode) || Number(mode) || 7,
      slots: chartData.slots,
      points: chartData.points,
    };
  }

  return {
    mode: Number(mode) || 7,
    slots: [],
    points: [],
  };
}

function roundRange(value, direction) {
  const step = 10;
  if (direction === 'min') {
    return Math.floor(value / step) * step;
  }

  return Math.ceil(value / step) * step;
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

function getSlotCenter(index, totalSlots, plot) {
  if (totalSlots <= 1) {
    return (plot.left + plot.right) / 2;
  }

  return plot.left + (index / (totalSlots - 1)) * (plot.right - plot.left);
}

function getSlotStep(totalSlots, plot) {
  if (totalSlots <= 1) {
    return plot.right - plot.left;
  }

  return (plot.right - plot.left) / (totalSlots - 1);
}

function getLabelIndices(totalSlots, mode) {
  if (totalSlots <= 1) {
    return [0];
  }

  if (mode <= 7) {
    return Array.from({ length: totalSlots }, (_, index) => index);
  }

  const maxLabels = 8;
  if (totalSlots <= maxLabels) {
    return Array.from({ length: totalSlots }, (_, index) => index);
  }

  const indices = [];

  for (let index = 0; index < maxLabels; index += 1) {
    const nextIndex = Math.round((index * (totalSlots - 1)) / (maxLabels - 1));
    if (indices[indices.length - 1] !== nextIndex) {
      indices.push(nextIndex);
    }
  }

  return indices;
}

function drawXAxisLabels(ctx, slots, plot, mode) {
  const indices = getLabelIndices(slots.length, mode);

  ctx.save();
  ctx.fillStyle = CHART_COLORS.text;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  indices.forEach((index) => {
    const slot = slots[index];
    if (!slot) {
      return;
    }

    ctx.fillText(slot.label, getSlotCenter(index, slots.length, plot), plot.bottom + 12);
  });

  ctx.restore();
}

function valueToY(value, range, plot) {
  const span = range.max - range.min || 1;
  return plot.bottom - ((value - range.min) / span) * (plot.bottom - plot.top);
}

function getPointX(point, chartData, plot) {
  const slotCenter = getSlotCenter(point.slotIndex, chartData.slots.length, plot);
  if (chartData.mode > 7 || point.slotCount <= 1) {
    return slotCenter;
  }

  const step = getSlotStep(chartData.slots.length, plot);
  const offsetUnit = Math.min(step * 0.22, 18);
  let offset = 0;

  if (point.slotCount === 2) {
    offset = point.positionInSlot === 0 ? -offsetUnit * 0.7 : offsetUnit * 0.7;
  } else if (point.slotCount >= 3) {
    offset = (-1 + point.positionInSlot) * offsetUnit;
  }

  return slotCenter + offset;
}

function getBloodPressureRange(points, threshold) {
  const values = [];

  points.forEach((point) => {
    values.push(point.systolic, point.diastolic);
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

function getHeartRateRange(points) {
  const values = points
    .filter((point) => point.hasHeartRate)
    .map((point) => point.heartRate)
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

function drawSinglePoint(ctx, x, y, color, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPolyline(ctx, chartData, points, getValue, color, plot, range) {
  if (!points.length) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  points.forEach((point, index) => {
    const x = getPointX(point, chartData, plot);
    const y = valueToY(getValue(point), range, plot);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawSegmentedPolyline(ctx, chartData, points, getValue, color, isAlert, plot, range) {
  if (!points.length) {
    return;
  }

  if (points.length === 1) {
    const point = points[0];
    drawSinglePoint(
      ctx,
      getPointX(point, chartData, plot),
      valueToY(getValue(point), range, plot),
      isAlert(point) ? CHART_COLORS.alert : color,
      3,
    );
    return;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const abnormal = isAlert(current) || isAlert(next);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = abnormal ? CHART_COLORS.alert : color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.moveTo(
      getPointX(current, chartData, plot),
      valueToY(getValue(current), range, plot),
    );
    ctx.lineTo(
      getPointX(next, chartData, plot),
      valueToY(getValue(next), range, plot),
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawNormalPoints(ctx, chartData, points, getValue, color, plot, range) {
  points.forEach((point) => {
    drawSinglePoint(
      ctx,
      getPointX(point, chartData, plot),
      valueToY(getValue(point), range, plot),
      color,
      2.5,
    );
  });
}

function drawAlertPoints(ctx, chartData, points, getValue, isAlert, plot, range) {
  points.forEach((point) => {
    if (!isAlert(point)) {
      return;
    }

    drawSinglePoint(
      ctx,
      getPointX(point, chartData, plot),
      valueToY(getValue(point), range, plot),
      CHART_COLORS.alert,
      4,
    );
  });
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

function drawBloodPressureTrendChart(ctx, chartInput, threshold, canvasSize, mode) {
  const chartData = safeChartData(chartInput, mode);
  const plot = {
    left: 48,
    right: canvasSize.width - 10,
    top: 38,
    bottom: canvasSize.height - 34,
  };

  clearCanvas(ctx, canvasSize.width, canvasSize.height);
  drawTitle(ctx, '血压波动趋势', '单位: mmHg', canvasSize);

  if (!chartData.points.length) {
    return;
  }

  const range = getBloodPressureRange(chartData.points, threshold);

  drawGrid(ctx, range, plot);
  drawReferenceLine(ctx, threshold.systolic, CHART_COLORS.alert, plot, range);
  drawReferenceLine(ctx, threshold.diastolic, CHART_COLORS.diastolic, plot, range);
  drawXAxisLabels(ctx, chartData.slots, plot, chartData.mode);

  if (chartData.mode <= 7) {
    drawPolyline(ctx, chartData, chartData.points, (point) => point.systolic, CHART_COLORS.systolic, plot, range);
    drawPolyline(ctx, chartData, chartData.points, (point) => point.diastolic, CHART_COLORS.diastolic, plot, range);
    drawNormalPoints(ctx, chartData, chartData.points, (point) => point.systolic, CHART_COLORS.systolic, plot, range);
    drawNormalPoints(ctx, chartData, chartData.points, (point) => point.diastolic, CHART_COLORS.diastolic, plot, range);
    drawAlertPoints(ctx, chartData, chartData.points, (point) => point.systolic, (point) => point.systolicAlert, plot, range);
    drawAlertPoints(ctx, chartData, chartData.points, (point) => point.diastolic, (point) => point.diastolicAlert, plot, range);
    return;
  }

  drawSegmentedPolyline(
    ctx,
    chartData,
    chartData.points,
    (point) => point.systolic,
    CHART_COLORS.systolic,
    (point) => point.systolicAlert,
    plot,
    range,
  );
  drawSegmentedPolyline(
    ctx,
    chartData,
    chartData.points,
    (point) => point.diastolic,
    CHART_COLORS.diastolic,
    (point) => point.diastolicAlert,
    plot,
    range,
  );
}

function drawHeartRateChart(ctx, chartInput, threshold, canvasSize, mode) {
  const chartData = safeChartData(chartInput, mode);
  const heartRatePoints = chartData.points.filter((point) => point.hasHeartRate);
  const plot = {
    left: 48,
    right: canvasSize.width - 10,
    top: 38,
    bottom: canvasSize.height - 34,
  };

  clearCanvas(ctx, canvasSize.width, canvasSize.height);
  drawTitle(ctx, '心率变化 (bpm)', '', canvasSize);

  if (!heartRatePoints.length) {
    return;
  }

  const range = getHeartRateRange(heartRatePoints);

  drawGrid(ctx, range, plot);
  drawXAxisLabels(ctx, chartData.slots, plot, chartData.mode);

  if (chartData.mode <= 7) {
    const slotStep = Math.max(12, getSlotStep(chartData.slots.length, plot));
    const barWidth = Math.max(8, Math.min(18, slotStep * 0.18));

    heartRatePoints.forEach((point) => {
      const xCenter = getPointX(point, chartData, plot);
      const y = valueToY(point.heartRate, range, plot);
      const color = point.heartRateAlert ? CHART_COLORS.alert : CHART_COLORS.heartRate;

      drawRoundedBar(ctx, xCenter - barWidth / 2, y, barWidth, plot.bottom, color);
    });
    return;
  }

  drawPolyline(
    ctx,
    chartData,
    heartRatePoints,
    (point) => point.heartRate,
    CHART_COLORS.heartRate,
    plot,
    range,
  );
  drawNormalPoints(
    ctx,
    chartData,
    heartRatePoints,
    (point) => point.heartRate,
    CHART_COLORS.heartRate,
    plot,
    range,
  );
  drawAlertPoints(
    ctx,
    chartData,
    heartRatePoints,
    (point) => point.heartRate,
    (point) => point.heartRateAlert,
    plot,
    range,
  );
}

module.exports = {
  drawBloodPressureTrendChart,
  drawHeartRateChart,
};
