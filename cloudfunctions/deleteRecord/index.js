const { createCloudFunction } = require('./_shared/function');
const { createDeleteRecordHandler } = require('./handler');

exports.main = createCloudFunction(createDeleteRecordHandler());
