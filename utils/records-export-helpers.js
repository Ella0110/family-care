const {
  buildEast8RecentRange,
  formatEast8MonthDayTime,
  toEast8Parts,
} = require('./csv-helpers');

const EXPORT_IMAGE_CANVAS_WIDTH = 750;
const EXPORT_IMAGE_SIDE_PADDING = 40;
const EXPORT_IMAGE_TOP_PADDING = 72;
const EXPORT_IMAGE_TITLE_FONT_SIZE = 36;
const EXPORT_IMAGE_SUBTITLE_FONT_SIZE = 22;
const EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE = 26;
const EXPORT_IMAGE_HEADER_UNIT_FONT_SIZE = 20;
const EXPORT_IMAGE_HEADER_LINE_GAP = 6;
const EXPORT_IMAGE_HEADER_VERTICAL_PADDING = 16;
const EXPORT_IMAGE_TITLE_Y = EXPORT_IMAGE_TOP_PADDING;
const EXPORT_IMAGE_TITLE_BOTTOM_Y = EXPORT_IMAGE_TITLE_Y + (EXPORT_IMAGE_TITLE_FONT_SIZE / 2);
const EXPORT_IMAGE_SUBTITLE_Y = EXPORT_IMAGE_TITLE_BOTTOM_Y + 20 + (EXPORT_IMAGE_SUBTITLE_FONT_SIZE / 2);
const EXPORT_IMAGE_SUBTITLE_BOTTOM_Y = EXPORT_IMAGE_SUBTITLE_Y + (EXPORT_IMAGE_SUBTITLE_FONT_SIZE / 2);
const EXPORT_IMAGE_HEADER_LABEL_Y = EXPORT_IMAGE_SUBTITLE_BOTTOM_Y + 30 + (EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE / 2);
const EXPORT_IMAGE_HEADER_UNIT_Y = EXPORT_IMAGE_HEADER_LABEL_Y + (EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE / 2) + 6 + (EXPORT_IMAGE_HEADER_UNIT_FONT_SIZE / 2);
const EXPORT_IMAGE_HEADER_TOP = EXPORT_IMAGE_HEADER_LABEL_Y - (EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE / 2) - EXPORT_IMAGE_HEADER_VERTICAL_PADDING;
const EXPORT_IMAGE_HEADER_BOTTOM = EXPORT_IMAGE_HEADER_UNIT_Y + (EXPORT_IMAGE_HEADER_UNIT_FONT_SIZE / 2) + EXPORT_IMAGE_HEADER_VERTICAL_PADDING;
const EXPORT_IMAGE_HEADER_ROW_HEIGHT = EXPORT_IMAGE_HEADER_BOTTOM - EXPORT_IMAGE_HEADER_TOP;
const EXPORT_IMAGE_ROW_HEIGHT = 56;
const EXPORT_IMAGE_BOTTOM_HEIGHT = 96;
const TABLE_COLUMNS = [
  { key: 'time', label: '测量时间', unit: '', widthRatio: 0.38, align: 'left' },
  { key: 'systolic', label: '高压', unit: '(mmHg)', widthRatio: 0.2, align: 'left' },
  { key: 'diastolic', label: '低压', unit: '(mmHg)', widthRatio: 0.2, align: 'left' },
  { key: 'heartRate', label: '心率', unit: '(bpm)', widthRatio: 0.22, align: 'left' },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDottedDate(date) {
  const parts = toEast8Parts(date);
  if (!parts) {
    return '';
  }

  return `${parts.year}.${pad(parts.month)}.${pad(parts.day)}`;
}

function buildRecentRange(days, now = new Date()) {
  const east8Range = buildEast8RecentRange(days, now);
  const since = east8Range.since;
  const until = east8Range.until;
  const label = `近 ${days} 天`;
  const startDateText = formatDottedDate(since);
  const endDateText = formatDottedDate(until);

  return {
    days,
    label,
    since,
    until,
    startDateText,
    endDateText,
    subtitle: `${label}数据（${startDateText} - ${endDateText}）`,
  };
}

function measureRecordsImageHeight(recordCount) {
  return EXPORT_IMAGE_HEADER_TOP
    + EXPORT_IMAGE_HEADER_ROW_HEIGHT
    + Math.max(0, Number(recordCount) || 0) * EXPORT_IMAGE_ROW_HEIGHT
    + EXPORT_IMAGE_BOTTOM_HEIGHT;
}

function getRecordsExportLayoutMetrics() {
  return {
    titleY: EXPORT_IMAGE_TITLE_Y,
    titleBottomY: EXPORT_IMAGE_TITLE_BOTTOM_Y,
    subtitleY: EXPORT_IMAGE_SUBTITLE_Y,
    subtitleBottomY: EXPORT_IMAGE_SUBTITLE_BOTTOM_Y,
    headerTop: EXPORT_IMAGE_HEADER_TOP,
    headerLabelY: EXPORT_IMAGE_HEADER_LABEL_Y,
    headerUnitY: EXPORT_IMAGE_HEADER_UNIT_Y,
    headerBottom: EXPORT_IMAGE_HEADER_BOTTOM,
    headerHeight: EXPORT_IMAGE_HEADER_ROW_HEIGHT,
  };
}

function drawCellText(ctx, text, left, right, centerY, align) {
  const inset = 16;
  ctx.textAlign = align;

  if (align === 'right') {
    ctx.fillText(text, right - inset, centerY);
    return;
  }

  ctx.fillText(text, left + inset, centerY);
}

function drawRecordsImageTable(ctx, options) {
  const records = Array.isArray(options && options.records) ? options.records : [];
  const range = options && options.range ? options.range : buildRecentRange(7);
  const width = (options && options.width) || EXPORT_IMAGE_CANVAS_WIDTH;
  const layoutRowCount = records.length;
  const totalHeight = measureRecordsImageHeight(records.length);
  const tableLeft = EXPORT_IMAGE_SIDE_PADDING;
  const tableWidth = width - EXPORT_IMAGE_SIDE_PADDING * 2;
  const columnWidths = TABLE_COLUMNS.map((column) => Math.round(tableWidth * column.widthRatio));
  columnWidths[columnWidths.length - 1] = tableWidth - columnWidths[0] - columnWidths[1] - columnWidths[2];

  ctx.clearRect(0, 0, width, totalHeight);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = `bold ${EXPORT_IMAGE_TITLE_FONT_SIZE}px sans-serif`;
  ctx.fillText('血压心率数据记录', width / 2, EXPORT_IMAGE_TITLE_Y);

  ctx.fillStyle = '#6B7280';
  ctx.font = `${EXPORT_IMAGE_SUBTITLE_FONT_SIZE}px sans-serif`;
  ctx.fillText(range.subtitle, width / 2, EXPORT_IMAGE_SUBTITLE_Y);

  const headerTop = EXPORT_IMAGE_HEADER_TOP;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(tableLeft, headerTop, tableWidth, EXPORT_IMAGE_HEADER_ROW_HEIGHT);

  let cursorX = tableLeft;
  TABLE_COLUMNS.forEach((column, index) => {
    const columnWidth = columnWidths[index];
    ctx.fillStyle = '#334155';
    ctx.font = `bold ${EXPORT_IMAGE_HEADER_LABEL_FONT_SIZE}px sans-serif`;
    drawCellText(
      ctx,
      column.label,
      cursorX,
      cursorX + columnWidth,
      EXPORT_IMAGE_HEADER_LABEL_Y,
      column.align,
    );

    if (column.unit) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `${EXPORT_IMAGE_HEADER_UNIT_FONT_SIZE}px sans-serif`;
      drawCellText(
        ctx,
        column.unit,
        cursorX,
        cursorX + columnWidth,
        EXPORT_IMAGE_HEADER_UNIT_Y,
        column.align,
      );
    }
    cursorX += columnWidth;
  });

  const tableTop = headerTop;
  const tableBottom = headerTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT + layoutRowCount * EXPORT_IMAGE_ROW_HEIGHT;

  records.forEach((record, index) => {
    const rowTop = headerTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT + index * EXPORT_IMAGE_ROW_HEIGHT;
    if (index % 2 === 1) {
      ctx.fillStyle = '#FAFAFA';
      ctx.fillRect(tableLeft, rowTop, tableWidth, EXPORT_IMAGE_ROW_HEIGHT);
    }

    const payload = (record && record.payload) || {};
    const values = [
      formatEast8MonthDayTime(record && record.measuredAt),
      payload.systolic != null ? String(payload.systolic) : '--',
      payload.diastolic != null ? String(payload.diastolic) : '--',
      payload.heartRate != null ? String(payload.heartRate) : '--',
    ];

    ctx.fillStyle = '#111827';
    ctx.font = '26px sans-serif';

    let rowCursorX = tableLeft;
    TABLE_COLUMNS.forEach((column, columnIndex) => {
      const columnWidth = columnWidths[columnIndex];
      drawCellText(
        ctx,
        values[columnIndex],
        rowCursorX,
        rowCursorX + columnWidth,
        rowTop + EXPORT_IMAGE_ROW_HEIGHT / 2,
        column.align,
      );
      rowCursorX += columnWidth;
    });
  });

  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(tableLeft, tableTop);
  ctx.lineTo(tableLeft + tableWidth, tableTop);
  ctx.moveTo(tableLeft, tableTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT);
  ctx.lineTo(tableLeft + tableWidth, tableTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT);
  ctx.stroke();

  for (let lineIndex = 0; lineIndex < layoutRowCount; lineIndex += 1) {
    const lineY = tableTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT + (lineIndex + 1) * EXPORT_IMAGE_ROW_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(tableLeft, lineY);
    ctx.lineTo(tableLeft + tableWidth, lineY);
    ctx.stroke();
  }

  let borderX = tableLeft;
  ctx.beginPath();
  ctx.moveTo(tableLeft, tableTop);
  ctx.lineTo(tableLeft, tableBottom);
  TABLE_COLUMNS.forEach((column, index) => {
    borderX += columnWidths[index];
    ctx.moveTo(borderX, tableTop);
    ctx.lineTo(borderX, tableBottom);
  });
  ctx.stroke();

  return {
    height: totalHeight,
  };
}

module.exports = {
  EXPORT_IMAGE_CANVAS_WIDTH,
  buildRecentRange,
  getRecordsExportLayoutMetrics,
  measureRecordsImageHeight,
  drawRecordsImageTable,
};
