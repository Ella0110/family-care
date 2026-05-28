/**
 * @typedef {Object} StoreState
 * @property {Object|null} user
 * @property {Array<Object>} profiles
 * @property {Array<Object>} relationships
 * @property {string|null} currentProfileId
 * @property {{ profiles: Array<Object>, latestRecords: Object<string, Object>, records: Object<string, Object>, medications: Object<string, Object> }} cache
 * @property {{ profiles: number, members: Object<string, number> }} lastRefreshAt
 * @property {{ dismissedProfileCompletionHints: Object<string, boolean> }} session
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
    medications: {},
  },
  lastRefreshAt: {
    profiles: 0,
    members: {},
  },
  session: {
    dismissedProfileCompletionHints: {},
  },
};

const listeners = new Set();

function cloneCache(cache) {
  return {
    profiles: Array.isArray(cache.profiles) ? cache.profiles.slice() : [],
    latestRecords: Object.assign({}, cache.latestRecords || {}),
    records: Object.assign({}, cache.records || {}),
    medications: Object.assign({}, cache.medications || {}),
  };
}

function cloneSession(session) {
  return {
    dismissedProfileCompletionHints: Object.assign({}, session && session.dismissedProfileCompletionHints || {}),
  };
}

function cloneLastRefreshAt(lastRefreshAt) {
  return {
    profiles: Number(lastRefreshAt && lastRefreshAt.profiles) || 0,
    members: Object.assign({}, (lastRefreshAt && lastRefreshAt.members) || {}),
  };
}

function pruneCacheForProfiles(cache, profiles) {
  const profileIds = new Set((profiles || []).map((profile) => profile && profile._id).filter(Boolean));
  const nextCache = {
    profiles: Array.isArray(profiles) ? profiles.slice() : [],
    latestRecords: {},
    records: {},
    medications: {},
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

  Object.keys(cache.medications || {}).forEach((profileId) => {
    if (profileIds.has(profileId)) {
      nextCache.medications[profileId] = cache.medications[profileId];
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
    lastRefreshAt: cloneLastRefreshAt(state.lastRefreshAt),
    session: cloneSession(state.session),
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
    nextState.lastRefreshAt = cloneLastRefreshAt(nextState.lastRefreshAt || state.lastRefreshAt);
    nextState.session = cloneSession(nextState.session || state.session);
    nextState.cache.profiles = nextState.profiles.slice();
    if (Object.prototype.hasOwnProperty.call(patch, 'profiles')) {
      nextState.cache = pruneCacheForProfiles(nextState.cache, nextState.profiles);
      const validProfileIds = new Set(nextState.profiles.map((profile) => profile && profile._id).filter(Boolean));
      nextState.session.dismissedProfileCompletionHints = Object.keys(nextState.session.dismissedProfileCompletionHints)
        .filter((profileId) => validProfileIds.has(profileId))
        .reduce((accumulator, profileId) => {
          accumulator[profileId] = true;
          return accumulator;
        }, {});
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
   * @param {string} profileId
   * @returns {boolean}
   */
  hasCachedMedications(profileId) {
    return Object.prototype.hasOwnProperty.call(state.cache.medications, profileId);
  },

  /**
   * @param {string} profileId
   * @returns {{ active: Array<Object>, historical: Array<Object> }|null}
   */
  getCachedMedications(profileId) {
    const entry = state.cache.medications[profileId];

    if (!entry) {
      return null;
    }

    return {
      active: Array.isArray(entry.active) ? entry.active.slice() : [],
      historical: Array.isArray(entry.historical) ? entry.historical.slice() : [],
    };
  },

  /**
   * @param {string} profileId
   * @param {{ active: Array<Object>, historical: Array<Object> }} groups
   * @returns {StoreState}
   */
  setCachedMedications(profileId, groups) {
    if (!profileId) {
      return snapshot();
    }

    state.cache.medications = Object.assign({}, state.cache.medications, {
      [profileId]: {
        active: Array.isArray(groups && groups.active) ? groups.active.slice() : [],
        historical: Array.isArray(groups && groups.historical) ? groups.historical.slice() : [],
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
   * @param {string} profileId
   * @returns {boolean}
   */
  isProfileCompletionHintDismissed(profileId) {
    return Boolean(
      profileId &&
      state.session &&
      state.session.dismissedProfileCompletionHints &&
      state.session.dismissedProfileCompletionHints[profileId],
    );
  },

  /**
   * @param {string} profileId
   * @returns {StoreState}
   */
  dismissProfileCompletionHint(profileId) {
    if (!profileId) {
      return snapshot();
    }

    state.session.dismissedProfileCompletionHints = Object.assign(
      {},
      state.session.dismissedProfileCompletionHints,
      { [profileId]: true },
    );

    return notify();
  },

  /**
   * Clears transient in-memory UI dismissals for the current app session.
   *
   * @returns {StoreState}
   */
  resetSessionDismissals() {
    state.session.dismissedProfileCompletionHints = {};
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

  /**
   * Returns the last refresh timestamp for a scope.
   *
   * @param {'profiles'|'members'} scope
   * @param {string|null} [key]
   * @returns {number}
   */
  getLastRefreshAt(scope, key = null) {
    if (scope === 'profiles') {
      return Number(state.lastRefreshAt && state.lastRefreshAt.profiles) || 0;
    }

    if (scope === 'members') {
      return Number(state.lastRefreshAt && state.lastRefreshAt.members && key && state.lastRefreshAt.members[key]) || 0;
    }

    return 0;
  },

  /**
   * Marks a scope as refreshed at current time.
   *
   * @param {'profiles'|'members'} scope
   * @param {string|null} [key]
   * @returns {StoreState}
   */
  markRefreshed(scope, key = null) {
    const now = Date.now();

    if (scope === 'profiles') {
      state.lastRefreshAt = Object.assign({}, state.lastRefreshAt, {
        profiles: now,
      });
      return notify();
    }

    if (scope === 'members' && key) {
      state.lastRefreshAt = Object.assign({}, state.lastRefreshAt, {
        members: Object.assign({}, state.lastRefreshAt.members, {
          [key]: now,
        }),
      });
      return notify();
    }

    return snapshot();
  },

  /**
   * Clears refresh timestamps so a scope becomes stale again.
   *
   * @param {'profiles'|'members'} scope
   * @param {string|null} [key]
   * @returns {StoreState}
   */
  clearRefresh(scope, key = null) {
    if (scope === 'profiles') {
      state.lastRefreshAt = Object.assign({}, state.lastRefreshAt, {
        profiles: 0,
      });
      return notify();
    }

    if (scope === 'members') {
      const nextMembers = Object.assign({}, state.lastRefreshAt.members);

      if (key) {
        delete nextMembers[key];
      } else {
        Object.keys(nextMembers).forEach((profileId) => {
          delete nextMembers[profileId];
        });
      }

      state.lastRefreshAt = Object.assign({}, state.lastRefreshAt, {
        members: nextMembers,
      });
      return notify();
    }

    return snapshot();
  },

  /**
   * @param {'profiles'|'members'} scope
   * @param {string|null} key
   * @param {number} ttlMs
   * @returns {boolean}
   */
  isStale(scope, key, ttlMs) {
    const lastRefreshAt = this.getLastRefreshAt(scope, key);
    if (!lastRefreshAt) {
      return true;
    }

    return (Date.now() - lastRefreshAt) > ttlMs;
  },
};

module.exports = {
  store,
};
