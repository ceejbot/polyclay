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
		var custom = mixin.custom[k];
		Object.defineProperty(modelfunc.prototype, k,
		{
			get: custom.getter,
			set: custom.setter,
			enumerable: true
		});
	});

	props = Object.keys(mixin.methods || {});
	_.each(props, function(k)
	{
		modelfunc.prototype[k] = mixin.methods[k];
	});

	props = Object.keys(mixin.statics || {});
	_.each(props, function(k)
	{
		modelfunc[k] = mixin.statics[k];
	});
};
