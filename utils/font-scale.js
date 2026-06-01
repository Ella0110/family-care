const FONT_SCALE_OPTIONS = Object.freeze([1.0, 1.15, 1.3]);
const DEFAULT_FONT_SCALE = 1.0;
const FONT_SCALE_STORAGE_KEY = 'fontScale';
const FONT_SIZES_RPX = Object.freeze({
  hero: Object.freeze([80, 92, 104]),
  bpSystolic: Object.freeze([135, 140, 145]),
  bpDiastolic: Object.freeze([105, 110, 115]),
  title: Object.freeze([36, 41, 47]),
  button: Object.freeze([32, 37, 42]),
  body: Object.freeze([30, 35, 39]),
  secondary: Object.freeze([26, 30, 34]),
  label: Object.freeze([24, 28, 31]),
  caption: Object.freeze([22, 25, 29]),
});
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

function getScaleIndex(scale) {
  const normalizedScale = normalizeFontScale(scale);
  if (normalizedScale >= 1.3) {
    return 2;
  }
  if (normalizedScale >= 1.15) {
    return 1;
  }
  return 0;
}

function getFontSizes(scale) {
  const scaleIndex = getScaleIndex(scale);
  const nextFontSizes = {};

  Object.keys(FONT_SIZES_RPX).forEach((key) => {
    nextFontSizes[key] = `${FONT_SIZES_RPX[key][scaleIndex]}rpx`;
  });

  return nextFontSizes;
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

function getCurrentFontScale() {
  try {
    const app = getApp();
    return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
  } catch (error) {
    return DEFAULT_FONT_SCALE;
  }
}

function syncFontData() {
  const scale = getCurrentFontScale();
  this.setData({
    fontScale: scale,
    fs: getFontSizes(scale),
  });
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
  FONT_SIZES_RPX,
  FONT_SCALE_LABELS,
  isValidFontScale,
  normalizeFontScale,
  getScaleIndex,
  getFontSizes,
  readLocalFontScale,
  persistLocalFontScale,
  buildFontScaleStyle,
  getCurrentFontScale,
  syncFontData,
  getFontScaleLabel,
  resolveFontScaleSync,
};
