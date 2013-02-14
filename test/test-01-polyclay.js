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
	enumerables: {
		enum1: ['zero', 'one', 'two'],
		enum2: ['alpha', 'beta', 'gamma']
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

	it('defines getters and setters', function()
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

	it('throws when attempting to set an enum to an illegal value', function()
	{
		var invalidEnum = function() { instance.enum1 = 17; };
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
		for (var i = 0; i < checklist.length; i++)
			instance.should.have.property(checklist[i]);
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

});
