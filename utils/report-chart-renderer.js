const { HR_THRESHOLD } = require("./report-helpers");

const AXIS_STEP = 50;

const CHART_COLORS = {
    systolic: "#0356FC",
    diastolic: "#0356FC",
    heartRate: "#0356FC",
    normalPoint: "#0356FC",
    alert: "#EF4444",
    reference: "#D1D5DB",
    text: "#475569",
    title: "#0F172A",
    grid: "#E2E8F0",
    bg: "#FFFFFF",
};

const CHART_PADDING = {
    left: 36,
    right: 18,
    top: 36,
    bottom: 30,
};

function safeChartData(chartData, mode) {
    if (
        chartData &&
        Array.isArray(chartData.slots) &&
        Array.isArray(chartData.points)
    ) {
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

function roundUpToAxisStep(value) {
    return Math.ceil(value / AXIS_STEP) * AXIS_STEP;
}

function clearCanvas(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = CHART_COLORS.bg;
    ctx.fillRect(0, 0, width, height);
}

function drawTitle(ctx, leftTitle, rightTitle, canvasSize) {
    if (!leftTitle && !rightTitle) {
        return;
    }

    ctx.save();
    if (leftTitle) {
        ctx.fillStyle = CHART_COLORS.title;
        ctx.font = "15px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(leftTitle, 0, 0);
    }

    if (rightTitle) {
        ctx.fillStyle = CHART_COLORS.text;
        ctx.font = "12px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(rightTitle, canvasSize.width - 4, 2);
    }

    ctx.restore();
}

function drawGrid(ctx, ticks, range, plot) {
    ctx.save();
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.fillStyle = CHART_COLORS.text;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    ticks.forEach((value) => {
        const y = valueToY(value, range, plot);

        ctx.beginPath();
        ctx.moveTo(plot.left, y);
        ctx.lineTo(plot.right, y);
        ctx.stroke();
        ctx.fillText(String(value), plot.left - 10, y);
    });

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

function formatMonthDayNoPadding(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function isMonthEnd(date) {
    const nextDate = new Date(date.getTime());
    nextDate.setDate(date.getDate() + 1);
    return nextDate.getDate() === 1;
}

function getInteriorXAxisIndexes(totalSlots) {
    if (totalSlots <= 2) {
        return [];
    }

    const lastIndex = totalSlots - 1;
    const firstInterior = Math.round(lastIndex / 3);
    const secondInterior = Math.round((lastIndex * 2) / 3);
    return Array.from(new Set([firstInterior, secondInterior])).filter(
        (index) => index > 0 && index < lastIndex,
    );
}

function shouldShowXAxisLabel(slot, index, totalSlots, mode) {
    if (!slot || !(slot.date instanceof Date) || Number.isNaN(slot.date.getTime())) {
        return false;
    }

    if (mode <= 7) {
        return true;
    }

    if (index === 0 || index === totalSlots - 1) {
        return true;
    }

    return getInteriorXAxisIndexes(totalSlots).includes(index);
}

function drawXAxisLabels(ctx, slots, plot, mode) {
    ctx.save();
    ctx.fillStyle = CHART_COLORS.text;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    slots.forEach((slot, index) => {
        if (!shouldShowXAxisLabel(slot, index, slots.length, mode)) {
            return;
        }

        ctx.fillText(
            formatMonthDayNoPadding(slot.date),
            getSlotCenter(index, slots.length, plot),
            plot.bottom + 12,
        );
    });

    ctx.restore();
}

function valueToY(value, range, plot) {
    const span = range.max - range.min || 1;
    return (
        plot.bottom - ((value - range.min) / span) * (plot.bottom - plot.top)
    );
}

function getPointX(point, chartData, plot) {
    const slotCenter = getSlotCenter(
        point.slotIndex,
        chartData.slots.length,
        plot,
    );
    if (chartData.mode > 7 || point.slotCount <= 1) {
        return slotCenter;
    }

    const step = getSlotStep(chartData.slots.length, plot);
    const offsetUnit = step / 3;
    let offset = 0;

    if (point.slotCount === 2) {
        offset = point.positionInSlot === 0 ? -offsetUnit : offsetUnit;
    } else if (point.slotCount >= 3) {
        offset = (-1 + point.positionInSlot) * offsetUnit;
    }

    return slotCenter + offset;
}

// function getBloodPressureRange(points, threshold) {
//   const values = [];

//   points.forEach((point) => {
//     values.push(point.systolic, point.diastolic);
//   });
//   values.push(threshold.systolic, threshold.diastolic);

//   const min = Math.min.apply(null, values);
//   const max = Math.max.apply(null, values);
//   const rangeMin = roundRange(min - 10, 'min');
//   const rangeMax = roundRange(max + 10, 'max');

//   return {
//     min: rangeMin,
//     max: rangeMax <= rangeMin ? rangeMin + 20 : rangeMax,
//   };
// }

function getBloodPressureRange(points, threshold) {
    const values = [];
    points.forEach((point) => {
        values.push(point.systolic, point.diastolic);
    });
    values.push(threshold.systolic, threshold.diastolic);

    const max = Math.max.apply(null, values);

    return {
        min: 0,
        max: Math.max(AXIS_STEP, roundUpToAxisStep(max)),
    };
}

function getHeartRateRange(points) {
    const values = points
        .filter((point) => point.hasHeartRate)
        .map((point) => point.heartRate)
        .concat([HR_THRESHOLD.high, HR_THRESHOLD.low]);

    const max = Math.max.apply(null, values);

    return {
        min: 0,
        max: Math.max(AXIS_STEP, roundUpToAxisStep(max)),
    };
}

function buildAxisTicks(range) {
    const ticks = [];
    for (let value = range.min; value <= range.max; value += AXIS_STEP) {
        ticks.push(value);
    }
    return ticks;
}

function drawReferenceLine(ctx, value, color, plot, range) {
    const y = valueToY(value, range, plot);

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
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

function shouldBreakBetween(leftPoint, rightPoint) {
    return (
        !leftPoint ||
        !rightPoint ||
        rightPoint.slotIndex - leftPoint.slotIndex > 1
    );
}

function drawPolyline(ctx, chartData, points, getValue, color, plot, range) {
    if (!points.length) {
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    points.forEach((point, index) => {
        const x = getPointX(point, chartData, plot);
        const y = valueToY(getValue(point), range, plot);

        if (index === 0 || shouldBreakBetween(points[index - 1], point)) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();
    ctx.restore();
}

function drawSeriesPoints(
    ctx,
    chartData,
    points,
    getValue,
    isAlert,
    plot,
    range,
) {
    points.forEach((point) => {
        const abnormal = isAlert(point);
        drawSinglePoint(
            ctx,
            getPointX(point, chartData, plot),
            valueToY(getValue(point), range, plot),
            abnormal ? CHART_COLORS.alert : CHART_COLORS.normalPoint,
            abnormal ? 2 : 2,
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

function drawBloodPressureTrendChart(
    ctx,
    chartInput,
    threshold,
    canvasSize,
    mode,
    options = {},
) {
    const chartData = safeChartData(chartInput, mode);
    const plot = {
        left: CHART_PADDING.left,
        right: canvasSize.width - CHART_PADDING.right,
        top: CHART_PADDING.top,
        bottom: canvasSize.height - CHART_PADDING.bottom,
    };

    clearCanvas(ctx, canvasSize.width, canvasSize.height);
    drawTitle(
        ctx,
        options.hideTitle ? "" : options.leftTitle || "血压波动趋势",
        options.hideTitle
            ? ""
            : options.rightTitle === undefined
              ? "单位：mmHg"
              : options.rightTitle,
        canvasSize,
    );

    if (!chartData.points.length) {
        return;
    }

    const range = getBloodPressureRange(chartData.points, threshold);
    const ticks = buildAxisTicks(range);

    drawGrid(ctx, ticks, range, plot);
    drawReferenceLine(
        ctx,
        threshold.systolic,
        CHART_COLORS.reference,
        plot,
        range,
    );
    drawReferenceLine(
        ctx,
        threshold.diastolic,
        CHART_COLORS.reference,
        plot,
        range,
    );
    drawXAxisLabels(ctx, chartData.slots, plot, chartData.mode);

    drawPolyline(
        ctx,
        chartData,
        chartData.points,
        (point) => point.systolic,
        CHART_COLORS.systolic,
        plot,
        range,
    );
    drawPolyline(
        ctx,
        chartData,
        chartData.points,
        (point) => point.diastolic,
        CHART_COLORS.diastolic,
        plot,
        range,
    );
    drawSeriesPoints(
        ctx,
        chartData,
        chartData.points,
        (point) => point.systolic,
        (point) => point.systolicAlert,
        plot,
        range,
    );
    drawSeriesPoints(
        ctx,
        chartData,
        chartData.points,
        (point) => point.diastolic,
        (point) => point.diastolicAlert,
        plot,
        range,
    );
}

function drawHeartRateChart(
    ctx,
    chartInput,
    threshold,
    canvasSize,
    mode,
    options = {},
) {
    const chartData = safeChartData(chartInput, mode);
    const heartRatePoints = chartData.points.filter(
        (point) => point.hasHeartRate,
    );
    const plot = {
        left: CHART_PADDING.left,
        right: canvasSize.width - CHART_PADDING.right,
        top: CHART_PADDING.top,
        bottom: canvasSize.height - CHART_PADDING.bottom,
    };

    clearCanvas(ctx, canvasSize.width, canvasSize.height);
    drawTitle(
        ctx,
        options.hideTitle ? "" : options.leftTitle || "心率变化 (bpm)",
        options.hideTitle ? "" : options.rightTitle || "",
        canvasSize,
    );

    if (!heartRatePoints.length) {
        return;
    }

    const range = getHeartRateRange(heartRatePoints);
    const ticks = buildAxisTicks(range);

    drawGrid(ctx, ticks, range, plot);
    drawXAxisLabels(ctx, chartData.slots, plot, chartData.mode);

    if (chartData.mode <= 7) {
        const slotStep = Math.max(
            12,
            getSlotStep(chartData.slots.length, plot),
        );
        const barWidth = Math.max(8, Math.min(18, slotStep * 0.18));

        heartRatePoints.forEach((point) => {
            const xCenter = getPointX(point, chartData, plot);
            const y = valueToY(point.heartRate, range, plot);
            const color = point.heartRateAlert
                ? CHART_COLORS.alert
                : CHART_COLORS.heartRate;

            drawRoundedBar(
                ctx,
                xCenter - barWidth / 2,
                y,
                barWidth,
                plot.bottom,
                color,
            );
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
    drawSeriesPoints(
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
