# Polyclay

Polymer modeling clay for node.js. A model schema definition with type validations, dirty-state tracking, and rollback. Is optionally persistable to CouchDB using [cradle]().

Requires lodash: `npm install lodash`
But can probably work just fine with plain [underscore.js](http://underscorejs.com/).

### Property types

properties
: named properties with type enforcement in the provided getters and setters. If you [[etc]]

### Valid data types

string
: strings; undefined and null are disallowed

array
: [] or new Array()

number
: any number

boolean
: true/false

date
: attribute setter can take a date object, a milliseconds number, or a parseable date string.

hash
: object/hashmap/associative array

### Ennumerables

TBD

### Optional properties

TBD

### Required properties

TBD

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

* Remove dependency on cradle, which appears to be abandonware
* Clean up attachments API


## License

MIT
