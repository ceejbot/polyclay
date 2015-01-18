/*global describe:true, it:true, before:true, after:true */

var
    demand   = require('must'),
    polyclay = require('../index'),
    util     = require('util')
	;

var modelDefinition =
{
	properties:
	{
        key:           'string',
        name:          'string',
        created:       'date',
        foozles:       'array',
        snozzers:      'hash',
        is_valid:      'boolean',
        count:         'number',
        required_prop: 'string',
        pointer:       'reference',
        freeform:      'untyped'
    },
    optional:    [ 'computed', 'ephemeral' ],
    required:    [ 'name', 'is_valid', 'required_prop'],
    singular:    'model',
    plural:      'models',
    index:       [ 'key', 'name' ],
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
		Model.must.be.a.function();
		instance = new Model();
		instance.must.be.instanceof(Model);
	});

	it('runs the provided initialize() function on instance construction', function()
	{
		instance.ran_init.must.be.true();
		delete instance.ran_init;
	});

	it('adds any methods in the options to the prototype', function()
	{
		Model.prototype.must.have.property('supplied');
		Model.prototype.supplied.must.be.a.function();
		instance.supplied().must.equal(true);
	});

	it('sets the `__index` property on the prototype if index is in the options', function()
	{
		Model.prototype.must.have.property('__index');
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
			property.must.be.an.object();
			property.must.have.property('get');
			property.must.have.property('set');
		}
	});

	it('throws when asked to build a property of an unknown type', function()
	{
		var buildBad = function()
		{
			var badModel = { properties: { foo: 'bar' } };
			var MyBadClass = polyclay.Model.buildClass(badModel);
		};

		buildBad.must.throw(Error);
	});

	it('throws when setting a string property to a non-string', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.name = true;
		}

		badSetter.must.throw(Error);
	});

	it('throws when setting a number property to a non-number', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.count = 'string';
		}

		badSetter.must.throw(Error);
	});

	it('throws when setting an array property to a non-array', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.foozles = 'string';
		}

		badSetter.must.throw(Error);
	});

	it('throws when setting a hash property to a non-object', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.snozzers = 'string';
		}

		badSetter.must.throw(Error);
	});

	it('throws when setting a boolean property to a non-boolean', function()
	{
		function badSetter()
		{
			var obj = new Model();
			obj.is_valid = 'string';
		}

		badSetter.must.throw(Error);
	});

	it('accepts null for boolean properties', function()
	{
		var obj = new Model();
		obj.is_valid = null;
	});

	it('provides getters & setters for optional properties', function()
	{
		var property, name;
		var checklist = modelDefinition.optional;
		var proto = Object.getPrototypeOf(instance);

		for (var i = 0; i < checklist.length; i++)
		{
			name = checklist[i];
			instance.name.must.be.falsy();
			property = Object.getOwnPropertyDescriptor(proto, name);
			property.must.be.an.object();
			property.must.have.property('get');
			property.must.have.property('set');

			instance[name] = 'calc ' + name;
		}
	});

	it('provides getters & setters for reference properties', function()
	{
		var proto = Object.getPrototypeOf(instance);
		var property = Object.getOwnPropertyDescriptor(proto, 'pointer');
		property.must.be.an.object();
		property.must.have.property('get');
		property.must.have.property('set');

		property = Object.getOwnPropertyDescriptor(proto, 'pointer_id');
		property.must.be.an.object();
		property.must.have.property('get');
		property.must.have.property('set');

		var ref = { key: 'testref', foo: 'bar' };
		instance.pointer = ref;
		instance.pointer.must.be.an.object();
		instance.pointer_id.must.equal('testref');
	});

	it('returns a bare object as default reference', function()
	{
		var obj = new Model();
		var def = obj.pointer;
		def.must.be.an.object();
		Object.keys(def).length.must.equal(0);
	});

	it('sets singular and plural properties on the prototype', function()
	{
		var obj = new Model();
		obj.singular.must.equal('model');
		obj.plural.must.equal('models');
	});

	it('clears references when they are set to falsey values', function()
	{
		var obj = new Model();
		var target = new Model();
		target.key = 'foo';
		obj.pointer = target;
		obj.pointer.must.equal(target);
		obj.pointer_id.must.equal('foo');
		obj.pointer = null;
		obj.pointer_id.length.must.equal(0);
	});

	it('string setters turn nulls into empty strings', function()
	{
		var StringModel = polyclay.Model.buildClass({ properties: { description: 'string' } });
		var obj = new StringModel();
		obj.description = 'some text';
		obj.description = null;
		obj.description.must.be.a.string();
		obj.description.must.equal('');
	});

	it('date setters handle numeric input', function()
	{
		var DateModel = polyclay.Model.buildClass({ properties: { timestamp: 'date' } });
		var obj = new DateModel();
		obj.timestamp = 1361326857895;
		obj.timestamp.must.be.a.date();
	});

	it('date setters parse string input', function()
	{
		var DateModel = polyclay.Model.buildClass({ properties: { timestamp: 'date' } });
		var obj = new DateModel();
		obj.timestamp = 'Tue Feb 19 2013 18:20:57 GMT-0800';
		obj.timestamp.must.be.a.date();
	});

	it('date setters parse ISO 8601-style strings', function()
	{
		var DateModel = polyclay.Model.buildClass({ properties: { timestamp: 'date' } });
		var obj = new DateModel();
		obj.timestamp = '2013-07-10T17:59:03.628Z';
		obj.timestamp.must.be.a.date();
	});

	it('requires that references be strings', function()
	{
		var badSetter = function() { instance.pointer_id = {}; };
		badSetter.must.throw(Error);
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
			property.must.be.an.object();
			property.must.have.property('get');
			property.must.have.property('set');
		}
	});

	it('adds enumerables to the properties list with type number', function()
	{
		var idx = instance.__properties.indexOf('enum1');
		idx.must.not.equal(-1);
		instance.__types['enum1'].must.equal('number');
	});

	it('can set an enumerable property by number', function()
	{
		instance.enum1 = 1;
		instance.enum1.must.equal('one');
		instance.enum2 = 2;
		instance.enum2.must.equal('gamma');
	});

	it('can set an enumerable property by value', function()
	{
		instance.enum1 = 'one';
		instance.enum1.must.equal('one');
		instance.__attributes['enum1'].must.equal(1);

		instance.enum2 = 'beta';
		instance.enum2.must.equal('beta');
		instance.__attributes['enum2'].must.equal(1);
	});

	it('setting an enum to empty string sets it to value 0', function()
	{
		var obj = new Model();
		obj.enum1 = 'one';
		obj.__attributes['enum1'].must.equal(1);
		obj.enum1 = '';
		obj.__attributes['enum1'].must.equal(0);
	});

	it('throws when attempting to set an enum to an illegal numeric value', function()
	{
		var invalidEnum = function() { instance.enum1 = 17; };
		invalidEnum.must.throw(Error);
	});

	it('throws when attempting to set an enum to an illegal string value', function()
	{
		var invalidEnum = function() { instance.enum1 = 'jibberjabber'; };
		invalidEnum.must.throw(Error);
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
			name.indexOf('__').must.equal(0);
		}
	});

	it('provides default values for each type', function()
	{
		var checklist = Object.keys(modelDefinition.properties);
		var obj = new Model();
		for (var i = 0; i < checklist.length; i++)
			obj.must.have.property(checklist[i]);
	});

	it('should set the default value upon initial access', function()
	{
		var obj = new Model();
		obj.snozzers.widget = true;
		obj.snozzers.must.equal(obj.snozzers);
		obj.snozzers.widget.must.exist();
	});

	it('validates property types in setters', function()
	{
		var notAString = function() { instance.name = 0; };
		var notANumber = function() { instance.count = "four"; };
		var notADate   = function() { instance.created = 'Invalid Date'; };
		notAString.must.throw(Error);
		notANumber.must.throw(Error);
		notADate.must.throw(Error);
	});

	it('setting a property marks the model dirty', function()
	{
		instance.name = 'new name';
		instance.__dirty.must.be.true();
	});

	it('can clear the dirty state', function()
	{
		instance.clearDirty();
		instance.__dirty.must.be.false();
		Object.keys(instance.__attributesPrev).length.must.equal(0);
	});

	it('markDirty() sets the dirty bit', function()
	{
		var obj = new Model();
		obj.__dirty.must.be.false();
		obj.markDirty();
		obj.__dirty.must.be.true();
	});

	it('can roll back to previous version of model', function()
	{
		instance.name = 'second name';
		instance.name.must.equal('second name');
		instance.__dirty.must.be.true();
		instance.rollback().must.exist();
		instance.name.must.equal('new name');
	});

	it('can roll back enumerable properties', function()
	{
		var another = new Model();
		var initial = another.enum1;
		another.enum1 = 2;
		another.enum1.must.equal('two');
		another.__dirty.must.be.true();
		another.rollback().must.exist();
		another.enum1.must.equal(initial);
	});

	it('rollback() returns false when there is nothing to roll back', function()
	{
		var another = new Model();
		another.rollback().must.equal(false);
	});

	it('complains about missing required properties in valid()', function()
	{
		instance.__attributes.required_prop = undefined;
		instance.__attributes.is_valid = undefined;
		instance.__attributes.created = undefined;
		instance.__attributes.foozles = [];

		instance.valid().must.be.false();
		var errors = instance.errors;
		Object.keys(errors).length.must.be.above(0);
		errors.must.have.property('required_prop');
		errors.must.have.property('is_valid');
	});

	it('does not complain about invalid data for unset properties', function()
	{
		instance.valid().must.be.false();
		var errors = instance.errors;
		Object.keys(errors).length.must.be.above(0);
		errors.must.not.have.property('created');
		errors.must.not.have.property('foozles');
		errors.must.not.have.property('name');
	});

	it('complains about type mismatches', function()
	{
		instance.__attributes.is_valid = 'no';

		instance.valid().must.be.false();
		var errors = instance.errors;
		Object.keys(errors).length.must.be.above(0);
		errors.must.have.property('is_valid');
		errors.is_valid.must.equal('invalid data');
	});

	it('emits a valid JSON string even when properties are invalid', function()
	{
		var serialized = instance.toJSON();
		serialized.must.be.an.object();
		JSON.stringify(instance).must.be.a.string();
	});

	it('serializes missing properties to defaults', function()
	{
		var struct = instance.serialize();
		struct.must.be.an.object();

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.must.have.property(checklist[i]);

		struct.count.must.equal(0);
		struct.foozles.length.must.equal(0);
	});

	it('serializes when properties are valid', function()
	{
		instance.created = Date.now();
		instance.is_valid = false;
		instance.foozles = ['one', 'two'];
		instance.snozzers = {};
		instance.count = 1;
		instance.required_prop = 'satisfied';
		instance.freeform = 'whatever';

		var struct = instance.serialize();
		struct.must.be.an.object();

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.must.have.property(checklist[i]);
	});

	it('calls a custom validation function when one is present', function()
	{
		instance.valid().must.exist();
		Model.prototype.validator = function() { return false; };
		instance.valid().must.be.false();
	});

	it('includes all checked properties & only set checked properties in toJSON()', function()
	{
		instance.ephemeral = undefined;

		var serialized = instance.toJSON();
		serialized.must.be.an.object();

		var json = JSON.stringify(serialized);
		json.must.be.a.string();
		var struct = JSON.parse(json);

		struct.must.have.property('computed');
		struct.must.not.have.property('ephemeral');

		var checklist = expectedProperties;
		for (var i = 0; i < checklist.length; i++)
			struct.must.have.property(checklist[i]);
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

			obj.required_prop.must.equal(data.required_prop);
			obj.count.must.equal(data.count);
			obj.is_valid.must.equal(data.is_valid);
		});

		it('ignores primitive argument values', function()
		{
			var obj = new Model();
			function update1() { obj.update(); }
			function update2() { obj.update(null); }
			function update3() { obj.update('snozzers'); }
			function update4() { obj.update(false); }

			update1.must.not.throw();
			update2.must.not.throw();
			update3.must.not.throw();
			update4.must.not.throw();
		});
	});

	it('emits a "change" event when a property is set', function(done)
	{
		var obj = new Model();
		obj.on('change', function(val)
		{
			val.must.equal(9000);
			done();
		});
		obj.count = 9000;
	});

	it('emits a "change.propname" event when a property is set', function(done)
	{
		var obj = new Model();
		obj.on('change.count', function(val)
		{
			val.must.equal(9001);
			done();
		});
		obj.count = 9001;
	});

	it('emits change events for optional properties', function(done)
	{
		var obj = new Model();
		obj.on('change.ephemeral', function(val)
		{
			val.must.equal('fleeting');
			done();
		});
		obj.ephemeral = 'fleeting';
	});

	it('emits an event on rollback', function(done)
	{
		var obj = new Model();
		obj.on('rollback', function()
		{
			obj.name.must.equal('blort');
			obj.count.must.equal(9000);
			obj.isDirty().must.be.false();
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

		polyclay.validTypes.indexOf('testtype').must.be.above(-1);
		polyclay.validate.must.have.property('testtype');
		polyclay.typeDefaults.must.have.property('testtype');
	});

	it('newly-added types can be used to build models', function()
	{
		var TestModel = polyclay.Model.buildClass({ properties: { testtype: 'testtype' } });
		var obj = new TestModel();

		obj.must.have.property('testtype');
		obj.testtype.must.equal('test');
		obj.testtype = 'okay';
		obj.testtype.must.equal('okay');

		function shouldThrow()
		{
			obj.testtype = '';
		}

		shouldThrow.must.throw(Error);
	});

});
