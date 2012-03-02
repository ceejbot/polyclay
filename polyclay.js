var hasJquery = (window.jQuery !== undefined);
var vv = require('valentine');
var bean = require('bean');
var ender = hasJquery ? $.noConflict() : $;

var PolyClay = function(){};

PolyClay.Model = function()
{
};

PolyClay.Model.extend = function(options, methods)
{
	var sub = function()
	{
		this.construct();
		if (this.initialize !== undefined)
			this.initialize.apply(this, arguments);
	};

	sub.prototype = new PolyClay.Model();
	sub.prototype.constructor = sub;
	sub.prototype.__urlroot = options.urlroot;
	sub.prototype.__template = options.template;
	sub.prototype.__properties = [];
	sub.prototype.__calculated = [];
	sub.prototype.__types = {};
	sub.prototype.__collections = {};

	var props = options.properties;
	vv.each(props, function(k)
	{
		PolyClay.Model.addProperty(sub, k, props[k]);
	});
	props = options.calculated;
	vv.each(props, function(k)
	{
		PolyClay.Model.addCalculatedProperty(sub, k);
	});
	props = options.collections;
	vv.each(props, function(k)
	{
		PolyClay.Model.addCollection(sub, k, props[k]);
	});

	vv.each(PolyClay.Common.prototype, function(k)
	{
		sub.prototype[k] = PolyClay.Common.prototype[k];
	});

	vv.each(methods, function(k)
	{
		sub.prototype[k] = methods[k];
	});

	return sub;
};

PolyClay.Model.prototype.construct = function()
{
	this.id = undefined;
	this.attributes = {};
	this.attributesPrev = {};
	this.isNew =  true;
	this.dirty = false;
	
	var self = this;
	vv.each(this.__collections, function(k)
	{
		self[k] = new self.__collections[k]();
	});
};

PolyClay.validTypes = ['string', 'array', 'number', 'boolean', 'date', 'hash'];
PolyClay.validate = {
	'string': vv.is.str,
	'array': vv.is.arr, 
	'number': vv.is.num, 
	'boolean': vv.is.bool, 
	'date': vv.is.dat, 
	'object': vv.is.obj
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
		case 'object': return {};
	}
	return undefined;
};

PolyClay.Model.prototype.valid = function()
{
	var valid = true;
	var props = this.prototype.__properties ;
	var types = this.prototype.__types;
	this.errors = {};
	for (var i=0, len=props.length; i<len; i++)
	{
		var p = props[i];
		if (!PolyClay.validate[types[p]](this.attributes[p]))
		{
			this.errors[p] = true;
			valid = false;
		}
	}
	return valid;
};

PolyClay.Model.addProperty = function(obj, name, type)
{
	if (PolyClay.validTypes.indexOf(type) < 0)
		throw('type '+type+' invalid; see documentation for types');

	obj.prototype.__properties.push(name);
	obj.prototype.__types[name] = type;
	PolyClay.Model.makeGetterSetter(obj, name);
};

PolyClay.Model.addCalculatedProperty = function(obj, name)
{
	obj.prototype.__calculated.push(name);
	PolyClay.Model.makeGetterSetter(obj, name);
};

// prop() is getter
// prop(newval) is setter
PolyClay.Model.makeGetterSetter = function(obj, propname)
{
	var result = function()
	{
		// getter
		if (arguments.length === 0)
		{
			if (this.attributes[propname] === undefined)
				return PolyClay.defaults(obj.prototype.__types[propname]);
			else
				return this.attributes[propname];
		}
		// setter
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

PolyClay.Model.addCollection = function(obj, name, constructor)
{
	obj.prototype.__collections[name] = constructor;
};

PolyClay.Model.prototype.template = function()
{
	if (arguments.length === 1)
		this.__template = arguments["0"];
	else
		return this.__template;
};

PolyClay.Model.prototype.render = function(element, tmpl, append)
{
	var self = this;
	var template = tmpl ? tmpl : this.template();
	var destination = element ? element : this.element();
	if (!template || !destination)
		return;
	
	beam.render(template, this.toJSON(), function(rendered)
	{
		if (!append) $(destination).empty();
		$(destination).append(rendered);
		self.fire('render');
	});
};

PolyClay.Model.prototype.renderToString = function(tmpl)
{
	var template = tmpl ? tmpl : this.template();
	if (!template) return '';
	return beam[template](this.toJSON());
};

PolyClay.Model.prototype.toJSON = function()
{
	return this.attributes;
};

PolyClay.Model.prototype.urlroot = function()
{
	if (arguments.length === 1)
		this.__urlroot = arguments["0"];
	else
		return this.__urlroot;
};

PolyClay.Model.prototype.constructURL = function()
{
	if (this.id === undefined)
		return this.urlroot();

	return this.urlroot() + '/' + this.id;
};

PolyClay.Model.prototype.update = function(attr, silent)
{
	// Note: doesn't handle calculated properties. Special handling for id is hacky.
	var self = this;
	var events = ['change'];
	for (var k in attr)
	{
		if (k === 'id')
			self.id = attr[k];
		else if (attr.hasOwnProperty(k) && (self[k] !== undefined))
		{
			self[k].call(self, attr[k], true);
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

PolyClay.Model.prototype.save = function()
{
	var self = this;
	var failure, success, proplist;

	if (arguments.length === 1)
		proplist = arguments["0"];
	else
		proplist = self.__properties;

	var props = {};
	for (var i=0, len=proplist.length; i<len; i++)
		props[proplist[i]] = self.attributes[proplist[i]];

	var method = (self.id === undefined) ? 'POST' : 'PUT';

	var winning = function(req)
	{
		self.dirty = false;
		self.attributesPrev = {};
		self.update(req);
		self.fire('save');
	};

	var losing = function(jqXHR, textStatus, errorThrown)
	{
		// TODO
	};

	$.ajax(
	{
		url: self.constructURL(),
		method: method,
		type: 'json',
		data: JSON.stringify(props),
		success: winning,
		error: losing
	});
};

PolyClay.Model.prototype.destroy = function(success, failure)
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
		method: 'DELETE',
		type: 'json',
		success: winning,
		error: losing
	});
};

PolyClay.Model.prototype.load = function(success, failure)
{
	if (this.id === undefined)
		throw('cannot load object without an id');
	var self = this;
	$.ajax(
	{
		url: this.constructURL() + '.json',
		type: 'json',
		success: function(req)
		{
			self.update(req);
			self.fire('load');
		}
	});
};

//----------- Collection

PolyClay.Collection = function(){};

PolyClay.Collection.extend = function(options, methods)
{
	var sub = function()
	{
		this.construct();
		if (this.initialize !== undefined)
			this.initialize.apply(this, arguments);
	};

	sub.prototype = new PolyClay.Collection();
	sub.prototype.constructor = sub;
	sub.prototype.__urlroot = options.urlroot;
	sub.prototype.__model = options.model;

	vv.each(PolyClay.Common.prototype, function(k)
	{
		sub.prototype[k] = PolyClay.Common.prototype[k];
	});
	vv.each(methods, function(k)
	{
		sub.prototype[k] = methods[k];
	});

	return sub;
};

PolyClay.Collection.prototype.construct = function()
{
	this.items = [];
};

PolyClay.Collection.prototype.push = function(item, silent)
{
	this.items.push(item);
	if (!silent) this.fire('add');
};

PolyClay.Collection.prototype.unshift = function(item, silent)
{
	this.items.unshift(item);
	if (!silent) this.fire('add');
};

PolyClay.Collection.prototype.reset = function(data, silent)
{
	var item;
	this.items.length = 0;
	for (var i=0,len=data.length; i<len; i++)
	{
		item = new this.__model();
		item.update(data[i]);
		this.items.push(item);
	}
	if (!silent) this.fire('reset');
};

PolyClay.Collection.prototype.remove = function(item, silent)
{
	var idx = this.items.indexOf(item);
	this.items.splice(idx, 1);
	if (!silent) this.fire('remove');
};

PolyClay.Collection.prototype.insert = function(item, index, silent)
{
	this.items.splice(index, 0, item);
	if (!silent) this.fire('add');
};

PolyClay.Collection.prototype.url = function()
{
	if (arguments.length === 1)
		this.__url = arguments["0"];
	else
		return this.__url;
};

PolyClay.Collection.prototype.fetch = function(success, failure)
{
	var url = this.url();
	if (url === undefined)
		return;
	var self = this;

	var winning = function(data, textStatus, jqXHR)
	{
		self.reset(data);
	};
	var losing = function(jqXHR, textStatus, errorThrown)
	{
		// TODO
	};
	$.ajax(
	{
		url: this.url(),
		method: 'GET',
		type: 'json',
		success: winning,
		error: losing
	});
};

PolyClay.Collection.prototype.render = function()
{
	var into = this.element();
	if (into === undefined) return;
	var el = $(into);
	el.empty();
	for (var i=0, len=this.items.length; i<len; i++)
	{
		this.items[i].render(into, this.items[i].template(), true);
	}
};

//-----------  methods both prototypes have in common

PolyClay.Common = function(){};

PolyClay.Common.prototype.watch = function(event, callback)
{
	bean.add(this, event, callback);
};
PolyClay.Common.prototype.unwatch = function(event)
{
	bean.remove(this, event);
};
PolyClay.Common.prototype.fire = function(event)
{
	bean.fire(this, event);
};
PolyClay.Common.prototype.element = function()
{
	if (arguments.length === 1)
		this.__element = arguments['0'];
	else
		return this.__element;
};
PolyClay.Common.prototype.$ = function(child)
{
	if (child)
		return $(this.element() + ' '+ child);
	else
		return $(this.element());
};
