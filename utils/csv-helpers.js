const EAST8_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizeDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    if (value.$date) {
      return new Date(value.$date);
    }

    if (value._date) {
      return new Date(value._date);
    }
  }

  return new Date(value);
}

function toEast8Parts(value) {
  const date = normalizeDate(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const shifted = new Date(date.getTime() + EAST8_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

function formatEast8DateYMD(value) {
  const parts = toEast8Parts(value);
  if (!parts) {
    return '';
  }

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function formatEast8TimeHM(value) {
  const parts = toEast8Parts(value);
  if (!parts) {
    return '';
  }

  return `${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function formatEast8MonthDayTime(value) {
  const parts = toEast8Parts(value);
  if (!parts) {
    return '';
  }

  return `${parts.month}月${parts.day}日 ${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function toTimestamp(value) {
  const date = normalizeDate(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sanitizeNote(note) {
  return String(note || '')
    .replace(/[,\uff0c]/g, '、')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function recordsToCSV(records, options = {}) {
  const header = '日期,时间,高压,低压,心率,备注';
  const rows = (Array.isArray(records) ? records.slice() : [])
    .sort((left, right) => toTimestamp(left && left.measuredAt) - toTimestamp(right && right.measuredAt))
    .map((record) => {
      const payload = (record && record.payload) || {};
      const date = formatEast8DateYMD(record && record.measuredAt);
      const time = formatEast8TimeHM(record && record.measuredAt);
      const systolic = payload.systolic != null ? payload.systolic : '';
      const diastolic = payload.diastolic != null ? payload.diastolic : '';
      const heartRate = payload.heartRate != null ? payload.heartRate : '';
      const note = sanitizeNote(record && record.note);
      return `${date},${time},${systolic},${diastolic},${heartRate},${note}`;
    });

  const lines = [header].concat(rows);
  if (options.hasMore === true) {
    lines.push('# 注意：仅导出了前 200 条记录');
  }

  return lines.join('\n');
}

function parsePositiveInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  if (!/^\d+$/.test(String(value).trim())) {
    return Number.NaN;
  }

  return parseInt(String(value).trim(), 10);
}

function parseCSV(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      valid: [],
      errors: [],
    };
  }

  const lines = trimmed.split(/\r?\n/);
  let startIndex = 0;

  if (lines[0] && /日期|高压|systolic/i.test(lines[0])) {
    startIndex = 1;
  }

  const valid = [];
  const errors = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const parts = rawLine.split(',');
    if (parts.length < 4) {
      errors.push({
        line: index + 1,
        text: rawLine,
        reason: '列数不足，至少需要日期、时间、高压、低压',
      });
      continue;
    }

    const [dateStr, timeStr, sysStr, diaStr, hrStr, ...noteParts] = parts;
    const dateText = String(dateStr || '').trim();
    const timeText = String(timeStr || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      errors.push({
        line: index + 1,
        text: rawLine,
        reason: '日期格式应为 YYYY-MM-DD',
      });
      continue;
    }

    if (!/^\d{2}:\d{2}$/.test(timeText)) {
      errors.push({
        line: index + 1,
        text: rawLine,
        reason: '时间格式应为 HH:mm',
      });
      continue;
    }

    const systolic = parsePositiveInteger(sysStr);
    const diastolic = parsePositiveInteger(diaStr);
    if (!Number.isInteger(systolic) || systolic <= 0 || systolic > 300) {
      errors.push({
        line: index + 1,
        text: rawLine,
        reason: '高压值无效',
      });
      continue;
    }

    if (!Number.isInteger(diastolic) || diastolic <= 0 || diastolic > 300) {
      errors.push({
        line: index + 1,
        text: rawLine,
        reason: '低压值无效',
      });
      continue;
    }

    let heartRate = null;
    if (hrStr && String(hrStr).trim()) {
      heartRate = parsePositiveInteger(hrStr);
      if (!Number.isInteger(heartRate) || heartRate <= 0 || heartRate > 300) {
        errors.push({
          line: index + 1,
          text: rawLine,
          reason: '心率值无效',
        });
        continue;
      }
    }

    const payload = {
      systolic,
      diastolic,
    };

    if (heartRate != null) {
      payload.heartRate = heartRate;
    }

    valid.push({
      measuredAt: `${dateText}T${timeText}:00+08:00`,
      payload,
      note: noteParts.join(',').trim() || null,
      _raw: rawLine,
    });
  }

  return {
    valid,
    errors,
  };
}

module.exports = {
  normalizeDate,
  toEast8Parts,
  formatEast8DateYMD,
  formatEast8TimeHM,
  formatEast8MonthDayTime,
  recordsToCSV,
  parseCSV,
};
