// General storage interface.
// Can turn any polyclay model into a persistable model.

var
	_ = require('lodash'),
	assert = require('assert'),
	async = require('async'),
	path = require('path'),
	querystring = require('querystring'),
	util = require('util'),
	putil = require('./util')
	;

//-----------------------------------------------------------------

function persist(modelfunc, keyfield, adapter)
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

	modelfunc.name = "change me";

	// methods on the model class

	modelfunc.defineAttachment = function(name, mimetype)
	{
		modelfunc.prototype.__types[name] = mimetype;

		modelfunc.prototype['fetch_' + name] = function(callback)
		{
			var self = this;
			if (self.__attachments[name] && self.__attachments[name].body)
				return callback(null, self.__attachments[name].body);
			if (!self.__attachments[name])
				self.__attachments[name] = {};
			modelfunc.adapter.attachment(self.key, name, function(err, body)
			{
				if (err) return callback(err);
				if (modelfunc.prototype.__types[name].indexOf('text') === 0)
					body = body.toString('utf8');
				self.__attachments[name].body = body;
				callback(null, body);
			});
		};

		modelfunc.prototype['set_' + name] = function(data)
		{
			if (!this.__attachments[name])
				this.__attachments[name] = {};

			this.__attachments[name].body = data;
			this.__attachments[name].length = putil.dataLength(data);
			this.__attachments[name].stub = false;
			this.__attachments[name].__dirty = true;
			this.__attachments[name].content_type = this.__types[name];
		};
		modelfunc.prototype.__defineSetter__(name, modelfunc.prototype['set_' + name]);

		modelfunc.prototype.__defineGetter__(name, function()
		{
			return this.__attachments[name] ? this.__attachments[name].body : '';
		});
	};

	modelfunc.configure = function(options, Adapter)
	{
		modelfunc.adapter = new Adapter();
		modelfunc.adapter.configure(options);
	};

	modelfunc.get = function(key, callback)
	{
		if (Array.isArray(key))
			return modelfunc.getBatch(key, callback);

		modelfunc.adapter.get(key, modelfunc, function(err, object)
		{
			callback(err, object);
		});
	};

	modelfunc.getBatch = function(keys, callback)
	{
		var object, results = [];
		modelfunc.adapter.getBatch(keys, modelfunc, function(err, results)
		{
			callback(err, results);
		});
	};

	modelfunc.all = function(callback)
	{
		var results = [], ids = [];
		modelfunc.adapter.all(function (err, ids)
		{
			if (err) return callback(err);
			modelfunc.getBatch(ids, callback);
		});
	};

	modelfunc.provision = function(callback)
	{
		modelfunc.adapter.provision(modelfunc, callback);
	};

	modelfunc.constructMany = function(documents, callback)
	{
		if (!documents || documents.length === 0)
			return callback(null, []);

		var results = [];
		var struct, entry;
		for (var i = 0; i < documents.length; i++)
		{
			struct = documents[i];
			entry = new modelfunc();
			entry.key = struct.id;
			entry._rev = struct.value._rev;
			entry.initFromStorage(struct.value);
			results.push(entry);
		}

		callback(null, results);
	};

	modelfunc.destroyMany = function(objects, callback)
	{
		if (!objects || !Array.isArray(objects))
			return callback(null);

		modelfunc.adapter.destroyMany(objects, callback);
	};

	// methods on model objects

	modelfunc.prototype._idRevStruct = function()
	{
		return { id: this.key, rev: this._rev };
	};

	modelfunc.prototype._serializeAttachments = function()
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
	};

	modelfunc.prototype.save = function(callback)
	{
		var self = this;

		if (self.beforeSave)
			self.beforeSave();

		var serialized = self.serialize();
		serialized._attachments = self._serializeAttachments();

		if (self.__new)
		{
			modelfunc.adapter.save(self.key, serialized, function(err, response)
			{
				if (err) return callback(err);
				if (!self.key) self.key = response.id;
				if (response.rev) self._rev = response.rev;
				self.clearDirty();
				self.__new = false;

				if (self.afterSave)
					self.afterSave();

				callback(null, response);
			});
		}
		else
		{
			if (!self.__dirty && !serialized._attachments) return callback(null, 'OK');
			modelfunc.adapter.update(self.key, self._rev, serialized, function(err, response)
			{
				if (err) return callback(err);
				if (response.rev) self._rev = response.rev;
				self.clearDirty();
				if (self.afterSave)
					self.afterSave();

				callback(null, 'OK');
			});
		}
	};

	modelfunc.prototype.destroy = function(callback)
	{
		var self = this;
		if (!self.key)
			return callback(new Error('cannot destroy object without an id'));
		if (self.destroyed)
			return callback(new Error('object already destroyed'));

		if (self.beforeDestroy)
			self.beforeDestroy();

		modelfunc.adapter.remove(self.key, self._rev, function(err, response)
		{
			if (err) return callback(err, false);
			self.destroyed = true;
			callback(null, true);
		});
	};

	modelfunc.prototype.initFromStorage = function(struct)
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

		if (this.afterLoad)
			this.afterLoad();
	};

	modelfunc.prototype.handleAttachments = function(attachments)
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
	};

	modelfunc.prototype.saveAttachment = function(name, callback)
	{
		var self = this;
		var attach = _.clone(this.__attachments[name]);
		delete attach.__dirty;
		delete attach.data;
		delete attach.stub;
		attach.name = name;

		modelfunc.adapter.saveAttachment(this._idRevStruct(), attach, function(err, response)
		{
			if (err) return callback(err);
			self._rev = response.rev;
			self.__attachments[name].__dirty = false;
			callback(null, response);
		});
	};


	modelfunc.prototype.removeAttachment = function(name, callback)
	{
		var self = this;
		delete this.__attachments[name];

		modelfunc.adapter.removeAttachment(this._idRevStruct(), name, function(err, response)
		{
			if (err) return callback(err);
			self._rev = response.rev;
			callback(null, true);
		});
	};

	modelfunc.prototype.merge = function(properties, callback)
	{
		var self = this;
		self.update(properties);
		modelfunc.adapter.merge(self.key, properties, function(err, response)
		{
			// TODO error handling
			self.clearDirty();
			callback(err, response);
		});
	};

	modelfunc.prototype.isDirty = function()
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
	};

	modelfunc.prototype.clearDirty = function()
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
	};

}

exports.persist = persist;
