const { createCloudFunction } = require('./_shared/function');
const { createTransferOwnershipHandler } = require('./handler');

exports.main = createCloudFunction(createTransferOwnershipHandler());
