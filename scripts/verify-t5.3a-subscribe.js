const assert = require('assert');
const path = require('path');

function measuredParts(offsetMs = -10 * 60 * 1000) {
  const date = new Date(Date.now() + offsetMs);
  return {
    measuredDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    measuredTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

function createPageInstance(config) {
  const parts = measuredParts();

  return {
    data: {
      isEditMode: false,
      isSaving: false,
      profileId: 'profile_1',
      form: {
        systolic: 155,
        diastolic: 94,
        heartRate: '',
        measuredDate: parts.measuredDate,
        measuredTime: parts.measuredTime,
        note: '',
      },
    },
    setData(patch) {
      Object.keys(patch || {}).forEach((key) => {
        const segments = key.split('.');
        let cursor = this.data;
        while (segments.length > 1) {
          const segment = segments.shift();
          cursor[segment] = cursor[segment] || {};
          cursor = cursor[segment];
        }
        cursor[segments[0]] = patch[key];
      });
    },
    ...Object.keys(config).reduce((accumulator, key) => {
      if (typeof config[key] === 'function') {
        accumulator[key] = config[key];
      }
      return accumulator;
    }, {}),
  };
}

async function main() {
  const events = [];
  const servicePath = require.resolve('../services/record-service');
  const pagePath = require.resolve('../pages/record/record');

  delete require.cache[servicePath];
  delete require.cache[pagePath];

  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      saveRecord: async () => {
        events.push('save');
        return {
          record: { _id: 'record_1', payload: { systolic: 155, diastolic: 94 } },
          alertTriggered: true,
          alertSentTo: ['user_1'],
        };
      },
      updateRecord: async () => {
        throw new Error('updateRecord should not be called');
      },
      deleteRecord: async () => {
        throw new Error('deleteRecord should not be called');
      },
      getRecord: async () => null,
    },
  };

  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.getApp = () => ({ globalData: {} });
  global.getCurrentPages = () => [{ route: 'pages/record/record' }, { route: 'pages/home/home' }];
  global.wx = {
    requestSubscribeMessage({ success, complete }) {
      events.push('subscribe');
      if (typeof success === 'function') {
        success({
          'lrhxG9oawoHDyh1AFVSgiv-cQE7-qTAn87-_nzBDxCY': 'accept',
        });
      }
      if (typeof complete === 'function') {
        complete();
      }
    },
    showToast() {},
    navigateBack() {},
    redirectTo() {},
  };

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    if (typeof callback === 'function') {
      callback();
    }
    return 0;
  };

  require(pagePath);
  assert.ok(pageConfig, 'record page should register Page config');

  const page = createPageInstance(pageConfig);
  await page.handleSave();

  global.setTimeout = originalSetTimeout;

  assert.deepStrictEqual(events.slice(0, 2), ['subscribe', 'save']);
  assert.strictEqual(page.data.isSaving, false);
  console.log('[verify-t5.3a-subscribe] pass');
}

main().catch((error) => {
  console.error('[verify-t5.3a-subscribe] fail');
  console.error(error);
  process.exitCode = 1;
});
