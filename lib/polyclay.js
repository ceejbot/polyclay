var
	_ = require('lodash'),
	assert = require('assert')
	;

var PolyClay = function(){};

PolyClay.Model = function() {};

PolyClay.Model.buildClass = function(options, methods)
{
	var sub = function()
	{
		this.__attributes = {};
		this.__attributesPrev = {};
		this.__new =  true;
		this.__dirty = false;
		this.__attachments = {};
		if (this.__init !== undefined) this.__init.apply(this, arguments);
	};

	sub.prototype = new PolyClay.Model();
	sub.prototype.constructor = sub;
	sub.prototype.__properties = [];
	sub.prototype.__required = [];
	sub.prototype.__optional = [];
	sub.prototype.__types = {};
	sub.prototype.__init = options.initialize;

	var props = Object.keys(options.properties || {});
	_.each(props, function(k)
	{
		PolyClay.Model.addProperty(sub, k, options.properties[k]);
	});

	props = options.optional;
	_.each(props, function(k)
	{
		PolyClay.Model.addOptionalProperty(sub, k);
	});

	props = options.required;
	_.each(props, function(k)
	{
		if (options.properties[k])
			sub.prototype.__required.push(k);
	});

	_.each(options.enumerables, function(enumeration, k)
	{
		PolyClay.Model.addEnumerableProperty(sub, k, enumeration);
	});

	methods = methods || options.methods || {};
	_.each(Object.keys(methods), function(k)
	{
		sub.prototype[k] = methods[k];
	});

	return sub;
};

PolyClay.validTypes = ['string', 'array', 'number', 'boolean', 'date', 'hash', 'reference'];
PolyClay.validate = {
	'string': function(item) { return _.isString(item) || (item === undefined); },
	'array': _.isArray,
	'number': _.isNumber,
	'boolean': _.isBoolean,
	'date': _.isDate,
	'hash': _.isObject,
};
PolyClay.defaults = function(type)
{
	switch(type)
	{
		case 'string': return '';
		case 'array': return [];
		case 'number': return 0;
		case 'boolean': return false;
		case 'date': return new Date();
		case 'hash': return {};
		case 'reference': return {};
	}
};

PolyClay.Model.prototype.valid = function()
{
	var i, p, len;
	var valid = true;
	var props = this.__properties;
	var types = this.__types;
	this.errors = {};
	for (i=0, len=props.length; i<len; i++)
	{
		p = props[i];
		if (!PolyClay.validate[types[p]](this.__attributes[p]))
		{
			this.errors[p] = 'invalid data';
			valid = false;
		}
	}
	props = this.__required;
	for (i = 0, len = props.length; i < len; i++)
	{
		p = props[i];
		if (this.__attributes[p] === undefined)
		{
			this.errors[p] = 'missing';
			valid = false;
		}
	}

	if (this.validator)
		valid = (valid && this.validator());

	return valid;
};

PolyClay.Model.addProperty = function(obj, propname, type)
{
	if (PolyClay.validTypes.indexOf(type) < 0)
		throw(new Error(propname + ' type ' + type + ' invalid; see documentation for types'));

	if (type === 'reference')
		return PolyClay.Model.addReference(obj, propname);

	obj.prototype.__properties.push(propname);
	obj.prototype.__types[propname] = type;

	// prop() is getter
	// prop(newval) is setter
	var getterFunc = function()
	{
		if (this.__attributes[propname] === undefined)
			return PolyClay.defaults(obj.prototype.__types[propname]);

		return this.__attributes[propname];
	};

	var setterFunc = function()
	{
		var newval = arguments['0'];

		if ((obj.prototype.__types[propname] === 'date') && (_.isString(newval) || _.isNumber(newval)))
			newval = new Date(newval);
		else if ((obj.prototype.__types[propname] === 'string') && (null === newval))
			newval = '';

		if (!PolyClay.validate[obj.prototype.__types[propname]](newval))
		{
			throw(new Error(propname+': type of '+newval+' not '+obj.prototype.__types[propname]));
		}

		this.__attributesPrev[propname] = this.__attributes[propname];
		this.__attributes[propname] = newval;
		this.__dirty = true;
	};

	obj.prototype.__defineGetter__(propname, getterFunc);
	obj.prototype.__defineSetter__(propname, setterFunc);
};

PolyClay.Model.addReference = function(obj, propname)
{
	// The object to be referred to must have a `key` property.
	// References persist a 'ref_id' property and provide the usual get/set for
	// it. But they also provide this.ref() & this.set_ref() for runtime-only access
	// to the full object. Inflating that object is an exercise for the persistence
	// layer.

	var runtimeProp = '__' + propname;
	var idProp = propname + '_id';

	PolyClay.Model.addProperty(obj, idProp, 'string');

	var getterFunc = function()
	{
		if (this[runtimeProp] === undefined)
			return PolyClay.defaults('reference');

		return this[runtimeProp];
	};

	var setterFunc = function()
	{
		var newval = arguments['0'];
		if (!newval)
		{
			this[idProp] = '';
			this[runtimeProp] = null;
			return;
		}
		assert(newval.key);
		this[idProp] = newval.key;
		this[runtimeProp] = newval;
	};

	obj.prototype.__defineGetter__(propname, getterFunc);
	obj.prototype.__defineSetter__(propname, setterFunc);
};

PolyClay.Model.addEnumerableProperty = function(obj, propname, enumerable)
{
	var getterFunc = function()
	{
		if (this.__attributes[propname] === undefined)
			return '';

		return enumerable[this.__attributes[propname]];
	};

	var setterFunc = function()
	{
		var newval = arguments["0"];
		if (_.isString(newval) && newval.length === 0)
			newval = 0;

		if (_.isNumber(newval))
		{
			if (newval < 0 || newval >= enumerable.length)
				throw(new Error(newval + ' must be within enumerable range'));
		}
		else if (newval !== undefined)
		{
			var idx = enumerable.indexOf(newval);
			if (idx === -1)
				throw(new Error(newval + ' not member of enumeration for ' + propname));
			newval = idx;
		}
		this.__attributesPrev[propname] = this.__attributes[propname];
		this.__attributes[propname] = newval;
		this.__dirty = true;
	};

	obj.prototype.__properties.push(propname);
	obj.prototype.__types[propname] = 'number';
	obj.prototype.__defineGetter__(propname, getterFunc);
	obj.prototype.__defineSetter__(propname, setterFunc);
};

PolyClay.Model.addOptionalProperty = function(obj, propname)
{
	obj.prototype.__optional.push(propname);

	// No type validation on optional properties.
	var result = function()
	{
		if (arguments.length === 0)
			return this.__attributes[propname];
		this.__attributes[propname] = arguments["0"];
	};
	obj.prototype.__defineGetter__(propname, result);
	obj.prototype.__defineSetter__(propname, result);
};

// Model classes will have these methods defined for them.

PolyClay.Model.prototype.toJSON = function()
{
	return JSON.stringify(this.serialize());
};

PolyClay.Model.prototype.serialize = function()
{
	var props = _.union(this.__optional, this.__properties);
	var result = {};
	for (var i = 0; i < props.length; i++)
		result[props[i]] = this[props[i]];
	return result;
};

PolyClay.Model.prototype.update = function(attr)
{
	var k,
		self = this,
		props = Object.keys(attr),
		whitelist = _.union(this.__optional, this.__properties)
		;
	for (var i = 0; i < props.length; i++)
	{
		k = props[i];
		if (whitelist.indexOf(k) !== -1)
		{
			this[k] = attr[k];
		}
		//else
		//	console.log('skipping unknown property ' + k);
	}
};

PolyClay.Model.prototype.isDirty = function()
{
	return this.__dirty;
};

PolyClay.Model.prototype.clearDirty = function()
{
	this.__dirty = false;
	this.__attributesPrev = {};
};

PolyClay.Model.prototype.rollback = function()
{
	if (!this.isDirty() || !this.__attributesPrev)
		return false;

	var props = Object.keys(this.__attributesPrev);
	for (var i = 0; i < props.length; i++)
		this[props[i]] = this.__attributesPrev[props[i]];

	this.clearDirty();

	return true;
};

exports.Model = PolyClay.Model;
