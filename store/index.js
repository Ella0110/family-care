/**
 * @typedef {Object} StoreState
 * @property {Object|null} user
 * @property {Array<Object>} profiles
 * @property {Array<Object>} relationships
 * @property {string|null} currentProfileId
 * @property {{ profiles: Array<Object>, latestRecords: Object<string, Object>, records: Object<string, Object> }} cache
 */

/** @type {StoreState} */
const state = {
  user: null,
  profiles: [],
  relationships: [],
  currentProfileId: null,
  cache: {
    profiles: [],
    latestRecords: {},
    records: {},
  },
};

const listeners = new Set();

function cloneCache(cache) {
  return {
    profiles: Array.isArray(cache.profiles) ? cache.profiles.slice() : [],
    latestRecords: Object.assign({}, cache.latestRecords || {}),
    records: Object.assign({}, cache.records || {}),
  };
}

function pruneCacheForProfiles(cache, profiles) {
  const profileIds = new Set((profiles || []).map((profile) => profile && profile._id).filter(Boolean));
  const nextCache = {
    profiles: Array.isArray(profiles) ? profiles.slice() : [],
    latestRecords: {},
    records: {},
  };

  Object.keys(cache.latestRecords || {}).forEach((profileId) => {
    if (profileIds.has(profileId)) {
      nextCache.latestRecords[profileId] = cache.latestRecords[profileId];
    }
  });

  Object.keys(cache.records || {}).forEach((profileId) => {
    if (profileIds.has(profileId)) {
      nextCache.records[profileId] = cache.records[profileId];
    }
  });

  return nextCache;
}

function notify() {
  const nextSnapshot = snapshot();
  listeners.forEach((listener) => listener(nextSnapshot));
  return nextSnapshot;
}

/**
 * Creates a shallow snapshot for consumers so subscribers do not mutate internal state by accident.
 *
 * @returns {StoreState}
 */
function snapshot() {
  return {
    user: state.user,
    profiles: state.profiles.slice(),
    relationships: state.relationships.slice(),
    currentProfileId: state.currentProfileId,
    cache: cloneCache(state.cache),
  };
}

/**
 * Picks a valid current profile id after each state update.
 *
 * @param {StoreState} nextState
 * @returns {string|null}
 */
function resolveCurrentProfileId(nextState) {
  const profileIds = nextState.profiles.map((profile) => profile && profile._id).filter(Boolean);

  if (!nextState.currentProfileId) {
    return null;
  }

  if (profileIds.includes(nextState.currentProfileId)) {
    return nextState.currentProfileId;
  }

  return null;
}

const store = {
  /**
   * Returns the latest store snapshot.
   *
   * @returns {StoreState}
   */
  getState() {
    return snapshot();
  },

  /**
   * Merges the given patch into global state and notifies all subscribers.
   *
   * @param {Partial<StoreState>} [patch={}]
   * @returns {StoreState}
   */
  setState(patch = {}) {
    const nextState = Object.assign({}, state, patch);

    nextState.profiles = Array.isArray(nextState.profiles) ? nextState.profiles : [];
    nextState.relationships = Array.isArray(nextState.relationships) ? nextState.relationships : [];
    nextState.cache = cloneCache(nextState.cache || state.cache);
    nextState.cache.profiles = nextState.profiles.slice();
    if (Object.prototype.hasOwnProperty.call(patch, 'profiles')) {
      nextState.cache = pruneCacheForProfiles(nextState.cache, nextState.profiles);
    }
    nextState.currentProfileId = resolveCurrentProfileId(nextState);

    Object.assign(state, nextState);

    return notify();
  },

  /**
   * Selects the current profile. Unknown profile ids fall back to null so the
   * multi-profile list remains the safe default.
   *
   * @param {string|null} profileId
   * @returns {StoreState}
   */
  setCurrentProfileId(profileId) {
    if (profileId === null || profileId === undefined || profileId === '') {
      return this.setState({ currentProfileId: null });
    }

    const profileIds = state.profiles.map((profile) => profile && profile._id).filter(Boolean);
    return this.setState({
      currentProfileId: profileIds.includes(profileId) ? profileId : null,
    });
  },

  /**
   * @param {string} profileId
   * @returns {boolean}
   */
  hasCachedLatestRecord(profileId) {
    return Object.prototype.hasOwnProperty.call(state.cache.latestRecords, profileId);
  },

  /**
   * @param {string} profileId
   * @returns {Object|null}
   */
  getCachedLatestRecord(profileId) {
    const entry = state.cache.latestRecords[profileId];
    return entry ? entry.record : null;
  },

  /**
   * @param {string} profileId
   * @param {Object|null} record
   * @returns {StoreState}
   */
  setCachedLatestRecord(profileId, record) {
    if (!profileId) {
      return snapshot();
    }

    state.cache.latestRecords = Object.assign({}, state.cache.latestRecords, {
      [profileId]: {
        record: record || null,
        fetchedAt: Date.now(),
      },
    });

    return notify();
  },

  /**
   * @param {string} profileId
   * @returns {boolean}
   */
  hasCachedRecords(profileId) {
    return Object.prototype.hasOwnProperty.call(state.cache.records, profileId);
  },

  /**
   * @param {string} profileId
   * @returns {Array<Object>|null}
   */
  getCachedRecords(profileId) {
    const entry = state.cache.records[profileId];
    return entry ? entry.records.slice() : null;
  },

  /**
   * @param {string} profileId
   * @param {Array<Object>} records
   * @returns {StoreState}
   */
  setCachedRecords(profileId, records) {
    if (!profileId) {
      return snapshot();
    }

    state.cache.records = Object.assign({}, state.cache.records, {
      [profileId]: {
        records: Array.isArray(records) ? records.slice() : [],
        fetchedAt: Date.now(),
      },
    });

    return notify();
  },

  /**
   * Clears both latest-record and full-list caches for one profile.
   *
   * @param {string} profileId
   * @returns {StoreState}
   */
  invalidateRecords(profileId) {
    if (!profileId) {
      return snapshot();
    }

    const nextLatestRecords = Object.assign({}, state.cache.latestRecords);
    const nextRecords = Object.assign({}, state.cache.records);
    delete nextLatestRecords[profileId];
    delete nextRecords[profileId];

    state.cache.latestRecords = nextLatestRecords;
    state.cache.records = nextRecords;

    return notify();
  },

  /**
   * Subscribes to store changes.
   *
   * @param {(nextState: StoreState) => void} listener
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('store.subscribe requires a function listener.');
    }

    listeners.add(listener);

    return () => listeners.delete(listener);
  },

  /**
   * Returns the currently selected profile.
   *
   * @returns {Object|null}
   */
  getCurrentProfile() {
    return state.profiles.find((profile) => profile && profile._id === state.currentProfileId) || null;
  },

  /**
   * Returns the current user's relationship for the selected profile.
   *
   * @returns {Object|null}
   */
  getCurrentRelationship() {
    return (
      state.relationships.find(
        (relationship) => relationship && relationship.profileId === state.currentProfileId,
      ) || null
    );
  },

  /**
   * Checks whether the current relationship includes a specific permission flag.
   *
   * @param {string} permission
   * @returns {boolean}
   */
  hasPermission(permission) {
    const relationship = this.getCurrentRelationship();
    return Boolean(relationship && relationship.permissions && relationship.permissions[permission]);
  },
};

module.exports = {
  store,
};
