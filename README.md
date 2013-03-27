# Polyclay

Polymer modeling clay for node.js. A model schema definition with type validations, dirty-state tracking, and rollback. Models are optionally persistable to CouchDB using [cradle](https://github.com/cloudhead/cradle), to [Redis](http://redis.io/), or to [LevelUP](https://github.com/rvagg/node-levelup). Polyclay gives you the safety of type-enforcing properties without making you write a lot of boilerplate. 

Current version: __1.2.0__

[![Build Status](https://secure.travis-ci.org/ceejbot/polyclay.png)](http://travis-ci.org/ceejbot/polyclay)

## Installing

`npm install polyclay`

## Building a model

Polyclay builds a model constructor function from options that you pass to its `buildClass` function, similar to the way Backbone builds constructors. 

```javascript
var MyModel = polyclay.model.buildClass(options);
```

Valid options:

`properties`
: hash of named properties with types; see detailed discussion below

`optional`
: Array of string names of properties the model might have. Optional properties don't have types, but they do have convenient getters & setters defined for you. They are also persisted in CouchDB if they are present. 

`required`
: Array of string names of properties that must be present. The model will not validate if required properties are missing.

`enumerables`
: enum; a property that is constrained to values in the given array of strings. The provided setter accepts either integer or string name values. The provided getter returns the string. The value persisted in the database is an int representing the position in the array.

`methods`
: Hash of methods to add to the object. You can instead decorate the returned constructor prototype with object methods. 

`initialize`
: Function to call as the last step of the returned constructor. Provide an implementation to do any custom initialization for your model.`this` will be the newly constructed object.

`singular`
: The singular noun to use to describe your model. For example, "comment". Added to the model prototype as `Model.prototype.singular`.

`plural`
: The plural noun to use to describe your model; used by the persistence layer to name a database when appropriate. For example, "comments". Added to the model prototype as `Model.prototype.plural`.

### Valid data types

Polyclay properties must have types declared. Getters and setter functions will be defined for each that enforce the types. Supported types are:

`string`
: string; undefined and null are disallowed; default is empty string

`array`
: array; default is [] or new Array()

`number`
: any number; default is 0

`boolean`
: true/false; default is false

`date`
: attribute setter can take a date object, a milliseconds number, or a parseable date string; default is new Date()

`hash`
: object/hashmap/associative array/dictionary/choose your lingo; default is {}

`reference`
: pointer to another polyclay object; see documentation below; default is `null`

### References

*Reference* properties are pointers to other polyclay-persisted objects. When Polyclay builds a reference property, it provides two sets of getter/setters. First, it defines a `model.reference_id` property, which is a string property that tracks the `key` of the referred-to object. It also defines `model.reference()` and `model.set_reference()` functions, used to define the js property `model.reference`. This provides runtime-only access to the pointed-to object. Inflating it later is an exercise for the application using this model and the persistence layer.

In this example, widgets have an `owner` property that points to another object:

```javascript
var Widget = polyclay.Model.buildClass({
    properties:
    {
        _id: 'string', // couchdb key
        name: 'string',
        owner: 'reference'
    },
    singular: 'widget',
    plural: 'widgets'
});
polyclay.persist(Widget);

var widget = new Widget();
widget.name = 'eludium phosdex';
widget.owner = marvin; // marvin is an object we have already from somewhere else
assert(widget.owner_id === marvin.key);
assert(widget.owner === marvin);
widget.save(function(err)
{
    var id = widget.key.
    Widget.get(id, function(err, dbwidget)
    {
    	// the version from the db will have the id saved, 
    	// but not the full marvin object
        assert(dbwidget.owner_id === marvin.key);
        assert(dbwidget.owner === undefined);
    });
});
```

### Temporary fields

You can set any other fields on an object that you want for run-time purposes. polyclay prefixes all of its internal properties with `__` (double underscore) to avoid conflicts with typical field names.

### Validating

Validate an object by calling `valid()`. This method returns a boolean: true if valid, false if not. It tests if all typed properties contain valid data and if all required properties. If your model prototype defines a `validator()` method, this method will be called by `valid()`.

If an object has errors, an `errors` field will be set. This field is a hash. Keys are the names of invalid fields and values are textual descriptions of the problem with the field.

`invalid data`: property value does not match the required type  
`missing`: required property is missing


### Methods added to model prototypes

`obj.valid()`

Returns true if all required properties are present, the values of all typed properties are acceptable, and `validator()` (if defined on the model) returns true.

`obj.rollback()`

Roll back the values of fields to the last stored value. (Probably could be better.)

`obj.serialize()`

Serialize the model as a hash. Includes optional properties.

`obj.toJSON()`

Serialize the model as a string by calling `JSON.stringify()`. Includes optional properties.

`obj.clearDirty()`

Clears the dirty bit. The object cannot be rolled back after this is called. This is called by the persistence layer on a successful save.

## Persisting in CouchDB, Redis, or LevelUP

Once you've built a polyclay model, you can mix persistence methods into it:

````javascript
polyclay.persist(ModelFunction, '_id');
polyclay.persist(RedisModelFunc, 'name');
```

You can then set up its access to CouchDB by giving it an existing Cradle connection object plus the name of the database where this model should store its objects. The couch adapter wants two fields in its options hash: a cradle connection and a database name. For instance:

```javascript
var adapterOptions =
{
	connection: new cradle.Connection(),
	dbname: 'widgets'
};
ModelFunction.setStorage(adapterOptions, polyclay.CouchAdapter);
```

Every model instance has a pointer to the adapter on its `adapter` field. The adapter in turn gives you access to the cradle connection on `obj.adapter.connection` and the database on `obj.adapter.db`.

For the redis adapter, specify host & port of your redis server. The 'dbname' option is used to namespace keys. The redis adapter will store models in hash keys of the form `<dbname>:<key>`. It will also use a set at key `<dbname>:ids` to track model ids.

```javascript
var options =
{
	host: 'localhost',
	port: 6379,
	dbname: 'widgets'
};
ModelFunction.setStorage(options, polyclay.RedisAdapter);
```

The redis client is available at `obj.adapter.redis`.

For LevelUP:

```javascript
var options =
{
	dbpath: '/path/to/leveldb/dir',
	dbname: 'widgets'
};
ModelFunction.setStorage(options, polyclay.LevelupAdapter);
```

The Levelup object is available at `obj.adapter.db`. The attachments data store is available at `obj.adapter.attachdb`.

### Defining views

You can define views to be added to your couch databases when they are created.  Add a `design` field to your constructor function directly. 

Let's add some simple views to the Widget model we created above, one to fetch widgets by owner and one to fetch them by name.

```javascript
Widget.design =
{
	views:
	{
		by_owner: { map: "function(doc) {\n  emit(doc.owner_id, doc);\n}", language: "javascript" },
		by_name: { map: "function(doc) {\n  emit(doc.name, doc);\n}", language: "javascript" }
	}
};
```

Call `Widget.provision()` to create the 'widgets' database in your CouchDB instance. It will have a design document named "_design/widgets" with the two views above defined. The provision method nothing for Redis- or LevelUP-backed models.

### Persistence class methods

`provision(function(err, couchResponse))`

Create the database the model expects to use in couch. Create any views for the db that are specified in the `design` field. Does nothing for Redis and LevelUP.

`ModelFunction.get(id, function(err, object))`

Fetch an object from the database using the provided id.

`ModelFunction.all(function(err, objectArray))`

Fetch all objects from the database. It's up to you not to shoot yourself in the foot with this one.

`ModelFunction.constructMany(couchDocs, function(err, objectArray))`

Takes a list of couch response documents produced by calls to couch views, and uses them to inflate objects. You will use this class method when writing wrappers for couch views. For a simple example, see class Comment's findByOwner() method below. (Not exercised by the other adapters.)

`ModelFunction.destroyMany(idArray, function(err, response))`

Takes a list of object ids to remove. Responds with err if any failed, and an array of responses from couch or redis.


### Persistence instance methods

`obj.save(function(err, response))`

Save the model to the db. Works on new objects as well as updated objects that have already been persisted. If the object was not given a `key` property before the call, the property will be filled in with whatever couch chose. The LevelUP and Redis adapters both demand that you provide a key before calling save(). Does nothing if the object is not marked as dirty.

`obj.destroy(function(err, wasDestroyed))`

Removed the object from couch and set its `destroyed` flag. The object must have a `key`.

`obj.merge(hash, function(err, response))`

Update the model with fields in the supplied hash, then save the result to the backing store. 

`obj.removeAttachment(name, function(err, wasRemoved))`

Remove the named attachment. Responds with wasRemoved == true if the operation was successful.

`obj.initFromStorage(hash)`

Initialize a model from data returned by the backing store. You are unlikely to call this, but it's available.


### Attachments

You can define attachments for your polyclay models and several convenience methods will be added to the prototype for you. Give your attachment a name and a mime type:

`ModelFunc.defineAttachment(name, mimetype);`

The prototype will have `get_name` and `set_name` functions added to it, wrapped into the property *name*. Also, `fetch_name` will be defined to fetch the attachment data asynchronously from backing storage. Attachment data is saved when the model is saved, not when it is set using the property.

You can also save and remove attachments directly:

`obj.saveAttachment(name, function(err, response))`  
`obj.removeAttachment(name, function(err, response))`

A simple example:

```javascript
ModelFunc.defineAttachment('rendered', 'text/html');
ModelFunc.defineAttachment('avatar', 'image/jpeg');

var obj = new ModelFunc();
obj.avatar = fs.readFileSync('avatar.jpg');
console.log(obj.isDirty); // true

obj.save(function(err, resp)
{
	// attachment is now persisted in storage.
	// Also, obj's _rev has been updated.
	obj.avatar = null;
	obj.save(function(err, resp2)
	{
		// the avatar attachment has been removed
		// obj._rev has been updated again
	});
});
```

### Before & after hooks

If you supply the following methods on your model class, they will be called when their names suggest:

`afterLoad()`: after a document has been loaded from storage & a model instantiated  
`beforeSave()`: before a document is saved to storage in `save()`  
`afterSave()`: after a save to storage has succeeded, before callback  
`beforeDestroy()`: before deleting a model from storage in `destroy()`

## Mixins

A bundle of fields and methods that you wish to add to several model classes while allowing Polyclay to reduce the boilerplate for you.

Here's an example. It defines two date fields and a method that uses one:

```javascript
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

polyclay.mixin(ModelClass, HasTimestamps);
```

Mixin objects have three fields.

`properties`: A hash of property names & types, exactly as in a base model definition.  
`methods`: A hash of method names & implementations to add to the model prototype.  
`custom`: A hash of custom functions to add to the model prototype as getters & setters. 

Here's a simple example of a custom property:

```javascript
var SillyNameMixin =
{
	custom:
	{
		name:
		{
			'getter': function() { return this._name; },
			'setter': function(v) { this._name = v.toLowerCase(); }
		}
	}
}
```

## Example

Here's an example taken verbatim from the project I wrote this module for:

```javascript
var Comment = polyclay.Model.buildClass(
{
    properties:
    {
        _id: 'string', // couchdb key
        version: 'number',
        owner: 'reference',
        owner_handle: 'string',
        target: 'reference',
        parent: 'reference',
        title: 'string',
        content: 'string',
        editable: 'boolean'
    },
    enumerables:
    {
        state: ['visible', 'hidden', 'deleted', 'usergone']
    },
    optional: [ '_rev' ],
    required: [ 'owner_id', 'target_id', 'parent_id', 'state'],
    initialize: function()
    {
        this.created = Date.now();
        this.modified = this.created;
        this.editable = true;
        this.version = 1;
        this.state = 0;
    },
});

Comment.design =
{
	views:
	{
		by_target: { map: "function(doc) {\n  emit(doc.target_id, doc);\n}", language: "javascript" },
		by_owner: { map: "function(doc) {\n  emit(doc.owner_id, doc);\n}", language: "javascript" },
		by_owner_target: { map: "function(doc) {\n  emit(doc.owner_id + '|' + doc.target_id, doc);\n}", language: "javascript" },
	}
};

Comment.findByOwner = function(owner, callback)
{
	if (typeof owner === 'object')
		owner = owner.key;

	Comment.adapter.db.view('comments/by_owner', { key: owner }, function(err, documents)
	{
		if (err) return callback(err);
		Comment.constructMany(documents, callback);
	});
};

polyclay.mixin(Comment, HasTimestamps); // as defined above
polyclay.persist(Comment, '_id');

var opts =
{
	connection: new cradle.Connection(),
	dbname: 'comments'
};
Comment.setStorage(opts, polyclay.CouchAdapter);
Comment.provision(function(err, response)
{
	// database is now created & the views available to use
}); 


var comment = new Comment();
console.log(comment.state);
comment.version = "foo"; // throws an error
comment.version = 2; // sets the attribute
comment.state = 'yoinks'; // throws an error
comment.state = 'deleted';
console.log(comment.state);
comment.state = 1;
console.log(comment.state);
comment.touch();
console.log(comment.isDirty()); // true

comment.rollback(); // version is now 1 and modified the same as created
comment.tempfield = 'whatever'; // not persisted in couch
```

## License

MIT
