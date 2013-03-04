/*global describe:true, it:true, before:true, after:true */

var
	chai = require('chai'),
	assert = chai.assert,
	expect = chai.expect,
	should = chai.should()
	;

var
	polyclay = require('../lib/polyclay'),
	mixins = require('../lib/mixins'),
	util = require('util')
	;


describe('mixins', function()
{
	var Model1, Model2;

	var model1 =
	{
		properties:
		{
			name: 'string',
		},
		required: [ 'created', 'name' ],
	};

	var model2 =
	{
		properties:
		{
			foozle: 'string',
		},
		required: [ 'modified', 'foozle' ],
	};

	var HasTimestamps =
	{
		properties:
		{
			created: 'date',
			modified: 'date'
		},
		methods:
		{
			touch: function() { this.modified = Date.now(); }
		}
	};

	var HasVersion =
	{
		properties:
		{
			version: 'number'
		},
		methods:
		{
			upgrade: function() { this.version++; }
		},
		custom:
		{
			fred:
			{
				getter: function() { return this._antifred; },
				setter: function(f) { this._fred = f; this._antifred = f + ' NOT!'; }
			}
		}
	};

	beforeEach(function()
	{
		Model1 = polyclay.Model.buildClass(model1);
		Model2 = polyclay.Model.buildClass(model2);
	});

	it('adds properties to a model prototype', function()
	{
		mixins.mixin(Model1, HasTimestamps);
		var instance = new Model1();
		var proto = Object.getPrototypeOf(instance);

		var property = Object.getOwnPropertyDescriptor(proto, 'created');
		property.should.be.an('object');
		property.should.have.property('get');
		property.should.have.property('set');
	});

	it('adds methods to a model prototype', function()
	{
		mixins.mixin(Model1, HasTimestamps);
		Model1.prototype.should.have.property('touch');
		Model1.prototype.touch.should.be.a('function');
	});

	it('adds custom getters & setters for custom properties', function()
	{
		mixins.mixin(Model1, HasVersion);
		var instance = new Model1();
		var proto = Object.getPrototypeOf(instance);

		var property = Object.getOwnPropertyDescriptor(proto, 'fred');
		property.should.be.an('object');
		property.should.have.property('get');
		property.should.have.property('set');

		instance.fred = 'foo';
		instance._antifred.should.equal('foo NOT!');
	});

	it('can add more than one mixin to a prototype', function()
	{
		mixins.mixin(Model1, HasTimestamps);
		mixins.mixin(Model1, HasVersion);
		Model1.prototype.should.have.property('touch');
		Model1.prototype.touch.should.be.a('function');
		Model1.prototype.should.have.property('upgrade');
		Model1.prototype.upgrade.should.be.a('function');
	});

});
