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

var chaiAsPromised = require('chai-as-promised');
var P = require('p-promise');

require('mocha-as-promised')();
chai.use(chaiAsPromised);

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
		obj.should.have.property('set_test');
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
		obj.id = 'foo';
		obj.should.have.property('keyfield');
		obj.keyfield.should.be.a('string');
		assert(obj.keyfield === 'id', 'keyfield property not on object!');
		obj.should.have.property('key');
		obj.key.should.equal('foo');

		obj.key = 'bar';
		obj.id.should.equal('bar');
	});

	it('defaults the key field name to `key` when none is provided', function()
	{
		var Ephemeral = polyclay.Model.buildClass(
		{
			properties:
			{
				'key': 'string'
			}
		});
		polyclay.persist(Ephemeral);

		var obj = new Ephemeral();
		obj.should.have.property('keyfield');
		obj.keyfield.should.be.a('string');
		assert(obj.keyfield === 'key', 'keyfield property is not `key`!');
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

	it('destroyMany() does nothing when given empty input', function()
	{
		var promise = Model.destroyMany(null);
		return promise.should.become(null);
	});

	it('destroy responds with an error when passed an object without an id', function()
	{
		var obj = new Model();
		var promise = obj.destroy();
		return promise.should.be.rejected.with(Error, 'cannot destroy object without an id');
	});

	it('destroy responds with an error when passed an object that has already been destroyed', function()
	{
		var obj = new Model();
		obj.key = 'foozle';
		obj.destroyed = true;

		var promise = obj.destroy();
		return promise.should.be.rejected.with(Error, 'object already destroyed');
	});

	it('sets the db adapter in setStorage()', function()
	{
		Model.setStorage({}, MockDBAdapter);
		Model.should.have.property('adapter');
		assert.ok(Model.adapter instanceof MockDBAdapter);
	});

	it('emits before-save', function()
	{
		var obj = new Model();
		var beforeSaveDeferred = P.defer();

		obj.key = '1';
		obj.on('before-save', beforeSaveDeferred.resolve);

		return P.all([obj.save(), beforeSaveDeferred.promise]);
	});

	it('emits after-save', function()
	{
		var obj = new Model();
		var afterSaveDeferred = P.defer();

		obj.key = '2';
		obj.on('after-save', afterSaveDeferred.resolve);

		return P.all([obj.save(), afterSaveDeferred.promise]);
	});

	it('emits after-load', function()
	{
		return Model.get('1')
		.then(function(obj)
		{
			obj.afterLoad.should.be.ok;
		});
	});

	it('emits before-destroy', function()
	{
		return Model.get('1')
		.then(function(obj)
		{
			var beforeDestroyDeferred = P.defer();
			obj.on('before-destroy', beforeDestroyDeferred.resolve);

			return P.all([beforeDestroyDeferred.promise, obj.destroy()]);
		});
	});

	it('emits after-destroy', function()
	{
		return Model.get('2')
		.then(function(obj)
		{
			var afterDestroyDeferred = P.defer();
			obj.on('after-destroy', afterDestroyDeferred.resolve);

			return P.all([afterDestroyDeferred.promise, obj.destroy().should.become(true)]);
		});
	});

	it('emits change events for attachments', function()
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'text/plain');

		var obj = new Ephemeral();
		var changeDeferred = P.defer();

		obj.on('change.test', changeDeferred.resolve);
		obj.test = 'i am an attachment';

		return changeDeferred.promise;
	});

	var AttachModel;

	it('can save attachments', function()
	{
		AttachModel = polyclay.Model.buildClass({ properties: { key: 'string' } });
		polyclay.persist(AttachModel);
		AttachModel.defineAttachment('test', 'application/json');
		AttachModel.setStorage({}, MockDBAdapter);

		var obj = new AttachModel();
		obj.key = 'attach';

		obj.test = new Buffer('[1, 2, 3]');
		obj.test.should.deep.equal(new Buffer('[1, 2, 3]'));

		return obj.saveAttachment('test')
		.then(function() { return obj.save(); });
	});

	it('can retrieve attachments', function(done)
	{
		return AttachModel.get('attach')
		.then(function(obj)
		{
			return obj.fetch_test()
			.then(function(body)
			{
				Buffer.isBuffer(body).should.be.ok;
				body.should.deep.equal(new Buffer('[1, 2, 3]'));

				var attach = obj.__attachments.test;
				should.exist(attach);
				attach.body.should.equal(body);

				attach.content_type.should.equal('application/json');
				attach.__dirty.should.not.be.ok;
			});
		});
	});

	it('emits change events when attachments are removed', function()
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'text/plain');
		Ephemeral.setStorage({}, MockDBAdapter);

		var obj = new Ephemeral();
		obj.test = 'i am an attachment';

		return obj.save()
		.then(function()
		{
			var changeDeferred = P.defer();
			obj.on('change.test', changeDeferred.resolve);
			return P.all([obj.removeAttachment('test'), changeDeferred.promise]);
		});
	});

	it('propertyTypes() returns a hash of types for properties', function()
	{
		var obj = new Model();

		var types = obj.propertyTypes();
		types.should.be.an('object');

	});

	it('propertyType() can query the type of a specific property', function()
	{
		var obj = new Model();

		obj.propertyType('key').should.equal('string');
		obj.propertyType('required_prop').should.equal('string');
		obj.propertyType('ephemeral').should.equal('untyped');
		should.not.exist(obj.propertyType('nonexistent'));
	});

});
