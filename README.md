# Polyclay

Polymer modeling clay for node.js. A model schema definition with type validations, dirty-state tracking, and rollback. Is optionally persistable to CouchDB using [cradle](https://github.com/cloudhead/cradle).

The package.json requires [lodash](https://github.com/bestiejs/lodash) as a dependency, but it'll be perfectly fine with [underscore](https://github.com/documentcloud/underscore) instead.

[![Build Status](https://secure.travis-ci.org/ceejbot/polyclay.png)](http://travis-ci.org/ceejbot/polyclay)

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

`_init`
: Function to call as the last step of the returned constructor. The name is prefixed with a single underscore. (meh) Provide an implementation to do any custom initialization for your model.`this` will be the newly constructed object.

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

## References

*Reference* properties are pointers to other Couch-persisted objects. When Polyclay builds a reference property, it provides two sets of getter/setters. First, it defines a `model.reference_id` property, which is a string property that tracks the `_id` of the referred-to object. It also defines `model.reference()` and `model.set_reference()` functions, used to define the js property `model.reference`. This provides runtime-only access to the pointed-to object. Inflating it later is an exercise for the application using this model and the persistence layer.

In this example, widgets have an `owner` property that points to another object:

```javascript
var Widget = polyclay.Model.buildClass({
    properties:
    {
        _id: 'string', // couchdb key
        owner: 'reference'
    }
});
polyclay.persist(Widget);

var widget = new Widget();
widget.owner = fred; // fred is an object we have already from somewhere else
assert(widget.owner_id === fred._id);
assert(widget.owner === fred);
widget.save(function(err)
{
    var id = widget._id.
    Widget.get(id, function(err, dbwidget)
    {
    	// the version from the db will have the id saved, 
    	// but not the full fred object
        assert(dbwidget.owner_id === fred._id);
        assert(dbwidget.owner === undefined);
    });
});
```

## Temporary fields

You can set any other fields on an object that you with for run-time purposes. polyclay prefixes all of its internal properties with `__` (double underscore) to avoid conflicts with typical field names.

## Validation

Validate an object by calling `valid()`. This method returns a boolean: true if valid, false if not. It tests if all typed properties contain valid data and if all required properties. If your model prototype defines a `validator()` method, this method will be called by `valid()`.

If an object has errors, an `errors` field will be set. This field is a hash. Keys are the names of invalid fields and values are textual descriptions of the problem with the field.

`invalid data`: property value does not match the required type  
`missing`: required property is missing


## Methods added to model prototypes

### obj.valid()

Returns true if all required properties are present, the values of all typed properties are acceptable, and `validator()` (if defined on the model) returns true.

### obj.rollback()

Roll back the values of fields to the last stored value. (Probably could be better.)

### obj.serialize()

Serialize the model as a hash. Includes optional properties.

### obj.toJSON()

Serialize the model as a string by calling `JSON.stringify()`. Includes optional properties.

### clearDirty()

Clears the dirty bit. The model cannot be rolled back after this is called. Is called by the persistence layer on a successful save.


## Persisting in CouchDB

Once you've built a polyclay model, you can mix persistence methods into it:

`polyclay.persist(ModelFunction);`

You can then set up its access to CouchDB by giving it an existing Cradle connection object plus the name of the database where this model should store its objects:

```javascript
var conn = new cradle.Connection(options);
ModelFunction.configure(conn, 'databasename');
```


### Specifying views

TBD


### class methods

`provision(function(err, couchResponse)`

Create the database the model expects to use in couch. Create any views for the db that are specified in the `design` field.

`get(id, function(err, object)`

Fetch an object from the database using the provided id.

`all(function(err, objectArray)`

Fetch all objects from the database. It's up to you not to shoot yourself in the foot with this one.

`constructMany(couchDocs, function(err, objectArray)`

Takes a list of couch response documents produced by calls to couch views, and uses them to inflate objects. You will use this class method when writing wrappers for couch views. For a simple example, see class Comment's findByOwner() method below.

`destroyMany(idArray, function(err, couchResponseArray))`

Takes a list of object ids to remove. Responds with err if any failed, and an array of responses from couch.


### instance methods

`save(function(err, couchResponse))`

Save the model to the db. Works on new objects as well as updated objects that have already been persisted. If the object was not given an `_id` property before the call, the property will be filled in with whatever couch chose. Does nothing if the object is not marked as dirty.

`destroy(function(err, wasDestroyed))`

Removed the object from couch and set its `destroyed` flag. The object must have an `_id`.

`merge(hash, function(err, couchResponse))`

Update the model with fields in the supplied hash, then save the result to couch.

`removeAttachment(name, function(err, wasRemoved)`

Remove the named attachment. Responds with wasRemoved == true if the operation was successful.

`initFromStorage(hash)`

Initialize a model from data returned by couchdb. You are unlikely to call this, but it's available.


## Attachments

TBD

## Before & after hooks

If you supply the following methods on your model class, they will be called when their names suggest:

`afterLoad()`: after a document has been loaded from couch & a model instantiated  
`beforeSave()`: before a document is saved to couch in `save()`  
`afterSave()`: after a save to couch has succeeded, before callback  
`beforeDestroy()`: before deleting a model from couch in `destroy()`


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
        created: 'date',
        modified: 'date',
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
    _init: function()
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
		owner = owner._id;

	Comment.adapter.db.view('comments/by_owner', { key: owner }, function(err, documents)
	{
		if (err) return callback(err);
		Comment.constructMany(documents, callback);
	});
};

polyclay.persist(Comment);
var cradleconn = new cradle.Connection();
Comment.configure(cradleconn, 'comments');
// create the database
Comment.provision(function(err, response)
{
	// err should not exist
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
comment.modified = Date.now();
console.log(comment.__dirty); // true

comment.rollback(); // version is now 1 and modified undefined
comment.tempfield = 'whatever'; // not persisted in couch
```


## TODO

* Documentation
* Clean up attachments API
* Improve rollback behavior & write some vicious tests for it
* Rethink that enumerable implementation
* Probably should just denormalize enums to make them less fragile
* Consider removing the dependency on cradle
* Persistence layer is tangled with model layer in a couple of places
* Should add a way to specify a key/id attribute name to generalize away from couchdb a bit
* Nuke the underscore in `_init` ✓


## License

MIT
