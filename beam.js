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
		}
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
