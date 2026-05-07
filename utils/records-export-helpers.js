const {
  formatEast8MonthDayTime,
} = require('./csv-helpers');

const EXPORT_IMAGE_CANVAS_WIDTH = 750;
const EXPORT_IMAGE_SIDE_PADDING = 40;
const EXPORT_IMAGE_TITLE_HEIGHT = 120;
const EXPORT_IMAGE_HEADER_ROW_HEIGHT = 44;
const EXPORT_IMAGE_ROW_HEIGHT = 44;
const EXPORT_IMAGE_BOTTOM_HEIGHT = 100;
const TABLE_COLUMNS = [
  { key: 'time', label: '测量时间', widthRatio: 0.4, align: 'left' },
  { key: 'systolic', label: '高压 (mmHg)', widthRatio: 0.2, align: 'right' },
  { key: 'diastolic', label: '低压 (mmHg)', widthRatio: 0.2, align: 'right' },
  { key: 'heartRate', label: '心率 (bpm)', widthRatio: 0.2, align: 'right' },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDottedDate(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function buildRecentRange(days, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = new Date(startOfToday.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const until = new Date(now.getTime());
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
  return EXPORT_IMAGE_TITLE_HEIGHT
    + EXPORT_IMAGE_HEADER_ROW_HEIGHT
    + Math.max(0, Number(recordCount) || 0) * EXPORT_IMAGE_ROW_HEIGHT
    + EXPORT_IMAGE_BOTTOM_HEIGHT;
}

function drawCellText(ctx, text, left, right, centerY, align) {
  const inset = 12;
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
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('血压心率数据记录', width / 2, 72);

  ctx.fillStyle = '#6B7280';
  ctx.font = '14px sans-serif';
  ctx.fillText(range.subtitle, width / 2, 102);

  const headerTop = EXPORT_IMAGE_TITLE_HEIGHT;
  ctx.fillStyle = '#F3F4F6';
  ctx.fillRect(tableLeft, headerTop, tableWidth, EXPORT_IMAGE_HEADER_ROW_HEIGHT);

  ctx.fillStyle = '#374151';
  ctx.font = '14px sans-serif';

  let cursorX = tableLeft;
  TABLE_COLUMNS.forEach((column, index) => {
    const columnWidth = columnWidths[index];
    drawCellText(
      ctx,
      column.label,
      cursorX,
      cursorX + columnWidth,
      headerTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT / 2,
      column.align === 'right' ? 'right' : 'left',
    );
    cursorX += columnWidth;
  });

  const tableTop = headerTop;
  const tableBottom = headerTop + EXPORT_IMAGE_HEADER_ROW_HEIGHT + records.length * EXPORT_IMAGE_ROW_HEIGHT;

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
    ctx.font = '14px sans-serif';

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

  for (let lineIndex = 0; lineIndex <= records.length + 1; lineIndex += 1) {
    const y = headerTop + lineIndex * EXPORT_IMAGE_ROW_HEIGHT;
    const lineY = lineIndex === 0 ? headerTop : y;
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
  measureRecordsImageHeight,
  drawRecordsImageTable,
};
