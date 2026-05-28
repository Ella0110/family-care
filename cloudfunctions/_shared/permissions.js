const { invalidArgument } = require('./errors');

const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze({
    canView: true,
    canWrite: true,
    canEditProfile: true,
    canInvite: true,
    canManage: true,
  }),
  collaborator: Object.freeze({
    canView: true,
    canWrite: true,
    canEditProfile: false,
    canInvite: false,
    canManage: false,
  }),
  viewer: Object.freeze({
    canView: true,
    canWrite: false,
    canEditProfile: false,
    canInvite: false,
    canManage: false,
  }),
});

const ROLE_DEFAULT_SUBSCRIBE_ALERTS = Object.freeze({
  owner: false,
  collaborator: false,
  viewer: false,
});

const ROLE_SORT_ORDER = Object.freeze({
  owner: 0,
  collaborator: 1,
  viewer: 2,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSupportedRole(role) {
  if (!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)) {
    throw invalidArgument(`role must be one of: ${Object.keys(ROLE_PERMISSIONS).join(', ')}`);
  }
}

function getPermissionsForRole(role) {
  assertSupportedRole(role);
  return clone(ROLE_PERMISSIONS[role]);
}

function getSubscribeAlertsDefault(role) {
  assertSupportedRole(role);
  return ROLE_DEFAULT_SUBSCRIBE_ALERTS[role];
}

function getRoleDefaults(role) {
  return {
    role,
    permissions: getPermissionsForRole(role),
    subscribeAlerts: getSubscribeAlertsDefault(role),
  };
}

function compareRelationshipRoles(leftRole, rightRole) {
  const left = Object.prototype.hasOwnProperty.call(ROLE_SORT_ORDER, leftRole)
    ? ROLE_SORT_ORDER[leftRole]
    : Number.MAX_SAFE_INTEGER;
  const right = Object.prototype.hasOwnProperty.call(ROLE_SORT_ORDER, rightRole)
    ? ROLE_SORT_ORDER[rightRole]
    : Number.MAX_SAFE_INTEGER;

  return left - right;
}

module.exports = {
  ROLE_PERMISSIONS,
  ROLE_DEFAULT_SUBSCRIBE_ALERTS,
  ROLE_SORT_ORDER,
  getPermissionsForRole,
  getSubscribeAlertsDefault,
  getRoleDefaults,
  compareRelationshipRoles,
};
