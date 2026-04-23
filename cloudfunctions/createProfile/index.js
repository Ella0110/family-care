const { createCloudFunction } = require('../_shared/function');
const { createCreateProfileHandler } = require('./handler');

exports.main = createCloudFunction(createCreateProfileHandler());
