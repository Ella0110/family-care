const { createCloudFunction } = require('./_shared/function');
const { createAcceptInvitationHandler } = require('./handler');

exports.main = createCloudFunction(createAcceptInvitationHandler());
