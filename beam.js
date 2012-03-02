var beam = ((typeof module !== 'undefined') && module.exports) || {};

(function(exports)
{
    function trim(input)
    {
		if (''.trim) return input.trim();
		else return input.replace(/^\s+/, '').replace(/\s+$/, '');
    }
	beam = {
		templates: {},
		// jquery, zepto, or ender's qwery/bonzo
		$: $,
		addTemplate: function(name, tmplstr)
		{
			if (typeof name === 'object')
			{
				for (var t in name)
					this.addTemplate(t, name[t]);
				return;
			}
			if (beam[name] || beam.templates[name])
			{
				console.error('"'+name+'" is already in use or a reserved name; template not added');
				return;
			}
			beam.templates[name] = mote.compile(tmplstr);
			beam[name] = function(data, raw)
			{
				data = data || {};
				var result = beam.templates[name](data);
				return (beam.$ && !raw) ? beam.$(result) : result;
			};
		},
		clearAll: function()
		{
			for (var k in beam.templates)
				delete beam[k];
			beam.templates = {};
		},
		refresh: function()
		{
			beam.clearAll();
			beam.grabTemplates();
		},
		grabTemplates: function()
		{
			var i, len, script,
				scripts = document.getElementsByTagName('script'),
				trash = [];
			for (i=0, len=scripts.length; i<len; i++)
			{
				script = scripts[i];
				if (script && script.innerHTML && script.id && (script.type === "text/html" || script.type === "text/x-icanhaz"))
				{
					beam.addTemplate(script.id, trim(script.innerHTML));
					trash.unshift(script);
				}
			}
			for (i=0,len=trash.length; i<len; i++)
				trash[i].parentNode.removeChild(trash[i]);
		},
		fetch: function(tmpl, callback)
		{
			var date;
			var cached = lscache.get(tmpl);
			if (cached && cached.date)
				date = cached.date;
			else
				date = undefined;
			$.ajax(
			{
				url: beam.templateURL + tmpl,
				method: 'GET',
			  	headers: {  'If-Modified-Since': date },
				type: 'text',
				success: function(req)
				{
					lscache.set(tmpl, { tmpl: req.response, date: (new Date()).toUTCString() });
					beam.addTemplate(tmpl, req.response);
					if (callback) callback();
				},
				error: function(err)
				{
					if (err.status == 304)
						beam.addTemplate(tmpl, cached.tmpl);
					if (callback) callback();
				},
			});
		},
		preload: function(tmpllist)
		{
			for (var i=0, len=tmpllist.length; i<len; i++)
			{
				var tmpl = tmpllist[i];
				if (beam[tmpl] === undefined)
					beam.fetch(tmpl, undefined);
			}
		},
		render: function(tmpl, data, callback)
		{
			if (beam[tmpl] === undefined)
			{
				beam.fetch(tmpl, function()
				{
					callback(beam[tmpl](data));
				});
			}
			else
				callback(beam[tmpl](data));
		},
		renderInto: function(tmpl, data, element)
		{
			beam.render(tmpl, data, function(rendered)
			{
				element.empty();
				element.append(rendered);
			});
		},
	};
	if (typeof document !== 'undefined')
	{
		if (beam.$)
			beam.$(document).ready(function() { beam.grabTemplates(); });
		else
			document.addEventListener('DOMContentLoaded', function() { beam.grabTemplates(); }, true);
	}
	
	exports = beam;
	exports.VERSION = '0.0.1';
})(beam);
