/*global describe:true, it:true, before:true, after:true */

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should(),
	fs = require('fs'),
	path = require('path'),
	polyclay = require('../index'),
	util = require('util'),
	MockDBAdapter = require('./mock-adapter')
	;

var testDir = process.cwd();
if (path.basename(testDir) !== 'test')
	testDir = path.join(testDir, 'test');
var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

describe('dataLength()', function()
{
	it('handles null data', function()
	{
		var len = polyclay.dataLength(null);
		len.should.equal(0);
	});

	it('handles Buffer data', function()
	{
		var len = polyclay.dataLength(attachmentdata);
		len.should.equal(6776);
	});

	it('handles ascii string data', function()
	{
		var len = polyclay.dataLength('cat');
		len.should.equal(3);
	});

	it('handles non-ascii string data', function()
	{
		var len = polyclay.dataLength('crème brûlée');
		len.should.equal(15);
	});
});

describe('persistence layer', function()
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
		singular: 'model',
		plural: 'models',
		initialize: function()
		{
			this.ran_init = true;
			this.on('after-load', this.afterLoad.bind(this));
		},
		methods:
		{
			afterLoad: function() { this.afterLoad = true; }
		}
	};

	var Model, instance, another, hookTest, hookid;

	before(function()
	{
		Model = polyclay.Model.buildClass(modelDefinition);
	});

	it('adds functions to the prototype when persist is called', function()
	{
		polyclay.persist(Model, 'key');
		Model.prototype.save.should.be.a('function');
		Model.prototype.destroy.should.be.a('function');
	});

	it('adds class methods to the Model function', function()
	{
		Model.setStorage.should.be.a('function');
		Model.get.should.be.a('function');
		Model.getBatch.should.be.a('function');
		Model.all.should.be.a('function');
		Model.provision.should.be.a('function');
	});

	it('handles models without persistable fields', function()
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'image/jpeg');

		var obj = new Ephemeral();
		obj.should.be.an('object');
		obj.should.have.property('test');
		obj.should.have.property('fetch_test');
	});

	it('can be passed a key field', function()
	{
		var Ephemeral = polyclay.Model.buildClass(
		{
			properties:
			{
				'id': 'string'
			}
		});
		polyclay.persist(Ephemeral, 'id');

		var keyprop = Object.getOwnPropertyDescriptor(Ephemeral.prototype, 'key');

		keyprop.should.be.ok;
		keyprop.should.be.an('object');

		var obj = new Ephemeral();
		obj.key = '4';

		var obj2 = new Ephemeral();
		obj2.key = 'foo';

		assert(obj2.id === 'foo', obj2.id + ' !== ' + obj2.key);
		assert(obj.id === '4', obj.id + ' !== ' + obj.key);
	});

	it('stores the name of the key field on the prototype', function()
	{
		var Ephemeral = polyclay.Model.buildClass(
		{
			properties:
			{
				'id': 'string'
			}
		});
		polyclay.persist(Ephemeral, 'id');

		var obj = new Ephemeral();
		obj.should.have.property('keyfield');
		obj.keyfield.should.be.a('string');
		assert(obj.keyfield === 'id', 'keyfield property not on object!');
	});

	it('throws when passed a model without polyclay attributes', function()
	{
		var willThrow = function()
		{
			function Bad()
			{
				this.foo = 'bar';
			}
			polyclay.persist(Bad);
		};

		willThrow.should.throw(Error);
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

	it('sets the db adapter in setStorage()', function()
	{
		Model.setStorage({}, MockDBAdapter);
		Model.should.have.property('adapter');
		assert.ok(Model.adapter instanceof MockDBAdapter);
	});


	it('emits before-save', function(done)
	{
		var obj = new Model();
		obj.key = '1';
		obj.on('before-save', function()
		{
			done();
		});
		obj.save(function(err, resp)
		{
			should.not.exist(err);
		});
	});

	it('emits after-save', function(done)
	{
		var obj = new Model();
		obj.key = '2';
		obj.on('after-save', function()
		{
			done();
		});
		obj.save(function(err, resp)
		{
			should.not.exist(err);
		});
	});

	it('emits after-load', function(done)
	{
		Model.get('1', function(err, obj)
		{
			should.not.exist(err);
			obj.afterLoad.should.be.ok;
			done();
		});
	});

	it('emits before-destroy', function(done)
	{
		Model.get('1', function(err, obj)
		{
			obj.on('before-destroy', function()
			{
				done();
			});

			obj.destroy(function(err, destroyed)
			{
				should.not.exist(err);
			});
		});
	});

	it('emits after-destroy', function(done)
	{
		Model.get('2', function(err, obj)
		{
			obj.on('after-destroy', function()
			{
				obj.destroyed.should.equal(true);
				done();
			});

			obj.destroy(function(err, destroyed)
			{
				should.not.exist(err);
				destroyed.should.be.ok;
			});
		});
	});

	it('emits change events for attachments', function(done)
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'text/plain');

		var obj = new Ephemeral();
		obj.on('change.test', function()
		{
			done();
		});
		obj.test = 'i am an attachment';
	});

	it('emits change events when attachments are removed', function(done)
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'text/plain');
		Ephemeral.setStorage({}, MockDBAdapter);

		var obj = new Ephemeral();
		obj.test = 'i am an attachment';
		obj.save(function(err, resp)
		{
			obj.on('change.test', function()
			{
				done();
			});
			obj.removeAttachment('test', function(err, resp)
			{
				should.not.exist(err);
			});
		});
	});

	it('propertyType() returns a hash of types for properties', function()
	{
		var obj = new Model();

		var types = obj.propertyTypes();
		types.should.be.an('object');

	});

});
