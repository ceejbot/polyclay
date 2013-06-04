/*
Plan:
just dump JSON stringified object into the db to start
once it's working as a glorified key/value store, start
exploding into columns/rebuilding the object
*/

var
	_           = require('lodash'),
	assert      = require('assert'),
	scamandrios = require('scamandrios'),
	util        = require('util')
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
	var self = this;

	_.assign(this.options, options);
	this.constructor = modelfunc;
	this.family = modelfunc.prototype.plural;

	// If you hand us a connection, we presume you have connected with it & added
	// an error listener.
	if (options.connection)
		this.connection = options.connection;
	else
	{
		this.connection = new scamandrios.ConnectionPool({
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

		this.connection.connect().then(function(keyspace)
		{
			self.keyspace = keyspace;
		}, function(err)
		{
			throw(err);
		}).done();
	}
};

CassandraAdapter.prototype.provision = function(callback)
{
	var self = this;
	var keyspace = self.options.keyspace;

	this.connection.createKeyspace(keyspace)
	.then(function()
	{
		return self.connection.useKeyspace(keyspace);
	})
		.then(function(ks)
		{
			self.keyspace = ks;
			self.keyspace.describe().then(function(columnFamilies)
			{
				if (columnFamilies[self.family])
				{
					self.columnFamily = columnFamilies[self.family];
					return callback(null, 'OK');
				}

				var throwaway = new self.constructor();
				var properties = throwaway.propertyTypes();

				var names = Object.keys(properties);
				var cols = [];
				for (var i = 0; i < names.length; i++)
				{
					var validator;
					var name = names[i];

					if (name === 'key')
						continue;

					switch (properties[name])
					{
					case 'string':
						validator = 'UTF8Type';
						break;

					case 'number':
						validator = 'DoubleType';
						break;

					case 'boolean':
						validator = 'BooleanType';
						break;

					case 'date':
						validator = 'DateType';
						break;

					// for now subobjects are just JSON.stringified
					case 'array':
					case 'hash':
					case 'reference':
						validator = 'UTF8Type';
						break;

					default:
						validator = 'UTF8Type';
						break;
					}

					cols.push({
						name: name,
						validation_class: validator
					});
				}

				var options =
				{
					comment: 'polyclay ' + self.constructor.prototype.singular,
					key_alias: 'key',
					key_validation_class: 'UTF8Type',
					comparator: 'UTF8Type',
					default_validation_class: 'UTF8Type',
					columns: cols
				};

				self.keyspace.createColumnFamily(self.family, options)
				.then(function(res)
				{
					self.keyspace.get(self.family)
					.then(function(colfamily)
					{
						self.columnFamily = colfamily;
						callback(null, 'OK');
					});
				}, function(err) { console.log(err); callback(err); }).done();
			}, function(err) { console.log(err); callback(err); }).done();
		})
	.fail(function(err) { console.log(err); callback(err); })
	.done();
};

CassandraAdapter.prototype.shutdown = function() { };

CassandraAdapter.prototype.save = function(obj, properties, callback)
{
	assert(obj.key);
	var self = this;

	this.columnFamily.insert(obj.key, serialize(obj))
	.then(
		function(resp) { callback(null, 'OK');},
		function(err) { return callback(err); }
	).done();
};

CassandraAdapter.prototype.update = CassandraAdapter.prototype.save;

CassandraAdapter.prototype.merge = function(key, properties, callback)
{
	// this sort of only makes sense for couch/cradle-- consider nuking entirely
	throw(new Error('unimplemented'));
};

CassandraAdapter.prototype.saveAttachment = function(obj, attachment, callback)
{
	throw(new Error('unimplemented'));
	// this.attachments[obj.key + ':' + attachment.name] = attachment;
	// callback(null, 'OK');
};

CassandraAdapter.prototype.get = function(key, callback)
{
	var self = this,
		results = [];

	this.connection.cql('SELECT * from %s WHERE key = ?', [this.family, key])
	.then(function(rows)
	{
		rows.forEach(function(row)
		{
			var props = {};
			row.forEach(function(n, v, ts, ttl)
			{
				props[n] = v;
			});

			var obj = self.inflate(props);
			results.push(obj);
		});
		callback(null, results[0]);

	}, function(err) { return callback(err); }).done();
};

CassandraAdapter.prototype.getBatch = function(keylist, callback)
{
	var results = [];
	var self = this;

	this.connection.cql('SELECT * from %s WHERE key IN (%s)', [this.family, keylist.join(', ')])
	.then(function(rows)
	{
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

	}, function(err) { return callback(err); }).done();
};

CassandraAdapter.prototype.all = function(callback)
{
	var results = [];
	var self = this;

	this.connection.cql('SELECT * from %s', [this.family])
	.then(function(rows)
	{
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
	}, function(err) { return callback(err); }).done();
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

	this.connection.cql('DELETE FROM %s WHERE KEY = ?', [this.family, obj.key])
	.then(function(reply)
	{
		// TODO also delete attachments
		callback();
	}, function(err) { return callback(err); }).done();
};

CassandraAdapter.prototype.destroyMany = function(objlist, callback)
{
	var keylist = _.map(objlist, function(item) { return item.key; });

	this.connection.cql('DELETE * from %s WHERE key IN (%s)', [this.family, keylist.join(', ')])
	.then(function(reply)
	{
		// TODO also delete attachments
		callback();
	}, function(err) { return callback(err); });
};

CassandraAdapter.prototype.removeAttachment = function(obj, name, callback)
{
	callback(new Error('unimplemented'));
	//delete this.attachments[obj.key + ':' + name];
	// callback(null, 'OK');
};


function serialize(obj)
{
	var struct = obj.serialize();
	var types = obj.propertyTypes();

	var keys = Object.keys(struct);
	for (var i = 0; i < keys.length; i++)
	{
		var k = keys[i];
		if (('array' === types[k]) || ('hash' === types[k]) || ('reference' === types[k]) || 'untyped' === types[k])
			struct[k] = JSON.stringify(struct[k]);
	}

	return struct;
}

function convert(value, type)
{
	switch (type)
	{
	case 'string':    return value;
	case 'boolean':   return value;
	case 'date':      return value;
	case 'number':    return value;
	case 'array':     return JSON.parse(value);
	case 'hash':      return JSON.parse(value);
	case 'reference': return JSON.parse(value);
	default:          return JSON.parse(value);
	}
}

CassandraAdapter.prototype.inflate = function(hash)
{
	var obj = new this.constructor();
	var converted = {};
	var keys = Object.keys(hash);

	for (var i = 0; i < keys.length; i++)
	{
		var k = keys[i];
		var v = hash[k];
		var type = obj.__types[k];
		converted[k] = convert(v, type);
	}

	obj.update(converted);
	return obj;
};

module.exports = CassandraAdapter;
