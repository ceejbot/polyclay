// General storage interface.
// Can turn any polyclay model into a persistable model.

var
	_ = require('lodash'),
	assert = require('assert'),
	path = require('path'),
	querystring = require('querystring'),
	util = require('util'),
	putil = require('./util')
	;

//-----------------------------------------------------------------

function persist(modelfunc, keyfield)
{
	/*jshint newcap:false */
	assert(typeof modelfunc === 'function');

	if (!modelfunc.prototype.__properties && !modelfunc.prototype.serialize)
		throw(new Error('persist only accepts polyclay models'));

	// We must supply either a keyfield parameter or already have a 'key' property.
	var keyprop = Object.getOwnPropertyDescriptor(modelfunc.prototype, 'key');
	if (!keyprop)
	{
		if (!keyfield)
			keyfield = '_id';

		modelfunc.prototype.__defineGetter__('key', function()
		{
			return this[keyfield];
		});
		modelfunc.prototype.__defineSetter__('key', function(v)
		{
			this[keyfield] = v;
		});
	}

	_.assign(modelfunc, persist.statics);
	_.assign(modelfunc.prototype, persist.plugins);
}

// methods on the model class

persist.statics =
{
	defineAttachment: function(name, mimetype)
	{
		this.prototype.__types[name] = mimetype;

		this.prototype['fetch_' + name] = function(callback)
		{
			var self = this;
			if (self.__attachments[name] && self.__attachments[name].body)
				return callback(null, self.__attachments[name].body);
			if (!self.__attachments[name])
				self.__attachments[name] = {};
			self.constructor.adapter.attachment(self.key, name, function(err, body)
			{
				if (err) return callback(err);
				if (self.constructor.prototype.__types[name].indexOf('text') === 0)
					body = body ? body.toString('utf8') : '';
				self.__attachments[name].body = body;
				callback(null, body);
			});
		};

		this.prototype['set_' + name] = function(data)
		{
			if (!this.__attachments[name])
				this.__attachments[name] = {};

			this.__attachments[name].body = data;
			this.__attachments[name].length = putil.dataLength(data);
			this.__attachments[name].stub = false;
			this.__attachments[name].__dirty = true;
			this.__attachments[name].content_type = this.__types[name];
			this.trigger('change.' + name);
		};
		this.prototype.__defineSetter__(name, this.prototype['set_' + name]);

		this.prototype.__defineGetter__(name, function()
		{
			return this.__attachments[name] ? this.__attachments[name].body : '';
		});
	},

	setStorage: function setStorage(options, Adapter)
	{
		this.adapter = new Adapter();
		this.adapter.configure(options, this);
	},

	get: function get(key, callback)
	{
		if (!key || !key.length)
			return callback(null, []);

		if (Array.isArray(key))
			return this.getBatch(key, callback);

		this.adapter.get(key, function(err, object)
		{
			callback(err, object);
		});
	},

	getBatch: function getBatch(keys, callback)
	{
		var object, results = [];
		this.adapter.getBatch(keys, function(err, results)
		{
			callback(err, results);
		});
	},

	all: function all(callback)
	{
		var self = this;

		var results = [], ids = [];
		this.adapter.all(function (err, ids, fullObjects)
		{
			if (err) return callback(err);
			if (fullObjects) return callback(null, ids);
			self.getBatch(ids, callback);
		});
	},

	provision: function provision(callback)
	{
		this.adapter.provision(callback);
	},

	constructMany: function constructMany(documents, callback)
	{
		var self = this;

		if (!documents || documents.length === 0)
			return callback(null, []);

		var results = _.map(documents, function(doc)
		{
			return self.adapter.inflate(doc);
		});
		callback(null, results);
	},

	destroyMany: function destroyMany(objects, callback)
	{
		if (!objects || !Array.isArray(objects))
			return callback(null);

		this.adapter.destroyMany(objects, callback);
	}
};

// methods on model objects

persist.plugins =
{
	_serializeAttachments: function _serializeAttachments()
	{
		var result = _.clone(this.__attachments);
		var body, name;
		var keys = Object.keys(this.__attachments);

		for (var i = 0; i < keys.length; i++)
		{
			name = keys[i];

			if (this.__attachments[name].__dirty)
			{
				if (this.__attachments[name].body === null)
					body = '';
				else if (this.__attachments[name].body instanceof Buffer)
					body = this.__attachments[name].body.toString('base64');
				else
					body = new Buffer(this.__attachments[name].body).toString('base64');

				result[name].stub = false;
				result[name].data = body;
				result[name].content_type = this.__types[name];
			}
		}

		return result;
	},

	save: function save(callback)
	{
		var self = this;

		self.trigger('before-save');
		var serialized = self.serialize();
		serialized._attachments = self._serializeAttachments();

		if (self.__new)
		{
			this.constructor.adapter.save(self, serialized, function(err, response)
			{
				if (err) return callback(err);
				self.clearDirty();
				self.__new = false;
				self.trigger('after-save');
				callback(null, response);
			});
		}
		else
		{
			if (!self.isDirty() && !serialized._attachments) return callback(null, 'OK');
			this.constructor.adapter.update(self, serialized, function(err, response)
			{
				if (err) return callback(err);
				self.clearDirty();
				self.trigger('after-save');
				callback(null, 'OK');
			});
		}
	},

	destroy: function destroy(callback)
	{
		var self = this;
		if (!self.key)
			return callback(new Error('cannot destroy object without an id'));
		if (self.destroyed)
			return callback(new Error('object already destroyed'));

		self.trigger('before-destroy');
		this.constructor.adapter.remove(self, function(err, response)
		{
			if (err) return callback(err, false);
			self.destroyed = true;
			self.trigger('after-destroy');
			callback(null, true);
		});
	},

	initFromStorage: function initFromStorage(struct)
	{
		if (struct._attachments)
		{
			this.handleAttachments(struct._attachments);
			delete struct._attachments;
		}

		this.update(struct);
		this.__new = false;
		this.destroyed = false;
		this.clearDirty();
	},

	handleAttachments: function handleAttachments(attachments)
	{
		var name, attach;
		if (!attachments || (typeof attachments !== 'object'))
			return;

		var names = Object.keys(attachments);
		for (var i = 0; i < names.length; i++)
		{
			name = names[i];
			attach = attachments[name];
			this.__attachments[name] = attach;
		}
	},

	saveAttachment: function saveAttachment(name, callback)
	{
		var self = this;
		var attach = _.clone(this.__attachments[name]);
		delete attach.__dirty;
		delete attach.data;
		delete attach.stub;
		attach.name = name;

		this.constructor.adapter.saveAttachment(self, attach, function(err, response)
		{
			if (err) return callback(err);
			self.__attachments[name].__dirty = false;
			callback(null, response);
		});
	},

	removeAttachment: function removeAttachment(name, callback)
	{
		var self = this;
		delete this.__attachments[name];

		this.constructor.adapter.removeAttachment(this, name, function(err, response)
		{
			self.trigger('change.' + name);
			callback(err, !err);
		});
	},

	merge: function merge(properties, callback)
	{
		var self = this;
		self.update(properties);
		this.constructor.adapter.merge(self.key, properties, function(err, response)
		{
			// TODO error handling
			self.clearDirty();
			callback(err, response);
		});
	},

	isDirty: function isDirty()
	{
		var result = false;
		result |= this.__dirty;
		if (this.__attachments)
		{
			_.each(this.__attachments, function(value, key)
			{
				result |= value.__dirty;
			});
		}

		return result === 1;
	},

	clearDirty: function clearDirty()
	{
		this.__dirty = false;
		this.__attributesPrev = {};
		if (this.__attachments)
		{
			_.each(this.__attachments, function(value, key)
			{
				value.__dirty = false;
			});
		}
	}
};

exports.persist = persist;
