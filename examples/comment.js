var
	polyclay = require('../index'),
	persistence = require('../lib/persistence'),
	;

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
	initialize: function()
	{
		this.created = Date.now();
		this.modified = this.created;
		this.editable = true;
		this.version = 1;
		this.state = 0;
	},
});

polyclay.persist(Comment);
Comment.prototype.modelPlural = 'comments';
