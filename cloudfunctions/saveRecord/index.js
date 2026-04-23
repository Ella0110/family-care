const { createCloudFunction } = require('./_shared/function');
const { createSaveRecordHandler } = require('./handler');

exports.main = createCloudFunction(createSaveRecordHandler());
