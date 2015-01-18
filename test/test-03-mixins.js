/*global describe:true, it:true, before:true, after:true, beforeEach: true */

var
    demand   = require('must'),
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
		},
		statics:
		{
			comparator: function comparator(l, r) { return l.created.getTime() - r.created.getTime(); },
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
		property.must.be.an.object();
		property.must.have.property('get');
		property.must.have.property('set');
	});

	it('adds methods to a model prototype', function()
	{
		mixins.mixin(Model1, HasTimestamps);
		Model1.prototype.must.have.property('touch');
		Model1.prototype.touch.must.be.a.function();
	});

	it('adds static methods to the model constructor', function()
	{
		mixins.mixin(Model1, HasTimestamps);
		Model1.must.have.property('comparator');
		Model1.comparator.must.be.a.function();
	});

	it('adds custom getters & setters for custom properties', function()
	{
		mixins.mixin(Model1, HasVersion);
		var instance = new Model1();
		var proto = Object.getPrototypeOf(instance);

		var property = Object.getOwnPropertyDescriptor(proto, 'fred');
		property.must.be.an.object();
		property.must.have.property('get');
		property.must.have.property('set');

		instance.fred = 'foo';
		instance._antifred.must.equal('foo NOT!');
	});

	it('can add more than one mixin to a prototype', function()
	{
		mixins.mixin(Model1, HasTimestamps);
		mixins.mixin(Model1, HasVersion);
		Model1.prototype.must.have.property('touch');
		Model1.prototype.touch.must.be.a.function();
		Model1.prototype.must.have.property('upgrade');
		Model1.prototype.upgrade.must.be.a.function();
	});

});
