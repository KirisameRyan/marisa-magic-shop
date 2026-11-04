'use strict';
const E=require('../../js/gensokyo-engine.js'),D=require('../../js/gensokyo-market-data.js'),C=require('./conditions.cjs'),G=require('./price-guard.cjs'),T=require('./treasury.cjs');
function create(now=Date.now()){const s=D.prepare(E.create(),now);require('./seed.cjs').applySeed(s,now);E.refreshEtf(s);D.ensureAssets(s);s.randomSeed=require('node:crypto').randomBytes(4).readUInt32LE();s.accounts={};s.businessDay=day(now);s.revision=0;s.serverVersion=3;return s;}
function day(t){return new Date(t+4*3600000).toISOString().slice(0,10);}
function context(s,id){const a=s.accounts[String(id)];if(!a)throw Error('尚未开通交易账户');const c={assets:s.assets,system:s.system,flow:s.flow,insurance:s.insurance};for(const k of ['cash','fees','realized','positions','spotPositions','orders','fills'])Object.defineProperty(c,k,{get:()=>a[k],set:v=>{a[k]=v;},enumerable:true});for(const k of ['seq','round','executionTime'])Object.defineProperty(c,k,{get:()=>s[k],set:v=>{s[k]=v;}});return c;}
function join(s,user,now=Date.now()){const id=String(user.id);if(s.accounts[id]){s.accounts[id].username=user.username;return false;}s.accounts[id]={id:Number(user.id),username:user.username,createdAt:now,cash:100000,fees:0,realized:0,positions:{},spotPositions:{},orders:[],fills:[],dayStartEquity:100000};s._journal ||= [];s._journal.push({event:'initial-'+id,userId:Number(id),time:now,kind:'initial-funding',cashDelta:100000,cashAfter:100000});return true;}
function netExposure(s,asset){let net=0;for(const u of Object.values(s.accounts)){const p=u.positions?.[asset];if(p)net+=p.sign*p.qty;const sp=u.spotPositions?.[asset];if(sp)net+=sp.qty;}return net;}
function accountNotional(s,userId){const u=s.accounts[String(userId)];if(!u)return 0;let total=0;for(const p of Object.values(u.positions||{})){const a=s.assets.find(x=>x.id===p.asset);if(a)total+=p.qty*(a.mark||a.price);}for(const p of Object.values(u.spotPositions||{})){const a=s.assets.find(x=>x.id===p.asset);if(a)total+=p.qty*(a.price||a.mark);}for(const o of u.orders||[]){if(o.remaining>0)total+=o.remaining*Number(o.price||0);}return total;}
function order(s,user,body,now=Date.now()){if(!['spot','contract'].includes(body.product))throw Error('请选择普通交易或杠杆合约');const c=context(s,user.id),a=s.assets.find(a=>a.id===body.asset),position=body.product==='spot'?c.spotPositions[body.asset]:c.positions[body.asset],legacyExit=['sell','close'].includes(body.intent)&&position&&body.qty===position.qty&&position.qty%100!==0;if(a?.pausedUntil>now)throw Object.assign(Error('该标的临时停牌，恢复后再下单'),{status:409});if(!Number.isSafeInteger(body.qty)||body.qty<=0||(body.qty%100!==0&&!legacyExit))throw Object.assign(Error('数量必须是100份的整数倍；旧零股仓位只能整笔退出'),{status:400});
 const opening=['buy','long','short'].includes(body.intent);
 if(opening&&a){
  const notional=Number(body.price)*Number(body.qty);
  const used=accountNotional(s,user.id);
  if(used+notional>D.ACCOUNT_NOTIONAL)throw Object.assign(Error('账户名义敞口超过上限（'+Math.round(D.ACCOUNT_NOTIONAL/10000)+' 万，已用 '+Math.round(used/10000)+' 万）'),{status:400});
  const kind=a.model?a.model.kind:'stock',cap=D.NET_OI[kind]||20000,next=netExposure(s,body.asset)+(['buy','long'].includes(body.intent)?1:-1)*body.qty;
  if(Math.abs(next)>cap)throw Object.assign(Error('该标的净持仓已达上限（'+cap+' 份），暂不接受同向开仓'),{status:409});
 }
 if(a&&['buy','long'].includes(body.intent)){const b=G.bands(a);if(Number(body.price)>b.upper+1e-8)throw Object.assign(Error('委托价格超出动态价格保护上界 '+b.upper.toFixed(1)),{status:400});}if(a&&['sell','short'].includes(body.intent)&&Number(body.price)<G.bands(a).lower-1e-8)throw Object.assign(Error('委托价格超出动态价格保护下界'),{status:400});const o=E.submit(c,body.asset,body.intent,body.price,body.qty,body.leverage,body.product,now,body.marginMode||'isolated');o.userId=user.id;o.resting=false;o.lotSize=100;o.legacyExit=!!legacyExit;return o;}
function makerLimit(s,id){const a=s.assets.find(a=>a.id===id);D.ensureAsset(a);const inv=Math.abs(D.inventory(s,a));return inv>a.model.limit?Math.max(a.model.limit,Math.ceil(inv*1.15/100)*100):a.model.limit;}
// Quotes are deterministic within a minute: polling cannot reroll liquidity.
function quoteNoise(s,id,salt){let h=2166136261;for(const c of id+':'+s.lastTick+':'+salt)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return ((h^(h>>>16))>>>0)/4294967296;}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function makerBook(s,id){
 const a=s.assets.find(a=>a.id===id);D.ensureAsset(a);
 const band=G.bands(a),inv=D.inventory(s,a),limit=makerLimit(s,id),P=clamp(D.reservePrice(s,a),band.lower,band.upper);
 const half=a.model.spread/2*(1+2*(a.newsShock||0));
 const bestBid=Math.max(.1,Math.floor(P*(1-half)*10)/10);
 const bestAsk=Math.max(bestBid+.1,Math.ceil(P*(1+half)*10)/10);
 const step=Math.max(.1,Math.round(P*.002*10)/10);
 let cash=Math.max(0,s.system.cash);
 const side=sign=>{let left=sign===1?Math.max(0,limit-inv):Math.max(0,limit+inv),gap=0;const out=[];
  for(let i=0;i<5;i++){
   if(i)gap+=step*(quoteNoise(s,id,'gap:'+i)<.85?1:2);
   const price=E.round((sign===1?bestBid:bestAsk)-sign*gap);
   const decay=sign===1?Math.max(0,1-Math.max(0,inv)/limit):Math.max(0,1+Math.min(0,inv)/limit);
   const depth=(a.model.kind==='crypto'?6000+i*1500:1800+i*500)*(.45+quoteNoise(s,id,sign+':'+i)*1.8)*(1-a.newsShock*.5)*decay;
   const qty=Math.max(0,Math.floor(Math.min(left,depth,sign===1?Math.floor(cash/Math.max(price,.01)):Infinity)/100)*100);
   if(qty>0&&!out.some(l=>l.price===price)){out.push({price,qty});left-=qty;if(sign===1)cash-=price*qty;}
  }
  return out;};
 return {asks:side(-1),bids:side(1)};
}
function report(s,a,time,title,body,extra={}){s.news.unshift({id:'report-'+s.seq++,kind:'market-report',asset:a.id,time,category:'交易动态',source:'交易所行情监测',title,body,delta:0,...extra});s.news=s.news.slice(0,64);}
function orderSummary(s,account){const active=account.orders.filter(o=>o.remaining>0),groups=new Map();for(const o of active){const key=JSON.stringify([o.asset,o.product,o.intent,o.liquidation?null:o.price]);let row=groups.get(key);if(!row){row={asset:o.asset,name:s.assets.find(a=>a.id===o.asset)?.name||o.asset,product:o.product||'contract',intent:o.intent,price:o.liquidation?null:o.price,liquidation:!!o.liquidation,remaining:0};groups.set(key,row);}row.remaining+=o.remaining;}return {count:active.length,totalQty:active.reduce((n,o)=>n+o.remaining,0),buyQty:active.filter(o=>o.sign===1).reduce((n,o)=>n+o.remaining,0),sellQty:active.filter(o=>o.sign===-1).reduce((n,o)=>n+o.remaining,0),groupCount:groups.size,majorOrders:[...groups.values()].sort((a,b)=>b.remaining-a.remaining||b.price-a.price).slice(0,5)};}
function cancelPausedOrders(s,asset,time){let count=0;for(const u of Object.values(s.accounts)){const cancelled=u.orders.filter(o=>o.asset===asset&&o.remaining>0&&!o.liquidation);for(const o of cancelled){count++;s._journal ||= [];s._journal.push({event:'circuit-cancel-'+s.seq++,userId:u.id,time,kind:'circuit-cancel',cashDelta:0,cashAfter:u.cash,asset,orderId:o.id,remaining:o.remaining,reason:'熔断自动撤单'});if(o.conditionId){const c=u.conditions?.find(c=>c.id===o.conditionId);if(c){c.status='cancelled';c.reason='熔断自动撤回未成交委托，已成交部分保留';}}}u.orders=u.orders.filter(o=>o.asset!==asset||o.liquidation);}return count;}
function insuranceTarget(s){let oi=0;for(const u of Object.values(s.accounts))for(const p of Object.values(u.positions||{})){const a=s.assets.find(x=>x.id===p.asset);if(a)oi+=p.qty*(a.mark||a.price);}return Math.max(1000000,Math.round(oi*.02));}
function applyFunding(s,time){if(s.fundingEnabled===false)return 0;let total=0;const byUser=new Map();for(const a of s.assets){const fair=Number(a.fair),mark=Number(a.mark);if(!(fair>0)||!(mark>0))continue;const rate=Math.max(-.01,Math.min(.01,.05*(mark/fair-1)));if(!rate)continue;for(const u of Object.values(s.accounts)){const p=u.positions?.[a.id];if(!p||!p.qty)continue;const pay=E.round(p.sign*p.qty*mark*rate);if(!pay)continue;u.cash=E.round(u.cash-pay);byUser.set(u.id,(byUser.get(u.id)||0)+pay);total+=pay;}}if(!total)return 0;s.system.cash=E.round(s.system.cash+total);for(const [id,pay] of byUser){const u=s.accounts[String(id)];s._journal.push({event:'funding-'+time+'-'+id,userId:id,time,kind:'funding',cashDelta:-E.round(pay),cashAfter:u.cash});}return E.round(total);}
function adl(s,time){const target=insuranceTarget(s),ins=s.insurance;if(!ins||ins.balance>=target*.2)return 0;if(s.lastAdlAt&&time-s.lastAdlAt<10*60000)return 0;const candidates=[];for(const u of Object.values(s.accounts))for(const p of Object.values(u.positions||{})){const a=s.assets.find(x=>x.id===p.asset);if(!a)continue;const pnl=(a.mark-p.entry)*p.qty*p.sign;if(pnl>0)candidates.push({u,p,a,pnl});}if(!candidates.length)return 0;candidates.sort((x,y)=>y.pnl-x.pnl);let reduced=0;for(const {u,p,a} of candidates){if(ins.balance>=target*.2)break;const qty=Math.max(100,Math.floor(p.qty*.25/100)*100);if(qty>p.qty)continue;const pnl=E.round((a.mark-p.entry)*qty*p.sign);u.cash=E.round(u.cash+pnl);s.system.cash=E.round(s.system.cash-pnl);s.system.inventory[a.id]=E.round((s.system.inventory[a.id]||0)+p.sign*qty);p.margin=E.round(p.margin*(1-qty/p.qty));p.qty-=qty;if(!p.qty)delete u.positions[a.id];s._journal.push({event:'adl-'+time+'-'+u.id+'-'+a.id,userId:u.id,time,kind:'adl',cashDelta:pnl,cashAfter:u.cash,asset:a.id,qty});reduced+=qty;}if(reduced){s.lastAdlAt=time;s.news.unshift({id:'adl-'+time,kind:'market-report',category:'风险处置',source:'交易所风控',title:'保险池不足，触发自动减仓',body:'已对盈利仓位执行自动减仓 '+reduced+' 份，降低系统性敞口。',time,delta:0});s.news=s.news.slice(0,64);}return reduced;}
function tick(s,{time,random=Math.random}){
 s.executionTime=time;s._journal ||= [];s._trades ||= [];let tradeCount=0,systemTradeCount=0;const warnings=[],urgentHandlers=[];let riskDirty=true;D.ensureAssets(s);
 const dayKey=day(time);if(!s.businessDay)s.businessDay=dayKey;else if(s.businessDay!==dayKey)D.dailyRollover(s,time);
 if(s.maintenanceUntil&&time<s.maintenanceUntil){for(const a of s.assets)a.history.push({t:time,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});return {tradeCount:0,systemTradeCount:0,warnings:[]};}
 for(const a of s.assets){G.begin(a,time);a.tradeStatsSince ??= time-60000;}

 T.rebalance(s,time,makerLimit);
 if(time%28800000===0)applyFunding(s,time);
 adl(s,time);
 function checkAllRisk(){if(!riskDirty)return;riskDirty=false;for(const account of Object.values(s.accounts)){warnings.push(...E.checkRisk(context(s,account.id)));for(const o of account.orders)if(o.liquidation){o.userId=account.id;o.resting=false;o.submittedAt=time;o.lotSize=100;}}}
 checkAllRisk();
 const reduce=o=>o.intent==='close'||o.intent==='sell';
 function capacity(o,price,wanted){if(o.userId){const c=context(s,o.userId);if(!c.orders.includes(o))return 0;if(!reduce(o)&&Object.values(c.positions).some(p=>p.liquidating||E.risk(c,p).riskRate>=1))return 0;if(reduce(o)){const p=o.product==='spot'?c.spotPositions[o.asset]:c.positions[o.asset];if(p&&o.product!=='spot'&&E.isCross(p)&&E.otherCrossPnl(c,o.asset)>.01){const costPerUnit=(p.entry-price)*p.sign+price*.0005;if(costPerUnit>0)return Math.min(wanted,p.qty,Math.max(0,Math.floor((E.crossFunds(c)-.01)/costPerUnit)));}return Math.min(wanted,p?.qty||0);}if(price>o.price){const extra=(price-o.price)*(1/o.leverage+.0005);return Math.min(wanted,Math.max(0,Math.floor((E.available(c)-.02)/extra)));}return wanted;}
  const actor=s[o.actor],inv=actor.inventory[o.asset]||0,limit=o.actor==='flow'?(s.assets.find(a=>a.id===o.asset).model.kind==='crypto'?80000:20000):makerLimit(s,o.asset);let q=Math.min(wanted,Math.max(0,o.sign===1?limit-inv:limit+inv));if(o.sign===1)q=Math.min(q,Math.floor(Math.max(0,actor.cash)/price));return q;
 }
 function settlementCapacity(x,y,price){
  const pnl=o=>{if(!o.userId||o.product==='spot'||o.intent!=='close')return 0;const p=s.accounts[o.userId].positions[o.asset];return p?(price-p.entry)*p.sign:0;};
  const cost=pnl(x)+pnl(y);if(cost<=0)return Infinity;
  const payer=x.userId&&y.userId?s.system:s[(x.userId?y:x).actor];
  return Math.max(0,Math.floor(Math.max(0,payer.cash)/cost));
 }
 function userFill(o,other,price,q,tradeId){const c=context(s,o.userId),before=c.cash,marginBefore=E.margin(c),insuranceBefore=(s.insurance?.paid||0)+(s.insurance?.uncovered||0),position=c.positions[o.asset],direction=position?.sign===1?'long':'short',leverage=position?.leverage||o.leverage,liquidationEventId=position?.liquidationEventId||o.id;E.applyFill(c,o,price,q,other.userId?s.system:s[other.actor]);const f=c.fills[0];s.accounts[o.userId].hasTraded=true;f.marketTradeId=tradeId;if(o.conditionId){const condition=s.accounts[o.userId].conditions?.find(c=>c.id===o.conditionId);if(condition)condition.filledQty=(condition.filledQty||0)+q;}s._journal.push({event:'fill-'+f.id,userId:o.userId,time,kind:o.liquidation?'liquidation':'trade',cashDelta:E.round(c.cash-before),cashAfter:c.cash,fillId:f.id,marketTradeId:tradeId,orderId:o.id,intent:o.intent,product:o.product,leverage:o.leverage,marginDelta:E.round(E.margin(c)-marginBefore),asset:o.asset,qty:q,price,insuranceFee:f.insuranceFee||0,...(o.liquidation||((s.insurance?.paid||0)+(s.insurance?.uncovered||0)>insuranceBefore)?{liquidation:{orderId:liquidationEventId,direction,leverage,extraLoss:E.round((s.insurance?.paid||0)+(s.insurance?.uncovered||0)-insuranceBefore),complete:o.remaining===0}}:{})});}
 for(const a of s.assets){if(a.kind==='etf')E.refreshEtf(s);if(a.pausedUntil>time){cancelPausedOrders(s,a.id,time);a.history.push({t:time,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});continue;}if(a.pausedUntil){report(s,a,time,a.name+'恢复交易','熔断暂停结束，本分钟恢复撮合。原未成交委托已撤回，需要重新下单。');G.resume(a,time);a.volatilityAnchor={time,price:a.mark};delete a.pausedUntil;delete a.pauseReason;}const reference=G.baseline(a,time);const bids=[],asks=[],trades=[];const sort=side=>side.sort((x,y)=>(side===bids?y.price-x.price:x.price-y.price)||x.id-y.id);
  const invBefore=D.inventory(s,a);
  let sweeping=false;
  function urgent(){if(sweeping||a.pausedUntil>time)return;sweeping=true;try{checkAllRisk();for(const account of Object.values(s.accounts))for(const o of [...account.orders])if(o.asset===a.id&&o.liquidation&&o.remaining>0)process(o);}finally{sweeping=false;}}
  let bookedQty=0;
  urgentHandlers.push(()=>{urgent();if(a.history.at(-1)?.t===time&&trades.length){const bar=a.history.at(-1),v=trades.reduce((n,t)=>n+t.qty,0);a.price=trades.at(-1).price;bar.h=Math.max(bar.h,...trades.map(t=>t.price));bar.l=Math.min(bar.l,...trades.map(t=>t.price));bar.c=a.price;bar.v=v;a.volume+=v-bookedQty;bookedQty=v;}});
  function process(incoming){if(a.pausedUntil>time||incoming.userId&&!s.accounts[incoming.userId].orders.includes(incoming))return;if(!sweeping&&!incoming.liquidation){const side=incoming.sign===1?bids:asks;side.push(incoming);sort(side);urgent();const index=side.indexOf(incoming);if(index>=0)side.splice(index,1);if(incoming.remaining<=0||incoming.userId&&!s.accounts[incoming.userId].orders.includes(incoming))return;}const opposing=incoming.sign===1?asks:bids;sort(opposing);while(incoming.remaining>0&&opposing.length&&!(a.pausedUntil>time)){const passive=opposing[0];if(incoming.sign===1?passive.price>incoming.price:passive.price<incoming.price)break;
    if(incoming.userId&&incoming.userId===passive.userId){if(incoming.liquidation){opposing.shift();continue;}incoming.remaining=0;break;}
    if(!incoming.userId&&!passive.userId&&incoming.actor===passive.actor){incoming.remaining=0;break;}
    if(passive.userId&&!G.allowed(a,passive.price)){opposing.shift();if(passive.userId){passive.remaining=0;const u=s.accounts[passive.userId];s._journal.push({event:'price-guard-'+s.seq++,userId:u.id,time,kind:'price-protection-cancel',cashDelta:0,cashAfter:u.cash,asset:a.id,orderId:passive.id,price:passive.price,bands:G.bands(a)});if(passive.conditionId){const c=u.conditions?.find(c=>c.id===passive.conditionId);if(c){c.status='cancelled';c.reason='成交前价格保护校验未通过，余单撤回';}}}continue;}
    const price=passive.price,wanted=Math.min(incoming.remaining,passive.remaining),inCap=capacity(incoming,price,wanted),outCap=capacity(passive,price,wanted),rawQty=Math.min(inCap,outCap,settlementCapacity(incoming,passive,price)),oddExit=(!incoming.userId||!passive.userId)&&[incoming,passive].some(o=>o.legacyExit||o.liquidation||o.userId&&!o.lotSize),q=oddExit&&rawQty<100?rawQty:Math.floor(rawQty/100)*100;
    if(q<=0){if(outCap<100&&!(oddExit&&outCap>0)){passive.remaining=0;opposing.shift();continue;}incoming.remaining=0;break;}
    const tradeId=s.seq++,buyer=incoming.sign===1?incoming:passive,seller=incoming.sign===-1?incoming:passive;
    if(buyer.userId)userFill(buyer,seller,price,q,tradeId);if(seller.userId)userFill(seller,buyer,price,q,tradeId);
    if(!buyer.userId&&!seller.userId){s[buyer.actor].cash=E.round(s[buyer.actor].cash-price*q);s[seller.actor].cash=E.round(s[seller.actor].cash+price*q);s[buyer.actor].inventory[a.id]=(s[buyer.actor].inventory[a.id]||0)+q;s[seller.actor].inventory[a.id]=(s[seller.actor].inventory[a.id]||0)-q;}
    if(!buyer.userId)buyer.remaining-=q;if(!seller.userId)seller.remaining-=q;
    const source=buyer.userId||seller.userId?'player':'system',record={id:tradeId,asset:a.id,price,qty:q,time,round:s.round,source,spotQty:(!buyer.userId&&!seller.userId||buyer.userId&&buyer.product==='spot'||seller.userId&&seller.product==='spot')?q:0,sign:incoming.sign,buyUserId:buyer.userId||null,sellUserId:seller.userId||null};trades.push(record);s._trades.push(record);s.marketTrades ||= [];s.marketTrades.unshift(record);s.marketTrades=s.marketTrades.slice(0,100);if(source==='player')tradeCount++;else systemTradeCount++;if(!passive.remaining)opposing.shift();a.price=price;if(!a.open)a.open=price;G.observe(a,record);const pair=G.repeatPair(a,record);if(pair)s._journal.push({event:'pair-review-'+s.seq++,userId:buyer.userId,time,kind:'counterparty-pattern-review',cashDelta:0,cashAfter:s.accounts[buyer.userId].cash,asset:a.id,...pair});riskDirty=true;checkAllRisk();if(Math.abs(a.mark-reference)+1e-8>=reference*(a.model.kind==='crypto'?.30:.20)){a.pausedUntil=time+3*60000;a.pauseStartedAt=time;a.pauseReason='5分钟保护参考价格偏离达到'+(a.model.kind==='crypto'?'30%':'20%');const cancelledCount=cancelPausedOrders(s,a.id,time);report(s,a,time,a.name+'触发熔断，暂停交易3分钟',a.pauseReason+'。本标的立即暂停撮合，未成交委托已全部撤回（'+cancelledCount+'笔），已成交部分保留。预计'+D.time(a.pausedUntil,true)+'恢复。',{category:'熔断通告',source:'交易所公告',resumeAt:a.pausedUntil,cancelledCount});break;}
    if(!sweeping)urgent();
   }
   if(incoming.remaining>0&&!incoming.liquidation&&(!incoming.userId||s.accounts[incoming.userId].orders.includes(incoming))){(incoming.sign===1?bids:asks).push(incoming);sort(incoming.sign===1?bids:asks);}
  }
  const priorPrice=a.price;
  const orders=Object.values(s.accounts).flatMap(u=>u.orders).filter(o=>o.asset===a.id&&o.submittedAt<=time).sort((x,y)=>x.id-y.id);
  for(const o of orders.filter(o=>o.resting&&!o.liquidation))(o.sign===1?bids:asks).push(o);sort(bids);sort(asks);
  const quotes=makerBook(s,a.id);for(const [sign,levels] of [[-1,quotes.asks],[1,quotes.bids]])for(const l of levels)process({id:s.seq++,actor:'system',asset:a.id,sign,price:l.price,remaining:l.qty});
  urgent();
  for(const o of orders.filter(o=>!o.resting&&!o.liquidation))process(o);
  urgent();
  s.flow ||= {cash:1000000,inventory:{}};const inventory=s.flow.inventory[a.id]||0;
  const bias=Math.max(-.35,Math.min(.35,(a.fair/a.price-1)*2-(inventory/a.model.depth)));
  let sign=random()<.5+bias?1:-1;
  const flowLimit=a.model.kind==='crypto'?80000:20000;
  if(inventory>=flowLimit*.8)sign=-1;else if(inventory<=-flowLimit*.8)sign=1;
  const feasible=dir=>((dir===1?quotes.asks:quotes.bids).length>0)&&(dir!==1||s.flow.cash>=Math.max(a.price,...quotes.asks.map(l=>l.price))*100)&&(dir===1?inventory<flowLimit:inventory>-flowLimit);
  if(!feasible(sign)&&feasible(-sign))sign=-sign;
  const attempts=1+Math.floor(random()*3),sizeBase=a.model.kind==='crypto'?200:100,sizeSpan=a.model.kind==='crypto'?800:400;
  for(let i=0;i<attempts;i++){
   const currentInventory=s.flow.inventory[a.id]||0;
   let direction=i===0?sign:(random()<.5+(a.fair/a.price-1)*3?1:-1);
   if(currentInventory>=flowLimit*.8)direction=-1;else if(currentInventory<=-flowLimit*.8)direction=1;
   const availableLevels=direction===1?quotes.asks:quotes.bids;
   if(!availableLevels.length)continue;
   const level=availableLevels[Math.min(availableLevels.length-1,Math.floor(random()*availableLevels.length))];
   const room=direction===1?flowLimit-currentInventory:flowLimit+currentInventory;
   const cashRoom=direction===1?Math.floor(s.flow.cash/level.price):Infinity;
   const qty=Math.floor(Math.min(sizeBase+Math.floor(random()*sizeSpan)*1,room,cashRoom)/100)*100;
   if(qty>=100)process({id:s.seq++,actor:'flow',asset:a.id,sign:direction,price:level.price,remaining:qty});
  }
  urgent();
  const invAfter=D.inventory(s,a),netFlow=-(invAfter-invBefore);
  a.momentum=E.round((a.model.rho*(a.momentum||0)+a.model.lambda*(netFlow/a.model.depth))*1e6)/1e6;
  if(trades.length){a.price=trades.at(-1).price;const v=trades.reduce((n,t)=>n+t.qty,0);a.volume+=v;a.history.push({t:time,o:trades[0].price,h:Math.max(...trades.map(t=>t.price)),l:Math.min(...trades.map(t=>t.price)),c:a.price,v,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});}else a.history.push({t:time,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});a.lastReturn=a.price/priorPrice-1;
  const playerTrades=trades.filter(t=>t.source==='player'),playerQty=playerTrades.reduce((n,t)=>n+t.qty,0),changePct=(a.price/priorPrice-1)*100,windowChangePct=(a.price/reference-1)*100;
  if(playerQty>0&&(Math.abs(changePct)>=3||Math.abs(windowChangePct)>=8||playerQty>=5000)&&time-(a.lastPlayerReportAt||0)>=5*60000){const participants=new Map();for(const t of playerTrades)for(const id of new Set([t.buyUserId,t.sellUserId].filter(Boolean)))participants.set(id,(participants.get(id)||0)+t.qty);const leaders=[...participants].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,qty])=>({name:s.accounts[id]?.username||'玩家',qty}));const action=changePct>=3?'明显拉升':changePct<=-3?'明显下跌':windowChangePct>=8?'五分钟明显拉升':windowChangePct<=-8?'五分钟明显下跌':'出现大额成交';report(s,a,time,a.name+action+'，玩家参与成交'+playerQty+'份','本分钟从 '+priorPrice.toFixed(2)+' 变为 '+a.price.toFixed(2)+'，涨跌 '+changePct.toFixed(2)+'%，五分钟参考区间涨跌 '+windowChangePct.toFixed(2)+'%。玩家参与的成交量为 '+playerQty+'份；同一笔双边玩家成交只计一次。'+(leaders.length?' 主要参与：'+leaders.map(p=>p.name+'（'+p.qty+'份）').join('、')+'。':''),{playerQty,priceChangePct:E.round(changePct),windowChangePct:E.round(windowChangePct),participants:leaders});a.lastPlayerReportAt=time;}
 }
 for(let pass=0;pass<3;pass++){const count=s._trades.length;for(const urgent of urgentHandlers)urgent();if(s._trades.length===count)break;}
 for(const a of Object.values(s.accounts)){a.orders=a.orders.filter(o=>o.remaining>0);for(const o of a.orders)o.resting=true;warnings.push(...E.checkRisk(context(s,a.id)));for(const o of a.orders)if(o.liquidation){o.userId=a.id;o.resting=false;}}
 for(const a of s.assets){const bar=a.history.at(-1);if(bar?.t===time){const fills=s._trades.filter(t=>t.asset===a.id&&t.time===time);bar.amount=E.round(fills.reduce((n,t)=>n+t.price*t.qty,0));bar.spotV=fills.reduce((n,t)=>n+(t.spotQty||0),0);}}
 C.evaluate(s,time,order,book);s.round++;return {tradeCount,systemTradeCount,warnings};
}
function book(s,id){if(s.assets.find(a=>a.id===id).pausedUntil>s.lastTick)return {asks:[],bids:[]};const b=makerBook(s,id);for(const u of Object.values(s.accounts))for(const o of u.orders.filter(o=>o.asset===id&&!o.liquidation&&G.allowed(s.assets.find(a=>a.id===id),o.price))){const levels=o.sign===1?b.bids:b.asks,l=levels.find(l=>l.price===o.price);if(l)l.qty+=o.remaining;else levels.push({price:o.price,qty:o.remaining});}b.asks.sort((a,b)=>a.price-b.price);b.bids.sort((a,b)=>b.price-a.price);return {asks:b.asks.slice(0,5),bids:b.bids.slice(0,5)};}
function ranking(s,board='assets'){
 const rows=Object.values(s.accounts).map(a=>{const c=context(s,a.id),equity=E.equity(c),pnl=E.round(equity-100000),dailyPnl=E.round(equity-(a.dayStartEquity??100000)),engaged=!!(a.hasTraded||a.fills.length||a.orders.length||Object.keys(a.positions).length||Object.keys(a.spotPositions).length||pnl!==0);return {userId:a.id,name:a.username,equity,returnPct:E.round(pnl/100000*100),pnl,dailyPnl,dailyReturnPct:(a.dayStartEquity??100000)>0?E.round(dailyPnl/(a.dayStartEquity??100000)*100):null,createdAt:a.createdAt,orders:orderSummary(s,a),engaged};}).filter(a=>a.engaged&&(board==='profit'?a.dailyPnl>0:board==='loss'?a.dailyPnl<0:true));
 rows.sort((a,b)=>(board==='profit'?b.dailyPnl-a.dailyPnl:board==='loss'?a.dailyPnl-b.dailyPnl:b.equity-a.equity)||a.createdAt-b.createdAt||a.userId-b.userId);
 return rows.map(({engaged,...a},i)=>({...a,rank:i+1}));
}
function assetView(s,a){let p=D.pe(a);if(a.kind==='etf'&&Array.isArray(a.basket)){let num=0,den=0;for(const b of a.basket){const m=s.assets.find(x=>x.id===b.asset);if(m&&m.eps>0){num+=b.quantity*m.price;den+=b.quantity*m.eps;}}p=den>0?num/den:null;}return {id:a.id,name:a.name,code:a.code,kind:a.kind||'stock',price:a.price,mark:a.mark,fair:E.round(a.fair),prevClose:a.prevClose,open:a.open,changePct:a.prevClose?E.round((a.price/a.prevClose-1)*100):0,pausedUntil:a.pausedUntil||0,eps:a.eps??null,targetPE:a.targetPE??null,pe:p===null?null:E.round(p*100)/100,model:a.model?{kind:a.model.kind,gamma:a.model.gamma,spread:a.model.spread}:null};}
function overview(s){return {ok:true,updatedAt:s.lastTick,halted:!!s.halted,maintenance:s.maintenanceUntil?{until:s.maintenanceUntil}:null,announcement:s.announcement||null,assets:s.assets.map(a=>assetView(s,a))};}
function liquidityDiagnostics(s){return {makerCash:s.system.cash,flowCash:s.flow?.cash||0,totalSystemCash:E.round(s.system.cash+(s.flow?.cash||0)),insuranceCash:s.insurance?.balance,insuranceTarget:insuranceTarget(s),netOI:Object.fromEntries(s.assets.map(a=>[a.id,netExposure(s,a.id)])),assets:s.assets.map(a=>{const b=makerBook(s,a.id),limit=makerLimit(s,a.id),inventory=s.system.inventory[a.id]||0,flowInventory=s.flow?.inventory?.[a.id]||0,band=G.bands(a),paused=a.pausedUntil>s.lastTick;return {id:a.id,paused,mark:a.mark,band,inventoryLimit:limit,makerInventory:inventory,flowInventory,combinedInventory:inventory+flowInventory,systemBidQty:paused?0:b.bids.reduce((n,l)=>n+l.qty,0),systemAskQty:paused?0:b.asks.reduce((n,l)=>n+l.qty,0),buyConstraints:[...(paused?['熔断暂停']:[]),...(inventory>=limit?['做市多头库存达到上限']:[]),...(s.system.cash<band.lower*100?['做市现金不足100份买入']:[]),...(!paused&&inventory<limit&&s.system.cash>=band.lower*100&&!b.bids.length?['当前报价被动态价格保护过滤']:[])]};})};}
function quoteStats(s,a){const since=a.tradeStatsSince??s.lastTick,cutoff=s.lastTick-86400000,bars=a.history.filter(b=>b.t>cutoff&&b.t>since&&b.t<=s.lastTick&&Number.isFinite(b.amount)),volume=bars.reduce((n,b)=>n+b.v,0),spotVolume=bars.reduce((n,b)=>n+(b.spotV||0),0),amount=E.round(bars.reduce((n,b)=>n+b.amount,0)),referenceFloat=a.referenceFloat||(a.kind==='etf'||a.kind==='crypto'?10000000:5000000);return {volume,spotVolume,amount,referenceFloat,turnover:spotVolume/referenceFloat*100,since,partial:s.lastTick-since<86400000};}
function snapshot(s,assetId,user){const assets=s.assets.map(a=>({...a,priceProtection:undefined,priceBand:G.bands(a),quoteStats:a.id===assetId?quoteStats(s,a):undefined,history:a.id===assetId?a.history:[],pe:D.pe(a)}));const account=user&&s.accounts[String(user.id)];return {ok:true,mode:'online',serverTime:Date.now(),revision:s.revision,announcement:s.announcement||null,maintenance:s.maintenanceUntil?{until:s.maintenanceUntil}:null,market:{assets,news:s.news,round:s.round,lastTick:s.lastTick,books:Object.fromEntries(s.assets.map(a=>[a.id,book(s,a.id)])),marketTrades:(s.marketTrades||[]).map(({buyUserId,sellUserId,...t})=>t),insurance:{...s.insurance,target:insuranceTarget(s)},halted:s.halted||false},account:account?JSON.parse(JSON.stringify({...account,conditions:C.list(account)})):null,identity:user?{id:user.id,username:user.username}:null,rank:user?ranking(s).find(r=>r.userId===user.id)?.rank||null:null};}
module.exports={liquidityDiagnostics,quoteStats,overview,create,context,join,order,tick,ranking,snapshot,day,netExposure};






