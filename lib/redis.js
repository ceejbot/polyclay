// Redis storage interface.
// Objects are stored as hashes.

var
	_ = require('lodash'),
	redis = require('redis')
	;

//-----------------------------------------------------------------

function RedisAdapter() { }

RedisAdapter.prototype.configure = function(opts, modelfunc)
{
	this.redis = redis.createClient(opts);
	this.dbname = opts.dbname;
	this.constructor = modelfunc;
};

RedisAdapter.prototype.provision = function(callback)
{
	// Nothing to do?
	callback(null);
};

RedisAdapter.prototype.all = function(callback)
{
	this.redis.smembers(this.idskey(), function(err, ids)
	{
		callback(err, ids);
	});
};

RedisAdapter.prototype.hashkey = function(key)
{
	return this.dbname + ':' + key;
};

RedisAdapter.prototype.idskey = function()
{
	return this.dbname + ':ids';
};

RedisAdapter.prototype.save = function(object, json, callback)
{
	if (!object.key || !object.key.length)
		throw(new Error('cannot save a document without a key'));

	var payload = RedisAdapter.flatten(json);

	var chain = this.redis.multi();
	chain.sadd(this.idskey(), object.key);
	chain.hmset(this.hashkey(object.key), payload);
	chain.exec(function(err, replies)
	{
		callback(err, replies[1]);
	});
};

RedisAdapter.prototype.get = function(key, callback)
{
	var self = this;
	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.redis.hgetall(this.hashkey(key), function(err, payload)
	{
		if (err) return callback(err);
		var object = self.inflate(payload);
		callback(null, object);
	});
};

RedisAdapter.prototype.getBatch = function(keylist, callback)
{
	var self = this;
	var chain = this.redis.multi();
	_.each(keylist, function(item)
	{
		chain.hgetall(self.hashkey(item));
	});

	chain.exec(function(err, jsondocs)
	{
		if (err) return callback(err);
		var results = _.map(jsondocs, function(item) { return self.inflate(item); });
		callback(err, results);
	});

};

RedisAdapter.prototype.merge = function(key, attributes, callback)
{
	this.redis.hmset(this.hashkey(key), RedisAdapter.flatten(attributes), callback);
};

RedisAdapter.prototype.update = function(object, json, callback)
{
	this.redis.hmset(this.hashkey(object.key), RedisAdapter.flatten(json), callback);
};

RedisAdapter.prototype.remove = function(object, callback)
{
	var chain = this.redis.multi();
	chain.del(this.hashkey(object.key));
	chain.srem(this.idskey(), object.key);
	chain.exec(function(err, replies)
	{
		callback(err, replies[0]);
	});
};

RedisAdapter.prototype.destroyMany = function(objects, callback)
{
	var self = this;
	var ids = _.map(objects, function(obj)
	{
		if (typeof obj === 'string')
			return obj;
		return obj.key;
	});

	var idkey = this.idskey();
	var chain = this.redis.multi();
	_.each(ids, function(id) { chain.srem(idkey, id); });
	chain.del(_.map(ids, function(key) { return self.hashkey(key); }));

	chain.exec(function(err, replies)
	{
		callback(err);
	});
};

RedisAdapter.prototype.attachment = function(key, name, callback)
{
	var attachfield = 'attach:' + name;
	this.redis.hget(this.hashkey(key), attachfield, function(err, payload)
	{
		if (err) return callback(err);
		var struct = JSON.parse(payload);
		if (_.isObject(struct.body))
			struct.body = new Buffer(struct.body);
		callback(null, struct.body);
	});
};

RedisAdapter.prototype.saveAttachment = function(object, attachment, callback)
{
	var key = object.key;
	var attachfield = 'attach:' + attachment.name;
	this.redis.hset(this.hashkey(key), attachfield, JSON.stringify(attachment), callback);
};

RedisAdapter.prototype.removeAttachment = function(object, name, callback)
{
	var key = object.key;
	var attachfield = 'attach:' + name;
	this.redis.hdel(this.hashkey(key), attachfield, callback);
};

RedisAdapter.prototype.constructMany = function(documents)
{
};

var attachpat = /^attach:(.*)/;
RedisAdapter.prototype.inflate = function(payload)
{
	if (payload === null)
		return;
	var object = new this.constructor();
	var json = {};
	json._attachments = {};
	var matches;

	var fields = Object.keys(payload).sort();
	for (var i = 0; i < fields.length; i++)
	{
		var field = fields[i];

		if (matches = field.match(attachpat))
		{
			var name = matches[1];
			var struct = JSON.parse(payload[field]);
			if (_.isObject(struct.body))
				struct.body = new Buffer(struct.body);
			json._attachments[name] = struct;
			continue;
		}

		try
		{
			json[field] = JSON.parse(payload[field]);
		}
		catch (e)
		{
			json[field] = payload[field];
		}
	}

	object.initFromStorage(json);
	return object;
};

RedisAdapter.flatten = function(json)
{
	var payload = {};
	var i;

	if (json._attachments)
	{
		var attaches = Object.keys(json._attachments);
		for (i = 0; i < attaches.length; i++)
		{
			var attachment = json._attachments[attaches[i]];
			var item = {};
			item.body = attachment.body;
			item.content_type = attachment.content_type;
			item.length = attachment.length;
			item.name = attaches[i];
			payload['attach:' + attaches[i]] = JSON.stringify(item);
		}
		delete json._attachments;
	}

	var fields = Object.keys(json).sort();
	for (i = 0; i < fields.length; i++)
	{
		var field = fields[i];
		payload[field] = JSON.stringify(json[field]);
	}

	return payload;
};

//-----------------------------------------------------------------

module.exports = RedisAdapter;
