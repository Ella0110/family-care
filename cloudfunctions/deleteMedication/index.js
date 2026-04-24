const { createCloudFunction } = require('./_shared/function');
const { createDeleteMedicationHandler } = require('./handler');

exports.main = createCloudFunction(createDeleteMedicationHandler());
