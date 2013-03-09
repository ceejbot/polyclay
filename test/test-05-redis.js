/*global describe:true, it:true, before:true, after:true */

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should()
	;

var
	fs = require('fs'),
	path = require('path'),
	polyclay = require('../index'),
	redis = require('redis'),
	util = require('util')
	;

var testDir = process.cwd();
if (path.basename(testDir) !== 'test')
	testDir = path.join(testDir, 'test');
var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

describe('redis adapter', function()
{
	var modelDefinition =
	{
		properties:
		{
			key: 'string',
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
		initialize: function()
		{
			this.ran_init = true;
		},
		methods:
		{
			beforeSave: function() { this.beforeSaveCalled = true; },
			afterSave: function() { this.afterSaveCalled = true; },
			afterLoad: function() { this.afterLoadCalled = true; },
			beforeDestroy: function() { this.beforeDestroyCalled = true; },
		}
	};

	var Model, instance, another, hookTest, hookid;

	before(function()
	{
		Model = polyclay.Model.buildClass(modelDefinition);
		Model.prototype.modelPlural = 'models';
		polyclay.persist(Model);
	});

	it('can be configured for database access', function()
	{
		var options =
		{
			host: 'localhost',
			port: 6379,
			dbname: 'test'
		};

		Model.configure(options, polyclay.RedisAdapter);
		Model.adapter.should.be.ok;
		Model.adapter.redis.should.be.ok;
	});

	it('throws when asked to save a document without a key', function()
	{
		var noID = function()
		{
			var obj = new Model();
			obj.name = 'idless';
			obj.save(function(err, reply)
			{
			});
		};

		noID.should.throw(Error);
	});

	it('can save a document in the db', function(done)
	{
		instance = new Model();
		instance.update(
		{
			key: '1',
			name: 'test',
			created: Date.now(),
			foozles: ['three', 'two', 'one'],
			snozzers: { field: 'value' },
			is_valid: true,
			count: 3,
			required_prop: 'requirement met',
			computed: 17
		});

		instance.save(function(err, reply)
		{
			should.not.exist(err);
			reply.should.be.ok;
			done();
		});
	});

	it('can retrieve the saved document', function(done)
	{
		Model.get(instance.key, function(err, retrieved)
		{
			should.not.exist(err);
			retrieved.should.be.ok;
			retrieved.should.be.an('object');
			retrieved.key.should.equal(instance.key);
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
		instance.name = "New name";
		instance.__dirty.should.be.true;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			response.should.be.a('string');
			response.should.equal('OK');
			instance.isDirty().should.equal(false);
			done();
		});
	});


	it('can fetch in batches', function(done)
	{
		var ids = [ instance.key ];
		var obj = new Model();
		obj.name = 'two';
		obj.key = '2';
		obj.save(function(err, response)
		{
			ids.push(obj.key);

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
			itemlist.length.should.equal(2);
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
		Model.get('2', function(err, item)
		{
			should.not.exist(err);

			item.merge({ is_valid: true, count: 1023 }, function(err, response)
			{
				should.not.exist(err);
				Model.get(item.key, function(err, stored)
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
		instance.save(function(err, response)
		{
			should.not.exist(err);
			instance.isDirty().should.equal.false;
			done();
		});
	});

	it('can retrieve attachments', function(done)
	{
		Model.get(instance.key, function(err, retrieved)
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
			Model.get(instance.key, function(err, retrieved)
			{
				should.not.exist(err);
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
			Model.get(instance.key, function(err, retrieved)
			{
				should.not.exist(err);
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
		instance.isDirty().should.equal(true);
		instance.saveAttachment('frogs', function(err, response)
		{
			should.not.exist(err);
			instance.isDirty().should.equal(false);
			done();
		});
	});

	it('can remove an attachment', function(done)
	{
		instance.removeAttachment('frogs', function(err, deleted)
		{
			should.not.exist(err);
			deleted.should.be.true;
			done();
		});
	});


	it('caches an attachment after it is fetched', function(done)
	{
		instance.avatar = attachmentdata;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			instance.__dirty.should.be.false;
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
			Model.get(instance.key, function(err, retrieved)
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
		hookTest.key = '3';
		hookTest.name = 'hook test';

		hookTest.should.not.have.property('beforeSaveCalled');
		hookTest.save(function(err, res)
		{
			should.not.exist(err);
			hookid = hookTest.key;
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

	it('calls afterLoad() after loading a model from the db', function(done)
	{
		hookTest.should.not.have.property('afterLoadCalled');
		Model.get(hookid, function(err, loaded)
		{
			should.not.exist(err);
			loaded.should.have.property('afterLoadCalled');
			loaded.afterLoadCalled.should.equal(true);
			done();
		});
	});

	it('calls beforeDestroy() before destroying a model', function(done)
	{
		hookTest.should.not.have.property('beforeDestroyCalled');
		hookTest.destroy(function(err, deleted)
		{
			should.not.exist(err);
			hookTest.should.have.property('beforeDestroyCalled');
			hookTest.beforeDestroyCalled.should.equal(true);
			done();
		});
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
		obj2.key = '4';
		obj2.name = 'two';
		obj2.save(function(err, response)
		{
			Model.get('2', function(err, obj)
			{
				should.not.exist(err);
				obj.should.be.an('object');

				var itemlist = [obj, obj2];
				Model.destroyMany(itemlist, function(err, response)
				{
					should.not.exist(err);
					// TODO examine response more carefully
					done();
				});
			});
		});
	});

	it('destroyMany() does nothing when given empty input', function(done)
	{
		Model.destroyMany(null, function(err)
		{
			should.not.exist(err);
			done();
		});
	});

	it('destroy responds with an error when passed an object without an id', function(done)
	{
		var obj = new Model();
		obj.destroy(function(err, destroyed)
		{
			err.should.be.an('object');
			err.message.should.equal('cannot destroy object without an id');
			done();
		});
	});

	it('destroy responds with an error when passed an object that has already been destroyed', function(done)
	{
		var obj = new Model();
		obj.key = 'foozle';
		obj.destroyed = true;
		obj.destroy(function(err, destroyed)
		{
			err.should.be.an('object');
			err.message.should.equal('object already destroyed');
			done();
		});
	});

	after(function(done)
	{
		done();
	});

});
