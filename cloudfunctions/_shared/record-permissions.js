/**
 * @param {Object} relationship
 * @param {Object} record
 * @returns {boolean}
 */
function canModifyRecord(relationship, record) {
  if (!relationship) {
    return false;
  }

  if (relationship.role === 'owner') {
    return true;
  }

  if (relationship.permissions && relationship.permissions.canManage === true) {
    return true;
  }

  return Boolean(
    relationship.permissions &&
      relationship.permissions.canWrite === true &&
      record.recordedBy === relationship.userId,
  );
}

module.exports = {
  canModifyRecord,
};
