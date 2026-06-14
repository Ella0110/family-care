const { createCloudFunction } = require('./_shared/function');
const { createCleanupDeletedProfilesHandler } = require('./handler');

exports.main = createCloudFunction(createCleanupDeletedProfilesHandler());
