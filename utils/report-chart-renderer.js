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

const POINT_LINE_GAP = 3;

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

function getSlotWidth(totalSlots, plot, mode) {
    if (totalSlots <= 0) {
        return plot.right - plot.left;
    }

    if (mode <= 7) {
        return (plot.right - plot.left) / totalSlots;
    }

    if (totalSlots <= 1) {
        return plot.right - plot.left;
    }

    return (plot.right - plot.left) / (totalSlots - 1);
}

function getSlotStep(totalSlots, plot, mode) {
    return getSlotWidth(totalSlots, plot, mode);
}

function getSlotCenter(index, totalSlots, plot, mode) {
    if (totalSlots <= 0) {
        return plot.right - plot.left;
    }

    if (mode <= 7) {
        const slotWidth = getSlotWidth(totalSlots, plot, mode);
        return plot.left + slotWidth * index + slotWidth / 2;
    }

    if (totalSlots <= 1) {
        return (plot.left + plot.right) / 2;
    }

    return plot.left + (index / (totalSlots - 1)) * (plot.right - plot.left);
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
    if (
        !slot ||
        !(slot.date instanceof Date) ||
        Number.isNaN(slot.date.getTime())
    ) {
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
            getSlotCenter(index, slots.length, plot, mode),
            plot.bottom + 12,
        );
    });

    ctx.restore();
}

function drawVerticalGuides(ctx, slots, plot, mode) {
    if (mode > 7 || !Array.isArray(slots) || !slots.length) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;

    slots.forEach((slot, index) => {
        const x = getSlotCenter(index, slots.length, plot, mode);
        ctx.beginPath();
        ctx.moveTo(x, plot.top);
        ctx.lineTo(x, plot.bottom);
        ctx.stroke();
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
        chartData.mode,
    );
    if (chartData.mode > 7 || point.slotCount <= 1) {
        return slotCenter;
    }

    const slotWidth = getSlotWidth(
        chartData.slots.length,
        plot,
        chartData.mode,
    );
    const offsetUnit = slotWidth / 3;
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

function buildContinuousSegments(chartData, points, getValue, plot, range) {
    const segments = [];
    let currentSegment = [];

    points.forEach((point, index) => {
        const entry = {
            point,
            x: getPointX(point, chartData, plot),
            y: valueToY(getValue(point), range, plot),
        };

        if (index === 0 || shouldBreakBetween(points[index - 1], point)) {
            if (currentSegment.length) {
                segments.push(currentSegment);
            }
            currentSegment = [entry];
            return;
        }

        currentSegment.push(entry);
    });

    if (currentSegment.length) {
        segments.push(currentSegment);
    }

    return segments;
}

function drawPolyline(ctx, chartData, points, getValue, color, plot, range) {
    if (points.length < 2) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    points.forEach((point, index) => {
        if (index === 0 || shouldBreakBetween(points[index - 1], point)) {
            return;
        }

        const previousPoint = points[index - 1];
        const x1 = getPointX(previousPoint, chartData, plot);
        const y1 = valueToY(getValue(previousPoint), range, plot);
        const x2 = getPointX(point, chartData, plot);
        const y2 = valueToY(getValue(point), range, plot);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!distance || distance <= POINT_LINE_GAP * 2) {
            return;
        }

        const offsetX = (dx / distance) * POINT_LINE_GAP;
        const offsetY = (dy / distance) * POINT_LINE_GAP;

        ctx.beginPath();
        ctx.moveTo(x1 + offsetX, y1 + offsetY);
        ctx.lineTo(x2 - offsetX, y2 - offsetY);
        ctx.stroke();
    });
    ctx.restore();
}

function drawSmoothPolyline(ctx, chartData, points, getValue, color, plot, range) {
    const segments = buildContinuousSegments(
        chartData,
        points,
        getValue,
        plot,
        range,
    ).filter((segment) => segment.length >= 2);

    if (!segments.length) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    segments.forEach((segment) => {
        ctx.beginPath();
        ctx.moveTo(segment[0].x, segment[0].y);

        if (segment.length === 2) {
            ctx.lineTo(segment[1].x, segment[1].y);
            ctx.stroke();
            return;
        }

        for (let index = 1; index < segment.length - 1; index += 1) {
            const current = segment[index];
            const next = segment[index + 1];
            const middleX = (current.x + next.x) / 2;
            const middleY = (current.y + next.y) / 2;
            ctx.quadraticCurveTo(current.x, current.y, middleX, middleY);
        }

        const penultimate = segment[segment.length - 2];
        const last = segment[segment.length - 1];
        ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
        ctx.stroke();
    });

    ctx.restore();
}

function drawSmoothPolylineByPair(
    ctx,
    chartData,
    points,
    getValue,
    getPairColor,
    plot,
    range,
) {
    const segments = buildContinuousSegments(
        chartData,
        points,
        getValue,
        plot,
        range,
    ).filter((segment) => segment.length >= 2);

    if (!segments.length) {
        return;
    }

    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    segments.forEach((segment) => {
        for (let index = 0; index < segment.length - 1; index += 1) {
            const current = segment[index];
            const next = segment[index + 1];
            const strokeColor = getPairColor(current.point, next.point);

            ctx.beginPath();
            ctx.strokeStyle = strokeColor;

            if (segment.length === 2) {
                ctx.moveTo(current.x, current.y);
                ctx.lineTo(next.x, next.y);
                ctx.stroke();
                continue;
            }

            const previous = index > 0 ? segment[index - 1] : current;
            const following =
                index + 2 < segment.length ? segment[index + 2] : next;
            const control1X = current.x + (next.x - previous.x) / 6;
            const control1Y = current.y + (next.y - previous.y) / 6;
            const control2X = next.x - (following.x - current.x) / 6;
            const control2Y = next.y - (following.y - current.y) / 6;

            ctx.moveTo(current.x, current.y);
            ctx.bezierCurveTo(
                control1X,
                control1Y,
                control2X,
                control2Y,
                next.x,
                next.y,
            );
            ctx.stroke();
        }
    });

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

function isBloodPressurePairAlert(leftPoint, rightPoint, key) {
    if (key === "systolic") {
        return Boolean(leftPoint.systolicAlert || rightPoint.systolicAlert);
    }

    if (key === "diastolic") {
        return Boolean(leftPoint.diastolicAlert || rightPoint.diastolicAlert);
    }

    return false;
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
    drawVerticalGuides(ctx, chartData.slots, plot, chartData.mode);
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

    if (chartData.mode >= 90) {
        drawSmoothPolylineByPair(
            ctx,
            chartData,
            chartData.points,
            (point) => point.systolic,
            (leftPoint, rightPoint) =>
                isBloodPressurePairAlert(leftPoint, rightPoint, "systolic")
                    ? CHART_COLORS.alert
                    : CHART_COLORS.systolic,
            plot,
            range,
        );
        drawSmoothPolylineByPair(
            ctx,
            chartData,
            chartData.points,
            (point) => point.diastolic,
            (leftPoint, rightPoint) =>
                isBloodPressurePairAlert(leftPoint, rightPoint, "diastolic")
                    ? CHART_COLORS.alert
                    : CHART_COLORS.diastolic,
            plot,
            range,
        );
        return;
    }

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
    drawVerticalGuides(ctx, chartData.slots, plot, chartData.mode);
    drawXAxisLabels(ctx, chartData.slots, plot, chartData.mode);

    if (chartData.mode <= 7) {
        const slotStep = Math.max(
            12,
            getSlotStep(chartData.slots.length, plot, chartData.mode),
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

    if (chartData.mode >= 90) {
        drawSmoothPolylineByPair(
            ctx,
            chartData,
            heartRatePoints,
            (point) => point.heartRate,
            (leftPoint, rightPoint) =>
                Boolean(leftPoint.heartRateAlert || rightPoint.heartRateAlert)
                    ? CHART_COLORS.alert
                    : CHART_COLORS.heartRate,
            plot,
            range,
        );
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
