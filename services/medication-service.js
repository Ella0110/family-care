const { call } = require('./request');
const { store } = require('../store/index');
const {
  getChinaDateString,
  normalizeMedicationGroups,
  upsertMedicationGroups,
  removeMedicationFromGroups,
} = require('../utils/medication');

function medicationSignature(medication) {
  if (!medication) {
    return 'null';
  }

  return [
    medication._id,
    medication.profileId,
    medication.drug,
    medication.dose,
    medication.frequency,
    medication.timing || '',
    medication.startDate || '',
    medication.endDate || '',
    medication.note || '',
    medication.createdAt && String(medication.createdAt),
    medication.updatedAt && String(medication.updatedAt),
  ].join('|');
}

function groupsSignature(groups) {
  const normalized = normalizeMedicationGroups(groups);
  return [
    normalized.active.map((item) => medicationSignature(item)).join('||'),
    normalized.historical.map((item) => medicationSignature(item)).join('||'),
  ].join('###');
}

function normalizeResult(result) {
  return normalizeMedicationGroups({
    active: Array.isArray(result && result.activeMedications) ? result.activeMedications : [],
    historical: Array.isArray(result && result.historicalMedications) ? result.historicalMedications : [],
  });
}

function findMedicationLocation(medicationId) {
  const cache = (store.getState().cache && store.getState().cache.medications) || {};
  const profileIds = Object.keys(cache);

  for (let index = 0; index < profileIds.length; index += 1) {
    const profileId = profileIds[index];
    const groups = store.getCachedMedications(profileId);
    const allMedications = (groups && groups.active || []).concat((groups && groups.historical) || []);
    const medication = allMedications.find((item) => item && item._id === medicationId);

    if (medication) {
      return {
        profileId,
        groups,
        medication,
      };
    }
  }

  return null;
}

function getCachedMedication(profileId, medicationId) {
  const groups = store.getCachedMedications(profileId);
  const allMedications = (groups && groups.active || []).concat((groups && groups.historical) || []);
  return allMedications.find((item) => item && item._id === medicationId) || null;
}

async function fetchMedications(profileId) {
  const result = await call('listMedications', { profileId }, { silent: true });
  const groups = normalizeResult(result);
  store.setCachedMedications(profileId, groups);

  return {
    activeMedications: groups.active,
    historicalMedications: groups.historical,
  };
}

async function loadMedications(profileId, callbacks = {}) {
  const cachedGroups = store.getCachedMedications(profileId);
  const hasCache = store.hasCachedMedications(profileId);
  const cachedSignature = hasCache ? groupsSignature(cachedGroups) : '';

  if (hasCache && callbacks.onCacheHit) {
    callbacks.onCacheHit({
      active: cachedGroups.active,
      historical: cachedGroups.historical,
      fromCache: true,
    });
  }

  try {
    const fresh = await fetchMedications(profileId);
    const freshGroups = {
      active: fresh.activeMedications,
      historical: fresh.historicalMedications,
    };

    if (!hasCache || groupsSignature(freshGroups) !== cachedSignature) {
      if (callbacks.onFresh) {
        callbacks.onFresh({
          active: freshGroups.active,
          historical: freshGroups.historical,
          fromCache: false,
        });
      }
    }

    return freshGroups;
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error, { hasCache });
    }

    return null;
  }
}

async function createMedication(profileId, data) {
  const result = await call('saveMedication', { profileId, data }, { silent: true });
  const nextGroups = upsertMedicationGroups(
    store.getCachedMedications(profileId) || { active: [], historical: [] },
    result.medication,
    getChinaDateString(),
  );

  store.setCachedMedications(profileId, nextGroups);

  return {
    medication: result.medication,
  };
}

async function updateMedication(medicationId, patch) {
  const result = await call('saveMedication', { medicationId, patch }, { silent: true });
  const profileId = result.medication && result.medication.profileId;

  if (profileId) {
    const nextGroups = upsertMedicationGroups(
      store.getCachedMedications(profileId) || { active: [], historical: [] },
      result.medication,
      getChinaDateString(),
    );
    store.setCachedMedications(profileId, nextGroups);
  }

  return {
    medication: result.medication,
  };
}

async function deleteMedication(medicationId) {
  const location = findMedicationLocation(medicationId);

  await call('deleteMedication', { medicationId }, { silent: true });

  if (location && location.profileId) {
    store.setCachedMedications(
      location.profileId,
      removeMedicationFromGroups(location.groups, medicationId),
    );
  }

  return {
    success: true,
  };
}

module.exports = {
  fetchMedications,
  loadMedications,
  createMedication,
  updateMedication,
  deleteMedication,
  getCachedMedication,
};
