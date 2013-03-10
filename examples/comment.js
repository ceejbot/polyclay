var
	cradle = require('cradle'),
	polyclay = require('../index');

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

Comment.prototype.plural = 'comments';
Comment.prototype.singular = 'comment';

Comment.design =
{
	views:
	{
		by_target: { map: "function(doc) {\n  emit(doc.target_id, doc);\n}", language: "javascript" },
		by_owner: { map: "function(doc) {\n	 emit(doc.owner_id, doc);\n}", language: "javascript" },
		by_owner_target: { map: "function(doc) {\n	emit(doc.owner_id + '|' + doc.target_id, doc);\n}", language: "javascript" },
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

polyclay.persist(Comment, '_id');

var opts =
{
	connection: new cradle.Connection(),
	dbname: 'comments'
};
Comment.setStorage(opts, polyclay.CouchAdapter);

// create the database
Comment.provision(function(err, response)
{
	// err should not exist
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

	comment.save(function(err, response)
	{
		// comment should now be stored in couch
	});
});


