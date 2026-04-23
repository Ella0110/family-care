const { createCloudFunction } = require('./_shared/function');
const { createUpdateProfileHandler } = require('./handler');

exports.main = createCloudFunction(createUpdateProfileHandler());
