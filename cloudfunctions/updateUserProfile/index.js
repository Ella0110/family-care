const { createCloudFunction } = require('./_shared/function');
const { createUpdateUserProfileHandler } = require('./handler');

exports.main = createCloudFunction(createUpdateUserProfileHandler());
