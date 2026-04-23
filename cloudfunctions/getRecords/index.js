const { createCloudFunction } = require('../_shared/function');
const { createGetRecordsHandler } = require('./handler');

exports.main = createCloudFunction(createGetRecordsHandler());
