const { createCloudFunction } = require('./_shared/function');
const { createGetInvitationInfoHandler } = require('./handler');

exports.main = createCloudFunction(createGetInvitationInfoHandler());
