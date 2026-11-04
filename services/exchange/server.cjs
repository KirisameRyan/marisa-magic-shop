'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{gzipSync}=require('node:zlib');
const {Store}=require('./store.cjs'),M=require('./market.cjs');
const root=path.resolve(__dirname,'../..');
const assets=new Set(['gensokyo_exchange.html','verify-email.html','reset.html','css/gensokyo-exchange.css','css/gensokyo-auth.css','css/common.css','js/gensokyo-engine.js','js/gensokyo-market-data.js','js/gensokyo-exchange.js','js/gensokyo-tools.js','js/exchange-v3.js','js/polyfills.js','js/gensokyo-network.js','js/echarts.min.js','js/api-config.js','js/auth.js','js/page-base.js','js/catalog.js','nav.js','css/vendor/fontawesome/css/all.min.css',...['fa-solid-900','fa-regular-400','fa-brands-400','fa-v4compatibility'].map(n=>'css/vendor/fontawesome/webfonts/'+n+'.woff2')]);
function createServer({dataDir,origins=['http://127.0.0.1:8098','https://www.azureflame.cloud','https://azureflame.cloud'],authUpstream='',resume=false,now=Date.now(),environment='production'}={}){
 origins=[...new Set([...origins,'https://www.bilibili.com','https://www.bilibilitoy.com',...(process.env.MMS_TOY_ORIGINS||'').split(',').map(x=>x.trim()).filter(x=>/^https:\/\/[^/?#]+$/.test(x))])];
 if(!dataDir)throw Error('必须配置私有数据库目录 MMS_PRIVATE_DIR');const store=new Store(dataDir,{resume,now}),limits=new Map(),devAuth=(!authUpstream&&environment==='development'&&process.env.MMS_DEV_AUTH==='1')?require('./dev-auth.cjs').create(path.join(dataDir,'site.db')):null;
 function rate(subject,limit,ms){const now=Date.now(),old=limits.get(subject);if(!old||old.until<=now){limits.set(subject,{until:now+ms,count:1});return true;}return ++old.count<=limit;}
 function send(req,res,status,data,etag){res.setHeader('Content-Type','application/json; charset=utf-8');if(etag){res.setHeader('ETag',etag);if(req.headers['if-none-match']===etag){res.writeHead(304).end();return;}}const raw=Buffer.from(JSON.stringify(data));if((req.headers['accept-encoding']||'').includes('gzip')){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Origin, Accept-Encoding');res.writeHead(status).end(gzipSync(raw));}else res.writeHead(status).end(raw);}
 async function handleDevAuth(req,res,url,dev,send){
  const token=(/^Bearer\s+([a-f0-9]{64})$/i.exec(req.headers.authorization||'')||[])[1]||'';
  const action=(url.searchParams.get('action')||'').toLowerCase();
  if(req.method==='GET'||action==='me'){const u=dev.me(token);if(!u)return send(req,res,401,{ok:false,error:'未登录'});return send(req,res,200,{ok:true,user:{id:u.id,username:u.username,email:null,is_guest:1}});}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return send(req,res,413,{ok:false,error:'请求过大'});}
  let form={};try{form=Object.fromEntries(new URLSearchParams(body));}catch(e){}
  let act=(action||form.action||'').toLowerCase();
  if(!act){const m=/name="action"\s*\r?\n\r?\n([^\r\n]+)/.exec(body)||/(?:^|&)action=([^&]+)/.exec(body)||/"action"\s*:\s*"([^"]+)"/.exec(body);if(m)act=String(m[1]).trim().toLowerCase();}
  if(act==='guest'||act==='toy_login'){const g=dev.guest();return send(req,res,200,{ok:true,...g});}
  if(act==='logout')return send(req,res,200,{ok:true});
  if(act==='me'){const u=dev.me(token);if(!u)return send(req,res,401,{ok:false,error:'未登录'});return send(req,res,200,{ok:true,user:{id:u.id,username:u.username,email:null,is_guest:1}});}
  return send(req,res,400,{ok:false,error:'开发环境仅支持游客登录'});
 } const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');const origin=req.headers.origin;if(origin&&!origins.includes(origin)){send(req,res,403,{ok:false,error:'Origin not allowed'});return;}if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}res.setHeader('Access-Control-Expose-Headers','ETag');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key, If-None-Match');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  try{const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname).slice(1)||'gensokyo_exchange.html';if(name==='api/exchange.php'&&url.searchParams.get('route'))name='api/exchange/'+encodeURIComponent(url.searchParams.get('route'));if(name==='api/auth.php'&&devAuth){await handleDevAuth(req,res,url,devAuth,send);return;}
   if(['api/auth.php','api/toy.php','api/exchange.php'].includes(name)&&authUpstream){const upstream=new URL('/'+name+url.search,authUpstream);if(!['127.0.0.1','localhost','[::1]'].includes(upstream.hostname))throw Error('本地鉴权代理只允许回环地址');const headers={};for(const key of ['authorization','content-type','origin','idempotency-key','if-none-match'])if(req.headers[key])headers[key]=req.headers[key];const proxy=http.request(upstream,{method:req.method,headers},up=>{const forwarded={'Content-Type':'application/json; charset=utf-8'};if(up.headers.etag)forwarded.ETag=up.headers.etag;res.writeHead(up.statusCode,forwarded);up.pipe(res);});proxy.on('error',()=>send(req,res,503,{ok:false,error:'网站登录服务未启动'}));req.pipe(proxy);return;}
   if(environment==='development'&&name==='__dev__/exchange-seed'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'scripts/exchange-seed-export.html')));return;}
   if(name.startsWith('api/exchange/')){
    const route=name.slice('api/exchange/'.length);if(req.method==='GET'&&route==='health'){store.advance();send(req,res,200,{ok:true,service:'gensokyo-exchange',halted:!!store.state.halted,lastTick:store.state.lastTick,build:process.env.MMS_BUILD||'dev'});return;}if(req.method==='GET'&&route==='overview'){if(!rate('overview-'+req.socket.remoteAddress,60,60000)){send(req,res,429,{ok:false,error:'请求过于频繁'});return;}store.advance();send(req,res,200,{...M.overview(store.state),environment});return;}const user=store.authenticate(req.headers.authorization);if(!user){send(req,res,401,{ok:false,error:'请先登录游戏账户'});return;}
    if(!rate('read-'+(user?.id||req.socket.remoteAddress),300,60000)){send(req,res,429,{ok:false,error:'请求过于频繁'});return;}
    store.advance();
    if(req.method==='GET'&&route==='state'){const id=url.searchParams.get('asset')||'kappa';if(!store.state.assets.some(a=>a.id===id)){send(req,res,400,{ok:false,error:'未知交易标的'});return;}send(req,res,200,{...M.snapshot(store.state,id,user),environment},`"${store.state.revision}:${user?.id||0}:${id}"`);return;}
    if(req.method==='GET'&&route==='leaderboard'){const board=url.searchParams.get('board')||'assets';if(!['assets','profit','loss','liquidation'].includes(board)){send(req,res,400,{ok:false,error:'榜单类型无效'});return;}if(board==='liquidation'){send(req,res,200,{ok:true,board,updatedAt:store.state.lastTick,...store.liquidationRanking(user.id)},`"rank:liquidation:${store.state.revision}:${user.id}"`);return;}const all=M.ranking(store.state,board);send(req,res,200,{ok:true,board,day:store.state.businessDay,updatedAt:store.state.lastTick,rows:all.slice(0,100),total:all.length,self:user?all.find(r=>r.userId===user.id)||null:null},`"rank:${board}:${store.state.revision}:${user?.id||0}"`);return;}
    if(req.method!=='POST'||!['join','order','cancel','margin','marginMode','condition','cancelCondition','tutorial'].includes(route)){send(req,res,404,{ok:false,error:'接口不存在'});return;}
    if(!user){send(req,res,401,{ok:false,error:'请先登录游戏账户'});return;}
    if(!rate('write-'+user.id,60,60000)){send(req,res,429,{ok:false,error:'操作过于频繁'});return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192){send(req,res,413,{ok:false,error:'请求过大'});return;}chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{send(req,res,400,{ok:false,error:'请求格式不正确'});return;}if(!body||typeof body!=='object'||Array.isArray(body)){send(req,res,400,{ok:false,error:'请求格式不正确'});return;}
    const result=store.mutate(user,req.headers['idempotency-key'],route,body);send(req,res,200,result);return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   if(name==='games.html'){res.writeHead(302,{Location:'/gensokyo_exchange.html'}).end();return;}
   if(!assets.has(name)){res.writeHead(404).end('Not found');return;}
   fs.readFile(path.join(root,name),(err,buf)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.woff2')?'font/woff2':'text/javascript; charset=utf-8');res.writeHead(200).end(buf);});
  }catch(error){const status=error.status||(/尚未|请选择|请输入|不足|委托|仓位|杠杆|保险|高风险|反向|追加|价格/.test(error.message)?400:500);if(status===500)console.error('Exchange request failed:',error.constructor.name);send(req,res,status,{ok:false,error:status===500?'交易服务暂时不可用，请稍后重试':error.message});}
 });
 const timer=setInterval(()=>{try{store.heartbeat();store.advance();}catch(e){console.error('Market scheduler paused:',e.constructor.name);process.exitCode=1;server.close();}},1000);timer.unref();server.on('close',()=>{clearInterval(timer);store.close();if(devAuth)devAuth.close();});server.store=store;return server;
}
if(require.main===module){const server=createServer({dataDir:process.env.MMS_PRIVATE_DIR,origins:(process.env.MMS_ALLOWED_ORIGINS||'http://127.0.0.1:8098,https://www.azureflame.cloud,https://azureflame.cloud').split(',').map(s=>s.trim()),authUpstream:process.env.MMS_AUTH_UPSTREAM||'',resume:process.env.MMS_EXCHANGE_RESUME==='1',environment:process.env.MMS_ENV||'production'});server.listen(Number(process.env.MMS_EXCHANGE_PORT||8098),'127.0.0.1',()=>console.log('Exchange service listening on loopback port '+server.address().port));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));}
module.exports={createServer};





