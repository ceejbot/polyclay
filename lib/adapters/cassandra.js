/*
Plan:
just dump JSON stringified object into the db to start
once it's working as a glorified key/value store, start
exploding into columns/rebuilding the object
*/

var
	_ = require('lodash'),
	assert = require('assert'),
	helenus = require('helenus'),
	util = require('util')
	;

function Defaults()
{
	this.hosts    = ['127.0.0.1:9160'];
	this.keyspace = 'test';
	this.user     = '';
	this.pass     = '';
	this.timeout  = 3000;
}

function CassandraAdapter()
{
	this.options = new Defaults();
	this.connection = null;
}

CassandraAdapter.prototype.configure = function(options, modelfunc)
{
	_.assign(this.options, options);
	this.constructor = modelfunc;
	this.family = modelfunc.prototype.plural;

	// If you hand us a connection, we presume you have connected with it & added
	// an error listener.
	if (options.connection)
		this.connection = options.connection;
	else
	{
		this.connection = new helenus.ConnectionPool({
			hosts:        this.options.hosts, // ['localhost:9160'],
			keyspace:     this.options.keyspace,
			user:         this.options.user,
			password:     this.options.password,
			timeout:      3000
		});

		this.connection.on('error', function(err)
		{
			console.error(err.name, err.message);
			throw(err);
		});

		this.connection.connect(function(err, keyspace)
		{
			if (err) throw(err);
			this.keyspace = keyspace;
		}.bind(this));
	}
};

CassandraAdapter.prototype.provision = function(callback)
{
	var self = this;

	// if keyspace exists, use it
	// else create & then use it

	this.connection.createKeyspace(this.options.keyspace, function(err, response)
	{
		if (err) return callback(err);

		self.connection.use(self.options.keyspace, function(err, keyspace)
		{
			if (err) return callback(err);

			self.keyspace = keyspace;

			self.keyspace.describe(function(err, columnFamilies)
			{
				if (err) return callback(err);
				if (columnFamilies[self.family])
				{
					self.columnFamily = columnFamilies[self.family];
					return callback(null, 'OK');
				}

				var options =
				{
					comment: 'polyclay ' + self.constructor.prototype.singular,
					key_alias: 'key',
					key_validation_class: 'UTF8Type',
					comparator: 'UTF8Type',
					default_validation_class: 'UTF8Type'
				};

				self.keyspace.createColumnFamily(self.family, options, function(err, resp2)
				{
					if (err) return callback(err);

					self.keyspace.get(self.family, function(err, colfamily)
					{
						if (err) return callback(err);
						self.columnFamily = colfamily;
						callback(null, 'OK');
					});
				});
			});
		});
	});
};

CassandraAdapter.prototype.shutdown = function() { };

CassandraAdapter.prototype.save = function(obj, properties, callback)
{
	assert(obj.key);
	var self = this;

	this.columnFamily.insert(obj.key, obj.serialize(), function(err, results)
	{
		if (err) return callback(err);
		callback(null, 'OK');
	});

};

CassandraAdapter.prototype.update = CassandraAdapter.prototype.save;

CassandraAdapter.prototype.merge = function(key, properties, callback)
{
	var previous = this.db[key];
	_.assign(previous, properties);
	this.db[key] = previous;
	callback(null, 'OK');
};

CassandraAdapter.prototype.saveAttachment = function(obj, attachment, callback)
{
	// this.attachments[obj.key + ':' + attachment.name] = attachment;
	callback(null, 'OK');
};

CassandraAdapter.prototype.get = function(key, callback)
{
	var self = this;

	this.connection.cql('SELECT * from %s WHERE key = ?', [this.family, key], function(err, results)
	{
		if (err) return callback(err);

		results.forEach(function(row)
		{
			var props = {};
			row.forEach(function(n, v, ts, ttl)
			{
				props[n] = v;
			});

			console.log(props);

			callback(null, self.inflate(props));
		});
	});
};

CassandraAdapter.prototype.getBatch = function(keylist, callback)
{
	var results = [];
	var self = this;

	// SELECT ... WHERE keyalias IN ('key1', 'key2', 'key3', ...);
	// TODO quoting or figure out if helenus handles this
	this.connection.cql('SELECT * from %s WHERE keyalias IN (%s)', [this.family, keylist.join(', ')], function(err, rows)
	{
		console.log(err, rows);
		if (err) return callback(err);

		rows.forEach(function(row)
		{
			var props = {};
			row.forEach(function(n, v, ts, ttl)
			{
				props[n] = v;
			});

			results.push(self.inflate(props));
		});

		callback(null, results);
	});
};

CassandraAdapter.prototype.all = function(callback)
{
	// todo research topic
	this.getBatch(Object.keys(this.db), callback);
};

CassandraAdapter.prototype.attachment = function(key, name, callback)
{
	// TODO
	callback(new Error('unimplemented'));
	// callback(null, this.attachments[key + ':' + name]);
};

CassandraAdapter.prototype.remove = function(obj, callback)
{
	var self = this;

	this.connection.cql('DELETE FROM %s WHERE KEY = ?', [this.family, obj.key], function(err, reply)
	{
		if (err) return callback(err);

		// TODO also delete attachments

		callback();
	});
};

CassandraAdapter.prototype.destroyMany = function(objlist, callback)
{
	var keylist = _.map(objlist, function(item) { return item.key; });

	this.connection.cql('DELETE * from %s WHERE keyalias IN (%s)', [this.family, keylist.join(', ')], function(err, rows)
	{
		if (err) return callback(err);
	});
};

CassandraAdapter.prototype.removeAttachment = function(obj, name, callback)
{
	callback(new Error('unimplemented'));
	//delete this.attachments[obj.key + ':' + name];
	// callback(null, 'OK');
};


function convert(value, type)
{
	switch (type)
	{
	case 'string':    return value;
	case 'array':     return value.split(',');

	case 'number':
		if (_.isNumber(value))
			return value;
		return parseInt(value, 10);

	case 'boolean':   return (value === 'true');
	case 'date':      return new Date(value);
	case 'hash':      return {}; // TODO
	case 'reference': return value;

	default: return value;
	}
}



CassandraAdapter.prototype.inflate = function(hash)
{
	var obj = new this.constructor();
	var converted = {};

	_.forIn(hash, function(v, k)
	{
		var type = obj.__types[k];
		converted[k] = convert(v, type);
	});

	obj.update(converted);
	return obj;
};

module.exports = CassandraAdapter;
