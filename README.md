# Polyclay

Polymer modeling clay for node.js. A model schema definition with type validations, dirty-state tracking, and rollback. Is optionally persistable to CouchDB using [cradle]().

Requires lodash: `npm install lodash`
But can probably work just fine with plain [underscore.js](http://underscorejs.com/).

### Property types

properties
: named properties with type enforcement in the provided getters and setters. If you 

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

### Optional properties

### Required properties

## Persisting in Couch

### Example

```javascript
var Person = polyclay.Model.buildClass(
{
	properties:
	{
		_id: 'string', // couchdb key
		version: 'number',
		handle: 'string',
		created: 'date',
		modified: 'date',
		p_password: 'string',
		email_primary: 'string',
		email_addresses: 'array', // of string
		email_validated: 'array', // of boolean
		security_question: 'string',
		security_answer: 'string',
		icon: 'string',
		profile: 'string',
		last_login: 'date'
	},
	enumerables: {
		authtype: ['password', 'persona']
	},
	optional: [ '_rev' ],
	required: [ 'handle', 'authtype', 'email_primary' ],
	_init: function()
	{
		this.authtype = 'password';
		this.created = Date.now();
		this.p_password = '';
		this.last_login = new Date(0);
		this.version = 1;
	},
});

var person = new Person();
console.log(person.authtype);
person.version = "foo"; // throws an error
person.version = 2; // sets the attribute
person.authtype = 'unknown'; // throws an error
person.modified = Date.now();
console.log(person.__dirty); // true

person.rollback(); // version is now 1 and modified undefined
person.tempfield = 'whatever'; // not persisted in 
```


## TODO

* Remove dependency on cradle, which appears to be abandonware
* Clean up attachments API


## License

MIT
