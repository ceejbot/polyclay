// Common model features implemented as mixins.

var
	_ = require('lodash'),
	assert = require('assert'),
	polyclay = require('./polyclay'),
	util = require('util')
	;

exports.include = function(modelfunc, mixin)
{
	var props = Object.keys(mixin.properties);
	_.each(props, function(k)
	{
		polyclay.Model.addProperty(modelfunc, k, mixin.properties[k]);
	});

	props = Object.keys(mixin.custom);
	_.each(props, function(k)
	{
		modelfunc.prototype.__defineGetter__(k, mixin.custom[k].getter);
		modelfunc.prototype.__defineSetter__(k, mixin.custom[k].setter);
	});
};

