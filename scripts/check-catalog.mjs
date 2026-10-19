import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('js/catalog.js','utf8'),context);
const library=context.window.MMS_LIBRARY;assert(library&&library.items.length>0);const seen=new Set();
for(const item of library.items){assert(!seen.has(item.href),'duplicate '+item.href);seen.add(item.href);assert(library.categories[item.category],'invalid category');assert(item.name&&item.tag&&item.desc,'incomplete item');assert(!item.href.includes('..')&&!/^(?:https?:|javascript:)/i.test(item.href),'external or unsafe catalog route');assert(fs.existsSync(decodeURI(item.href)),'missing '+item.href);}
assert(library.items.some(x=>x.href.startsWith('zyms/')&&x.category==='tools'),'Memory Signal missing');
for(const name of Object.keys(library.categories))assert(fs.existsSync(name+'.html'),'missing directory page');
console.log('Catalog OK: '+library.items.length+' unique works, '+Object.keys(library.categories).length+' categories');
