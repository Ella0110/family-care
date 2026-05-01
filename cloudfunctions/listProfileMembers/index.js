const { createCloudFunction } = require('./_shared/function');
const { createListProfileMembersHandler } = require('./handler');

exports.main = createCloudFunction(createListProfileMembersHandler());
