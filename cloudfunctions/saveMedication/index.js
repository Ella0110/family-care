const { createCloudFunction } = require('./_shared/function');
const { createSaveMedicationHandler } = require('./handler');

exports.main = createCloudFunction(createSaveMedicationHandler());
