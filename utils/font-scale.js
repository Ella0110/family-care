const FONT_SCALE_OPTIONS = Object.freeze([1.0, 1.15, 1.3]);
const DEFAULT_FONT_SCALE = 1.0;
const FONT_SCALE_STORAGE_KEY = 'fontScale';
const FONT_SCALE_LABELS = Object.freeze({
  1: '标准',
  1.15: '大号',
  1.3: '超大',
});

function isValidFontScale(value) {
  return FONT_SCALE_OPTIONS.includes(Number(value));
}

function normalizeFontScale(value) {
  return isValidFontScale(value) ? Number(value) : DEFAULT_FONT_SCALE;
}

function readLocalFontScale(storageApi = wx) {
  try {
    const value = storageApi.getStorageSync(FONT_SCALE_STORAGE_KEY);
    return isValidFontScale(value) ? Number(value) : null;
  } catch (error) {
    return null;
  }
}

function persistLocalFontScale(value, storageApi = wx) {
  const nextValue = normalizeFontScale(value);
  storageApi.setStorageSync(FONT_SCALE_STORAGE_KEY, nextValue);
  return nextValue;
}

function buildFontScaleStyle(value) {
  return `--font-scale: ${normalizeFontScale(value)};`;
}

function getFontScaleLabel(value) {
  return FONT_SCALE_LABELS[normalizeFontScale(value)] || FONT_SCALE_LABELS[DEFAULT_FONT_SCALE];
}

function resolveFontScaleSync({ localFontScale = null, remoteFontScale = null } = {}) {
  const hasLocal = isValidFontScale(localFontScale);
  const hasRemote = isValidFontScale(remoteFontScale);

  if (!hasLocal && !hasRemote) {
    return {
      fontScale: DEFAULT_FONT_SCALE,
      shouldPersistLocal: false,
      shouldSyncRemote: false,
    };
  }

  if (hasLocal && !hasRemote) {
    return {
      fontScale: Number(localFontScale),
      shouldPersistLocal: false,
      shouldSyncRemote: true,
    };
  }

  if (!hasLocal && hasRemote) {
    return {
      fontScale: Number(remoteFontScale),
      shouldPersistLocal: true,
      shouldSyncRemote: false,
    };
  }

  if (Number(localFontScale) !== Number(remoteFontScale)) {
    return {
      fontScale: Number(remoteFontScale),
      shouldPersistLocal: true,
      shouldSyncRemote: false,
    };
  }

  return {
    fontScale: Number(remoteFontScale),
    shouldPersistLocal: false,
    shouldSyncRemote: false,
  };
}

module.exports = {
  FONT_SCALE_OPTIONS,
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  FONT_SCALE_LABELS,
  isValidFontScale,
  normalizeFontScale,
  readLocalFontScale,
  persistLocalFontScale,
  buildFontScaleStyle,
  getFontScaleLabel,
  resolveFontScaleSync,
};
