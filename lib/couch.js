var
	async = require('async'),
	cradle = require('cradle'),
	path = require('path')
	;

function CouchAdapter() { }

CouchAdapter.prototype.configure = function(options, Modelfunc)
{
	this.connection = options.connection;
	this.dbname = options.dbname;
	this.db = this.connection.database(this.dbname);
	this.constructor = Modelfunc;
};

CouchAdapter.prototype.provision = function(Modelfunc, callback)
{
	var self = this;
	var design = Modelfunc.design;

	self.db.create(function(err, resp)
	{
		if (err || !design) return callback(err, resp);

		var designpath = path.join('_design', Modelfunc.prototype.modelPlural);
		self.db.save(designpath, design, callback);
	});
};

CouchAdapter.prototype.all = function(callback)
{
	this.db.all(function (err, rows)
	{
		if (err) return callback(err);

		var ids = [];
		for (var i = 0; i < rows.length; i++)
		{
			if (rows[i].id.indexOf('_design/') === 0)
				continue;
			ids.push(rows[i].id);
		}
		callback(null, ids);
	});
};

CouchAdapter.prototype.save = function(ignored, document, callback)
{
	var self = this;
	this.db.save(document, callback);
};

CouchAdapter.prototype.get = function(key, callback)
{
	var self = this;

	if (Array.isArray(key))
		return this.getBatch(key, callback);

	this.db.get(key, function(err, response)
	{
		if (err) return callback(err);
		var object = new self.constructor();
		object.key = response._id;
		object._rev = response._rev;
		object.initFromStorage(response);
		callback(null, object);
	});
};

CouchAdapter.prototype.getBatch = function(keylist, callback)
{
	var self = this;

	this.db.get(keylist, function(err, jsondocs)
	{
		if (err) return callback(err);

		var results = [];
		for (var i = 0; i < jsondocs.length; i++)
		{
			if (!jsondocs[i].doc)
				continue;
			var object = new self.constructor();
			object._rev = jsondocs[i].doc._rev;
			object.initFromStorage(jsondocs[i].doc);
			results.push(object);
		}
		callback(null, results);
	});
};

CouchAdapter.prototype.merge = function(key, attributes, callback)
{
	this.db.merge(key, attributes, callback);
};

CouchAdapter.prototype.update = function(key, rev, document, callback)
{
	this.db.save(key, rev, document, function(err, response)
	{
		callback(err, response);
	});
};

CouchAdapter.prototype.remove = function(key, revision, callback)
{
	this.db.remove(key, revision, callback);
};

CouchAdapter.prototype.destroyMany = function(objects, callback)
{
	var self = this;

	var makeRemoveFunc = function(id, rev)
	{
		return function(cb) { self.db.remove(id, rev, cb); };
	};

	var actionsList = [];
	for (var i = 0; i < objects.length; i++)
		actionsList.push(makeRemoveFunc(objects[i].key, objects[i]._rev));

	async.parallel(actionsList, function(err, results)
	{
		callback(err, results);
	});
};

CouchAdapter.prototype.attachment = function(key, name, callback)
{
	this.db.getAttachment(key, name, function(err, response)
	{
		callback(err, response ? response.body : '');
	});
};

CouchAdapter.prototype.saveAttachment = function(item, attachment, callback)
{
	this.db.saveAttachment(item, attachment, callback);
};

CouchAdapter.prototype.removeAttachment = function(item, attachmentName, callback)
{
	this.db.removeAttachment(item, attachmentName, callback);
};

CouchAdapter.prototype.inflate = function(struct)
{
	var object = new this.constructor();
	object.key = struct.id;
	object._rev = struct.value._rev;
	object.initFromStorage(struct.value);

	return object;
}

module.exports = CouchAdapter;
