const { createCloudFunction } = require('./_shared/function');
const { createRestoreProfileHandler } = require('./handler');

exports.main = createCloudFunction(createRestoreProfileHandler());
