// Common model features implemented as mixins.

var
	_ = require('lodash'),
	polyclay = require('./polyclay')
	;

exports.mixin = function(modelfunc, mixin)
{
	var props = Object.keys(mixin.properties || {});
	_.each(props, function(k)
	{
		polyclay.Model.addProperty(modelfunc, k, mixin.properties[k]);
	});

	props = Object.keys(mixin.custom || {});
	_.each(props, function(k)
	{
		modelfunc.prototype.__defineGetter__(k, mixin.custom[k].getter);
		modelfunc.prototype.__defineSetter__(k, mixin.custom[k].setter);
	});

	props = Object.keys(mixin.methods || {});
	_.each(props, function(k)
	{
		modelfunc.prototype[k] = mixin.methods[k];
	});
};

