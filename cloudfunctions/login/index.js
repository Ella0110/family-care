const { createCloudFunction } = require('./_shared/function');
const { createLoginHandler } = require('./handler');

exports.main = createCloudFunction(createLoginHandler());
