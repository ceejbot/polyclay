// CouchDB storage interface.
// Can turn any polyclay model into a persistable model.

var
	_ = require('lodash'),
	async = require('async'),
	cradle = require('cradle'),
	path = require('path'),
	querystring = require('querystring'),
	util = require('util')
	;

//-----------------------------------------------------------------

function dataLength(data)
{
	if (!data)
		return 0;
	if (data instanceof Buffer)
		return data.length;
	return Buffer.byteLength(data);
}

//-----------------------------------------------------------------

function persist(modelfunc)
{
	/*jshint newcap:false */

	if (!modelfunc.prototype.__properties && !modelfunc.prototype.serialize)
		throw(new Error('persist only accepts polyclay models'));

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
			modelfunc.adapter.attachment(self._id, name, function(err, body)
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
			this.__attachments[name].length = dataLength(data);
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

	modelfunc.configure = function(options, credentials)
	{
		modelfunc.adapter = new CouchAdapter();
		modelfunc.adapter.configure(options, credentials);
	};

	modelfunc.get = function(key, callback)
	{
		if (Array.isArray(key))
			return modelfunc.getBatch(key, callback);

		modelfunc.adapter.get(key, function(err, response)
		{
			if (err) return callback(err);
			var object = new modelfunc();
			object._id = response._id;
			object._rev = response._rev;
			object.initFromStorage(response);
			callback(err, object);
		});
	};

	modelfunc.getBatch = function(keys, callback)
	{
		var object, results = [];
		modelfunc.adapter.get(keys, function(err, jsondocs)
		{
			if (err) return callback(err);

			for (var i = 0; i < jsondocs.length; i++)
			{
				object = new modelfunc();
				object._rev = jsondocs[i].doc._rev;
				object.initFromStorage(jsondocs[i].doc);
				results.push(object);
			}
			callback(null, results);
		});
	};

	modelfunc.all = function(callback)
	{
		var results = [], ids = [];
		modelfunc.adapter.db.all(function (err, rows)
		{
			if (err) return callback(err);
			for (var i = 0; i < rows.length; i++)
			{
				if (rows[i].id.indexOf('_design/') === 0)
					continue;
				ids.push(rows[i].id);
			}
			modelfunc.getBatch(ids, callback);
		});
	};

	modelfunc.provision = function(callback)
	{
		var design = modelfunc.design;
		var designpath = path.join('_design', modelfunc.prototype.modelPlural);
		modelfunc.adapter.db.create(function(err, resp)
		{
			if (err || !design) return callback(err, resp);
			modelfunc.adapter.db.save(designpath, design, callback);
		});
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
			entry._id = struct.id;
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

		var makeRemoveFunc = function(id, rev)
		{
			return function(callback) { modelfunc.adapter.db.remove(id, rev, callback); };
		};

		var actionsList = [];
		for (var i = 0; i < objects.length; i++)
			actionsList.push(makeRemoveFunc(objects[i]._id, objects[i]._rev));

		async.parallel(actionsList, function(err, results)
		{
			if (err) console.log(err);
			callback(err, results);
		});
	};


	// methods on model objects

	modelfunc.prototype._idRevStruct = function()
	{
		return { id: this._id, rev: this._rev };
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
			modelfunc.adapter.save(serialized, function(err, response)
			{
				if (err) return callback(err);
				self._id = response.id;
				self._rev = response.rev;
				self.clearDirty();
				self.__new = false;

				if (self.afterSave)
					self.afterSave();

				callback(null, response);
			});
		}
		else
		{
			if (!self.__dirty && !serialized._attachments) return callback(null, {'okay': true});
			modelfunc.adapter.update(self._id, self._rev, serialized, function(err, response)
			{
				if (err) return callback(err);
				self._rev = response.rev;
				self.clearDirty();
				if (self.afterSave)
					self.afterSave();

				callback(null, response);
			});
		}
	};

	modelfunc.prototype.destroy = function(callback)
	{
		var self = this;
		if (!self._id)
			return callback(new Error('cannot destroy object without an id'));
		if (self.destroyed)
			return callback(new Error('object already destroyed'));

		if (self.beforeDestroy)
			self.beforeDestroy();

		modelfunc.adapter.remove(self._id, self._rev, function(err, response)
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
		var payload = JSON.stringify(this.__attachments[name]);

		modelfunc.adapter.saveAttachment(this._idRevStruct(), payload, function(err, response)
		{
			if (err) return callback(err);
			self._rev = response.rev;
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
		modelfunc.adapter.merge(self._id, properties, function(err, response)
		{
			// TODO error handling
			self.clearDirty();
			callback(err, response);
		});
	};
}

//-----------------------------------------------------------------

function CouchAdapter() { }

CouchAdapter.prototype.configure = function(connection, dbname)
{
	this.connection = connection;
	this.dbname = dbname;
	this.db = this.connection.database(this.dbname);
};


CouchAdapter.prototype.save = function(document, callback)
{
	var self = this;
	this.db.save(document, callback);
};

CouchAdapter.prototype.get = function(key, callback)
{
	this.db.get(key, callback);
};

CouchAdapter.prototype.merge = function(key, attributes, callback)
{
	this.db.merge(key, attributes, callback);
};

CouchAdapter.prototype.update = function(key, rev, document, callback)
{
	this.db.save(key, rev, document, function(err, response)
	{
		callback(err, response);
	});
};

CouchAdapter.prototype.remove = function(key, revision, callback)
{
	this.db.remove(key, revision, callback);
};

CouchAdapter.prototype.attachment = function(key, name, callback)
{
	this.db.getAttachment(key, name, function(err, response)
	{
		callback(err, response ? response.body : '');
	});
};

CouchAdapter.prototype.saveAttachment = function(item, attachment, callback)
{
	this.db.saveAttachment(item, attachment, callback);
};

CouchAdapter.prototype.removeAttachment = function(item, attachmentName, callback)
{
	this.db.removeAttachment(item, attachmentName, callback);
};

//-----------------------------------------------------------------

exports.persist = persist;
exports.dataLength = dataLength;
