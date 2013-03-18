exports.Model = require('./lib/polyclay').Model;
exports.persist = require('./lib/persistence').persist;
exports.dataLength = require('./lib/util').dataLength;
exports.mixin = require('./lib/mixins').mixin;
exports.CouchAdapter = require('./lib/adapters/couch');
exports.RedisAdapter = require('./lib/adapters/redis');
exports.LevelupAdapter = require('./lib/adapters/levelup');
