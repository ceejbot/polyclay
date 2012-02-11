var vv = require('valentine');
var bean = require('bean');
var ender = $.noConflict(); // return '$' back to its original owner

var Sculpy = function(){};

Sculpy.Model = function()
{
};

Sculpy.Model.extend = function(options)
{
	var sub = function()
	{
		this.construct();
		if (this.initialize !== undefined)
			this.initialize();
	};

	sub.prototype = new Sculpy.Model;
	sub.prototype.constructor = sub;
	sub.prototype.properties = [];
	sub.prototype.calculated = [];
	sub.prototype.defaults = {};
	sub.prototype.initialize = options.initialize;
	
	var props = options.properties;
	vv.each(props, function(k)
	{
		Sculpy.Model.addProperty(sub, k, props[k]);
	});
	props = options.calculated;
	vv.each(props, function(k)
	{
		Sculpy.Model.addCalculatedProperty(sub, k);
	});
	
	sub.prototype.urlroot = options.urlroot;
	
	return sub;
};

Sculpy.Model.prototype.construct = function()
{
	this.id = undefined;
	this.attributes = {};
	this.attributesPrev = {};
	this.isNew =  true;
	this.dirty = false;
};

Sculpy.Model.addProperty = function(obj, name, defaultVal)
{
	obj.prototype.properties.push(name);
	obj.prototype.defaults[name] = defaultVal;
	Sculpy.Model.makeGetterSetter(obj, name);
};

Sculpy.Model.addCalculatedProperty = function(obj, name)
{
	obj.prototype.calculated.push(name);
	Sculpy.Model.makeGetterSetter(obj, name);
};

// prop() is getter
// prop(newval) is setter
Sculpy.Model.makeGetterSetter = function(obj, propname)
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
		var silent = false;
		if (arguments.length > 1)
			silent = arguments["1"];
		this.dirty = true;
		if (!silent)
		{
			this.fire('change:'+propname);
			this.fire('change');
		}
	};
	obj.prototype[propname] = result;
};

Sculpy.Model.prototype.toJSON = function()
{
	return this.attributes;
};

Sculpy.Model.prototype.watch = function(target, event, callback)
{
	bean.add(target, event, callback);
};

Sculpy.Model.prototype.fire = function(event)
{
	bean.fire(this, event);
};

Sculpy.Model.prototype.root = function()
{
	return this.__proto__.urlroot;
};

Sculpy.Model.prototype.constructURL = function()
{
	if (this.id === undefined)
		return this.root();
	
	return this.root() + '/' + this.id;
}

Sculpy.Model.prototype.update = function(attr, silent)
{
	// Note: doesn't handle calculated properties.
	var self = this;
	var events = ['change'];
	for (k in attr)
	{
		if (attr.hasOwnProperty(k) && (self.__proto__.properties.indexOf(k) >= 0))
		{
			self.__proto__[k].call(self, attr[k], true);
			events.push('change:'+k);
		}
	}
	if (!silent)
	{
		vv.each(events, function(e)
		{
			self.fire(e);
		});
	}
};

Sculpy.Model.prototype.save = function()
{
	var self = this;
	var failure, success, proplist;

	if (arguments.length == 1)
		proplist = arguments["0"];
	else
		proplist = self.__proto__.properties;

	var props = {};
	for (var i=0, len=proplist.length; i<len; i++)
		props[proplist[i]] = self.attributes[proplist[i]];

	var method = (self.id === undefined) ? 'POST' : 'PUT';
	
	var winning = function(data, textStatus, jqXHR)
	{
		self.dirty = false;
		self.attributesPrev = {};
		self.update(data);
		if (data.id !== undefined)
			self.id = data.id;
	};
	
	var losing = function(jqXHR, textStatus, errorThrown)
	{
		// TODO
	};
	
	$.ajax(
	{
		url: self.constructURL(),
		type: method,
		data: props,
		success: winning,
		error: losing
	});
};

Sculpy.Model.prototype.destroy = function(success, failure)
{
	var self = this;
	var winning = function(data, textStatus, jqXHR)
	{
		self.fire('destroy');
	};
	
	var losing = function(jqXHR, textStatus, errorThrown)
	{
		// TODO
	};
	
	$.ajax(
	{
		url: this.constructURL(),
		type: 'DELETE',
		success: winning,
		error: losing
	});
};

Sculpy.Model.prototype.load = function(success, failure)
{
	if (this.id === undefined)
		throw('cannot load object without an id');

	var winning = function(data, textStatus, jqXHR)
	{
		self.update(data);
		self.fire('load');
	};
	
	var losing = function(jqXHR, textStatus, errorThrown)
	{
		// TODO
	};

	$.ajax(
	{
		url: this.constructURL(),
		type: 'GET',
		success: winning,
		error: losing
	});

	return this;
};

Sculpy.Collection = function(){};

