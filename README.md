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

`:optional`
: Array of string names of properties the model might have. Optional properties don't have types, but they do have convenient getters & setters defined for you. They are also persisted in CouchDB if they are present. 

`required`
: Array of string names of properties that must be present. The model will not validate if required properties are missing.

`enumerables`
: Integer property that is constrained to values in the given array of strings. The provided setter accepts either integer or string name values. The provided getter returns the string. The value persisted in the database is an int.

`methods`
: Hash of methods to add to the object. You can instead decorate the returned constructor prototype with object methods. 

`_init`
: Function to call as the last step of the returned constructor. [[ say more ]]

### Valid data types

Polyclay properties must have types declared. Getters and setter functions will be defined for each that enforce the types. Supported types are:

`string`
: strings; undefined and null are disallowed; default is empty string

`array`
: arrays; default is [] or new Array()

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
        assert(dbwidget.owner_id === fred._id);
        assert(!dbwidget.owner);
    });
});
```

## Validation

TBD

## API

`buildClass()`

`valid()`

Returns true if all required properties are present, the values of all typed properties are acceptable, and `validator()` (if defined on the model) returns true.

`rollback()`

Roll back the values of fields to the last stored value. (Probably could be better.)

`serialize()`

Serialize the model as a hash. Includes optional properties.

`toJSON()`

Serialize the model as a string by calling `JSON.stringify()`. Includes optional properties.

`clearDirty()`

Clears the dirty bit. The model cannot be rolled back after this is called. Is called by the persistence layer on a successful save.


## Persisting in Couch

TBD


## Example

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

polyclay.persist(Comment);

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
* Consider removing the dependency on cradle


## License

MIT
