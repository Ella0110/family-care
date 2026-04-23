const assert = require('assert');

const { store } = require('../store/index');

let notifyCount = 0;
let lastSnapshot = null;

const unsubscribe = store.subscribe((nextState) => {
  notifyCount += 1;
  lastSnapshot = nextState;
});

const emptyState = store.setState({
  user: { _id: 'user_1' },
  profiles: [],
  relationships: [],
  currentProfileId: null,
});

assert.strictEqual(emptyState.currentProfileId, null);
assert.deepStrictEqual(emptyState.profiles, []);

const withProfile = store.setState({
  profiles: [{ _id: 'profile_1', name: '爸爸' }],
  relationships: [{ _id: 'rel_1', profileId: 'profile_1', role: 'owner' }],
  currentProfileId: null,
});

assert.strictEqual(withProfile.currentProfileId, null);
assert.strictEqual(store.getCurrentProfile(), null);
assert.strictEqual(store.getCurrentRelationship(), null);

const selected = store.setState({ currentProfileId: 'profile_1' });

assert.strictEqual(selected.currentProfileId, 'profile_1');
assert.strictEqual(store.getCurrentProfile().name, '爸爸');
assert.strictEqual(store.getCurrentRelationship()._id, 'rel_1');

const removed = store.setState({
  profiles: [],
  relationships: [],
  currentProfileId: 'profile_1',
});

assert.strictEqual(removed.currentProfileId, null);
assert.strictEqual(store.getCurrentProfile(), null);
assert.strictEqual(store.getCurrentRelationship(), null);

unsubscribe();
store.setState({ currentProfileId: null });

assert.ok(notifyCount >= 4);
assert.ok(lastSnapshot);

console.log('[verify-store] pass');
