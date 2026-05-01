const { getRoleDefaults, ROLE_PERMISSIONS, ROLE_DEFAULT_SUBSCRIBE_ALERTS } = require('./permissions');

const DEFAULT_BP_THRESHOLD = Object.freeze({
  systolic: 140,
  diastolic: 90,
});

const DEFAULT_BP_REFERENCE_LINES = Object.freeze({
  systolic: {
    normal: 120,
    elevated: 140,
    high: 160,
  },
  diastolic: {
    normal: 80,
    elevated: 90,
    high: 100,
  },
});

const DEFAULT_PROFILE_SETTINGS = Object.freeze({
  bp: {
    // threshold is only for alerting. Do not conflate it with referenceLines.
    threshold: DEFAULT_BP_THRESHOLD,
    // referenceLines is only for charts. It is independently editable from threshold.
    referenceLines: DEFAULT_BP_REFERENCE_LINES,
  },
  glucose: {},
  chartPreferences: {
    split: false,
  },
});

const DEFAULT_USER_SETTINGS = Object.freeze({
  fontScale: 1.0,
  theme: null,
});

/**
 * @param {Object} value
 * @returns {Object}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @returns {Object}
 */
function getDefaultProfileSettings() {
  return clone(DEFAULT_PROFILE_SETTINGS);
}

/**
 * @returns {Object}
 */
function getDefaultUserSettings() {
  return clone(DEFAULT_USER_SETTINGS);
}

module.exports = {
  DEFAULT_BP_THRESHOLD,
  DEFAULT_BP_REFERENCE_LINES,
  DEFAULT_PROFILE_SETTINGS,
  DEFAULT_USER_SETTINGS,
  ROLE_PERMISSIONS,
  ROLE_DEFAULT_SUBSCRIBE_ALERTS,
  getDefaultProfileSettings,
  getDefaultUserSettings,
  getRoleDefaults,
};
