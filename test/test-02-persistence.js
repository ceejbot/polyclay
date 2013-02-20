// Unit tests for the polyclay model framework.

// tell jshint about mocha
/*global describe:true, it:true, before:true, after:true */

(function() {

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should()
	;

var
	fs = require('fs'),
	path = require('path'),
	persistence = require('../lib/persistence'),
	polyclay = require('../lib/polyclay'),
	util = require('util')
	;

describe('persistence layer', function()
{
	var testDir = process.cwd();
	if (path.basename(testDir) !== 'test')
		testDir = path.join(testDir, 'test');

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
		_init: function()
		{
			this.ran_init = true;
		}
	};

	var couch_config =
	{
		couch_host: 'localhost',
		couch_port: 5984,
		couch_db: 'polyclay_tests'
	};

	var Model, instance, another;
	var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

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
	});

	it('adds functions to the prototype when persist is called', function()
	{
		persistence.persist(Model);
		Model.name = 'model';
		Model.prototype.modelPlural = 'models';
		Model.prototype.save.should.be.a('function');
		Model.prototype.destroy.should.be.a('function');
	});

	it('adds class methods to the Model function', function()
	{
		Model.configure.should.be.a('function');
		Model.get.should.be.a('function');
		Model.getBatch.should.be.a('function');
		Model.all.should.be.a('function');
		Model.provision.should.be.a('function');
	});

	it('handles models without persistable fields', function()
	{
		var Ephemeral = polyclay.Model.buildClass({});
		persistence.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'image/jpeg');

		var obj = new Ephemeral();
		obj.should.be.an('object');
		obj.should.have.property('test');
		obj.should.have.property('fetch_test');
	});

	it('throws when passed a model without polyclay attributes', function()
	{
		var willThrow = function()
		{
			function Bad()
			{
				this.foo = 'bar';
			}
			persistence.persist(Bad);
		};

		willThrow.should.throw(Error);
	});

	it('can be configured for database access', function(done)
	{
		Model.configure(couch_config);
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
		done();
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
			instance.__dirty.should.be.false;
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
		instance.__dirty.should.be.true;
		instance.save(function(err, response)
		{
			should.not.exist(err);
			response.should.be.an('object');
			instance.__dirty.should.be.false;
			instance._rev.should.not.equal(prevRev);
			done();
		});
	});


	it('can fetch in batches', function(done)
	{
		done();
	});

	it('can fetch all', function(done)
	{
		done();
	});

	it('has a test for merge()', function(done)
	{
		done();
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
			instance.__dirty.should.be.false;
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

	it('removes an attachment when its data is set to null', function(done)
	{

	});

	it('caches an attachment after it is fetched', function(done)
	{
	});

	it('can delete a document from the db', function(done)
	{
		instance.destroy(function(err, deleted)
		{
			should.not.exist(err);
			deleted.should.be.ok;
			instance.deleted.should.be.true;
			done();
		});
	});
});
}.call(this));

