// Dependency-free local preview; exact allowlist, loopback only.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=new Set(['gensokyo_exchange.html','css/gensokyo-exchange.css','js/gensokyo-engine.js','js/gensokyo-exchange.js','js/echarts.min.js']);
files.add('css/vendor/fontawesome/css/all.min.css');
files.add('js/gensokyo-market-data.js');
for(const name of ['fa-solid-900','fa-regular-400','fa-brands-400','fa-v4compatibility'])files.add('css/vendor/fontawesome/webfonts/'+name+'.woff2');
const server=http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'gensokyo_exchange.html';}catch{res.writeHead(400).end();return;}
 if(name==='games.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><title>游戏室预览</title><p>此预览服务仅开放交易所原型。完整游戏室由主站提供。</p><a href="gensokyo_exchange.html">返回幻想乡交易所</a>');return;}
 if(!files.has(name)){res.writeHead(404).end('Not found');return;}
 fs.readFile(path.join(root,name),(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(data);});
});server.listen(Number(process.argv[2]||8098),'127.0.0.1',()=>console.log('Practice preview: http://127.0.0.1:'+server.address().port+'/gensokyo_exchange.html'));
