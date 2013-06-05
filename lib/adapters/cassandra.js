var
	_           = require('lodash'),
	assert      = require('assert'),
	P           = require('p-promise'),
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
	this.options      = new Defaults();
	this.constructor  = null;
	this.family       = null;
	this.attachfamily = null;
	this.tables       = {};
	this.connection   = null;
	this.keyspace     = null;
	this.columnFamily = null;
	this.attachments  = null;
}

CassandraAdapter.prototype.configure = function(options, modelfunc)
{
	var self = this;

	_.assign(this.options, options);
	this.constructor = modelfunc;
	this.family = modelfunc.prototype.plural;
	this.attachfamily = this.family + '_attachments';

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
		return self;
	})
	.then(function()
	{
		return self.keyspace.describe();
	}).then(function(columnFamilies)
	{
		self.tables = columnFamilies;
	})
	.then(function()
	{
		return self.createModelTable();
	})
	.then(function()
	{
		return self.createAttachmentsTable();
	})
	.then(function()
	{
		callback(null, 'OK');
	})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.createModelTable = function()
{
	if (this.tables[this.family])
	{
		this.columnFamily = this.tables[this.family];
		return P(this.columnFamily);
	}

	var self = this,
		deferred = P.defer();

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
		comment:                  'polyclay ' + self.constructor.prototype.singular,
		key_alias:                'key',
		key_validation_class:     'UTF8Type',
		comparator_type:          'UTF8Type',
		default_validation_class: 'UTF8Type',
		columns:                  cols
	};

	self.keyspace.createColumnFamily(self.family, options)
	.then(function(res)
	{
		self.keyspace.get(self.family)
		.then(function(colfamily)
		{
			self.columnFamily = colfamily;
			deferred.resolve(self.columnFamily);
		});
	})
	.fail(function(err) { deferred.reject(err); })
	.done();

	return deferred.promise;
};

CassandraAdapter.prototype.createAttachmentsTable = function()
{
	var attachname = this.attachfamily;
	if (this.tables[attachname])
	{
		this.attachments = this.tables[attachname];
		return P(this.attachments);
	}

	var self = this,
		deferred = P.defer();

	var options =
	{
		comment:                  'polyclay ' + self.constructor.prototype.singular + ' attachments',
		key_alias:                'key',
		key_validation_class:     'UTF8Type',
		comparator_type:          'UTF8Type',
		default_validation_class: 'UTF8Type',
		columns:
		[
			{ name: 'name',         validation_class: 'UTF8Type'  },
			{ name: 'content_type', validation_class: 'UTF8Type'  },
			{ name: 'data',         validation_class: 'AsciiType' }
		]
	};

	self.keyspace.createColumnFamily(attachname, options)
	.then(function(res)
	{
		self.keyspace.get(attachname)
		.then(function(colfamily)
		{
			self.attachments = colfamily;
			deferred.resolve(self.attachments);
		});
	})
	.fail(function(err) { deferred.reject(err); })
	.done();

	return deferred.promise;
};

CassandraAdapter.prototype.shutdown = function() { };

CassandraAdapter.prototype.save = function(obj, json, callback)
{
	assert(obj.key);
	var self = this;

	this.columnFamily.insert(obj.key, serialize(obj))
	.then(function() { return self.saveAttachments(obj.key, json._attachments); })
	.then(function(resp) { callback(null, 'OK');})
	.fail(function(err) { console.log(err); callback(err); })
	.done();
};

CassandraAdapter.prototype.update = CassandraAdapter.prototype.save;

CassandraAdapter.prototype.merge = function(key, properties, callback)
{
	var params = [ this.family];
	var query = 'UPDATE %s  USING CONSISTENCY ALL SET ';

	_.forOwn(properties, function(v, k)
	{
		query += '? = ?, ';
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
	var self = this;
	var key = makeAttachKey(obj.key, attachment.name);

	var values =
	{
		name:         attachment.name,
		content_type: attachment.content_type,
		data:         new Buffer(attachment.body).toString('base64')
	};

	self.attachments.insert(key, values)
	.then(function(res)
	{
		callback(null, 'OK');
	})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.saveAttachments = function(key, attachments)
{
	if (!attachments || !_.isObject(attachments))
		return P('OK');
	var names = Object.keys(attachments);
	if (!names.length)
		return P('OK');

	var self = this;

	var actions = _.map(names, function(name)
	{
		var attach = attachments[name];
		var k = makeAttachKey(key, name);
		var values =
		{
			name:         name,
			content_type: attach.content_type,
			data:         attach.data // use the B64-encoded version
		};

		return self.attachments.insert(k, values);
	});

	return P.all(actions);
};


CassandraAdapter.prototype.get = function(key, callback)
{
	var self = this,
		results = [];

	if (Array.isArray(key))
		return this.getBatch(key, callback);

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

	this.connection.cql('SELECT * from %s WHERE key IN (%s)', [this.family, keylist])
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

		callback(null, results, true);
	})
	.fail(function(err) { callback(err); })
	.done();
};

function makeAttachKey(k, n)
{
	return k + ':' + n;
}

CassandraAdapter.prototype.attachment = function(key, name, callback)
{
	var results = [];
	var self = this;

	var cassKey = makeAttachKey(key, name);

	this.connection.cql('SELECT * from %s WHERE key = ?', [this.attachfamily, cassKey])
	.then(function(rows)
	{
		if (rows.length === 0)
			return callback(null, null);

		var found = null;

		rows.forEach(function(row)
		{
			var props = {};
			row.forEach(function(n, v, ts, ttl)
			{
				props[n] = v;
			});

			if (props.data)
			{
				var b = new Buffer(props.data, 'base64');
				if (props.content_type.match(/text/))
					props.body = b.toString();
				else
					props.body = b;
			}

			if (props.name === name)
				found = props;
		});

		return callback(null, found ? found.body : null);
	})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.remove = function(obj, callback)
{
	var self = this;

	this.connection.cql('DELETE FROM %s WHERE KEY = ?', [this.family, obj.key])
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
	var keylist = _.map(objlist, function(item) { return item.key; });

	this.connection.cql('DELETE from %s WHERE key IN (%s)', [this.family, keylist.join(', ')])
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
	var key = makeAttachKey(obj.key, name);

	this.connection.cql('SELECT * from %s WHERE key = ?', [this.attachfamily, key])
	.then(function(reply)
	{
		callback(null, 'OK');
	})
	.fail(function(err) { console.log(err); callback(err); })
	.done();
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
