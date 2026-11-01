'use strict';
const E=require('../../js/gensokyo-engine.js'),D=require('../../js/gensokyo-market-data.js');
function create(now=Date.now()){const s=D.prepare(E.create(),now);s.randomSeed=require('node:crypto').randomBytes(4).readUInt32LE();s.accounts={};s.businessDay=day(now);s.revision=0;s.serverVersion=1;return s;}
function day(t){return new Date(t+4*3600000).toISOString().slice(0,10);}
function context(s,id){const a=s.accounts[String(id)];if(!a)throw Error('尚未开通交易账户');const c={assets:s.assets,system:s.system,flow:s.flow,insurance:s.insurance};for(const k of ['cash','fees','realized','positions','spotPositions','orders','fills'])Object.defineProperty(c,k,{get:()=>a[k],set:v=>{a[k]=v;},enumerable:true});for(const k of ['seq','round','executionTime'])Object.defineProperty(c,k,{get:()=>s[k],set:v=>{s[k]=v;}});return c;}
function join(s,user,now=Date.now()){const id=String(user.id);if(s.accounts[id]){s.accounts[id].username=user.username;return false;}s.accounts[id]={id:Number(user.id),username:user.username,createdAt:now,cash:100000,fees:0,realized:0,positions:{},spotPositions:{},orders:[],fills:[],dayStartEquity:100000};s._journal ||= [];s._journal.push({event:'initial-'+id,userId:Number(id),time:now,kind:'initial-funding',cashDelta:100000,cashAfter:100000});return true;}
function order(s,user,body,now=Date.now()){if(!['spot','contract'].includes(body.product))throw Error('请选择普通交易或杠杆合约');const c=context(s,user.id);const o=E.submit(c,body.asset,body.intent,body.price,body.qty,body.leverage,body.product,now);o.userId=user.id;o.resting=false;return o;}
function tick(s,{time,random=Math.random}){
 s.executionTime=time;s._journal ||= [];s._trades ||= [];let tradeCount=0,systemTradeCount=0;const warnings=[];
 if(day(time)!==s.businessDay){s._snapshots ||= [];for(const a of Object.values(s.accounts)){const c=context(s,a.id),equity=E.equity(c);s._snapshots.push({day:s.businessDay,userId:a.id,equity,time});a.dayStartEquity=equity;}s.businessDay=day(time);}
 const reduce=o=>o.intent==='close'||o.intent==='sell';
 function capacity(o,price,wanted){if(o.userId){const c=context(s,o.userId);if(reduce(o)){const p=o.product==='spot'?c.spotPositions[o.asset]:c.positions[o.asset];return Math.min(wanted,p?.qty||0);}if(price>o.price){const extra=(price-o.price)*(1/o.leverage+.0005);return Math.min(wanted,Math.max(0,Math.floor((E.available(c)-.02)/extra)));}return wanted;}
  const actor=s[o.actor],inv=actor.inventory[o.asset]||0,limit=o.actor==='flow'?2000:20000;let q=Math.min(wanted,Math.max(0,o.sign===1?limit-inv:limit+inv));if(o.sign===1)q=Math.min(q,Math.floor(actor.cash/price));return q;
 }
 function userFill(o,other,price,q,tradeId){const c=context(s,o.userId),before=c.cash,marginBefore=E.margin(c);E.applyFill(c,o,price,q,other.userId?s.system:s[other.actor]);const f=c.fills[0];f.marketTradeId=tradeId;s._journal.push({event:'fill-'+f.id,userId:o.userId,time,kind:o.liquidation?'liquidation':'trade',cashDelta:E.round(c.cash-before),cashAfter:c.cash,fillId:f.id,marketTradeId:tradeId,orderId:o.id,intent:o.intent,product:o.product,leverage:o.leverage,marginDelta:E.round(E.margin(c)-marginBefore),asset:o.asset,qty:q,price});}
 for(const a of s.assets){if(a.kind==='etf')E.refreshEtf(s);const bids=[],asks=[],trades=[];const sort=side=>side.sort((x,y)=>(side===bids?y.price-x.price:x.price-y.price)||x.id-y.id);
  function process(incoming){const opposing=incoming.sign===1?asks:bids;sort(opposing);while(incoming.remaining>0&&opposing.length){const passive=opposing[0];if(incoming.sign===1?passive.price>incoming.price:passive.price<incoming.price)break;
    if(incoming.userId&&incoming.userId===passive.userId){incoming.remaining=0;break;}
    if(!incoming.userId&&!passive.userId&&incoming.actor===passive.actor){incoming.remaining=0;break;}
    const price=passive.price,wanted=Math.min(incoming.remaining,passive.remaining),inCap=capacity(incoming,price,wanted),outCap=capacity(passive,price,wanted),q=Math.min(inCap,outCap);
    if(q<=0){if(outCap<=0){passive.remaining=0;opposing.shift();continue;}incoming.remaining=0;break;}
    const tradeId=s.seq++,buyer=incoming.sign===1?incoming:passive,seller=incoming.sign===-1?incoming:passive;
    if(buyer.userId)userFill(buyer,seller,price,q,tradeId);if(seller.userId)userFill(seller,buyer,price,q,tradeId);
    if(!buyer.userId&&!seller.userId){s[buyer.actor].cash=E.round(s[buyer.actor].cash-price*q);s[seller.actor].cash=E.round(s[seller.actor].cash+price*q);s[buyer.actor].inventory[a.id]=(s[buyer.actor].inventory[a.id]||0)+q;s[seller.actor].inventory[a.id]=(s[seller.actor].inventory[a.id]||0)-q;}
    if(!buyer.userId)buyer.remaining-=q;if(!seller.userId)seller.remaining-=q;
    const source=buyer.userId||seller.userId?'player':'system',record={id:tradeId,asset:a.id,price,qty:q,time,round:s.round,source,sign:incoming.sign,buyUserId:buyer.userId||null,sellUserId:seller.userId||null};trades.push(record);s._trades.push(record);s.marketTrades ||= [];s.marketTrades.unshift(record);s.marketTrades=s.marketTrades.slice(0,100);if(source==='player')tradeCount++;else systemTradeCount++;if(!passive.remaining)opposing.shift();
   }
   if(incoming.remaining>0){(incoming.sign===1?bids:asks).push(incoming);sort(incoming.sign===1?bids:asks);}
  }
  const orders=Object.values(s.accounts).flatMap(u=>u.orders).filter(o=>o.asset===a.id&&o.submittedAt<=time).sort((x,y)=>x.id-y.id);
  for(const o of orders.filter(o=>o.resting))(o.sign===1?bids:asks).push(o);sort(bids);sort(asks);
  const quotes=E.book(s,a.id);for(const [sign,levels] of [[-1,quotes.asks],[1,quotes.bids]])for(const l of levels)process({id:s.seq++,actor:'system',asset:a.id,sign,price:l.price,remaining:l.qty});
  for(const o of orders.filter(o=>!o.resting))process(o);
  s.flow ||= {cash:1000000,inventory:{}};const inventory=s.flow.inventory[a.id]||0,bias=Math.max(-.25,Math.min(.25,(a.fair-a.price)*.05-inventory/8000)),sign=random()<.5+bias?1:-1;
  process({id:s.seq++,actor:'flow',asset:a.id,sign,price:E.round(Math.max(.1,a.price+sign*.6)),remaining:80+Math.floor(random()*270)});
  a.sentiment=E.round(Math.max(-.5,Math.min(.5,(a.sentiment||0)*.7+(random()-.5)*.4)));
  if(trades.length){a.price=trades.at(-1).price;const v=trades.reduce((n,t)=>n+t.qty,0);a.volume+=v;a.history.push({t:time,o:trades[0].price,h:Math.max(...trades.map(t=>t.price)),l:Math.min(...trades.map(t=>t.price)),c:a.price,v,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});}else a.history.push({t:time,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});a.mark=E.round(.7*a.mark+.3*a.price);
 }
 for(const a of Object.values(s.accounts)){a.orders=a.orders.filter(o=>o.remaining>0);for(const o of a.orders)o.resting=true;warnings.push(...E.checkRisk(context(s,a.id)));for(const o of a.orders)if(o.liquidation){o.userId=a.id;o.resting=false;}}
 s.round++;return {tradeCount,systemTradeCount,warnings};
}
function book(s,id){const b=E.book(s,id);for(const u of Object.values(s.accounts))for(const o of u.orders.filter(o=>o.asset===id)){const levels=o.sign===1?b.bids:b.asks,l=levels.find(l=>l.price===o.price);if(l)l.qty+=o.remaining;else levels.push({price:o.price,qty:o.remaining});}b.asks.sort((a,b)=>a.price-b.price);b.bids.sort((a,b)=>b.price-a.price);return {asks:b.asks.slice(0,5),bids:b.bids.slice(0,5)};}
function ranking(s){return Object.values(s.accounts).map(a=>{const c=context(s,a.id),equity=E.equity(c);return {userId:a.id,name:a.username,equity,returnPct:E.round((equity/100000-1)*100),pnl:E.round(equity-100000),createdAt:a.createdAt};}).sort((a,b)=>b.equity-a.equity||a.createdAt-b.createdAt||a.userId-b.userId).map((a,i)=>({...a,rank:i+1}));}
function snapshot(s,assetId,user){const assets=s.assets.map(a=>({...a,history:a.id===assetId?a.history:[]}));const account=user&&s.accounts[String(user.id)];return {ok:true,mode:'online',serverTime:Date.now(),revision:s.revision,market:{assets,news:s.news,round:s.round,lastTick:s.lastTick,books:Object.fromEntries(s.assets.map(a=>[a.id,book(s,a.id)])),marketTrades:(s.marketTrades||[]).map(({buyUserId,sellUserId,...t})=>t),insurance:s.insurance,halted:s.halted||false},account:account?JSON.parse(JSON.stringify(account)):null,identity:user?{id:user.id,username:user.username}:null,rank:user?ranking(s).find(r=>r.userId===user.id)?.rank||null:null};}
module.exports={create,context,join,order,tick,ranking,snapshot,day};
