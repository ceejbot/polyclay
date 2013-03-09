// Redis storage interface.
// Objects are stored as hashes.

var
	_ = require('lodash'),
	redis = require('redis')
	;

//-----------------------------------------------------------------

var attachpat = /^attach:(.*)/;
function inflate(Modelfunc, payload)
{
	var object = new Modelfunc();
	var json = {};
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
			object.__attachments[name] = struct;
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
}

function flatten(json)
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
}

//-----------------------------------------------------------------

function RedisAdapter() { }

RedisAdapter.prototype.configure = function(opts, dbname)
{
	this.redis = redis.createClient(opts);
	this.dbname = opts.dbname;
};

RedisAdapter.prototype.provision = function(Modelfunc, callback)
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

RedisAdapter.prototype.save = function(key, json, callback)
{
	if (!key || !key.length)
		throw(new Error('cannot save a document without a key'));

	var payload = flatten(json);

	var chain = this.redis.multi();
	chain.sadd(this.idskey(), key);
	chain.hmset(this.hashkey(key), payload);
	chain.exec(function(err, replies)
	{
		callback(err, replies[1]);
	});
};

RedisAdapter.prototype.get = function(key, Modelfunc, callback)
{
	if (Array.isArray(key))
		return this.getBatch(key, Modelfunc, callback);

	this.redis.hgetall(this.hashkey(key), function(err, payload)
	{
		if (err) return callback(err);
		var object = inflate(Modelfunc, payload);
		callback(null, object);
	});
};

RedisAdapter.prototype.getBatch = function(keylist, Modelfunc, callback)
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
		var results = _.map(jsondocs, function(item) { return inflate(Modelfunc, item); });
		callback(err, results);
	});

};

RedisAdapter.prototype.merge = function(key, attributes, callback)
{
	this.redis.hmset(this.hashkey(key), flatten(attributes), callback);
};

RedisAdapter.prototype.update = function(key, ignored, json, callback)
{
	this.redis.hmset(this.hashkey(key), flatten(json), callback);
};

RedisAdapter.prototype.remove = function(key, ignored, callback)
{
	var chain = this.redis.multi();
	chain.del(this.hashkey(key));
	chain.srem(this.idskey(), key);
	chain.exec(function(err, replies)
	{
		callback(err, replies[0]);
	});
};

RedisAdapter.prototype.removeMany = function(objects, callback)
{
	var self = this;
	var ids = _.map(objects, function(obj)
	{
		if (typeof obj === 'string')
			return obj;
		return obj.key;
	});

	var chain = this.redis.multi();
	chain.srem(this.idskey(), ids);
	chain.del(_.map(ids, function(key) { return self.hashkey(key); }));
	chain.exec(function(err, replies)
	{
		// TODO process replies
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

RedisAdapter.prototype.saveAttachment = function(item, attachment, callback)
{
	var key = item.id;
	var attachfield = 'attach:' + attachment.name;
	this.redis.hset(this.hashkey(key), attachfield, JSON.stringify(attachment), callback);
};

RedisAdapter.prototype.removeAttachment = function(item, name, callback)
{
	var key = item.id;
	var attachfield = 'attach:' + name;
	this.redis.hdel(this.hashkey(key), attachfield, callback);
};

//-----------------------------------------------------------------

module.exports = RedisAdapter;
