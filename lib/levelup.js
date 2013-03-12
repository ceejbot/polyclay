// Levelup storage interface.
// Objects are stored as hashes.

var
	_ = require('lodash'),
	assert = require('assert'),
	levelup = require('levelup')
	;

//-----------------------------------------------------------------

function LevelupAdapter() { }

LevelupAdapter.prototype.configure = function(opts, modelfunc)
{
	assert(opts.dbpath);
	assert(opts.dbname);
	assert(typeof modelfunc === 'function');
	opts.encoding = 'json';
	this.db = levelup(opts.dbpath, opts);
	this.dbname = opts.dbname;
	this.constructor = modelfunc;
};

LevelupAdapter.prototype.provision = function(callback)
{
	// Nothing to do?
	callback(null);
};

LevelupAdapter.prototype.shutdown = function(callback)
{
	this.db.close(callback);
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

	var payload = LevelupAdapter.flatten(json);
	var ops = [];
	ops.push({ type: 'put', key: object.key, value: payload.body });
	Object.keys(payload.attachments).forEach(function(key)
	{
		var k = object.key + key;
		ops.push({ type: 'put', key: k, value: payload.attachments[key] });
	});

	this.db.batch(ops, function(err, response)
	{
		callback(err, 'OK');
	});
};
LevelupAdapter.prototype.update = LevelupAdapter.prototype.save;

LevelupAdapter.prototype.get = function(key, callback)
{
	var self = this;
	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.db.get(key, function(err, payload)
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

		self.db.get(keylist[ptr], continuer);
	}

	self.db.get(keylist[ptr], continuer);
};

LevelupAdapter.prototype.merge = function(key, attributes, callback)
{
	var self = this;
	self.db.get(key, function(err, payload)
	{
		if (err) return callback(err);
		_.assign(payload, attributes);
		self.db.put(key, payload, callback);
	});
};

LevelupAdapter.prototype.remove = function(object, callback)
{
	this.db.del(object.key, callback);
};

LevelupAdapter.prototype.destroyMany = function(objects, callback)
{
	var self = this;
	var ops = _.map(objects, function(obj)
	{
		if (typeof obj === 'string')
			return { type: 'del', key: obj };
		return { type: 'del', key: obj.key };
	});

	this.db.batch(ops, callback);
};

LevelupAdapter.prototype.attachment = function(key, name, callback)
{
	var attachkey = key + ':attach:' + name;
	this.db.get(attachkey, {encoding: 'binary'}, function(err, payload)
	{
		if (err && err.name === 'NotFoundError')
			return callback(null, null);
		callback(err, payload);
	});
};

LevelupAdapter.prototype.saveAttachment = function(object, attachment, callback)
{
	var attachkey = object.key + ':attach:' + attachment.name;
	this.db.put(attachkey, attachment.body, {encoding: 'binary'}, callback);
};

LevelupAdapter.prototype.removeAttachment = function(object, name, callback)
{
	var attachkey = object.key + ':attach:' + name;
	this.db.del(attachkey, callback);
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
	payload.attachments = {};

	if (json._attachments)
	{
		var attaches = Object.keys(json._attachments);
		for (var i = 0; i < attaches.length; i++)
		{
			var attachment = json._attachments[attaches[i]];
			payload.attachments[':attach:' + attaches[i]] = attachment.body;
		}
		delete json._attachments;
	}

	payload.body = json;

	return payload;
};

//-----------------------------------------------------------------

module.exports = LevelupAdapter;
