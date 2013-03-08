// Redis storage interface.
// Objects are stored as hashes.

var
	redis = require('redis')
	;

//-----------------------------------------------------------------

function RedisAdapter() { }

RedisAdapter.prototype.configure = function(opts, dbname)
{
	this.redis = redis.createClient(opts);
	this.dbname = opts.dbname;
};

RedisAdapter.prototype.hashkey = function(key)
{
	return this.dbname + ':' + key;
};

RedisAdapter.prototype.save = function(key, json, callback)
{
	this.redis.hmset(this.hashkey(key), json, callback);
};

RedisAdapter.prototype.get = function(key, callback)
{
	this.redis.hgetall(this.hashkey(key), callback);
};

RedisAdapter.prototype.merge = function(key, attributes, callback)
{
	this.redis.hmset(this.hashkey(key), attributes, callback);
};

RedisAdapter.prototype.update = function(key, json, callback)
{
	this.redis.hmset(this.hashkey(key), json, callback);
};

RedisAdapter.prototype.remove = function(key, callback)
{
	this.redis.del(this.hashkey(key), callback);
};

// TODO
RedisAdapter.prototype.attachment = function(key, name, callback)
{
	this.db.getAttachment(key, name, function(err, response)
	{
		callback(err, response ? response.body : '');
	});
};

// TODO
RedisAdapter.prototype.saveAttachment = function(item, attachment, callback)
{
	this.db.saveAttachment(item, attachment, callback);
};

RedisAdapter.prototype.removeAttachment = function(item, attachmentName, callback)
{
	this.db.removeAttachment(item, attachmentName, callback);
};

//-----------------------------------------------------------------

module.exports = RedisAdapter;
