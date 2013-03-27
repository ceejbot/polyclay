// Levelup storage interface.
// Objects are stored as hashes.

var
	_ = require('lodash'),
	assert = require('assert'),
	fs = require('fs'),
	levelup = require('levelup'),
	path = require('path')
	;

//-----------------------------------------------------------------

function LevelupAdapter() { }

LevelupAdapter.prototype.configure = function(opts, modelfunc)
{
	assert(opts.dbpath);
	assert(typeof modelfunc === 'function');
	if (!fs.existsSync(opts.dbpath))
		throw(new Error(opts.dbpath + ' does not exist'));

	this.db = levelup(opts.dbpath, {encoding: 'json'});

	this.attachdb = levelup(path.join(opts.dbpath, 'attachments'), {encoding: 'binary'});

	this.dbname = opts.dbname || modelfunc.prototype.plural;
	this.constructor = modelfunc;
	this.keyspace = this.dbname + ':';
};

LevelupAdapter.prototype.attachmentKey = function(key, name)
{
	return this.namespaceKey(key) + ':' + name;
};

LevelupAdapter.prototype.namespaceKey = function(key)
{
	if (key.indexOf(this.keyspace) === 0)
		return key;
	return this.keyspace + key;
}

LevelupAdapter.prototype.provision = function(callback)
{
	// Nothing to do?
	callback(null);
};

LevelupAdapter.prototype.shutdown = function(callback)
{
	var self = this;
	self.db.close(function(err)
	{
		self.attachdb.close(callback);
	});
};

LevelupAdapter.prototype.all = function(callback)
{
	var keys = [];
	var opts =
	{
		start: this.dbname + ':',
		end: this.dbname + ';'
	};
	this.db.createKeyStream().on('data', function (data)
	{
		keys.push(data);
	}).on('end', function()
	{
		callback(null, keys);
	}).on('err', function(err)
	{
		callback(err);
	});
};

LevelupAdapter.prototype.save = function(object, json, callback)
{
	if (!object.key || !object.key.length)
		throw(new Error('cannot save a document without a key'));

	var self = this;

	var payload = LevelupAdapter.flatten(json);
	var basekey = this.namespaceKey(object.key);
	var ops = [];

	for (var i = 0; i < payload.attachments.length; i++)
	{
		var k = basekey + payload.attachments[i].keyfrag;
		var body = payload.attachments[i].body;
		if (!body || !body.length)
			ops.push({ type: 'del', key: k });
		else
			ops.push({ type: 'put', key: k, value: body });
	};

	this.db.put(basekey, payload.body, function(err, response)
	{
		if (err) return callback(err);
		if (ops.length === 0)
			return callback(null, 'OK');

		self.attachdb.batch(ops, function(err)
		{
			callback(err, err ? null : 'OK');
		});
	});
};
LevelupAdapter.prototype.update = LevelupAdapter.prototype.save;

LevelupAdapter.prototype.get = function(key, callback)
{
	var self = this;
	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.db.get(this.namespaceKey(key), function(err, payload)
	{
		if (err) return callback(err);
		var object = self.inflate(payload);
		callback(null, object);
	});
};

LevelupAdapter.prototype.getBatch = function(keylist, callback)
{
	var self = this;
	var result = [];
	var ptr = 0;

	function continuer(err, payload)
	{
		if (err) return callback(err);

		result.push(self.inflate(payload));

		ptr++;
		if (ptr >= keylist.length)
			return callback(null, result);

		self.db.get(self.namespaceKey(keylist[ptr]), continuer);
	}

	self.db.get(self.namespaceKey(keylist[ptr]), continuer);
};

LevelupAdapter.prototype.merge = function(key, attributes, callback)
{
	var self = this;
	var id = this.namespaceKey(key);
	self.db.get(id, function(err, payload)
	{
		if (err) return callback(err);
		_.assign(payload, attributes);
		self.db.put(id, payload, callback);
	});
};

LevelupAdapter.prototype.remove = function(object, callback)
{
	// TODO remove attachments

	this.db.del(this.namespaceKey(object.key), callback);
};

LevelupAdapter.prototype.destroyMany = function(objects, callback)
{
	// TODO remove attachments

	var self = this;
	var ops = _.map(objects, function(obj)
	{
		if (typeof obj === 'string')
			return { type: 'del', key: self.namespaceKey(obj) };
		return { type: 'del', key: self.namespaceKey(obj.key) };
	});

	this.db.batch(ops, callback);
};

LevelupAdapter.prototype.attachment = function(key, name, callback)
{
	var attachkey = this.attachmentKey(key, name);
	this.attachdb.get(attachkey, function(err, payload)
	{
		if (err && err.name === 'NotFoundError')
			return callback(null, null);
		callback(err, payload);
	});
};

LevelupAdapter.prototype.saveAttachment = function(object, attachment, callback)
{
	var attachkey = this.attachmentKey(object.key, attachment.name);
	this.attachdb.put(attachkey, attachment.body, callback);
};

LevelupAdapter.prototype.removeAttachment = function(object, name, callback)
{
	var attachkey = this.attachmentKey(object.key, name);
	this.attachdb.del(attachkey, callback);
};

LevelupAdapter.prototype.inflate = function(payload)
{
	if (payload === null)
		return;
	var object = new this.constructor();
	object.initFromStorage(payload);
	return object;
};

LevelupAdapter.flatten = function(json)
{
	var payload = {};
	payload.attachments = [];

	if (json._attachments)
	{
		var attaches = Object.keys(json._attachments);
		for (var i = 0; i < attaches.length; i++)
		{
			var attachment = json._attachments[attaches[i]];
			payload.attachments.push({
				keyfrag: ':' + attaches[i],
				body: attachment.body
			});
		}
		delete json._attachments;
	}

	payload.body = _.clone(json);

	return payload;
};

//-----------------------------------------------------------------

module.exports = LevelupAdapter;
