const assert = require('assert');
const path = require('path');

const { store } = require('../store/index');
const { ERROR_MESSAGES } = require('../utils/error-messages');
const {
  FREQUENCY_OPTIONS,
  TIMING_OPTIONS,
  resolveMedicationOptionState,
  sortMedicationsByCreatedAtDesc,
  upsertMedicationGroups,
  removeMedicationFromGroups,
} = require('../utils/medication');

store.setState({
  user: { _id: 'user_owner' },
  profiles: [
    { _id: 'profile_a', name: '爸爸' },
    { _id: 'profile_b', name: '妈妈' },
  ],
  relationships: [
    {
      _id: 'rel_owner_profile_a',
      userId: 'user_owner',
      profileId: 'profile_a',
      role: 'owner',
      permissions: {
        canView: true,
        canWrite: true,
        canEditProfile: true,
        canManage: true,
        canInvite: true,
      },
      subscribeAlerts: true,
      createdAt: '2026-04-20T08:00:00.000Z',
    },
  ],
  currentProfileId: null,
});

assert.ok(Array.isArray(FREQUENCY_OPTIONS));
assert.ok(Array.isArray(TIMING_OPTIONS));
assert.strictEqual(typeof store.getCachedMedications, 'function');
assert.strictEqual(typeof store.setCachedMedications, 'function');
assert.strictEqual(typeof store.hasCachedMedications, 'function');
assert.strictEqual(ERROR_MESSAGES.MEDICATION_NOT_FOUND, '用药记录不存在');

const customFrequencyState = resolveMedicationOptionState('每日四次', FREQUENCY_OPTIONS);
assert.strictEqual(customFrequencyState.selection, '其他');
assert.strictEqual(customFrequencyState.customValue, '每日四次');

const builtInTimingState = resolveMedicationOptionState('早餐后', TIMING_OPTIONS);
assert.strictEqual(builtInTimingState.selection, '早餐后');
assert.strictEqual(builtInTimingState.customValue, '');

const olderMedication = {
  _id: 'med_old',
  profileId: 'profile_a',
  drug: '阿司匹林',
  dose: '100mg',
  frequency: '每日一次',
  createdAt: '2026-04-20T08:00:00.000Z',
  endDate: null,
};
const newerMedication = {
  _id: 'med_new',
  profileId: 'profile_a',
  drug: '厄贝沙坦',
  dose: '150mg',
  frequency: '每日一次',
  createdAt: '2026-04-21T08:00:00.000Z',
  endDate: null,
};

assert.deepStrictEqual(
  sortMedicationsByCreatedAtDesc([olderMedication, newerMedication]).map((item) => item._id),
  ['med_new', 'med_old'],
);

const initialGroups = upsertMedicationGroups(
  { active: [], historical: [] },
  olderMedication,
  '2026-04-24',
);
assert.strictEqual(initialGroups.active.length, 1);
assert.strictEqual(initialGroups.historical.length, 0);

const migratedGroups = upsertMedicationGroups(
  initialGroups,
  Object.assign({}, olderMedication, { endDate: '2026-04-23' }),
  '2026-04-24',
);
assert.strictEqual(migratedGroups.active.length, 0);
assert.strictEqual(migratedGroups.historical.length, 1);
assert.strictEqual(migratedGroups.historical[0]._id, 'med_old');

const removedGroups = removeMedicationFromGroups(migratedGroups, 'med_old');
assert.strictEqual(removedGroups.active.length, 0);
assert.strictEqual(removedGroups.historical.length, 0);

store.setCachedMedications('profile_a', {
  active: [newerMedication],
  historical: [],
});
assert.strictEqual(store.hasCachedMedications('profile_a'), true);
assert.strictEqual(store.getCachedMedications('profile_a').active[0]._id, 'med_new');
assert.strictEqual(store.getCachedMedications('profile_b'), null);

const requestPath = path.resolve(__dirname, '../services/request.js');
delete require.cache[requestPath];

let listResponse = {
  activeMedications: [
    {
      _id: 'med_remote_active',
      profileId: 'profile_a',
      drug: '缬沙坦',
      dose: '80mg',
      frequency: '每日一次',
      createdAt: '2026-04-22T08:00:00.000Z',
      endDate: null,
    },
  ],
  historicalMedications: [],
};

require.cache[requestPath] = {
  id: requestPath,
  filename: requestPath,
  loaded: true,
  exports: {
    async call(name, data) {
      if (name === 'listMedications') {
        return Object.assign({ success: true }, listResponse);
      }

      if (name === 'saveMedication') {
        if (data.profileId) {
          return {
            success: true,
            medication: {
              _id: 'med_created',
              profileId: data.profileId,
              drug: data.data.drug,
              dose: data.data.dose,
              frequency: data.data.frequency,
              timing: data.data.timing || null,
              startDate: data.data.startDate || null,
              endDate: data.data.endDate || null,
              note: data.data.note || null,
              createdAt: '2026-04-24T08:00:00.000Z',
              updatedAt: '2026-04-24T08:00:00.000Z',
            },
          };
        }

        return {
          success: true,
          medication: {
            _id: data.medicationId,
            profileId: 'profile_a',
            drug: '缬沙坦',
            dose: '40mg',
            frequency: data.patch.frequency || '每日一次',
            timing: data.patch.timing === undefined ? '早餐后' : data.patch.timing,
            startDate: '2026-04-20',
            endDate: data.patch.endDate === undefined ? null : data.patch.endDate,
            note: data.patch.note === undefined ? null : data.patch.note,
            createdAt: '2026-04-22T08:00:00.000Z',
            updatedAt: '2026-04-24T09:00:00.000Z',
          },
        };
      }

      if (name === 'deleteMedication') {
        return { success: true };
      }

      throw new Error(`unexpected cloud function: ${name}`);
    },
  },
};

const medicationServicePath = path.resolve(__dirname, '../services/medication-service.js');
delete require.cache[medicationServicePath];
const medicationService = require('../services/medication-service');

async function main() {
  const events = [];

  await medicationService.loadMedications('profile_a', {
    onCacheHit(data) {
      events.push(`cache:${data.active[0]._id}`);
    },
    onFresh(data) {
      events.push(`fresh:${data.active[0]._id}`);
    },
    onError(error) {
      events.push(`error:${error.code || error.message}`);
    },
  });

  assert.deepStrictEqual(events, ['cache:med_new', 'fresh:med_remote_active']);
  assert.strictEqual(store.getCachedMedications('profile_a').active[0]._id, 'med_remote_active');

  const created = await medicationService.createMedication('profile_a', {
    drug: '阿托伐他汀',
    dose: '20mg',
    frequency: '每日一次',
  });
  assert.strictEqual(created.medication._id, 'med_created');
  assert.strictEqual(store.getCachedMedications('profile_a').active[0]._id, 'med_created');

  await medicationService.updateMedication('med_remote_active', {
    endDate: '2026-04-23',
  });
  assert.strictEqual(store.getCachedMedications('profile_a').active.length, 1);
  assert.strictEqual(store.getCachedMedications('profile_a').historical[0]._id, 'med_remote_active');

  await medicationService.deleteMedication('med_created');
  assert.ok(
    !(store.getCachedMedications('profile_a').active || []).some((item) => item._id === 'med_created'),
  );
  assert.strictEqual(store.getCachedMedications('profile_b'), null);

  let medicationEditConfig = null;
  global.Page = (config) => {
    medicationEditConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateBack() {},
    redirectTo() {},
    showModal({ success }) {
      success({ confirm: true, cancel: false });
    },
  };
  global.getCurrentPages = () => [{ route: 'pages/home/home' }, { route: 'pages/medication-edit/medication-edit' }];

  const medicationEditPath = path.resolve(__dirname, '../pages/medication-edit/medication-edit.js');
  delete require.cache[medicationEditPath];
  require('../pages/medication-edit/medication-edit');

  assert.ok(medicationEditConfig, 'medication-edit should register Page config');

  const page = {
    data: JSON.parse(JSON.stringify(medicationEditConfig.data || {})),
    setData(patch) {
      Object.keys(patch || {}).forEach((key) => {
        if (key.indexOf('.') === -1) {
          this.data[key] = patch[key];
          return;
        }

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
  };
  Object.keys(medicationEditConfig).forEach((key) => {
    if (typeof medicationEditConfig[key] === 'function') {
      page[key] = medicationEditConfig[key];
    }
  });

  store.setCachedMedications('profile_a', {
    active: [
      {
        _id: 'med_custom',
        profileId: 'profile_a',
        drug: '测试药',
        dose: '10mg',
        frequency: '每日四次',
        timing: '晨起后',
        startDate: '2026-04-20',
        endDate: null,
        note: '自定义值',
        createdAt: '2026-04-24T08:00:00.000Z',
        updatedAt: '2026-04-24T08:00:00.000Z',
      },
    ],
    historical: [],
  });

  page.onLoad({
    mode: 'edit',
    profileId: 'profile_a',
    medicationId: 'med_custom',
  });

  assert.strictEqual(page.data.form.frequencySelection, '其他');
  assert.strictEqual(page.data.form.frequencyCustom, '每日四次');
  assert.strictEqual(page.data.form.timingSelection, '其他');
  assert.strictEqual(page.data.form.timingCustom, '晨起后');

  page.onFrequencyChange({ detail: { value: 0 } });
  assert.strictEqual(page.data.showCustomFrequency, false);
  assert.strictEqual(page.data.form.frequencyCustom, '');

  page.setData({
    'form.drug': '',
  });
  assert.strictEqual(page.validateForm(), '药物名称不能为空');

  page.setData({
    'form.drug': '测试药',
    'form.dose': '10mg',
    'form.frequencySelection': '每日一次',
    'form.startDate': '2026-04-24',
    'form.endDate': '2026-04-23',
  });
  assert.strictEqual(page.validateForm(), '停药日期必须晚于开始日期');

  console.log('[verify-t3.1b-medication] pass');
}

main().catch((error) => {
  console.error('[verify-t3.1b-medication] fail');
  console.error(error);
  process.exitCode = 1;
});
