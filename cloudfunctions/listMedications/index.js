const { createCloudFunction } = require('./_shared/function');
const { createListMedicationsHandler } = require('./handler');

exports.main = createCloudFunction(createListMedicationsHandler());
