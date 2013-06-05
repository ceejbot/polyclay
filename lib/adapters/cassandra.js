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
	this.link = null;
}

var typeToValidator =
{
	'string': 'UTF8Type',
	'number': 'DoubleType',
	'boolean': 'BooleanType',
	'date': 'DateType',

	// for now subobjects are just JSON.stringified
	'array': 'UTF8Type',
	'hash': 'UTF8Type',
	'reference': 'UTF8Type'
};
CassandraAdapter.typeToValidator = typeToValidator;

CassandraAdapter.prototype.configure = function(options, modelfunc)
{
	var self = this;

	_.assign(this.options, options);
	this.constructor = modelfunc;
	this.family = modelfunc.prototype.plural;

	// If you hand us a pool, we presume you have added an error listener.
	if (options.connection)
		this.connection = options.connection;
	else
	{
		this.connection = new scamandrios.ConnectionPool({
			hosts:        this.options.hosts, // ['localhost:9160'],
			user:         this.options.user,
			password:     this.options.password,
			timeout:      3000
		});

		this.connection.on('error', function(err)
		{
			console.error(err.name, err.message);
			throw(err);
		});
	}

	this.link = this.connection.connect();
};

CassandraAdapter.prototype.assignKeyspace = function()
{
	var self = this;
	var keyspace = self.options.keyspace;

	return this.link.then(function()
	{
		return self.connection.use(keyspace);
	})
	.fail(function(err)
	{
		if (err.name !== 'HelenusNotFoundException')
			throw err;

		return self.connection.createKeyspace(keyspace).then(function()
		{
			return self.connection.use(keyspace);
		});
	})
	.then(function(keyspace)
	{
		if (Array.isArray(keyspace))
			keyspace = _.find(keyspace, { 'state': 'fulfilled' }).value;

		self.keyspace = keyspace;
		return keyspace;
	});
};

CassandraAdapter.prototype.getColumnFamily = function getColumnFamily()
{
	var self = this;

	return this.assignKeyspace()
	.then(function(keyspace)
	{
		return keyspace.describe();
	})
	.then(function(columnFamilies)
	{
		if (columnFamilies[self.family])
		{
			self.columnFamily = columnFamilies[self.family];
			return self.columnFamily;
		}

		return null;
	});
};

CassandraAdapter.prototype.provision = function(callback)
{
	var self = this;

	this.getColumnFamily().then(function(colfamily)
	{
		if (colfamily)
			return callback(null, 'OK');

		var throwaway = new self.constructor();
		var properties = throwaway.propertyTypes();

		var cols = [];
		_.forOwn(properties, function(property, name)
		{
			if (name === 'key')
				return;

			var validator = typeToValidator[property] || 'UTF8Type';

			cols.push({
				name: name,
				validation_class: validator
			});
		});

		var options =
		{
			comment: 'polyclay ' + self.constructor.prototype.singular,
			key_alias: 'key',
			key_validation_class: 'UTF8Type',
			comparator_type: 'UTF8Type',
			default_validation_class: 'UTF8Type',
			columns: cols
		};

		self.keyspace.createColumnFamily(self.family, options)
		.then(function(res)
		{
			return self.keyspace.get(self.family);
		})
		.then(function(colfamily)
		{
			self.columnFamily = colfamily;
			callback(null, 'OK');
		}, function(err) { callback(err); }).done();
	}, function(err) { callback(err); }).done();
};

CassandraAdapter.prototype.shutdown = function() {};

CassandraAdapter.prototype.save = function(obj, properties, callback)
{
	assert(obj.key);
	var self = this;

	this.getColumnFamily()
	.then(function(colfamily)
	{
		return colfamily.insert(obj.key, serialize(obj));
	})
	.then(
		function(resp) { callback(null, 'OK');},
		function(err) { return callback(err); }
	).done();
};

CassandraAdapter.prototype.update = CassandraAdapter.prototype.save;

CassandraAdapter.prototype.merge = function(key, properties, callback)
{
	var params = [ this.family];
	var query = 'UPDATE %s  USING CONSISTENCY ALL SET ';

	_.forOwn(properties, function(v, k)
	{
		query += '? = ?, '
		params.push(k);
		params.push(v);
	});

	query = query.slice(0, query.length - 2);
	query += ' WHERE key = ?';
	params.push(key);

	this.connection.cql(query, params).then(function(rows)
	{
		callback(null, 'OK');
	})
	.fail(function(err) { callback(err); })
	.done();
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

	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.link.then(function()
	{
		return self.connection.cql('SELECT * from %s WHERE key = ?', [self.family, key]);
	})
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
		callback(null, results[0]);

	})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.getBatch = function(keylist, callback)
{
	var results = [];
	var self = this;

	this.link.then(function()
	{
		return self.connection.cql('SELECT * from %s WHERE key IN (%s)', [self.family, keylist]);
	})
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

	})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.all = function(callback)
{
	var results = [];
	var self = this;

	this.link.then(function()
	{
		return self.connection.cql('SELECT * from %s', [self.family]);
	})
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

		callback(null, results, true);
	})
	.fail(function(err) { callback(err); })
	.done();
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

	this.link.then(function()
	{
		return self.connection.cql('DELETE FROM %s WHERE KEY = ?', [self.family, obj.key]);
	})
	.then(function(reply)
	{
		// TODO also delete attachments
		callback();
	})
	.fail(function(err) { console.log(err); callback(err); })
	.done();
};

CassandraAdapter.prototype.destroyMany = function(objlist, callback)
{
	var self = this;
	var keylist = _.map(objlist, function(item) { return item.key; });

	this.link.then(function()
	{
		return self.connection.cql('DELETE from %s WHERE key IN (%s)', [self.family, keylist.join(', ')]);
	})
	.then(function(reply)
	{
		// TODO also delete attachments
		callback();
	})
	.fail(function(err) { console.log(err); callback(err); })
	.done();
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
	if (!hash || !_.isObject(hash))
		return;

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
