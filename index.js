var PolyClay = require('./lib/polyclay');

PolyClay.persist    = require('./lib/persistence').persist;
PolyClay.dataLength = require('./lib/util').dataLength;
PolyClay.mixin      = require('./lib/mixins').mixin;

module.exports = PolyClay;
