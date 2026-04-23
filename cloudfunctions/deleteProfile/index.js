const { createCloudFunction } = require('../_shared/function');
const { createDeleteProfileHandler } = require('./handler');

exports.main = createCloudFunction(createDeleteProfileHandler());
