exports.Model = require('./lib/polyclay').Model;
exports.persist = require('./lib/persistence').persist;
exports.dataLength = require('./lib/util').dataLength;
exports.mixin = require('./lib/mixins').mixin;
try { exports.CouchAdapter = require('./lib/adapters/couch'); } catch(ex) { }
try { exports.RedisAdapter = require('./lib/adapters/redis'); } catch(ex) { }
try { exports.LevelupAdapter = require('./lib/adapters/levelup'); } catch(ex) { }
try { CouchbaseAdapter = require('./lib/adapters/couchbase'); } catch(ex) { }
