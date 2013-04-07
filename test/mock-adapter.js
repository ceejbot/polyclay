var _ = require('lodash');

function MockDBAdapter()
{
	this.db = {};
	this.attachments = {};
}

MockDBAdapter.prototype.configure = function(options, modelfunc)
{
	this.constructor = modelfunc;
};

MockDBAdapter.prototype.provision = function() { };
MockDBAdapter.prototype.shutdown = function() { };

MockDBAdapter.prototype.save = function(obj, properties, callback)
{
	this.db[obj.key] = properties;
	callback(null, 'OK');
};
MockDBAdapter.prototype.update = MockDBAdapter.prototype.save;

MockDBAdapter.prototype.merge = function(key, properties, callback)
{
	var previous = this.db[key];
	_.assign(previous, properties);
	this.db[key] = previous;
	callback(null, 'OK');
};

MockDBAdapter.prototype.saveAttachment = function(obj, attachment, callback)
{
	this.attachments[obj.key + ':' + attachment.name] = attachment;
	callback(null, 'OK');
};

MockDBAdapter.prototype.get = function(key, callback)
{
	var props = this.db[key];
	if (!props)
		return callback(null, null);

	callback(null, this.inflate(props));
};

MockDBAdapter.prototype.getBatch = function(keylist, callback)
{
	var results = [];
	for (var i = 0; i < keylist.length; i++)
	{
		var props = this.db[keylist[i]];
		if (!props)
		{
			results.push(null);
			continue;
		}
		results.push(this.inflate(props));
	}

	callback(null, results);
};

MockDBAdapter.prototype.all = function(callback)
{
	this.getBatch(Object.keys(this.db), callback);
};

MockDBAdapter.prototype.attachment = function(key, name, callback)
{
	callback(null, this.attachments[key + ':' + name]);
};

MockDBAdapter.prototype.remove = function(obj, callback)
{
	delete this.db[obj.key];

	var prefix = obj.key + ':';
	var keys = Object.keys(this.attachments);
	for (var i = 0; i < keys.length; i++)
	{
		var k = keys[i];
		if (k.indexOf(prefix) === 0)
			delete this.attachments[k];
	}

	callback(null);
};

MockDBAdapter.prototype.destroyMany = function(objlist, callback)
{
	var keys = _.map(objlist, function(item) { return item.key; });
};

MockDBAdapter.prototype.removeAttachment = function(obj, name, callback)
{
	delete this.attachments[obj.key + ':' + name];
	callback(null, 'OK');
};

MockDBAdapter.prototype.inflate = function(hash)
{
	var obj = new this.constructor();
	obj.update(hash);
	return obj;
};

module.exports = MockDBAdapter;
