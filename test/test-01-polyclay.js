// Unit tests for the polyclay model framework.

/*global describe:true, it:true, before:true, after:true */

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should()
	;

var
	polyclay = require('../index'),
	util = require('util')
	;

require('mocha-as-promised')();

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
		pointer: 'reference'
	},
	optional: [ 'computed', 'ephemeral' ],
	required: [ 'name', 'is_valid', 'required_prop'],
	singular: 'model',
	plural: 'models',
	enumerables:
	{
		enum1: ['zero', 'one', 'two'],
		enum2: ['alpha', 'beta', 'gamma']
	},
	methods:
	{
		supplied: function() { return true; }
	},
	initialize: function()
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

	it('runs the provided initialize() function on instance construction', function()
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

	it('throws when setting a string property to a non-string', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.name = true;
		}

		badSetter.should.throw(Error);
	});

	it('throws when setting a number property to a non-number', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.count = 'string';
		}

		badSetter.should.throw(Error);
	});

	it('throws when setting an array property to a non-array', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.foozles = 'string';
		}

		badSetter.should.throw(Error);
	});

	it('throws when setting a hash property to a non-object', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.snozzers = 'string';
		}

		badSetter.should.throw(Error);
	});

	it('throws when setting a boolean property to a non-boolean', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.is_valid = 'string';
		}

		badSetter.should.throw(Error);
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

		var ref = { key: 'testref', foo: 'bar' };
		instance.pointer = ref;
		instance.pointer.should.be.an('object');
		instance.pointer_id.should.equal('testref');
	});

	it('sets singular and plural properties on the prototype', function()
	{
		var obj = new Model();
		obj.singular.should.equal('model');
		obj.plural.should.equal('models');
	});

	it('clears references when they are set to falsey values', function()
	{
		var obj = new Model();
		var target = new Model();
		target.key = 'foo';
		obj.pointer = target;
		obj.pointer.should.equal(target);
		obj.pointer_id.should.equal('foo');
		obj.pointer = null;
		should.not.exist(obj.pointer);
		obj.pointer_id.length.should.equal(0);
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

	it('date setters parse ISO 8601-style strings', function()
	{
		var DateModel = polyclay.Model.buildClass({ properties: { timestamp: 'date' } });
		var obj = new DateModel();
		obj.timestamp = '2013-07-10T17:59:03.628Z';
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
		var lucidprops = ['on', 'set', 'pipe', 'once', 'off', 'trigger', 'listeners'];

		for (var i = 0; i < instanceProps.length; i++)
		{
			name = instanceProps[i];
			if (lucidprops.indexOf(name) > -1)
				continue;
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

	it('should set the default value upon initial access', function()
	{
		var obj = new Model();
		obj.snozzers.widget = true;
		obj.snozzers.should.equal(obj.snozzers);
		obj.snozzers.widget.should.be.ok;
	});

	it('validates property types in setters', function()
	{
		var notAString = function() { instance.name = 0; };
		var notANumber = function() { instance.count = "four"; };
		var notADate   = function() { instance.created = 'Invalid Date'; };
		notAString.should.throw(Error);
		notANumber.should.throw(Error);
		notADate.should.throw(Error);
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

	it('markDirty() sets the dirty bit', function()
	{
		var obj = new Model();
		obj.__dirty.should.be.false;
		obj.markDirty();
		obj.__dirty.should.be.true;
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
		instance.__attributes.required_prop = undefined;
		instance.__attributes.is_valid = undefined;
		instance.__attributes.created = undefined;
		instance.__attributes.foozles = [];

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
		errors.should.not.have.property('foozles');
		errors.should.not.have.property('name');
	});

	it('emits a valid JSON string even when properties are invalid', function()
	{
		var serialized = instance.toJSON();
		serialized.should.be.an('object');
		JSON.stringify(instance).should.be.a('string');
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

		var serialized = instance.toJSON();
		serialized.should.be.an('object');

		var json = JSON.stringify(serialized);
		json.should.be.a('string');
		var struct = JSON.parse(json);

		struct.should.have.property('computed');
		struct.should.not.have.property('ephemeral');

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.should.have.property(checklist[i]);
	});

	describe('#update', function()
	{
		it('updates all known properties', function()
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

		it('ignores primitive argument values', function()
		{
			var obj = new Model();
			should.not.throw(function() { obj.update(); });
			should.not.throw(function() { obj.update(null); });
			should.not.throw(function() { obj.update('snozzers'); });
			should.not.throw(function() { obj.update(false); });
		});
	});

	it('emits a "change" event when a property is set', function(done)
	{
		var obj = new Model();
		obj.on('change', function(val)
		{
			assert.equal(val, 9000, 'change event did not send new value');
			done();
		});
		obj.count = 9000;
	});

	it('emits a "change.propname" event when a property is set', function(done)
	{
		var obj = new Model();
		obj.on('change.count', function(val)
		{
			assert.equal(val, 9001, 'change.field event did not send new value');
			done();
		});
		obj.count = 9001;
	});

	it('emits change events for optional properties', function(done)
	{
		var obj = new Model();
		obj.on('change.ephemeral', function(val)
		{
			assert.equal(val, 'fleeting', 'change.field event did not send new value');
			done();
		});
		obj.ephemeral = 'fleeting';
	});

	it('emits an event on rollback', function(done)
	{
		var obj = new Model();
		obj.on('rollback', function()
		{
			assert.equal(obj.name, 'blort');
			assert.equal(obj.count, 9000);
			assert.ok(!obj.isDirty(), 'object is still dirty after rollback');
			done();
		});

		obj.count = 9000;
		obj.name = 'blort';
		obj.clearDirty();
		obj.name = 'foo';
		obj.count = 2000;

		obj.rollback();
	});

	it('emits an event on update', function(done)
	{
		var data = {
			is_valid: true,
			foozles: ['three', 'four'],
			count: 50,
			required_prop: 'badges'
		};
		var obj = new Model();
		obj.on('update', function()
		{
			done();
		});
		obj.update(data);
	});

	it('PolyClay.addType() can add a new type', function()
	{
		polyclay.addType(
		{
			name: 'testtype',
			validatorFunc: function(v) { return v.length > 0; },
			defaultFunc: function() { return 'test'; },
		});

		polyclay.validTypes.indexOf('testtype').should.be.above(-1);
		polyclay.validate.should.have.property('testtype');
		polyclay.typeDefaults.should.have.property('testtype');
	});

	it('newly-added types can be used to build models', function()
	{
		var TestModel = polyclay.Model.buildClass({ properties: { testtype: 'testtype' } });
		var obj = new TestModel();

		obj.should.have.property('testtype');
		obj.testtype.should.equal('test');
		obj.testtype = 'okay';
		obj.testtype.should.equal('okay');

		function shouldThrow()
		{
			obj.testtype = '';
		}

		shouldThrow.should.throw(Error);
	});

});
