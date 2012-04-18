## PolyClay

Polymer modeling clay for the browser. RESTful persistence, usable properties, collections, and change events. As simple as I can get away with and no simpler.

Requires [ender](http://ender.no.de/) modules [bean](https://github.com/fat/bean) and [valentine](https://github.com/ded/valentine) for events & iteration respectively. Install ender using npm, then build the modules:

```
npm install -g ender
ender build bean valentine
```

Include the resulting library in your pages along with PolyClay.

Well, actually, don't: this isn't safe for use by anybody because I am writing this as a learning exercise and everything might change overnight as I suddenly realize what I have done horribly wrong. Do not eat. Do not apply to skin.

### Example

```javascript
var Play = PolyClay.Model.extend({
	// properties
	properties: {
		author: 'string',
		title: 'string',
		characters: 'array',
		acts: 'array',
		published: 'date',
	},
	// list of calculated properties, provided to templates
	calculated: ['report', ],
	// the html element to render this into (optional)
	element: '#playView',
	// the name of the mote template to render this with (optional)
	template: 'playTmpl',
	// root of the RESTish urls where this is persisted
	urlroot: '/plays'
},{
	// methods
	initialize: function(id)
	{
		// Called after construction for all models with whatever arguments
		// are passed to the constructor.
		this.id = id;
		this.watch('change', this.render);
	},
	mymethod: function(yammer)
	{
		// your method here
	},
});

var PlayList = PolyClay.Collection.extend({
	model: Play,
	element: '#list_of_plays',
	url: '/plays'
});

// mixed collection
var ProductionList = PolyClay.Collection.extend(
{
	model: [['play', Play], ['musical', Musical]]
}, {
	initialize: function(urlroot, element)
	{
		this.url(urlroot);
		this.element(element);
		this.watch('reset', this.render);
		this.watch('add', this.render);
	},
});
```

### Fields

Calculated properties are available to templates but not synced using ajax.

### Events

### PolyClay.Model API

TBD.

### PolyClay.Collection API

TBD.

## Beam

Because I was sick of writing template-rendering boilerplate, PolyClay requires [mote.js](http://satchmorun.github.com/mote/) and the convenience wrapper Beam.

Beam is [ICanHaz](http://icanhazjs.com/) rewritten for mote. It caches the compiled templates instead of the string source. Also, it is more agnostic than ICanHaz about its optional libraries. It will pick up anything claiming that it is __$__ in the global namespace and assume it works like jquery/zepto. This allows you to use Ender instead of jquery by adding some more packages to your ender build:

`ender add bonzo qwery domready`

Also has a dependency on [lscache](https://github.com/pamelafox/lscache) for template caching in local storage.

### Usage

Beam imitates ICanHaz's API. It creates a function for every template it finds in the DOM marked as type "text/html" or "text/x-icanhaz". That method has the following signature:

`beam.templatename(data [, raw])`

`data` must contain a valid context for a mote template. Pass "true" for `raw` to receive a string in return. Otherwise Beam will wrap up the result as a dom element.

For example, given the following html:

```html
<script type="text/html" id="slartibartfast">
<div><i>Greetings,</i> {{last}} {{first}} {{last}}.</div>
</script>
```

beam creates a function named `slartibartfast` that can be called like this:

```javascript
var rendered = beam.slartibartfast({ first: 'Arthur', last: 'Dent' });
$('#display_it_here').append(rendered);
```

Beam also provides the following functions. Their names are reserved words; you cannot create templates with the same names.

`beam.addTemplate(name, string)`

Add a template with the given name and source. Compiles the template and caches the result in `beam.templates[name]`. Creates a function to render the template in `beam[name]`.

`beam.clearAll()` 

Clear the templates and partials cache.

`beam.grabTemplates()` 

Search the DOM for `<script type="text/html">` tags to make templates out of, then remove those elements from the DOM. This function is called automatically when the document is ready.

`beam.refresh()`

Clear the cache and re-examine the DOM for new templates.

### Rendering templates

`beam.render(tmpl, data, callback)`

Render the given template name with the passed-in data hash, and fire the callback with the rendering as the sole parameter.

`beam.renderInto(templ, data, element)`

Render into the specified css element. Fire and forget.

### Fetching templates from a server

Set `beam.templateURL` to a string with the url for templates.

`beam.fetch(tmpl, callback)`

Fetch `beam.templateURL/tmpl` using ajax, compile the result, and cache it in local storage.

Beam will check local storage to see if it has a cached version of the template already. If it does, it will send an if-modified-since header along with the ajax request for the template.

`beam.preload(tmpllist)`

Pass a list of template names. Beam will fetch, compile, and cache whatever is returned by a fetch of `beam.templateURL/tmplname`, falling back to any locally cached versions if the server does not have anything newer.

