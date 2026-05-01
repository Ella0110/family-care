const { createCloudFunction } = require('./_shared/function');
const { createCreateInvitationHandler } = require('./handler');

exports.main = createCloudFunction(createCreateInvitationHandler());
