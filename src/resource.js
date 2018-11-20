// resource.js
/*
	On the language:

	There are four types of directives:

	1. Primary
	2. Secondary
	3. Input
	4. Output

	Primary directives can either have static arguments, or arguments provided by secondary directives.
*/
/* Contains class helper for resource operation processing */
/* eslint no-underscore-dangle: ["error", { "allow": ["_with", "_as"] }] */// Allowing for the ouput of the directives
"use strict";
const system = require("cpuabuse-system");
const sass = require("node-sass");
const MarkdownIt = require("markdown-it");
const directives = {
	primary: ["file", "scss", "md", "njk", "raw", "yml", "custom"],
	secondary: ["with", "as"],
	in: ["in"],
	out: ["out"],
	aux: ["data","primaryCounter", "_with", "_as"] // Properties added to the object over which iteration is occurring may either be visited or omitted from iteration. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
};
const methods = {
	async custom(resource, operation){
		let relativePath = await resource.root.parent.system.file.join(resource.root.parent.settings.folders.file, operation.custom.path);
		let absolutePath = await resource.root.parent.system.file.join(resource.root.parent.system.rootDir, relativePath);
		let filePath = await resource.root.parent.system.file.join(absolutePath, operation.custom.name);
		operation.data = await require(filePath)(resource, operation); /* eslint-disable-line global-require */// In-line require suits the needs and logic
	},
	async file(resource, operation){
		let path = await resource.root.parent.system.file.join(resource.root.parent.settings.folders.file, operation.file.path);
		operation.data = await resource.root.parent.system.file.getFile(path, operation.file.name);
	},
	async in(resource, operation){
		resource.in = resource.inData;
	},
	async md(resource, operation){ /* eslint-disable-line require-await */// Preserving async throught directives
		var markdown = new MarkdownIt();
		operation.data = markdown.render(operation._with);
	},
	async scss(resource, operation){ /* eslint-disable-line require-await */// Preserving async throught directives
		let text = sass.renderSync({
			data: operation._with
		});

		operation.data = text.css.toString("utf-8");
	},
	async njk(resource, operation){
		let path = await resource.root.parent.system.file.join(resource.root.parent.settings.folders.file, operation.njk.path);
		operation.data = await resource.root.parent.app.njk(path, operation.njk.name, operation.hasOwnProperty("_with") ? operation._with : null);
	},
	async yml(resource, operation){
		operation.data = await resource.root.parent.app.yml(operation._with);
	},
	async raw(resource, operation){ /* eslint-disable-line require-await */// Preserving async throught directives
		operation.data = operation.raw;
	},
	async with(resource, operation){
		var resourceContext = new ResourceContext(resource, resource.name, resource.in);
		resourceContext.data = operation.with;
		operation._with = await resourceContext.process();
	},
	async as(resource, operation){
		operation._as = resource.in;
	},
	async out(resource, operation){
		return new Promise(function(resolve){
			Promise.all(resource.data.filter(function(operation){
				return operation.hasOwnProperty("data");
			}).map(function(operation){
				return operation.data;
			})).then(function(data){
				switch(operation.out){
					case "raw":
					case "string":
					case "":
					case null:
					resource.out = data.join("");
					break;

					case "first_serve":
					resource.out = data[0];
					break;

					case "object":
					resource.out = JSON.parse(data.join(""));
					break;

					case "property":
					resource.out = data.map(function(result){
						/* Every object has a toString() method that is automatically called when the object is to be represented as a text value...
						https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString#Description */
						return (result.hasOwnProperty(operation._as) ? result[operation._as] : "").toString();
					}).join("");
					break;

					default:
					throw "error 4";
				}
				resolve();
			})
		});
	}
}

class ResourceContext extends system.AtomicLock{
	constructor(appOrParent, name, inData){
		// Call superclass constructor
		super();

		if(appOrParent instanceof ResourceContext){
			this.depth = appOrParent.depth + 1;
			this.root = appOrParent.root;
			this.data = null;
		} else { // NOTE: Instance of App; since this file is to be called from App only, we assume there is no other instanceof possibility
			this.depth = 0;
			this.root = this;
			this.parent = appOrParent;
			this.data = JSON.parse(JSON.stringify(appOrParent.app.rc[name].main));
		}
		this.inData = inData;
		this.name = name;
		this.directives = {
			in: [],
			secondary: [],
			primary: [],
			out: []
		};
	}

	// FIXME: add description that we split into primary in out secondary for code maintainability
	async process(){
		// For each entry in the data array
		this.data.forEach(operation => {
			// Initialize primary directive counter
			this.primary = false;
			// Preprocess preparation
			for (let directive in operation){ // For each directive in the data array element
				if(directives.primary.includes(directive)){ // Primary directives
					this.directives.primary.push(() => { // Arrow, since this used for directives
						this.lock();
						if(operation.hasOwnProperty("primaryCounter")){
							throw "some error";
						}
						operation.primaryCounter = null;
						this.release();

						return methods[directive](this, operation);
					});
				} else if(directives.out.includes(directive)){
					this.directives.out.push(() => methods[directive](this, operation));
				} else if(directives.in.includes(directive)){
					this.directives.in.push(() => methods[directive](this, operation));
				} else if(directives.secondary.includes(directive)){
					this.directives.secondary.push(() => methods[directive](this, operation));
				} else if(!directives.aux.includes(directive)){
					throw "some error2";
				}
			} // <== for directive in operation
		})

		// Populate for default in: raw	
		if(this.directives.in.length == 0){
			this.data.unshift({in: "raw"});
			this.directives.in.push(() => methods.in(this, this.data[0]));
		}

		// Populate for default out: raw
		// NOTE: Order of in then out is important, as referencing "len - 1" in async function for "out" will be evaluated during an actual call; That is why we are using "this.data.length", instead of what is returned by push, so that it does not matter what gets executed first - "in" or "out".
		if(this.directives.out.length == 0){
			this.data.push({out: "raw"});
			this.directives.out.push(() => methods.out(this, this.data[this.data.length - 1]));
		}

		// Call directives
		await Promise.all(this.directives.in.map(f => f())); // "in"
		await Promise.all(this.directives.secondary.map(f => f())); // Secondary
		await Promise.all(this.directives.primary.map(f => f())); // Primary
		await Promise.all(this.directives.out.map(f => f())); // "out"

		// Return
		return this.out;
	} // <== process()
}

exports.ResourceContext = ResourceContext;