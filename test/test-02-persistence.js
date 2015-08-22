/*global describe:true, it:true, before:true, after:true */

var
    demand        = require('must'),
    fs            = require('fs'),
    P             = require('p-promise'),
    path          = require('path'),
    polyclay      = require('../index'),
    util          = require('util'),
    MockDBAdapter = require('./mock-adapter')
	;

var testDir = process.cwd();
if (path.basename(testDir) !== 'test')
	testDir = path.join(testDir, 'test');
var attachmentdata = fs.readFileSync(path.join(testDir, 'test.png'));

function compareBuffers(left, right)
{
	if (left.length !== right.length)
		return left.length - right.length;

	for (var i = 0; i < left.length; i++)
	{
		if (left[i] !== right[i]) return (left[i] - right[i]);
	}

	return 0;
}

describe('dataLength()', function()
{
	it('handles null data', function()
	{
		var len = polyclay.dataLength(null);
		len.must.equal(0);
	});

	it('handles Buffer data', function()
	{
		var len = polyclay.dataLength(attachmentdata);
		len.must.equal(6776);
	});

	it('handles ascii string data', function()
	{
		var len = polyclay.dataLength('cat');
		len.must.equal(3);
	});

	it('handles non-ascii string data', function()
	{
		var len = polyclay.dataLength('crème brûlée');
		len.must.equal(15);
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
		},
		methods:
		{
			afterSave: function() { this._afterSave = true; },
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
		Model.prototype.save.must.be.a.function();
		Model.prototype.destroy.must.be.a.function();
	});

	it('adds class methods to the Model function', function()
	{
		Model.setStorage.must.be.a.function();
		Model.get.must.be.a.function();
		Model.getBatch.must.be.a.function();
		Model.all.must.be.a.function();
		Model.provision.must.be.a.function();
	});

	it('handles models without persistable fields', function()
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'image/jpeg');

		var obj = new Ephemeral();
		obj.must.be.an.object();
		obj.must.have.property('test');
		obj.must.have.property('fetch_test');
		obj.must.have.property('set_test');
	});

	it('can be passed a key field', function()
	{
		var Ephemeral = polyclay.Model.buildClass(
		{
			properties:
			{
				id: 'string'
			}
		});
		polyclay.persist(Ephemeral, 'id');

		var keyprop = Object.getOwnPropertyDescriptor(Ephemeral.prototype, 'key');

		keyprop.must.exist();
		keyprop.must.be.an.object();

		var obj = new Ephemeral();
		obj.key = '4';

		var obj2 = new Ephemeral();
		obj2.key = 'foo';

		obj2.id.must.equal('foo');
		obj.id.must.equal('4');
	});

	it('stores the name of the key field on the prototype', function()
	{
		var Ephemeral = polyclay.Model.buildClass(
		{
			properties: { id: 'string' }
		});
		polyclay.persist(Ephemeral, 'id');

		var obj = new Ephemeral();
		obj.id = 'foo';
		obj.must.have.property('keyfield');
		obj.keyfield.must.be.a.string();
		obj.keyfield.must.equal('id');
		obj.must.have.property('key');
		obj.key.must.equal('foo');

		obj.key = 'bar';
		obj.id.must.equal('bar');
	});

	it('defaults the key field name to `key` when none is provided', function()
	{
		var Ephemeral = polyclay.Model.buildClass(
		{
			properties: { key: 'string' }
		});
		polyclay.persist(Ephemeral);

		var obj = new Ephemeral();
		obj.must.have.property('keyfield');
		obj.keyfield.must.be.a.string();
		obj.keyfield.must.equal('key');
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

		willThrow.must.throw(Error);
	});

	it('destroyMany() does nothing when given empty input', function(done)
	{
		Model.destroyMany(null)
		.then(function(result)
		{
			demand(result).be.null();
			done();
		}).done();
	});

	it('destroy responds with an error when passed an object without an id', function(done)
	{
		var obj = new Model();
		obj.destroy()
		.then(function(reply)
		{
			demand(reply).not.exist();
		})
		.fail(function(err)
		{
			err.must.exist();
			err.must.be.instanceof(Error);
			err.message.must.equal('cannot destroy object without an id');
			done();
		}).done();
	});

	it('destroy responds with an error when passed an object that has already been destroyed', function(done)
	{
		var obj = new Model();
		obj.key = 'foozle';
		obj.destroyed = true;

		obj.destroy()
		.then(function(reply)
		{
			demand(reply).not.exist();
		})
		.fail(function(err)
		{
			err.must.exist();
			err.must.be.instanceof(Error);
			err.message.must.equal('object already destroyed');
			done();
		}).done();
	});

	it('sets the db adapter in setStorage()', function()
	{
		Model.setStorage({}, MockDBAdapter);
		Model.must.have.property('adapter');
		Model.adapter.must.be.instanceof(MockDBAdapter);
	});

	it('accepts callbacks and promises', function(done)
	{
		var obj = new Model();
		obj.key = 'nodeified';

		obj.save(function(err, response)
		{
			demand(err).not.exist();
			done();
		});
	});

	it('emits before-save', function(done)
	{
		var obj = new Model();
		obj.key = '1';

		var gotEvent = false;
		obj.on('before-save', function() { gotEvent = true; });

		obj.save()
		.then(function()
		{
			gotEvent.must.be.true();
			done();
		}).done();
	});

	it('emits after-save', function(done)
	{
		var obj = new Model();
		obj.key = '2';

		var gotEvent = false;
		obj.on('after-save', function() { gotEvent = true; });

		obj.save().then(function()
		{
			gotEvent.must.be.true();
			done();
		}).done();
	});

	it('emits before-destroy', function(done)
	{
		var obj;
		var gotEvent = false;

		return Model.get('1')
		.then(function(r)
		{
			obj = r;
			obj.on('before-destroy', function() { gotEvent = true; });
			return obj.destroy();
		}).then(function(ok)
		{
			ok.must.be.true();
			gotEvent.must.be.true();
			done();
		}).done();
	});

	it('emits after-destroy', function(done)
	{
		var obj;

		Model.get('2')
		.then(function(r)
		{
			obj = r;
			obj.on('after-destroy', done);
			return obj.destroy();
		}).then(function(ok)
		{
			ok.must.be.true();
		}).done();
	});

	it('emits change events for attachments', function(done)
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'text/plain');

		var obj = new Ephemeral();

		obj.on('change.test', done);
		obj.test = 'i am an attachment';
	});

	var AttachModel;

	it('can save attachments', function(done)
	{
		AttachModel = polyclay.Model.buildClass({ properties: { key: 'string' } });
		polyclay.persist(AttachModel);
		AttachModel.defineAttachment('test', 'application/json');
		AttachModel.setStorage({}, MockDBAdapter);

		var obj = new AttachModel();
		obj.key = 'attach';

		obj.test = new Buffer('[1, 2, 3]');

		return obj.saveAttachment('test')
		.then(function() { return obj.save(); })
		.then(function(ok) { done(); })
		.done();
	});

	it('can retrieve attachments', function(done)
	{
		var obj;

		return AttachModel.get('attach')
		.then(function(r)
		{
			obj = r;
			return obj.fetch_test();
		})
		.then(function(body)
		{
			Buffer.isBuffer(body).must.be.true();
			compareBuffers(body, new Buffer('[1, 2, 3]')).must.equal(0);

			var attach = obj.__attachments.test;
			attach.must.exist();
			compareBuffers(body, attach.body).must.equal(0);

			attach.content_type.must.equal('application/json');
			attach.__dirty.must.be.false();

			done();
		}).done();
	});

	it('emits change events when attachments are removed', function(done)
	{
		var Ephemeral = polyclay.Model.buildClass({});
		polyclay.persist(Ephemeral);
		Ephemeral.defineAttachment('test', 'text/plain');
		Ephemeral.setStorage({}, MockDBAdapter);

		var obj = new Ephemeral();
		obj.test = 'i am an attachment';

		obj.on('change.test', function(v)
		{
			done();
		});

		return obj.save()
		.then(function()
		{
			return obj.removeAttachment('test');
		})
		.then(function(results)
		{
			console.log(results);
		})
		.done();
	});

	it('propertyTypes() returns a hash of types for properties', function()
	{
		var obj = new Model();

		var types = obj.propertyTypes();
		types.must.be.an.object();
	});

	it('propertyType() can query the type of a specific property', function()
	{
		var obj = new Model();

		obj.propertyType('key').must.equal('string');
		obj.propertyType('required_prop').must.equal('string');
		obj.propertyType('ephemeral').must.equal('untyped');
		demand(obj.propertyType('nonexistent')).not.exist();
	});

	it('clearDirty() wipes the dirty bit');
	it('clearDirty() wipes the dirty bit on all attachments');

});
