// General storage interface.
// Can turn any polyclay model into a persistable model.

var
	_ = require('lodash'),
	assert = require('assert'),
	P = require('p-promise'),
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

		Object.defineProperty(modelfunc.prototype, 'key',
		{
			get: function getKey()
			{
				return this[this.keyfield];
			},
			set: function setKey(v)
			{
				this[this.keyfield] = v;
			},
			enumerable: true
		});
	}
	else
		keyfield = 'key';

	modelfunc.prototype.keyfield = keyfield;

	_.assign(modelfunc, persist.statics);
	_.assign(modelfunc.prototype, persist.plugins);
}

// methods on the model class

persist.statics =
{
	defineAttachment: function(name, mimetype)
	{
		this.prototype.__types[name] = mimetype;

		this.prototype['fetch_' + name] = function()
		{
			var self = this;
			var deferred = P.defer();

			var attachments = this.__attachments;
			var attach = attachments[name];

			if (attach && attach.body)
			{
				deferred.resolve(attach.body);
				return deferred.promise;
			}

			self.constructor.adapter.attachment(self.key, name, function(err, payload)
			{
				if (err) return deferred.reject(err);

				var isString = self.constructor.prototype.propertyType(name).lastIndexOf('text', 0) === 0;
				var body = isString ? (Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload || '')) : payload;

				var attach = self.setAttachment(name, body);
				attach.__dirty = false;

				deferred.resolve(body);
			});

			return deferred.promise;
		};

		this.prototype['set_' + name] = function(data)
		{
			var attach = this.setAttachment(name, data);
			this.trigger('change.' + name);
		};

		Object.defineProperty(this.prototype, name,
		{
			get: function getAttachment()
			{
				var attach = this.__attachments[name];
				return attach ? attach.body : '';
			},
			set: this.prototype['set_' + name]
		});
	},

	setStorage: function setStorage(options, Adapter)
	{
		this.adapter = new Adapter();
		this.adapter.configure(options, this);
	},

	get: function get(key)
	{
		var deferred = P.defer();

		if (!key)
		{
			deferred.resolve(null);
			return deferred.promise;
		}

		this.adapter.get(key, function(err, model)
		{
			if (err) deferred.reject(err);
			deferred.resolve(model);
		});

		return deferred.promise;
	},

	getBatch: function getBatch(keys)
	{
		var deferred = P.defer();

		if (!keys || !keys.length)
		{
			deferred.resolve(null);
			return deferred.promise;
		}

		this.adapter.getBatch(keys, function(err, results)
		{
			if (err) return deferred.reject(err);
			deferred.resolve(results);
		});

		return deferred.promise;
	},

	all: function all()
	{
		var self = this;
		var deferred = P.defer();

		this.adapter.all(function(err, ids, models)
		{
			if (err) return deferred.reject(err);
			if (models) return deferred.resolve(models);
			self.getBatch(ids).then(deferred.resolve, deferred.reject);
		});

		return deferred.promise;
	},

	provision: function provision()
	{
		var deferred = P.defer();

		this.adapter.provision(function(err, result)
		{
			if (err) return deferred.reject(err);
			deferred.resolve(result);
		});

		return deferred.promise;
	},

	constructMany: function constructMany(documents)
	{
		var self = this;
		var deferred = P.defer();

		if (!documents || !documents.length)
		{
			deferred.resolve(null);
			return deferred.promise;
		}

		var results = _.map(documents, function(doc)
		{
			return self.adapter.inflate(doc);
		});
		deferred.resolve(results);

		return deferred.promise;
	},

	destroyMany: function destroyMany(objects)
	{
		var deferred = P.defer();

		if (!objects || !objects.length)
		{
			deferred.resolve(null);
			return deferred.promise;
		}

		this.adapter.destroyMany(objects, function(err, result)
		{
			if (err) return deferred.reject(err);
			deferred.resolve(result);
		});

		return deferred.promise;
	}
};

// methods on model objects

persist.plugins =
{
	_serializeAttachments: function _serializeAttachments()
	{
		var self = this;

		return _.transform(this.__attachments, function(result, attach, name)
		{
			if (!attach.__dirty)
				return;

			var body = attach.body;
			var payload = body == null ? '' : (Buffer.isBuffer(body) ? body : new Buffer(body)).toString('base64');

			result[name] = { stub: false, data: body, content_type: self.propertyType(name) };
		}, {});
	},

	setAttachment: function setAttachment(name, body)
	{
		var attachments = this.__attachments;
		var attach = attachments[name] || (attachments[name] = {});

		attach.body = body;
		attach.length = putil.dataLength(body);
		attach.stub = false;
		attach.__dirty = true;
		attach.content_type = this.propertyType(name);

		return attach;
	},

	save: function save()
	{
		var self = this;
		var deferred = P.defer();

		var isNew = this.__new;
		this.trigger('before-save');

		var serialized = this.serialize();
		serialized._attachments = self._serializeAttachments();

		if (!isNew && !self.isDirty() && !serialized._attachments)
		{
			deferred.resolve('OK');
			return deferred.promise;
		}

		var handleSave = function handleSave(err, response)
		{
			if (err) return deferred.reject(err);

			self.clearDirty();
			self.__new = false;

			self.trigger('after-save');
			deferred.resolve(response);
		};

		var adapter = this.constructor.adapter;
		if (isNew)
			adapter.save(this, serialized, handleSave);
		else
			adapter.update(this, serialized, handleSave);

		return deferred.promise;
	},

	destroy: function destroy()
	{
		var self = this;
		var deferred = P.defer();

		if (!self.key)
		{
			deferred.reject(new Error('cannot destroy object without an id'));
			return deferred.promise;
		}

		if (self.destroyed)
		{
			deferred.reject(new Error('object already destroyed'));
			return deferred.promise;
		}

		this.trigger('before-destroy');
		this.constructor.adapter.remove(this, function(err, response)
		{
			if (err) return deferred.reject(err);
			self.destroyed = true;
			self.trigger('after-destroy');
			deferred.resolve(true);
		});

		return deferred.promise;
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

	saveAttachment: function saveAttachment(name)
	{
		var self = this;
		var deferred = P.defer();

		var attach = _.clone(this.__attachments[name]);
		delete attach.__dirty;
		delete attach.data;
		delete attach.stub;
		attach.name = name;

		this.constructor.adapter.saveAttachment(this, attach, function(err, response)
		{
			if (err) return deferred.reject(err);
			self.__attachments[name].__dirty = false;
			deferred.resolve(response);
		});

		return deferred.promise;
	},

	removeAttachment: function removeAttachment(name)
	{
		var self = this;
		var deferred = P.defer();

		var attachments = this.__attachments;
		var attach = attachments[name];
		delete attachments[name];

		this.constructor.adapter.removeAttachment(this, name, function(err, response)
		{
			if (err)
			{
				attachments[name] = attach;
				return deferred.reject(err);
			}

			self.trigger('change.' + name);
			deferred.resolve(true);
		});

		return deferred.promise;
	},

	merge: function merge(properties)
	{
		var self = this;
		var deferred = P.defer();

		self.update(properties);

		this.constructor.adapter.merge(this.key, properties, function(err, response)
		{
			if (err)
			{
				self.rollback();
				return deferred.reject(err);
			}

			self.clearDirty();
			deferred.resolve(response);
		});

		return deferred.promise;
	},

	isDirty: function isDirty()
	{
		var result = false;
		result |= this.__dirty;
		if (this.__attachments && !result)
		{
			_.forOwn(this.__attachments, function(value, key)
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
			_.forOwn(this.__attachments, function(value, key)
			{
				value.__dirty = false;
			});
		}
	}
};

exports.persist = persist;
