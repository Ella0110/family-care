const { createCloudFunction } = require('./_shared/function');
const { createRemoveRelationshipHandler } = require('./handler');

exports.main = createCloudFunction(createRemoveRelationshipHandler());
