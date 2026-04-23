const { createCloudFunction } = require('./_shared/function');
const { createUpdateRecordHandler } = require('./handler');

exports.main = createCloudFunction(createUpdateRecordHandler());
