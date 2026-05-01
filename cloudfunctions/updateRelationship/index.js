const { createCloudFunction } = require('./_shared/function');
const { createUpdateRelationshipHandler } = require('./handler');

exports.main = createCloudFunction(createUpdateRelationshipHandler());
