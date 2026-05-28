const assert = require('assert');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function resolveProject(relativePath) {
  return path.join(projectRoot, relativePath);
}

function mockModule(relativePath, exports) {
  const absolutePath = resolveProject(relativePath);
  require.cache[absolutePath] = {
    id: absolutePath,
    filename: absolutePath,
    loaded: true,
    exports,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assignData(target, keyPath, value) {
  const segments = String(keyPath || '').split('.');
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

function createPageInstance(definition, overrides = {}) {
  return Object.assign(
    {
      data: deepClone(definition.data || {}),
      setData(patch, callback) {
        Object.keys(patch || {}).forEach((key) => {
          assignData(this.data, key, patch[key]);
        });
        if (typeof callback === 'function') {
          callback();
        }
      },
    },
    definition,
    overrides,
  );
}

function loadPage(relativePath) {
  let capturedPage = null;
  global.Page = (definition) => {
    capturedPage = definition;
  };

  const absolutePath = resolveProject(relativePath);
  delete require.cache[absolutePath];
  require(absolutePath);
  assert.ok(capturedPage, `${relativePath} should register a page`);
  return capturedPage;
}

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function verifyMedicationListPage(listPage, context) {
  const instance = createPageInstance(listPage);
  listPage.onLoad.call(instance, { profileId: 'profile-1' });

  listPage.onShow.call(instance);
  await flushTasks();

  assert.strictEqual(context.loadMedicationsCalls.length, 1, 'list page should reload medications on show');
  assert.strictEqual(instance.data.activeMedications.length, 1, 'list page should render active medications');
  assert.strictEqual(instance.data.historicalMedications.length, 1, 'list page should render historical medications');
  assert.strictEqual(instance.data.hasAnyMedication, true, 'list page should leave empty state after loading medications');

  listPage.handleOpenMedicationDetail.call(instance, {
    currentTarget: {
      dataset: {
        id: 'med-1',
      },
    },
  });
  assert.deepStrictEqual(
    context.navigateToCalls.pop(),
    {
      url: '/pages/medication-detail/medication-detail?mode=edit&profileId=profile-1&medicationId=med-1',
    },
    'tapping a medication card should navigate to the detail editor',
  );

  listPage.handleCreateMedication.call(instance);
  assert.deepStrictEqual(
    context.navigateToCalls.pop(),
    {
      url: '/pages/medication-detail/medication-detail?mode=create&profileId=profile-1',
    },
    'the add-medication CTA should navigate to the create detail page',
  );

  await listPage.handleDeleteMedication.call(instance, {
    currentTarget: {
      dataset: {
        id: 'med-1',
      },
    },
  });

  assert.strictEqual(
    context.deleteMedicationCalls.pop(),
    'med-1',
    'swipe delete should delete medications directly from the list page',
  );
}

async function verifyMedicationEmptyState(listPage, context) {
  context.loadMedicationsResult = {
    active: [],
    historical: [],
  };

  const instance = createPageInstance(listPage);
  listPage.onLoad.call(instance, { profileId: 'profile-1' });
  await listPage.loadMedications.call(instance);

  assert.strictEqual(instance.data.activeMedications.length, 0, 'empty list should not keep active medications');
  assert.strictEqual(instance.data.historicalMedications.length, 0, 'empty list should not keep historical medications');
  assert.strictEqual(instance.data.hasAnyMedication, false, 'empty list should show the empty-state branch');
}

async function verifyMedicationDetailCreate(detailPage, context) {
  const instance = createPageInstance(detailPage);
  detailPage.onLoad.call(instance, { mode: 'create', profileId: 'profile-1' });

  instance.setData({
    'form.drug': '氨氯地平',
    'form.dose': '5mg',
    'form.frequencySelection': '每日一次',
    'form.timing': '早餐后',
    'form.startDate': '2026-05-28',
  });

  await detailPage.handleSubmit.call(instance);

  assert.deepStrictEqual(
    context.createMedicationCalls.pop(),
    {
      profileId: 'profile-1',
      payload: {
        drug: '氨氯地平',
        dose: '5mg',
        frequency: '每日一次',
        timing: '早餐后',
        startDate: '2026-05-28',
        endDate: null,
      },
    },
    'creating a medication should send the expected payload',
  );
  assert.deepStrictEqual(
    context.navigateBackCalls.pop(),
    { delta: 1 },
    'create success should navigate back to the medication list',
  );
}

async function verifyMedicationDetailEditAndDelete(detailPage, context) {
  const instance = createPageInstance(detailPage);
  detailPage.onLoad.call(instance, {
    mode: 'edit',
    profileId: 'profile-1',
    medicationId: 'med-1',
  });

  assert.strictEqual(instance.data.form.drug, '厄贝沙坦', 'edit mode should backfill the cached medication');

  instance.setData({
    'form.drug': '厄贝沙坦片',
    'form.timing': '晚饭后服用',
  });

  await detailPage.handleSubmit.call(instance);
  assert.deepStrictEqual(
    context.updateMedicationCalls.pop(),
    {
      medicationId: 'med-1',
      patch: {
        drug: '厄贝沙坦片',
        timing: '晚饭后服用',
      },
    },
    'editing a medication should only send the changed fields',
  );
  assert.deepStrictEqual(
    context.navigateBackCalls.pop(),
    { delta: 1 },
    'edit success should navigate back to the medication list',
  );

  await detailPage.handleDelete.call(instance);
  assert.strictEqual(context.deleteMedicationCalls.pop(), 'med-1', 'deleting a medication should call deleteMedication');
  assert.deepStrictEqual(
    context.navigateBackCalls.pop(),
    { delta: 1 },
    'delete success should navigate back to the medication list',
  );
}

async function main() {
  const state = {
    currentProfileId: 'profile-1',
    profiles: [
      {
        _id: 'profile-1',
        name: '爸爸',
      },
    ],
  };

  const context = {
    loadMedicationsCalls: [],
    createMedicationCalls: [],
    updateMedicationCalls: [],
    deleteMedicationCalls: [],
    navigateToCalls: [],
    navigateBackCalls: [],
    showToastCalls: [],
    loadMedicationsResult: {
      active: [
        {
          _id: 'med-1',
          drug: '厄贝沙坦',
          dose: '150mg',
          frequency: '每日一次',
          timing: '早餐后',
          startDate: '2026-05-01',
        },
      ],
      historical: [
        {
          _id: 'med-2',
          drug: '阿司匹林',
          dose: '100mg',
          frequency: '睡前一次',
          timing: '睡前',
          startDate: '2025-03-01',
          endDate: '2025-05-01',
        },
      ],
    },
  };

  const medicationService = {
    loadMedications(profileId, callbacks = {}) {
      context.loadMedicationsCalls.push(profileId);
      const groups = deepClone(context.loadMedicationsResult);
      if (callbacks.onFresh) {
        callbacks.onFresh(groups);
      }
      return Promise.resolve(groups);
    },
    fetchMedications() {
      const groups = deepClone(context.loadMedicationsResult);
      return Promise.resolve({
        activeMedications: groups.active,
        historicalMedications: groups.historical,
      });
    },
    getCachedMedication(profileId, medicationId) {
      if (profileId !== 'profile-1' || medicationId !== 'med-1') {
        return null;
      }
      return {
        _id: 'med-1',
        profileId: 'profile-1',
        drug: '厄贝沙坦',
        dose: '150mg',
        frequency: '每日一次',
        timing: '早餐后',
        startDate: '2026-05-01',
        endDate: null,
      };
    },
    createMedication(profileId, payload) {
      context.createMedicationCalls.push({ profileId, payload });
      return Promise.resolve({
        medication: Object.assign({ _id: 'med-new', profileId }, payload),
      });
    },
    updateMedication(medicationId, patch) {
      context.updateMedicationCalls.push({ medicationId, patch });
      return Promise.resolve({
        medication: Object.assign({
          _id: medicationId,
          profileId: 'profile-1',
          drug: '厄贝沙坦片',
          dose: '150mg',
          frequency: '每日一次',
          timing: '早餐后',
          startDate: '2026-05-01',
          endDate: null,
        }, patch),
      });
    },
    deleteMedication(medicationId) {
      context.deleteMedicationCalls.push(medicationId);
      return Promise.resolve({ success: true });
    },
  };

  mockModule('store/index.js', {
    store: {
      getState() {
        return state;
      },
    },
  });
  mockModule('services/medication-service.js', medicationService);
  mockModule('utils/error-messages.js', {
    getErrorMessage(error) {
      return (error && error.message) || 'error';
    },
  });
  mockModule('utils/permission-helpers.js', {
    canWrite() {
      return true;
    },
  });

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    callback();
    return 1;
  };
  global.clearTimeout = () => {};
  global.getCurrentPages = () => [{ route: 'pages/profile-home/profile-home' }, { route: 'pages/medication-detail/medication-detail' }];
  global.wx = {
    navigateTo(options) {
      context.navigateToCalls.push(options);
    },
    navigateBack(options) {
      context.navigateBackCalls.push(options);
    },
    redirectTo(options) {
      context.navigateToCalls.push(options);
    },
    showToast(options) {
      context.showToastCalls.push(options);
    },
    setNavigationBarTitle() {},
    showModal(options) {
      if (options && typeof options.success === 'function') {
        options.success({ confirm: true, cancel: false });
      }
    },
    switchTab() {},
  };

  try {
    const listPage = loadPage('pages/medication-edit/medication-edit.js');
    const detailPage = loadPage('pages/medication-detail/medication-detail.js');

    await verifyMedicationListPage(listPage, context);
    await verifyMedicationEmptyState(listPage, context);
    context.loadMedicationsResult = {
      active: [
        {
          _id: 'med-1',
          drug: '厄贝沙坦',
          dose: '150mg',
          frequency: '每日一次',
          timing: '早餐后',
          startDate: '2026-05-01',
          note: '',
        },
      ],
      historical: [
        {
          _id: 'med-2',
          drug: '阿司匹林',
          dose: '100mg',
          frequency: '睡前一次',
          timing: '睡前',
          startDate: '2025-03-01',
          endDate: '2025-05-01',
          note: '',
        },
      ],
    };
    await verifyMedicationDetailCreate(detailPage, context);
    await verifyMedicationDetailEditAndDelete(detailPage, context);
    console.log('verify-c2-medication-runtime: ok');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
