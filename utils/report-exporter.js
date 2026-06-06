const {
    drawBloodPressureTrendChart,
    drawHeartRateChart,
} = require("./report-chart-renderer");

const EXPORT_CANVAS_WIDTH = 750;
const MAX_EXPORT_HEIGHT = 4000;
const EXPORT_PADDING = 60;
const PADDING_X = 40;
const CONTENT_WIDTH = EXPORT_CANVAS_WIDTH - PADDING_X * 2;
const SECTION_GAP = 24;
const EMPTY_TEXT = "该时间段内暂无测量记录";
const MORE_ALERTS_TEXT = "更多异常记录请在应用中查看";

function trimText(value) {
    return String(value || "").trim();
}

function getDisplayPatient(patient, privacyMode) {
    const safePatient = patient || {};

    return {
        nameText: privacyMode
            ? safePatient.maskedNameText
            : safePatient.rawNameText,
        medicationText: safePatient.medicationText || "暂无用药记录",
        emergencyText: privacyMode
            ? safePatient.maskedEmergencyText
            : safePatient.rawEmergencyText,
    };
}

function approximateLineCount(text, maxCharsPerLine) {
    const safeText = trimText(text);
    if (!safeText) {
        return 1;
    }

    return Math.max(
        1,
        Math.ceil(safeText.length / Math.max(1, maxCharsPerLine)),
    );
}

function buildAlertBlock(alert, minCount) {
    const alerts = Array.isArray(alert) ? alert : [];
    return {
        items: alerts.slice(0, minCount),
        hasMore: alerts.length > minCount,
    };
}

function estimatePatientSectionHeight(patient) {
    const nameLines = approximateLineCount(patient.nameText, 12);
    const medicationLines = approximateLineCount(patient.medicationText, 16);
    const emergencyLines = approximateLineCount(patient.emergencyText, 20);
    const firstRowHeight = Math.max(
        62 + nameLines * 32,
        62 + medicationLines * 32,
    );

    return 48 + firstRowHeight + 28 + 62 + emergencyLines * 32 + 24;
}

function estimateBannerHeight(banner) {
    if (!banner) {
        return 0;
    }

    return 92 + approximateLineCount(banner.text, 28) * 30;
}

function estimateDisclaimerHeight(text) {
    return 24 + 24 + approximateLineCount(text, 28) * 28 + 40;
}

function estimateAlertsHeight(alerts, hasMoreNotice) {
    if (!alerts.length) {
        return 48 + 68;
    }

    let height = 48;
    alerts.forEach((item, index) => {
        const lines = approximateLineCount(item.alertText, 20);
        height += 84 + Math.max(0, lines - 1) * 24;
        if (index < alerts.length - 1) {
            height += 22;
        }
    });

    if (hasMoreNotice) {
        height += 52;
    }

    return height;
}

function measureHeightWithAlerts(payload, alertBlock) {
    const patient = getDisplayPatient(payload.patient, payload.privacyMode);
    let height = 0;

    height += 140;
    height += SECTION_GAP;
    height += estimatePatientSectionHeight(patient);

    if (payload.banner) {
        height += SECTION_GAP;
        height += estimateBannerHeight(payload.banner);
    }

    if (payload.hasRecords) {
        height += SECTION_GAP;
        height += 216;
        height += SECTION_GAP;
        height += 320;
        height += SECTION_GAP;
        height += payload.hasHeartRateData ? 280 : 112;
        height += SECTION_GAP;
        height += estimateAlertsHeight(alertBlock.items, alertBlock.hasMore);
    } else {
        height += SECTION_GAP;
        height += 120;
    }

    height += SECTION_GAP;
    height += estimateDisclaimerHeight(payload.disclaimer);

    return height;
}

function measureReportExportHeight(payload) {
    const initialAlerts = buildAlertBlock(payload.recentAlerts, 5);
    let height = measureHeightWithAlerts(payload, initialAlerts);

    if (height > MAX_EXPORT_HEIGHT && initialAlerts.items.length > 3) {
        const reducedAlerts = buildAlertBlock(payload.recentAlerts, 3);
        reducedAlerts.hasMore =
            Array.isArray(payload.recentAlerts) &&
            payload.recentAlerts.length > 3;
        height = measureHeightWithAlerts(payload, reducedAlerts);

        return {
            height,
            exportAlerts: reducedAlerts.items,
            exportAlertsNotice: reducedAlerts.hasMore ? MORE_ALERTS_TEXT : "",
        };
    }

    return {
        height,
        exportAlerts: initialAlerts.items,
        exportAlertsNotice: initialAlerts.hasMore ? MORE_ALERTS_TEXT : "",
    };
}

function drawRoundedRect(ctx, x, y, width, height, radius, color) {
    const nextRadius = Math.min(radius, width / 2, height / 2);

    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(x + nextRadius, y);
    ctx.lineTo(x + width - nextRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + nextRadius);
    ctx.lineTo(x + width, y + height - nextRadius);
    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - nextRadius,
        y + height,
    );
    ctx.lineTo(x + nextRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - nextRadius);
    ctx.lineTo(x, y + nextRadius);
    ctx.quadraticCurveTo(x, y, x + nextRadius, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = String(text || "").split("");
    let line = "";
    let currentY = y;

    chars.forEach((char) => {
        const nextLine = line + char;
        if (line && ctx.measureText(nextLine).width > maxWidth) {
            ctx.fillText(line, x, currentY);
            line = char;
            currentY += lineHeight;
            return;
        }

        line = nextLine;
    });

    if (line) {
        ctx.fillText(line, x, currentY);
    }

    return currentY + lineHeight;
}

function drawSectionLabel(ctx, label, x, y) {
    ctx.save();
    ctx.fillStyle = "#6B7280";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, x, y);
    ctx.restore();
}

function drawLabelValue(ctx, label, value, x, y, maxWidth) {
    ctx.save();
    ctx.fillStyle = "#94A3B8";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, x, y);

    ctx.fillStyle = "#111827";
    ctx.font = "bold 22px sans-serif";
    const endY = drawWrappedText(ctx, value, x, y + 24, maxWidth, 30);
    ctx.restore();
    return endY;
}

function drawReportExportCanvas(ctx, payload) {
    const layout = payload.exportLayout || measureReportExportHeight(payload);
    const patient = getDisplayPatient(payload.patient, payload.privacyMode);
    const exportAlerts = layout.exportAlerts || [];
    let y = 0;

    ctx.clearRect(0, 0, EXPORT_CANVAS_WIDTH, layout.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, EXPORT_CANVAS_WIDTH, layout.height);

    y = EXPORT_PADDING;
    ctx.fillStyle = "#111827";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("血压心率报告", PADDING_X, y);

    y += 42;
    ctx.fillStyle = "#6B7280";
    ctx.font = "14px sans-serif";
    ctx.fillText(payload.periodLabel, PADDING_X, y);

    y += 24;
    ctx.fillStyle = "#94A3B8";
    ctx.font = "12px sans-serif";
    ctx.fillText(`生成于 ${payload.generatedAtText}`, PADDING_X, y);

    y += 56;
    drawSectionLabel(ctx, "患者档案", PADDING_X, y);
    y += 32;

    const columnGap = 24;
    const columnWidth = (CONTENT_WIDTH - columnGap) / 2;
    const leftEndY = drawLabelValue(
        ctx,
        "患者姓名",
        patient.nameText,
        PADDING_X,
        y,
        columnWidth,
    );
    const rightEndY = drawLabelValue(
        ctx,
        "主要用药",
        patient.medicationText,
        PADDING_X + columnWidth + columnGap,
        y,
        columnWidth,
    );
    y = Math.max(leftEndY, rightEndY) + 18;
    y =
        drawLabelValue(
            ctx,
            "紧急联系人",
            patient.emergencyText,
            PADDING_X,
            y,
            CONTENT_WIDTH,
        ) + 6;

    if (payload.banner) {
        y += SECTION_GAP;
        const bannerBg =
            payload.banner.type === "critical" ? "#FEE2E2" : "#FFEDD5";
        const bannerTitle =
            payload.banner.type === "critical" ? "#991B1B" : "#9A3412";
        const bannerText =
            payload.banner.type === "critical" ? "#7F1D1D" : "#7C2D12";
        const bannerHeight = estimateBannerHeight(payload.banner);

        drawRoundedRect(
            ctx,
            PADDING_X,
            y,
            CONTENT_WIDTH,
            bannerHeight,
            22,
            bannerBg,
        );
        ctx.fillStyle = bannerTitle;
        ctx.font = "bold 22px sans-serif";
        ctx.fillText(payload.banner.title, PADDING_X + 24, y + 22);

        ctx.fillStyle = bannerText;
        ctx.font = "15px sans-serif";
        drawWrappedText(
            ctx,
            payload.banner.text,
            PADDING_X + 24,
            y + 58,
            CONTENT_WIDTH - 48,
            24,
        );
        y += bannerHeight;
    }

    if (payload.hasRecords) {
        y += SECTION_GAP;
        const cardWidth = (CONTENT_WIDTH - 18) / 2;
        const summaryTop = y;

        (payload.summaryCards || []).forEach((item, index) => {
            const column = index % 2;
            const row = Math.floor(index / 2);
            const cardX = PADDING_X + column * (cardWidth + 18);
            const cardY = summaryTop + row * (102 + 14);

            drawRoundedRect(ctx, cardX, cardY, cardWidth, 102, 18, "#F8FAFC");
            ctx.fillStyle = "#6B7280";
            ctx.font = "13px sans-serif";
            ctx.fillText(item.label, cardX + 20, cardY + 18);
            ctx.fillStyle =
                item.accentClassName === "report-summary__value--danger"
                    ? "#B42318"
                    : item.accentClassName === "report-summary__value--warning"
                      ? "#C2410C"
                      : "#111827";
            ctx.font = "bold 30px sans-serif";
            ctx.fillText(item.value, cardX + 20, cardY + 48);
            ctx.fillStyle = "#94A3B8";
            ctx.font = "12px sans-serif";
            ctx.fillText(item.unit, cardX + 20, cardY + 78);
        });

        y = summaryTop + 218;

        y += SECTION_GAP;
        ctx.save();
        ctx.translate(PADDING_X, y);
        drawBloodPressureTrendChart(
            ctx,
            payload.records,
            payload.threshold,
            { width: CONTENT_WIDTH, height: 300 },
            payload.mode,
        );
        ctx.restore();
        y += 300;

        y += SECTION_GAP;
        if (payload.hasHeartRateData) {
            ctx.save();
            ctx.translate(PADDING_X, y);
            drawHeartRateChart(
                ctx,
                payload.records,
                payload.threshold,
                { width: CONTENT_WIDTH, height: 260 },
                payload.mode,
            );
            ctx.restore();
            y += 260;
        } else {
            drawRoundedRect(
                ctx,
                PADDING_X,
                y,
                CONTENT_WIDTH,
                92,
                18,
                "#F8FAFC",
            );
            ctx.fillStyle = "#6B7280";
            ctx.font = "15px sans-serif";
            ctx.fillText("暂无心率数据", PADDING_X + 24, y + 34);
            y += 92;
        }

        y += SECTION_GAP;
        drawSectionLabel(ctx, "最近异常明细", PADDING_X, y);
        y += 30;

        if (exportAlerts.length) {
            exportAlerts.forEach((item, index) => {
                if (index > 0) {
                    ctx.strokeStyle = "#E5E7EB";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(PADDING_X, y);
                    ctx.lineTo(EXPORT_CANVAS_WIDTH - PADDING_X, y);
                    ctx.stroke();
                    y += 18;
                }

                ctx.fillStyle = "#111827";
                ctx.font = "bold 15px sans-serif";
                ctx.fillText(item.measuredAtText, PADDING_X, y);
                ctx.fillStyle = "#B42318";
                ctx.font = "14px sans-serif";
                const alertEndY = drawWrappedText(
                    ctx,
                    item.alertText,
                    PADDING_X,
                    y + 24,
                    360,
                    22,
                );

                ctx.fillStyle = "#111827";
                ctx.font = "bold 24px sans-serif";
                ctx.textAlign = "right";
                ctx.fillText(
                    item.bloodPressureText,
                    EXPORT_CANVAS_WIDTH - PADDING_X,
                    y + 2,
                );
                if (item.heartRateText) {
                    ctx.fillStyle = "#6B7280";
                    ctx.font = "13px sans-serif";
                    ctx.fillText(
                        item.heartRateText,
                        EXPORT_CANVAS_WIDTH - PADDING_X,
                        y + 32,
                    );
                }
                ctx.textAlign = "left";

                y = Math.max(alertEndY, y + 50) + 12;
            });

            if (layout.exportAlertsNotice) {
                ctx.fillStyle = "#6B7280";
                ctx.font = "13px sans-serif";
                ctx.fillText(layout.exportAlertsNotice, PADDING_X, y + 8);
                y += 40;
            }
        } else {
            ctx.fillStyle = "#6B7280";
            ctx.font = "15px sans-serif";
            ctx.fillText("该时间段内无异常记录", PADDING_X, y + 8);
            y += 54;
        }
    } else {
        y += SECTION_GAP;
        drawRoundedRect(ctx, PADDING_X, y, CONTENT_WIDTH, 96, 18, "#F8FAFC");
        ctx.fillStyle = "#6B7280";
        ctx.font = "15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(EMPTY_TEXT, EXPORT_CANVAS_WIDTH / 2, y + 38);
        ctx.textAlign = "left";
        y += 96;
    }

    y += SECTION_GAP;
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING_X, y);
    ctx.lineTo(EXPORT_CANVAS_WIDTH - PADDING_X, y);
    ctx.stroke();
    y += 24;

    ctx.fillStyle = "#94A3B8";
    ctx.font = "12px sans-serif";
    return drawWrappedText(
        ctx,
        payload.disclaimer,
        PADDING_X,
        y,
        CONTENT_WIDTH,
        22,
    );
}

module.exports = {
    EXPORT_CANVAS_WIDTH,
    MAX_EXPORT_HEIGHT,
    EXPORT_PADDING,
    EMPTY_TEXT,
    MORE_ALERTS_TEXT,
    measureReportExportHeight,
    drawReportExportCanvas,
};
