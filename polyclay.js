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
	sub.prototype.__defaults = {};

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
};

PolyClay.Model.addProperty = function(obj, name, defaultVal)
{
	obj.prototype.__properties.push(name);
	obj.prototype.__defaults[name] = defaultVal;
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
		if (arguments.length === 0)
		{
			if (this.attributes[propname] === undefined)
				return this.__defaults[propname];
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

PolyClay.Model.prototype.template = function()
{
	if (arguments.length === 1)
		this.__template = arguments["0"];
	else
		return this.__template;
};

PolyClay.Model.prototype.render = function(element, tmpl)
{
	if (tmpl === undefined)
		tmpl = this.template();
	if (tmpl === undefined)
		return;
	if (element === undefined)
		element = this.element();
	var rendered = beam[tmpl](this.toJSON());
	if (element !== undefined)
	{
		$(element).empty();
		$(element).append(rendered);
	}
	else
		return rendered;
};

PolyClay.Model.prototype.toJSON = function()
{
	return this.attributes;
};

PolyClay.Model.prototype.root = function()
{
	if (arguments.length === 1)
		this.__urlroot = arguments["0"];
	else
		return this.__urlroot;
};

PolyClay.Model.prototype.constructURL = function()
{
	if (this.id === undefined)
		return this.root();

	return this.root() + '/' + this.id;
};

PolyClay.Model.prototype.update = function(attr, silent)
{
	// Note: doesn't handle calculated properties.
	var self = this;
	var events = ['change'];
	for (var k in attr)
	{
		if (attr.hasOwnProperty(k) && (self.__properties.indexOf(k) >= 0))
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
		dataType: 'json',
		data: props,
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
		type: 'DELETE',
		dataType: 'json',
		success: winning,
		error: losing
	});
};

PolyClay.Model.prototype.load = function(success, failure)
{
	if (this.id === undefined)
		throw('cannot load object without an id');
	var self = this;

	var winning = function(data, textStatus, jqXHR)
	{
		self.update(data);
		self.fire('load');
	};

	var losing = function(jqXHR, textStatus, errorThrown)
	{
		// TODO
	};
	
	$.getJSON(this.constructURL() + '.json', function(data, textStatus, jqXHR)
	{
		self.update(data);
		self.fire('load');
	});
};

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
	this.__items = [];
};

PolyClay.Collection.prototype.push = function(item, silent)
{
	this.__items.push(item);
	if (!silent) this.fire('add');
};

PolyClay.Collection.prototype.unshift = function(item, silent)
{
	this.__items.unshift(item);
	if (!silent) this.fire('add');
};

PolyClay.Collection.prototype.reset = function(data, silent)
{
	var item;
	this.__items.length = 0;
	for (var i=0,len=data.length; i<len; i++)
	{
		item = new this.__model();
		item.update(data[i]);
		this.__items.push(item);
	}
	if (!silent) this.fire('reset');
};

PolyClay.Collection.prototype.remove = function(item, silent)
{
	var idx = this.__items.indexOf(item);
	this.__items.splice(idx, 1);
	if (!silent) this.fire('remove');
};

PolyClay.Collection.prototype.insert = function(item, index, silent)
{
	this.__items.splice(index, 0, item);
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
		type: 'GET',
		success: winning,
		error: losing
	});
};

PolyClay.Collection.prototype.render = function()
{
	var into = this.element();
	if (into === undefined) return;
	$(into).empty();
	for (var i=0, len=this.__items.length; i<len; i++)
	{
		$(into).append(this.__items[i].render());
	}
};

// methods both prototypes have in common
PolyClay.Common = function(){};

PolyClay.Common.prototype.watch = function(event, callback)
{
	bean.add(this, event, callback);
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

