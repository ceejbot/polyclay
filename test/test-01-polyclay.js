// Unit tests for the polyclay model framework.

// tell jshint about mocha
/*global describe:true, it:true, before:true, after:true */

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should()
	;

var
	polyclay = require('../lib/polyclay'),
	util = require('util')
	;


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
		pointer: 'reference'
	},
	optional: [ 'computed', 'ephemeral' ],
	required: [ 'name', 'is_valid', 'required_prop'],
	enumerables:
	{
		enum1: ['zero', 'one', 'two'],
		enum2: ['alpha', 'beta', 'gamma']
	},
	methods:
	{
		supplied: function() { return true; }
	},
	_init: function()
	{
		this.ran_init = true;
	}
};

// TODO programmatically notice the reference properties
var expectedProperties =
[
	'name', 'created', 'foozles',
	'snozzers', 'is_valid', 'count',
	'required_prop',
	'pointer_id'
];

describe('polyclay', function()
{
	var Model, instance;

	it('can construct a model class from a definition', function()
	{
		Model = polyclay.Model.buildClass(modelDefinition);
		Model.should.be.a('function');
		instance = new Model();
		assert(instance instanceof Model, 'expected Model to be a constructor');
	});

	it('runs the provided _init() function on instance construction', function()
	{
		instance.ran_init.should.be.true;
		delete instance.ran_init;
	});

	it('adds any methods in the options to the prototype', function()
	{
		Model.prototype.should.have.property('supplied');
		(typeof Model.prototype.supplied).should.equal('function');
		instance.supplied().should.equal(true);
	});

	it('defines getters and setters for typed properties', function()
	{
		var property, name;
		var checklist = Object.keys(modelDefinition.properties);
		var proto = Object.getPrototypeOf(instance);

		for (var i = 0; i < checklist.length; i++)
		{
			name = checklist[i];
			property = Object.getOwnPropertyDescriptor(proto, name);
			property.should.be.an('object');
			property.should.have.property('get');
			property.should.have.property('set');
		}
	});

	it('throws when asked to build a property of an unknown type', function()
	{
		var buildBad = function()
		{
			var badModel = { properties: { foo: 'bar' } };
			var MyBadClass = polyclay.Model.buildClass(badModel);
		};

		buildBad.should.throw(Error);
	});

	it('provides getters & setters for optional properties', function()
	{
		var property, name;
		var checklist = modelDefinition.optional;
		var proto = Object.getPrototypeOf(instance);

		for (var i = 0; i < checklist.length; i++)
		{
			name = checklist[i];
			instance.should.not.have.property(name);
			property = Object.getOwnPropertyDescriptor(proto, name);
			property.should.be.an('object');
			property.should.have.property('get');
			property.should.have.property('set');

			instance[name] = 'calc ' + name;
		}
	});

	it('provides getters & setters for reference properties', function()
	{
		var proto = Object.getPrototypeOf(instance);
		var property = Object.getOwnPropertyDescriptor(proto, 'pointer');
		property.should.be.an('object');
		property.should.have.property('get');
		property.should.have.property('set');

		property = Object.getOwnPropertyDescriptor(proto, 'pointer_id');
		property.should.be.an('object');
		property.should.have.property('get');
		property.should.have.property('set');

		var ref = { _id: 'testref', foo: 'bar' };
		instance.pointer = ref;
		instance.pointer.should.be.an('object');
		instance.pointer_id.should.equal('testref');
	});

	it('string setters turn nulls into empty strings', function()
	{
		var StringModel = polyclay.Model.buildClass({ properties: { description: 'string' } });
		var obj = new StringModel();
		obj.description = 'some text';
		obj.description = null;
		obj.description.should.be.a('string');
		obj.description.should.equal('');
	});

	it('date setters handle numeric input', function()
	{
		var DateModel = polyclay.Model.buildClass({ properties: { timestamp: 'date' } });
		var obj = new DateModel();
		obj.timestamp = 1361326857895;
		obj.timestamp.should.be.a('date');
	});

	it('date setters parse string input', function()
	{
		var DateModel = polyclay.Model.buildClass({ properties: { timestamp: 'date' } });
		var obj = new DateModel();
		obj.timestamp = 'Tue Feb 19 2013 18:20:57 GMT-0800';
		obj.timestamp.should.be.a('date');
	});

	it('requires that references be strings', function()
	{
		var badSetter = function() { instance.pointer_id = {}; };
		badSetter.should.throw(Error);
	});

	it('provides getters & setters for enumerables', function()
	{
		var property, name;
		var checklist = Object.keys(modelDefinition.enumerables);

		var proto = Object.getPrototypeOf(instance);

		for (var i = 0; i < checklist.length; i++)
		{
			name = checklist[i];
			property = Object.getOwnPropertyDescriptor(proto, name);
			property.should.be.an('object');
			property.should.have.property('get');
			property.should.have.property('set');
		}
	});

	it('adds enumerables to the properties list with type number', function()
	{
		var idx = instance.__properties.indexOf('enum1');
		idx.should.not.equal(-1);
		instance.__types['enum1'].should.equal('number');
	});

	it('can set an enumerable property by number', function()
	{
		instance.enum1 = 1;
		instance.enum1.should.equal('one');
		instance.enum2 = 2;
		instance.enum2.should.equal('gamma');
	});

	it('can set an enumerable property by value', function()
	{
		instance.enum1 = 'one';
		instance.enum1.should.equal('one');
		instance.__attributes['enum1'].should.equal(1);

		instance.enum2 = 'beta';
		instance.enum2.should.equal('beta');
		instance.__attributes['enum2'].should.equal(1);
	});

	it('setting an enum to empty string sets it to value 0', function()
	{
		var obj = new Model();
		obj.enum1 = 'one';
		obj.__attributes['enum1'].should.equal(1);
		obj.enum1 = '';
		obj.__attributes['enum1'].should.equal(0);
	});

	it('throws when attempting to set an enum to an illegal numeric value', function()
	{
		var invalidEnum = function() { instance.enum1 = 17; };
		invalidEnum.should.throw(Error);
	});

	it('throws when attempting to set an enum to an illegal string value', function()
	{
		var invalidEnum = function() { instance.enum1 = 'jibberjabber'; };
		invalidEnum.should.throw(Error);
	});

	it('prefixes implementation detail properties with two underscores', function()
	{
		var name;
		var instanceProps = Object.getOwnPropertyNames(instance);
		for (var i = 0; i < instanceProps.length; i++)
		{
			name = instanceProps[i];
			assert(name.indexOf('__') === 0, 'model property "' + name + '" does not start with underscores');
		}
	});

	it('provides default values for each type', function()
	{
		var checklist = Object.keys(modelDefinition.properties);
		var obj = new Model();
		for (var i = 0; i < checklist.length; i++)
			obj.should.have.property(checklist[i]);
	});

	it('validates property types in setters', function()
	{
		var notAString = function() { instance.name = 0; };
		var notANumber = function() { instance.count = "four"; };
		notAString.should.throw(Error);
		notANumber.should.throw(Error);
	});

	it('setting a property marks the model dirty', function()
	{
		instance.name = 'new name';
		instance.__dirty.should.be.true;
	});

	it('can clear the dirty state', function()
	{
		instance.clearDirty();
		instance.__dirty.should.be.false;
		Object.keys(instance.__attributesPrev).length.should.equal(0);
	});

	it('can roll back to previous version of model', function()
	{
		instance.name = 'second name';
		instance.name.should.equal('second name');
		instance.__dirty.should.be.true;
		instance.rollback().should.be.ok;
		instance.name.should.equal('new name');
	});

	it('can roll back enumerable properties', function()
	{
		var another = new Model();
		var initial = another.enum1;
		another.enum1 = 2;
		another.enum1.should.equal('two');
		another.__dirty.should.be.true;
		another.rollback().should.be.ok;
		another.enum1.should.equal(initial);
	});

	it('rollback() returns false when there is nothing to roll back', function()
	{
		var another = new Model();
		another.rollback().should.equal(false);
	});

	it('complains about missing required properties in valid()', function()
	{
		instance.valid().should.not.be.ok;
		var errors = instance.errors;
		assert(Object.keys(errors).length > 0, 'expected at least one error');
		errors.should.have.property('required_prop');
		errors.should.have.property('is_valid');
	});

	it('complains about invalid data for unset properties', function()
	{
		instance.valid().should.not.be.ok;
		var errors = instance.errors;
		assert(Object.keys(errors).length > 0, 'expected at least one error');
		errors.should.have.property('created');
		errors.created.should.equal('invalid data');
		errors.should.have.property('foozles');
		errors.should.not.have.property('name');
	});

	it('emits a valid JSON string even when properties are invalid', function()
	{
		instance.toJSON().should.be.a('string');
	});

	it('serializes missing properties to defaults', function()
	{
		var struct = instance.serialize();
		struct.should.be.an('object');

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.should.have.property(checklist[i]);

		struct.count.should.equal(0);
		struct.foozles.length.should.equal(0);
	});

	it('serializes when properties are valid', function()
	{
		instance.created = Date.now();
		instance.is_valid = false;
		instance.foozles = ['one', 'two'];
		instance.snozzers = {};
		instance.count = 1;
		instance.required_prop = 'satisfied';

		var struct = instance.serialize();
		struct.should.be.an('object');

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.should.have.property(checklist[i]);
	});

	it('calls a custom validation function when one is present', function()
	{
		instance.valid().should.be.ok;
		Model.prototype.validator = function() { return false; };
		instance.valid().should.not.be.ok;
	});

	it('includes all checked properties & only set checked properties in toJSON()', function()
	{
		instance.ephemeral = undefined;

		var json = instance.toJSON();
		json.should.be.a('string');
		var struct = JSON.parse(json);

		struct.should.have.property('computed');
		struct.should.not.have.property('ephemeral');

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.should.have.property(checklist[i]);
	});

	it('updates all known properties in update()', function()
	{
		var data = {
			is_valid: true,
			foozles: ['three', 'four'],
			count: 50,
			required_prop: 'badges'
		};
		var obj = new Model();
		obj.update(data);

		obj.required_prop.should.equal(data.required_prop);
		obj.count.should.equal(data.count);
		obj.is_valid.should.equal(data.is_valid);
	});

});