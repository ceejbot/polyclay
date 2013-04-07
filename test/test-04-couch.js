/*global describe:true, it:true, before:true, after:true */

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should()
	;

var
	cradle = require('cradle'),
	fs = require('fs'),
	path = require('path'),
	polyclay = require('../index'),
	CouchAdapter = require('../lib/adapters/couch'),
	util = require('util')
	;

var testDir = process.cwd();
if (path.basename(testDir) !== 'test')
	testDir = path.join(testDir, 'test');
var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

describe('couch adapter', function()
{
	var modelDefinition =
	{
		properties:
		{
			name: 'string',
			created: 'date',
			foozles: 'array',
			snozzers: 'hash',
			is_valid: 'boolean',
			count: 'number',
			required_prop: 'string',
		},
		optional: [ 'computed', 'ephemeral' ],
		required: [ 'name', 'is_valid', 'required_prop'],
		singular: 'model',
		plural: 'models',
		initialize: function()
		{
			this.ran_init = true;
			this.on('before-save', this.beforeSave.bind(this));
			this.on('after-save', this.afterSave.bind(this));
			this.on('after-load', this.afterLoad.bind(this));
			this.on('before-destroy', this.beforeDestroy.bind(this));
			this.on('after-destroy', this.afterDestroy.bind(this));
		},
		methods:
		{
			beforeSave: function() { this.beforeSaveCalled = true; },
			afterSave: function() { this.afterSaveCalled = true; },
			afterLoad: function() { this.afterLoadCalled = true; },
			beforeDestroy: function() { this.beforeDestroyCalled = true; },
			afterDestroy: function() { this.afterDestroyCalled = true; },
		}
	};

	var couch_config =
	{
		host: 'localhost',
		port: 5984,
		db: 'polyclay_tests',
	};

	if (process.env.CUSER && process.env.CPASS)
	{
		couch_config.auth =
		{
			username: process.env.USER,
			password: process.env.CPASS
		};
	}

	var Model, instance, another, hookTest, hookid;

	before(function()
	{
		Model = polyclay.Model.buildClass(modelDefinition);

		Model.design =
		{
			views:
			{
				by_name: { map: "function(doc) {\n  emit(doc.name, doc);\n}", language: "javascript" }
			}
		};

		Model.fetchByName = function(name, callback)
		{
			Model.adapter.db.view('models/by_name', { key: name }, function(err, documents)
			{
				if (err) return callback(err);
				Model.constructMany(documents, callback);
			});
		};

		polyclay.persist(Model);
	});

	it('can be configured for database access', function(done)
	{
		var connection = new cradle.Connection(
			couch_config.host,
			couch_config.port,
			{
				cache: false,
				raw: false,
				auth: couch_config.auth
			}
		);
		var options =
		{
			connection: connection,
			dbname: couch_config.db
		};

		Model.setStorage(options, CouchAdapter);
		Model.adapter.should.be.ok;
		Model.adapter.db.should.be.ok;
		Model.adapter.connection.info(function(err, response)
		{
			should.not.exist(err);
			response.should.be.an('object');
			done();
		});
	});

	it('can provision the database for the model', function(done)
	{
		Model.adapter.db.exists(function (err, exists)
		{
			should.not.exist(err);
			if (exists)
				return done();
			Model.provision(function(err, res)
			{
				should.not.exist(err);
				done();
			});
		});
	});

	it('saves views when it creates the database', function(done)
	{
		Model.adapter.db.get('_design/models', function(err, response)
		{
			should.not.exist(err);
			response.should.have.property('views');
			response.views.should.have.property('by_name');
			done();
		});
	});

	it('can save a document in the db', function(done)
	{
		instance = new Model();
		instance.update(
		{
			name: 'test',
			created: Date.now(),
			foozles: ['three', 'two', 'one'],
			snozzers: { field: 'value' },
			is_valid: true,
			count: 3,
			required_prop: 'requirement met',
			computed: 17
		});
		instance.save(function(err, id_and_rev)
		{
			should.not.exist(err);
			id_and_rev.should.be.ok;
			id_and_rev.should.be.an('object');
			instance.isDirty().should.be.false;
			instance._id.should.equal(id_and_rev.id);
			instance._rev.should.equal(id_and_rev.rev);
			done();
		});
	});

	it('can retrieve the saved document', function(done)
	{
		Model.get(instance._id, function(err, retrieved)
		{
			should.not.exist(err);
			retrieved.should.be.ok;
			retrieved.should.be.an('object');
			retrieved._id.should.equal(instance._id);
			retrieved.name.should.equal(instance.name);
			retrieved.created.getTime().should.equal(instance.created.getTime());
			retrieved.is_valid.should.equal(instance.is_valid);
			retrieved.count.should.equal(instance.count);
			retrieved.computed.should.equal(instance.computed);
			done();
		});
	});

	it('can update the document', function(done)
	{
		var prevRev = instance._rev;
		instance.name = "New name";
		instance.isDirty().should.be.true;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			response.should.be.a('string');
			response.should.equal('OK');
			instance.isDirty().should.be.false;
			instance._rev.should.not.equal(prevRev);
			done();
		});
	});


	it('can fetch in batches', function(done)
	{
		var ids = [ instance._id ];
		var obj = new Model();
		obj.name = 'two';
		obj.save(function(err, response)
		{
			ids.push(obj._id);

			Model.get(ids, function(err, itemlist)
			{
				should.not.exist(err);
				itemlist.should.be.an('array');
				itemlist.length.should.equal(2);
				done();
			});
		});
	});

	it('can fetch all', function(done)
	{
		Model.all(function(err, itemlist)
		{
			should.not.exist(err);
			itemlist.should.be.an('array');
			itemlist.length.should.be.above(1);
			done();
		});
	});

	it('can find documents using views', function(done)
	{
		Model.fetchByName('two', function(err, itemlist)
		{
			should.not.exist(err);
			itemlist.should.be.an('array');
			itemlist.length.should.equal(1);
			done();
		});
	});

	it('constructMany() retuns an empty list when given empty input', function(done)
	{
		Model.constructMany([], function(err, results)
		{
			should.not.exist(err);
			results.should.be.an('array');
			results.length.should.equal(0);
			done();
		});
	});

	it('merge() updates properties then saves the object', function(done)
	{
		Model.fetchByName('two', function(err, itemlist)
		{
			should.not.exist(err);
			var item = itemlist[0];

			item.merge({ is_valid: true, count: 1023 }, function(err, response)
			{
				should.not.exist(err);
				Model.get(item._id, function(err, stored)
				{
					should.not.exist(err);
					stored.count.should.equal(1023);
					stored.is_valid.should.equal(true);
					stored.name.should.equal(item.name);
					done();
				});
			});
		});
	});

	it('can add an attachment type', function()
	{
		Model.defineAttachment('frogs', 'text/plain');
		Model.defineAttachment('avatar', 'image/png');

		instance.set_frogs.should.be.a('function');
		instance.fetch_frogs.should.be.a('function');
		var property = Object.getOwnPropertyDescriptor(Model.prototype, 'frogs');
		property.get.should.be.a('function');
		property.set.should.be.a('function');
	});

	it('can save attachments', function(done)
	{
		instance.avatar = attachmentdata;
		instance.frogs = 'This is bunch of frogs.';
		var prevRev = instance._rev;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			instance.isDirty().should.equal.false;
			instance._rev.should.not.equal(prevRev);
			done();
		});
	});

	it('can retrieve attachments', function(done)
	{
		Model.get(instance._id, function(err, retrieved)
		{
			retrieved.fetch_frogs(function(err, frogs)
			{
				should.not.exist(err);
				frogs.should.be.a('string');
				frogs.should.equal('This is bunch of frogs.');
				retrieved.fetch_avatar(function(err, imagedata)
				{
					should.not.exist(err);
					assert(imagedata instanceof Buffer, 'expected image attachment to be a Buffer');
					imagedata.length.should.equal(attachmentdata.length);
					done();
				});
			});
		});
	});

	it('can update an attachment', function(done)
	{
		instance.frogs = 'Poison frogs are awesome.';
		instance.save(function(err, response)
		{
			should.not.exist(err);
			Model.get(instance._id, function(err, retrieved)
			{
				should.not.exist(err);
				retrieved._rev.should.equal(instance._rev);
				retrieved.fetch_frogs(function(err, frogs)
				{
					should.not.exist(err);
					frogs.should.equal(instance.frogs);
					retrieved.fetch_avatar(function(err, imagedata)
					{
						should.not.exist(err);
						imagedata.length.should.equal(attachmentdata.length);
						done();
					});
				});
			});
		});
	});

	it('can store an attachment directly', function(done)
	{
		instance.frogs = 'Poison frogs are awesome, but I think sand frogs are adorable.';
		instance.saveAttachment('frogs', function(err, response)
		{
			should.not.exist(err);
			Model.get(instance._id, function(err, retrieved)
			{
				should.not.exist(err);
				retrieved._rev.should.equal(instance._rev);
				retrieved.fetch_frogs(function(err, frogs)
				{
					should.not.exist(err);
					frogs.should.equal(instance.frogs);
					done();
				});
			});
		});
	});

	it('saveAttachment() clears the dirty bit', function(done)
	{
		instance.frogs = 'This is bunch of frogs.';
		var prevRev = instance._rev;
		instance.isDirty().should.equal(true);
		instance.saveAttachment('frogs', function(err, response)
		{
			should.not.exist(err);
			instance._rev.should.not.equal(prevRev);
			instance.isDirty().should.equal(false);
			done();
		});
	});

	it('can remove an attachment', function(done)
	{
		var prevRev = instance._rev;
		instance.removeAttachment('frogs', function(err, deleted)
		{
			should.not.exist(err);
			deleted.should.be.true;
			instance._rev.should.not.equal(prevRev);
			done();
		});
	});


	it('caches an attachment after it is fetched', function(done)
	{
		instance.avatar = attachmentdata;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			instance.isDirty().should.be.false;
			instance.fetch_avatar(function(err, imagedata)
			{
				should.not.exist(err);
				var cached = instance.__attachments['avatar'].body;
				cached.should.be.okay;
				(cached instanceof Buffer).should.equal(true);
				polyclay.dataLength(cached).should.equal(polyclay.dataLength(attachmentdata));
				done();
			});
		});
	});

	it('removes an attachment when its data is set to null', function(done)
	{
		instance.avatar = null;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			Model.get(instance._id, function(err, retrieved)
			{
				should.not.exist(err);
				retrieved.fetch_avatar(function(err, imagedata)
				{
					should.not.exist(err);
					should.not.exist(imagedata);
					done();
				});
			});
		});
	});

	it('calls a beforeSave() hook before saving a model', function(done)
	{
		hookTest = new Model();
		hookTest.name = 'hook test';

		hookTest.should.not.have.property('beforeSaveCalled');
		hookTest.save(function(err, res)
		{
			should.not.exist(err);
			hookid = hookTest._id;
			hookTest.should.have.property('beforeSaveCalled');
			hookTest.beforeSaveCalled.should.equal(true);
			done();
		});
	});

	it('calls afterSave() after saving a model', function()
	{
		hookTest.should.have.property('afterSaveCalled');
		hookTest.afterSaveCalled.should.equal(true);
	});

	it('can remove a document from the db', function(done)
	{
		instance.destroy(function(err, deleted)
		{
			should.not.exist(err);
			deleted.should.be.ok;
			instance.destroyed.should.be.true;
			done();
		});
	});

	it('can remove documents in batches', function(done)
	{
		var obj2 = new Model();
		obj2.name = 'two';
		obj2.save(function(err, response)
		{
			Model.fetchByName('two', function(err, itemlist)
			{
				should.not.exist(err);
				itemlist.should.be.an('array');
				itemlist.length.should.be.above(1);
				Model.destroyMany(itemlist, function(err, response)
				{
					should.not.exist(err);
					// TODO examine response more carefully
					done();
				});
			});
		});
	});

	// remaining uncovered cases:
	// saveAttachment() -- just a passthrough to cradle, so very low value
	// handleAttachments() -- only called by initFromStorage(), not sure it's ever been exercised

	after(function(done)
	{
		Model.adapter.db.destroy(function(err, response)
		{
			// swallow any errors because we don't actually care
			done();
		});
	});

});

