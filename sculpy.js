var vv = require('valentine');
var bean = require('bean');

var Sculpy = function()
{
};

Sculpy.extend = function(options)
{
	var sub = function()
	{
		this.construct();
		if (this.initialize !== undefined)
			this.initialize();
	};

	sub.prototype = new Sculpy;
	sub.prototype.constructor = sub;
	sub.prototype.properties = [];
	sub.prototype.calculated = [];
	sub.prototype.types = {};
	sub.prototype.defaults = {};
	sub.prototype.initialize = options.initialize;
	
	var props = options.properties;
	vv.each(props, function(k)
	{
		Sculpy.addProperty(sub, k, props[k][0], props[k][1]);
	});
	props = options.calculated;
	vv.each(props, function(k)
	{
		Sculpy.addCalculatedProperty(sub, k);
	});
	
	sub.prototype.urlroot = options.urlroot;
	
	return sub;
};

Sculpy.prototype.construct = function()
{
	this.id = undefined;
	this.errors = {};
	this.attributes = {};
	this.attributesPrev = {};
	this.isNew =  true;
	this.dirty = false;
};

Sculpy.validTypes = ['string', 'array', 'number', 'boolean', 'date', 'hash'];
Sculpy.validation = {
	'string': vv.is.str,
	'array': vv.is.arr, 
	'number': vv.is.num, 
	'boolean': vv.is.bool, 
	'date': vv.is.dat, 
	'hash': vv.is.obj
};

Sculpy.addProperty = function(obj, name, type, defaultVal)
{
	// If you name a property with an invalid identifier you get what you deserve.
	if (Sculpy.validTypes.indexOf(type) < 0)
		throw('type '+type+' invalid; see documentation for types');

	obj.prototype.properties.push(name);
	obj.prototype.types[name] = type;
	obj.prototype.defaults[name] = defaultVal;
	Sculpy.makeGetterSetter(obj, name);
};

Sculpy.addCalculatedProperty = function(obj, name)
{
	obj.prototype.calculated.push(name);
	Sculpy.makeGetterSetter(obj, name);
};

// prop() is getter
// prop(newval) is setter
Sculpy.makeGetterSetter = function(obj, propname)
{
	var result = function()
	{
		if (arguments.length == 0)
		{
			if (this.attributes[propname] === undefined)
				return this.__proto__.defaults[propname];
			else
				return this.attributes[propname];
		}
		this.attributesPrev[propname] = this.attributes[propname];
		this.attributes[propname] = arguments["0"];
		this.dirty = true;
		bean.fire(this, 'change:'+propname);
		bean.fire(this, 'change');
	};
	obj.prototype[propname] = result;
};

Sculpy.prototype.watch = function(target, event, callback)
{
	bean.add(target, event, callback);
};

Sculpy.prototype.root = function()
{
	return this.__proto__.urlroot;
};

Sculpy.prototype.constructURL = function()
{
	if (this.id === undefined)
		return this.root();
	
	return this.root() + '/' + this.id;
}

Sculpy.prototype.update = function(attr)
{
	var self = this;
	var events = ['change'];
	vv.each(attr, function(k)
	{
		self.__proto__[k].call(self, attr[k]);
		events.push['change:'+k];
	});
	vv.each(events, function(e)
	{
		bean.fire(this, e);
	});
};

Sculpy.prototype.save = function()
{
	var arglen = arguments.length;
	var failure, success, proplist;

	if (arglen == 3)
	{
		proplist = arguments["0"];
		success = arguments["1"];
		failure = arguments["2"];
	}
	else if (arglen == 2)
	{
		proplist = this.__proto__.properties;
		success = arguments["0"];
		failure = arguments["1"];
	}
	else
		throw("save() called with "+arglen+" arguments; exactly 2 or 3 required");

	var props = {};
	for (var i=0, len=proplist.length; i<len; i++)
		props[proplist[i]] = this.attributes[proplist[i]];

	var method = (this.id === undefined) ? 'POST' : 'PUT';
	
	var winning = function()
	{
		
	};
	
	$.ajax(
	{
		url: this.constructURL(),
		type: method,
		data: props,
		success: success,
		error: failure
	});
	return this;
};

Sculpy.prototype.destroy = function(success, failure)
{
	$.ajax(
	{
		url: this.constructURL(),
		type: method,
		success: success,
		error: failure
	});
	return this;
};

Sculpy.prototype.load = function(success, failure)
{
	if (this.id === undefined)
		throw('cannot load object without an id');

	$.ajax(
	{
		url: this.constructURL(),
		type: 'GET',
		success: success,
		error: failure
	});

	return this;
};

Sculpy.prototype.valid = function()
{
	var valid = true;
	var props = this.__proto__.properties;
	var types = this.__proto__.types;
	
	this.errors = {};
	for (var i=0, len=props.length; i<len; i++)
	{
		var p = props[i];
		if (!Sculpy.validation[types[p]](this.attributes[p]))
		{
			this.errors[p] = true;
			valid = false;
		}
	}
	return valid;
};
