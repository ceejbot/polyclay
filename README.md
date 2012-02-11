Sculpy polymer modeling clay for the browser. RESTful persistence, usable properties, a tiny amount of validation, and change events. As simple as I can get away with.

Requires [ender](http://ender.no.de/) modules [bean](https://github.com/fat/bean) and [valentine](https://github.com/ded/valentine) for events & validation respectively. Install ender using npm, then build the modules:

```
npm install -g ender
ender build bean valentine
```

Include the resulting library in your pages along with sculpy.