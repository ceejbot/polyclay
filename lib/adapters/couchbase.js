// Levelup storage interface.
// Objects are stored as hashes.

var
	_ = require('lodash'),
	assert = require('assert'),
	couchbase = require('couchbase'),
	events = require('events'),
	fs = require('fs'),
	path = require('path'),
	util = require('util')
	;

//-----------------------------------------------------------------

function CouchbaseAdapter() { }

CouchbaseAdapter.prototype.configure = function(opts, modelfunc)
{
	assert(opts.user);
	assert(opts.password);
	assert(opts.hosts);
	assert(Array.isArray(opts.hosts));
	assert(opts.bucket);
	assert(typeof modelfunc === 'function');

	events.EventEmitter.call(this);

	this.constructor = modelfunc;

	couchbase.connect(opts, function(err, bucket)
	{
		if (err)
			throw(err);

		this.bucket = bucket;
		this.emit('ready');
	}.bind(this));
};
util.inherits(CouchbaseAdapter, events.EventEmitter);

CouchbaseAdapter.prototype.attachmentKey = function(key, name)
{
	return key + ':attach:' + name;
};

CouchbaseAdapter.prototype.provision = function(callback)
{
	// Nothing to do?
	callback(null);
};

CouchbaseAdapter.prototype.shutdown = function(callback)
{
	this.bucket.close(callback);
};

CouchbaseAdapter.prototype.all = function(callback)
{
	var keys = [];
	var opts =
	{
		start: this.dbname + ':',
		end: this.dbname + ';'
	};
	this.bucket.createKeyStream().on('data', function (data)
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

CouchbaseAdapter.prototype.save = function(object, json, callback)
{
	if (!object.key || !object.key.length)
		throw(new Error('cannot save a document without a key'));

	var self = this;

	var payload = CouchbaseAdapter.flatten(json);
	var basekey = object.key;
	var ops = [];

	for (var i = 0; i < payload.attachments.length; i++)
	{
		var k = basekey + payload.attachments[i].keyfrag;
		var body = payload.attachments[i].body;
		if (!body || !body.length)
			ops.push({ type: 'del', key: k });
		else
			ops.push({ type: 'put', key: k, value: body });
	}

	this.bucket.set(basekey, payload.body, function(err, response)
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
CouchbaseAdapter.prototype.update = CouchbaseAdapter.prototype.save;

CouchbaseAdapter.prototype.get = function(key, callback)
{
	var self = this;
	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.bucket.get(key, function(err, payload, meta)
	{
		if (err) return callback(err);
		var object = self.inflate(payload);
		callback(null, object);
	});
};

CouchbaseAdapter.prototype.getBatch = function(keylist, callback)
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

		self.bucket.get(self.namespaceKey(keylist[ptr]), continuer);
	}

	self.bucket.get(self.namespaceKey(keylist[ptr]), continuer);
};

CouchbaseAdapter.prototype.merge = function(key, attributes, callback)
{
	var self = this;
	var id = this.namespaceKey(key);
	self.bucket.get(id, function(err, payload)
	{
		if (err) return callback(err);
		_.assign(payload, attributes);
		self.bucket.set(id, payload, callback);
	});
};

CouchbaseAdapter.prototype.remove = function(object, callback)
{
	// TODO remove attachments

	this.bucket.del(this.namespaceKey(object.key), callback);
};

CouchbaseAdapter.prototype.destroyMany = function(objects, callback)
{
	// TODO remove attachments

	var self = this;
	var ops = _.map(objects, function(obj)
	{
		if (typeof obj === 'string')
			return { type: 'del', key: self.namespaceKey(obj) };
		return { type: 'del', key: self.namespaceKey(obj.key) };
	});

	this.bucket.batch(ops, callback);
};

CouchbaseAdapter.prototype.attachment = function(key, name, callback)
{
	var attachkey = this.attachmentKey(key, name);
	this.attachdb.get(attachkey, function(err, payload)
	{
		if (err && err.name === 'NotFoundError')
			return callback(null, null);
		callback(err, payload);
	});
};

CouchbaseAdapter.prototype.saveAttachment = function(object, attachment, callback)
{
	var attachkey = this.attachmentKey(object.key, attachment.name);
	this.attachdb.set(attachkey, attachment.body, callback);
};

CouchbaseAdapter.prototype.removeAttachment = function(object, name, callback)
{
	var attachkey = this.attachmentKey(object.key, name);
	this.attachdb.del(attachkey, callback);
};

CouchbaseAdapter.prototype.inflate = function(payload)
{
	if (payload === null)
		return;
	var object = new this.constructor();
	var data = payload;
	try { data = JSON.parse(payload); } catch(e) { }
	object.initFromStorage(data);
	return object;
};

CouchbaseAdapter.flatten = function(json)
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

	payload.body = JSON.stringify(json);

	return payload;
};

//-----------------------------------------------------------------

module.exports = CouchbaseAdapter;
