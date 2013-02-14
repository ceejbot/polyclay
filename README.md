# Polyclay

Polymer modeling clay for node.js. A model schema definition with type validations, dirty-state tracking, and rollback. Is optionally persistable to CouchDB using [cradle]().

The package.json requires [lodash](https://github.com/bestiejs/lodash) as a dependency, but it'll be perfectly fine with [underscore](https://github.com/documentcloud/underscore) instead.

[![Build Status](https://secure.travis-ci.org/ceejbot/polyclay.png)](http://travis-ci.org/ceejbot/polyclay)

### Property types

properties
: named properties with type enforcement in the provided getters and setters. If you [[etc]]

### Valid data types

Polyclay properties must have types declared. Getters and setter functions will be defined for each that enforce the types. Supported types are:

string
: strings; undefined and null are disallowed; default is empty string

array
: arrays; default is [] or new Array()

number
: any number; default is 0

boolean
: true/false; default is false

date
: attribute setter can take a date object, a milliseconds number, or a parseable date string; default is new Date()

hash
: object/hashmap/associative array/dictionary/choose your lingo; default is {}

reference
: pointer to another polyclay object; see documentation below; default is `null`

### Enumerables

TBD

### Optional properties

Optional properties don't have types, but they do have convenient getters & setters defined for you. They are also persisted in CouchDB if they are present. 

### Required properties

TBD

The model will not validate if required properties are missing.

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
* Remove dependency on cradle, which appears to be abandonware
* Clean up attachments API
* Improve rollback behavior & write some vicious tests for it


## License

MIT
