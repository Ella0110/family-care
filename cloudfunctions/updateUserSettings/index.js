const { createCloudFunction } = require('./_shared/function');
const { createUpdateUserSettingsHandler } = require('./handler');

exports.main = createCloudFunction(createUpdateUserSettingsHandler());
