const { store } = require('../store/index');

const CURRENT_PROFILE_STORAGE_KEY = 'currentProfileId';
const LAST_SELECTED_PROFILE_STORAGE_KEY = 'lastSelectedProfileId';

function persistCurrentProfileId(profileId) {
  if (typeof wx === 'undefined') {
    return;
  }

  if (profileId) {
    wx.setStorageSync(CURRENT_PROFILE_STORAGE_KEY, profileId);
    return;
  }

  wx.removeStorageSync(CURRENT_PROFILE_STORAGE_KEY);
}

function clearDeletedLastSelectedProfileId(profileId) {
  if (typeof wx === 'undefined' || !profileId) {
    return;
  }

  const lastSelectedProfileId = wx.getStorageSync(LAST_SELECTED_PROFILE_STORAGE_KEY);
  if (lastSelectedProfileId === profileId) {
    wx.removeStorageSync(LAST_SELECTED_PROFILE_STORAGE_KEY);
  }
}

function findProfileById(profileId) {
  return (store.getState().profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function removeProfileFromStore(profileId) {
  if (!profileId) {
    return store.getState();
  }

  const state = store.getState();
  const nextProfiles = (state.profiles || []).filter((profile) => profile && profile._id !== profileId);
  const nextRelationships = (state.relationships || []).filter(
    (relationship) => relationship && relationship.profileId !== profileId,
  );
  const nextCurrentProfileId = nextProfiles.length ? nextProfiles[0]._id : null;

  const nextState = store.setState({
    profiles: nextProfiles,
    relationships: nextRelationships,
    currentProfileId: nextCurrentProfileId,
  });

  clearDeletedLastSelectedProfileId(profileId);
  persistCurrentProfileId(nextCurrentProfileId);

  return nextState;
}

module.exports = {
  findProfileById,
  removeProfileFromStore,
};
