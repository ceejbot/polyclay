var
	async = require('async'),
	cradle = require('cradle'),
	path = require('path')
	;

function CouchAdapter() { }

CouchAdapter.prototype.configure = function(options)
{
	this.connection = options.connection;
	this.dbname = options.dbname;
	this.db = this.connection.database(this.dbname);
};

CouchAdapter.prototype.provision = function(modelfunc, callback)
{
	var self = this;
	var design = modelfunc.design;

	self.db.create(function(err, resp)
	{
		if (err || !design) return callback(err, resp);

		var designpath = path.join('_design', modelfunc.prototype.modelPlural);
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

CouchAdapter.prototype.save = function(document, callback)
{
	var self = this;
	this.db.save(document, callback);
};

CouchAdapter.prototype.get = function(key, callback)
{
	this.db.get(key, callback);
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

CouchAdapter.prototype.removeMany = function(objects, callback)
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

module.exports = CouchAdapter;
