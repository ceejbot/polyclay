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
	this.withKeyspace = null;
	this.withTables   = null;
	this.keyspace     = null;
	this.columnFamily = null;
	this.attachments  = null;
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
	this.attachfamily = this.family + '_attachments';

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

	this.withKeyspace = this.connection.connect().then(function() { return self.assignKeyspace(); });
	this.withTables = this.withKeyspace.then(function(keyspace) { return self.getTables(keyspace); });
};

CassandraAdapter.prototype.assignKeyspace = function()
{
	var self = this;
	var keyspace = self.options.keyspace;

	if (self.keyspace)
		return P(self.keyspace);

	if (!(self.connection instanceof scamandrios.ConnectionPool))
	{
		return self.connection.useKeyspace(keyspace)
		.fail(function(err)
		{
			if (err.name !== 'HelenusNotFoundException')
				throw err;

			return self.connection.createKeyspace(keyspace).then(function()
			{
				return self.connection.useKeyspace(keyspace);
			});
		}).then(function(keyspace)
		{
			self.keyspace = keyspace;
			return keyspace;
		});
	}

	return self.connection.use(keyspace)
	.then(function(promises)
	{
		var initialFulfilled = _.find(promises, { state: 'fulfilled' });
		if (initialFulfilled)
		{
			self.keyspace = initialFulfilled.value;
			return self.keyspace;
		}

		var initialRejected = _.find(promises, { state: 'rejected' });
		if (initialRejected)
		{
			var reason = initialRejected.reason;
			if (reason.name !== 'HelenusNotFoundException')
				throw reason;

			return self.connection.createKeyspace(keyspace)
			.then(function() { return self.connection.use(keyspace); })
			.then(function(promises)
			{
				var initialFulfilled = _.find(promises, { state: 'fulfilled' });

				if (!initialFulfilled)
				{
					var selectError = new TypeError('Failed to create and select keyspace.');
					_.assign(selectError, { keyspace: keyspace, response: promises });
					throw selectError;
				}

				self.keyspace = initialFulfilled.value;
				return self.keyspace;
			});
		}

		var typeError = new TypeError('Unrecognized response type.');
		_.assign(typeError, { response: promises });
		throw typeError;
	});
};

CassandraAdapter.prototype.getTables = function(keyspace)
{
	var self = this;

	return keyspace.describe()
	.then(function(columnFamilies)
	{
		self.tables = columnFamilies;
		return columnFamilies;
	});
};

CassandraAdapter.prototype.getTableAs = function getTableAs(name, property)
{
	var self = this;

	if (this[property])
		return P(this[property]);

	return this.withTables
	.then(function(columnFamilies)
	{
		if (columnFamilies[name])
			self[property] = columnFamilies[name];

		return self[property];
	});
};

CassandraAdapter.prototype.createTableAs = function createTableAs(name, property, options)
{
	var self = this;
	options = _.defaults(Object(options), { 'columns': [], 'description': '' });

	return this.getTableAs(name, property)
	.then(function(colfamily)
	{
		if (colfamily)
			return colfamily;

		var settings =
		{
			comment:                  options.description,
			key_alias:                'key',
			key_validation_class:     'UTF8Type',
			comparator_type:          'UTF8Type',
			default_validation_class: 'UTF8Type',
			columns:                  options.columns
		};

		return self.keyspace.createColumnFamily(name, settings)
		.then(function() { return self.keyspace.get(name); })
		.then(function(colfamily)
		{
			self[property] = colfamily;
			return colfamily;
		});
	});
};

CassandraAdapter.prototype.getModelTable = function()
{
	return this.getTableAs(this.family, 'columnFamily');
};

CassandraAdapter.prototype.getAttachmentTable = function()
{
	return this.getTableAs(this.attachfamily, 'attachments');
};

CassandraAdapter.prototype.createModelTable = function()
{
	var self = this;

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

	return this.createTableAs(self.family, 'columnFamily',
	{
		description: 'polyclay ' + self.constructor.prototype.singular,
		columns:     cols
	});
};

CassandraAdapter.prototype.createAttachmentsTable = function()
{
	return this.createTableAs(this.attachfamily, 'attachments',
	{
		description: 'polyclay ' + this.constructor.prototype.singular + ' attachments',
		columns:
		[
			{ name: 'name',         validation_class: 'UTF8Type'  },
			{ name: 'content_type', validation_class: 'UTF8Type'  },
			{ name: 'data',         validation_class: 'AsciiType' }
		]
	});
};

CassandraAdapter.prototype.provision = function(callback)
{
	var self = this;

	return this.withTables
	.then(function()
	{
		return P.all(
		[
			self.createModelTable(),
			self.createAttachmentsTable()
		]);
	})
	.then(function()
	{
		callback(null, 'OK');
	}).fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.shutdown = function() {};

CassandraAdapter.prototype.save = function(obj, json, callback)
{
	assert(obj.key);
	var self = this;

	this.createModelTable()
	.then(function(colfamily) { return colfamily.insert(obj.key, serialize(obj)); })
	.then(function() { return self.createAttachmentsTable(); })
	.then(function() { return self.saveAttachments(obj.key, json._attachments); })
	.then(function(resp) { callback(null, 'OK');})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.update = CassandraAdapter.prototype.save;

CassandraAdapter.prototype.merge = function(key, properties, callback)
{
	var self = this;

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

	return this.withKeyspace
	.then(function() { return self.connection.cql(query, params); })
	.then(function()
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

	return this.getAttachmentTable()
	.then(function() { return self.attachments.insert(key, values); })
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

	return this.getAttachmentTable()
	.then(function()
	{
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
	});
};

CassandraAdapter.prototype.get = function(key, callback)
{
	var self = this,
		results = [];

	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.withKeyspace.then(function() { return self.connection.cql('SELECT * from %s WHERE key = ?', [self.family, key]); })
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

	this.withKeyspace.then(function() { return self.connection.cql('SELECT * from %s WHERE key IN (%s)', [self.family, keylist]); })
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

	this.withKeyspace.then(function() { return self.connection.cql('SELECT * from %s', [self.family]); })
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

	this.withKeyspace.then(function() { return self.connection.cql('SELECT * from %s WHERE key = ?', [self.attachfamily, cassKey]); })
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

	this.withKeyspace.then(function() { return self.connection.cql('DELETE FROM %s WHERE KEY = ?', [self.family, obj.key]); })
	.then(function(reply)
	{
		return self.removeAllAttachments(obj.key);
	}).then(function(res)
	{
		callback(null, 'OK');
	})
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.destroyMany = function(objlist, callback)
{
	var self = this;
	var keylist = _.map(objlist, function(item)
	{
		if (_.isObject(item))
			return item.key;
		else
			return item;
	});

	var actions = _.map(keylist, function(k)
	{
		return self.removeAllAttachments(k);
	});

	P.all(actions).then(function() { return self.connection.cql('DELETE from %s WHERE key IN (%s)', [self.family, keylist.join(', ')]); })
	.then(function(reply)
	{
		callback();
	})
	.fail(function(err) { console.log(err); callback(err); })
	.done();
};

CassandraAdapter.prototype.removeAttachment = function(obj, name, callback)
{
	var self = this;
	var key = makeAttachKey(obj.key, name);
	this.getAttachmentTable()
	.then(function() { return self.attachments.remove(key); })
	.then(function(res) { callback(null, 'OK'); })
	.fail(function(err) { callback(err); })
	.done();
};

CassandraAdapter.prototype.removeAllAttachments = function(key)
{
	var self = this;

	// I feel that this is grotty.
	var props = _.filter(Object.keys(self.constructor.prototype), function(item)
	{
		return item.match(/^fetch_/);
	});

	var actions = _.map(props, function(p)
	{
		var akey = key + ':' + p.replace(/^fetch_/, '');
		return self.getAttachmentTable().then(function() { return self.attachments.remove(akey); });
	});

	return P.all(actions);
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
