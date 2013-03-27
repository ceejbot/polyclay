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
	util = require('util')
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
	});

	it('adds functions to the prototype when persist is called', function()
	{
		polyclay.persist(Model);
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

});
