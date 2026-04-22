/**
 * @typedef {Object} StoreState
 * @property {Object|null} user
 * @property {Array<Object>} profiles
 * @property {Array<Object>} relationships
 * @property {string|null} currentProfileId
 */

/** @type {StoreState} */
const state = {
  user: null,
  profiles: [],
  relationships: [],
  currentProfileId: null,
};

const listeners = new Set();

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

  if (profileIds.includes(nextState.currentProfileId)) {
    return nextState.currentProfileId;
  }

  return profileIds[0] || null;
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
    nextState.currentProfileId = resolveCurrentProfileId(nextState);

    Object.assign(state, nextState);

    const nextSnapshot = snapshot();
    listeners.forEach((listener) => listener(nextSnapshot));

    return nextSnapshot;
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
