const { createCloudFunction } = require('./_shared/function');
const { createUpdateProfileSettingsHandler } = require('./handler');

exports.main = createCloudFunction(createUpdateProfileSettingsHandler());
