'use strict';
const E=require('../../js/gensokyo-engine.js'),D=require('../../js/gensokyo-market-data.js'),C=require('./conditions.cjs');
function create(now=Date.now()){const s=D.prepare(E.create(),now);require('./seed.cjs').applySeed(s,now);E.refreshEtf(s);s.randomSeed=require('node:crypto').randomBytes(4).readUInt32LE();s.accounts={};s.businessDay=day(now);s.revision=0;s.serverVersion=1;return s;}
function day(t){return new Date(t+4*3600000).toISOString().slice(0,10);}
function context(s,id){const a=s.accounts[String(id)];if(!a)throw Error('尚未开通交易账户');const c={assets:s.assets,system:s.system,flow:s.flow,insurance:s.insurance};for(const k of ['cash','fees','realized','positions','spotPositions','orders','fills'])Object.defineProperty(c,k,{get:()=>a[k],set:v=>{a[k]=v;},enumerable:true});for(const k of ['seq','round','executionTime'])Object.defineProperty(c,k,{get:()=>s[k],set:v=>{s[k]=v;}});return c;}
function join(s,user,now=Date.now()){const id=String(user.id);if(s.accounts[id]){s.accounts[id].username=user.username;return false;}s.accounts[id]={id:Number(user.id),username:user.username,createdAt:now,cash:100000,fees:0,realized:0,positions:{},spotPositions:{},orders:[],fills:[],dayStartEquity:100000};s._journal ||= [];s._journal.push({event:'initial-'+id,userId:Number(id),time:now,kind:'initial-funding',cashDelta:100000,cashAfter:100000});return true;}
function order(s,user,body,now=Date.now()){if(!['spot','contract'].includes(body.product))throw Error('请选择普通交易或杠杆合约');const c=context(s,user.id),a=s.assets.find(a=>a.id===body.asset),position=body.product==='spot'?c.spotPositions[body.asset]:c.positions[body.asset],legacyExit=['sell','close'].includes(body.intent)&&position&&body.qty===position.qty&&position.qty%100!==0;if(a?.pausedUntil>now)throw Object.assign(Error('该标的临时停牌，恢复后再下单'),{status:409});if(!Number.isSafeInteger(body.qty)||body.qty<=0||(body.qty%100!==0&&!legacyExit))throw Object.assign(Error('数量必须是100份的整数倍；旧零股仓位只能整笔退出'),{status:400});const o=E.submit(c,body.asset,body.intent,body.price,body.qty,body.leverage,body.product,now,body.marginMode||'isolated');o.userId=user.id;o.resting=false;o.lotSize=100;o.legacyExit=!!legacyExit;return o;}
function makerLimit(s,id){const exposure=Object.values(s.accounts).reduce((n,u)=>n+(u.positions[id]?.qty||0)+(u.spotPositions[id]?.qty||0),0);return Math.min(s.assets.find(a=>a.id===id).kind==='crypto'?400000:100000,(s.assets.find(a=>a.id===id).kind==='crypto'?80000:20000)+2*exposure);}
// Quotes are deterministic within a minute: polling cannot reroll liquidity.
function quoteNoise(s,id,salt){let h=2166136261;for(const c of id+':'+s.lastTick+':'+salt)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return ((h^(h>>>16))>>>0)/4294967296;}
function makerBook(s,id){
 const a=s.assets.find(a=>a.id===id),crypto=a.kind==='crypto',inv=s.system.inventory[id]||0,limit=makerLimit(s,id);
 const bars=a.history.slice(-10),vol=Math.min(.03,bars.reduce((n,b)=>n+(b.h-b.l)/Math.max(b.c,1),0)/Math.max(bars.length,1));
 const pending=Object.values(s.accounts).flatMap(u=>u.orders).filter(o=>o.asset===id&&o.remaining>0&&Math.abs(o.price/a.price-1)<.03);
 const pressure=Math.max(-1,Math.min(1,pending.reduce((n,o)=>n+o.sign*o.remaining,0)/30000));
 const step=Math.max(.1,Math.round(a.price*(crypto?.003+vol*.35:.0007+vol*.15)*10)/10);
 const center=Math.max(step*6,a.price+Math.max(-a.price*(crypto?.04:.0015),Math.min(a.price*(crypto?.04:.0015),(a.fair-a.price)*(crypto?.65:.08)))+(a.sentiment||0)+pressure*a.price*.0005-inv/limit*a.price*.0015);
 const bestBid=Math.max(.1,Math.floor(center*10)/10),bestAsk=E.round(bestBid+.1);
 const side=sign=>{let left=sign===1?Math.max(0,limit-inv):Math.max(0,limit+inv),cash=Math.max(0,s.system.cash),gap=0;return Array.from({length:5},(_,i)=>{
  if(i)gap+=step*(quoteNoise(s,id,'gap:'+i)<.85?1:2);
  const price=E.round((sign===1?bestBid:bestAsk)-sign*gap),noise=quoteNoise(s,id,sign+':'+i);
  const depth=(crypto?6000+i*1500:1800+i*500)*(.45+noise*1.8)*(1-vol*8)*(1-sign*inv/limit*.25);
  const qty=Math.max(0,Math.floor(Math.min(left,depth,sign===1?Math.floor(cash/price):Infinity)/100)*100);
  left-=qty;if(sign===1)cash-=price*qty;return {price,qty};
 }).filter(l=>l.qty>0);};return {asks:side(-1),bids:side(1)};
}
function report(s,a,time,title,body,extra={}){s.news.unshift({id:'report-'+s.seq++,kind:'market-report',asset:a.id,time,category:'交易动态',source:'交易所行情监测',title,body,delta:0,...extra});s.news=s.news.slice(0,64);}
function orderSummary(s,account){const active=account.orders.filter(o=>o.remaining>0),groups=new Map();for(const o of active){const key=JSON.stringify([o.asset,o.product,o.intent,o.liquidation?null:o.price]);let row=groups.get(key);if(!row){row={asset:o.asset,name:s.assets.find(a=>a.id===o.asset)?.name||o.asset,product:o.product||'contract',intent:o.intent,price:o.liquidation?null:o.price,liquidation:!!o.liquidation,remaining:0};groups.set(key,row);}row.remaining+=o.remaining;}return {count:active.length,totalQty:active.reduce((n,o)=>n+o.remaining,0),buyQty:active.filter(o=>o.sign===1).reduce((n,o)=>n+o.remaining,0),sellQty:active.filter(o=>o.sign===-1).reduce((n,o)=>n+o.remaining,0),groupCount:groups.size,majorOrders:[...groups.values()].sort((a,b)=>b.remaining-a.remaining||b.price-a.price).slice(0,5)};}
function cancelPausedOrders(s,asset,time){let count=0;for(const u of Object.values(s.accounts)){const cancelled=u.orders.filter(o=>o.asset===asset&&o.remaining>0);for(const o of cancelled){count++;s._journal ||= [];s._journal.push({event:'circuit-cancel-'+s.seq++,userId:u.id,time,kind:'circuit-cancel',cashDelta:0,cashAfter:u.cash,asset,orderId:o.id,remaining:o.remaining,reason:'熔断自动撤单'});if(o.conditionId){const c=u.conditions?.find(c=>c.id===o.conditionId);if(c){c.status='cancelled';c.reason='熔断自动撤回未成交委托，已成交部分保留';}}}u.orders=u.orders.filter(o=>o.asset!==asset);}return count;}
function tick(s,{time,random=Math.random}){
 s.executionTime=time;s._journal ||= [];s._trades ||= [];let tradeCount=0,systemTradeCount=0;const warnings=[],urgentHandlers=[];let riskDirty=true;
 if(day(time)!==s.businessDay){s._snapshots ||= [];for(const a of Object.values(s.accounts)){const c=context(s,a.id),equity=E.equity(c);s._snapshots.push({day:s.businessDay,userId:a.id,equity,time});a.dayStartEquity=equity;}s.businessDay=day(time);}
 function checkAllRisk(){if(!riskDirty)return;riskDirty=false;for(const account of Object.values(s.accounts)){warnings.push(...E.checkRisk(context(s,account.id)));for(const o of account.orders)if(o.liquidation){o.userId=account.id;o.resting=false;o.submittedAt=time;o.lotSize=100;}}}
 checkAllRisk();
 const reduce=o=>o.intent==='close'||o.intent==='sell';
 function capacity(o,price,wanted){if(o.userId){const c=context(s,o.userId);if(!c.orders.includes(o))return 0;if(!reduce(o)&&Object.values(c.positions).some(p=>p.liquidating||E.risk(c,p).riskRate>=1))return 0;if(reduce(o)){const p=o.product==='spot'?c.spotPositions[o.asset]:c.positions[o.asset];if(p&&o.product!=='spot'&&E.isCross(p)&&E.otherCrossPnl(c,o.asset)>.01){const costPerUnit=(p.entry-price)*p.sign+price*.0005;if(costPerUnit>0)return Math.min(wanted,p.qty,Math.max(0,Math.floor((E.crossFunds(c)-.01)/costPerUnit)));}return Math.min(wanted,p?.qty||0);}if(price>o.price){const extra=(price-o.price)*(1/o.leverage+.0005);return Math.min(wanted,Math.max(0,Math.floor((E.available(c)-.02)/extra)));}return wanted;}
  const actor=s[o.actor],inv=actor.inventory[o.asset]||0,limit=o.actor==='flow'?(s.assets.find(a=>a.id===o.asset).kind==='crypto'?80000:20000):makerLimit(s,o.asset);let q=Math.min(wanted,Math.max(0,o.sign===1?limit-inv:limit+inv));if(o.sign===1)q=Math.min(q,Math.floor(Math.max(0,actor.cash)/price));return q;
 }
 // A contract close pays realized PnL rather than exchanging spot principal.
 // Reserve its actual net payout as well as the orderbook's inventory/cash capacity.
 function settlementCapacity(x,y,price){
  const pnl=o=>{if(!o.userId||o.product==='spot'||o.intent!=='close')return 0;const p=s.accounts[o.userId].positions[o.asset];return p?(price-p.entry)*p.sign:0;};
  const cost=pnl(x)+pnl(y);if(cost<=0)return Infinity;
  const payer=x.userId&&y.userId?s.system:s[(x.userId?y:x).actor];
  return Math.max(0,Math.floor(Math.max(0,payer.cash)/cost));
 }
 function userFill(o,other,price,q,tradeId){const c=context(s,o.userId),before=c.cash,marginBefore=E.margin(c),insuranceBefore=(s.insurance?.paid||0)+(s.insurance?.uncovered||0),position=c.positions[o.asset],direction=position?.sign===1?'long':'short',leverage=position?.leverage||o.leverage,liquidationEventId=position?.liquidationEventId||o.id;E.applyFill(c,o,price,q,other.userId?s.system:s[other.actor]);const f=c.fills[0];s.accounts[o.userId].hasTraded=true;f.marketTradeId=tradeId;if(o.conditionId){const condition=s.accounts[o.userId].conditions?.find(c=>c.id===o.conditionId);if(condition)condition.filledQty=(condition.filledQty||0)+q;}s._journal.push({event:'fill-'+f.id,userId:o.userId,time,kind:o.liquidation?'liquidation':'trade',cashDelta:E.round(c.cash-before),cashAfter:c.cash,fillId:f.id,marketTradeId:tradeId,orderId:o.id,intent:o.intent,product:o.product,leverage:o.leverage,marginDelta:E.round(E.margin(c)-marginBefore),asset:o.asset,qty:q,price,insuranceFee:f.insuranceFee||0,...(o.liquidation||((s.insurance?.paid||0)+(s.insurance?.uncovered||0)>insuranceBefore)?{liquidation:{orderId:liquidationEventId,direction,leverage,extraLoss:E.round((s.insurance?.paid||0)+(s.insurance?.uncovered||0)-insuranceBefore),complete:o.remaining===0}}:{})});}
 for(const a of s.assets){if(a.kind==='etf')E.refreshEtf(s);if(a.pausedUntil>time){cancelPausedOrders(s,a.id,time);a.history.push({t:time,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});continue;}if(a.pausedUntil){report(s,a,time,a.name+'恢复交易','熔断暂停结束，本分钟恢复撮合。原未成交委托已撤回，需要重新下单。');a.volatilityAnchor={time,price:a.price};delete a.pausedUntil;delete a.pauseReason;}const cutoff=time-5*60000,anchor=a.volatilityAnchor,reference=anchor&&anchor.time>cutoff?anchor.price:(a.history.findLast(b=>b.t<=cutoff)?.c||a.price);if(a.kind==='crypto'){const shock=(random()+random()+random()-1.5)*.03+(random()<.04?(random()-.5)*.12:0);a.fair=Math.max(1,(a.fair*.8+a.price*.2)*Math.exp(shock+(a.lastReturn||0)*.15));}const bids=[],asks=[],trades=[];const sort=side=>side.sort((x,y)=>(side===bids?y.price-x.price:x.price-y.price)||x.id-y.id);
  let sweeping=false;
  function urgent(){if(sweeping||a.pausedUntil>time)return;sweeping=true;try{checkAllRisk();for(const account of Object.values(s.accounts))for(const o of [...account.orders])if(o.asset===a.id&&o.liquidation&&o.remaining>0)process(o);}finally{sweeping=false;}}
  let bookedQty=0;
  urgentHandlers.push(()=>{urgent();if(a.history.at(-1)?.t===time&&trades.length){const bar=a.history.at(-1),v=trades.reduce((n,t)=>n+t.qty,0);a.price=a.mark=trades.at(-1).price;bar.h=Math.max(bar.h,...trades.map(t=>t.price));bar.l=Math.min(bar.l,...trades.map(t=>t.price));bar.c=a.price;bar.v=v;a.volume+=v-bookedQty;bookedQty=v;}});
  function process(incoming){if(a.pausedUntil>time||incoming.userId&&!s.accounts[incoming.userId].orders.includes(incoming))return;if(!sweeping&&!incoming.liquidation){const side=incoming.sign===1?bids:asks;side.push(incoming);sort(side);urgent();const index=side.indexOf(incoming);if(index>=0)side.splice(index,1);if(incoming.remaining<=0||incoming.userId&&!s.accounts[incoming.userId].orders.includes(incoming))return;}const opposing=incoming.sign===1?asks:bids;sort(opposing);while(incoming.remaining>0&&opposing.length&&!(a.pausedUntil>time)){const passive=opposing[0];if(incoming.sign===1?passive.price>incoming.price:passive.price<incoming.price)break;
    if(incoming.userId&&incoming.userId===passive.userId){if(incoming.liquidation){opposing.shift();continue;}incoming.remaining=0;break;}
    if(!incoming.userId&&!passive.userId&&incoming.actor===passive.actor){incoming.remaining=0;break;}
    const price=passive.price,wanted=Math.min(incoming.remaining,passive.remaining),inCap=capacity(incoming,price,wanted),outCap=capacity(passive,price,wanted),rawQty=Math.min(inCap,outCap,settlementCapacity(incoming,passive,price)),oddExit=(!incoming.userId||!passive.userId)&&[incoming,passive].some(o=>o.legacyExit||o.liquidation||o.userId&&!o.lotSize),q=oddExit&&rawQty<100?rawQty:Math.floor(rawQty/100)*100;
    if(q<=0){if(outCap<100&&!(oddExit&&outCap>0)){passive.remaining=0;opposing.shift();continue;}incoming.remaining=0;break;}
    const tradeId=s.seq++,buyer=incoming.sign===1?incoming:passive,seller=incoming.sign===-1?incoming:passive;
    if(buyer.userId)userFill(buyer,seller,price,q,tradeId);if(seller.userId)userFill(seller,buyer,price,q,tradeId);
    if(!buyer.userId&&!seller.userId){s[buyer.actor].cash=E.round(s[buyer.actor].cash-price*q);s[seller.actor].cash=E.round(s[seller.actor].cash+price*q);s[buyer.actor].inventory[a.id]=(s[buyer.actor].inventory[a.id]||0)+q;s[seller.actor].inventory[a.id]=(s[seller.actor].inventory[a.id]||0)-q;}
    if(!buyer.userId)buyer.remaining-=q;if(!seller.userId)seller.remaining-=q;
    const source=buyer.userId||seller.userId?'player':'system',record={id:tradeId,asset:a.id,price,qty:q,time,round:s.round,source,sign:incoming.sign,buyUserId:buyer.userId||null,sellUserId:seller.userId||null};trades.push(record);s._trades.push(record);s.marketTrades ||= [];s.marketTrades.unshift(record);s.marketTrades=s.marketTrades.slice(0,100);if(source==='player')tradeCount++;else systemTradeCount++;if(!passive.remaining)opposing.shift();a.price=price;a.mark=price;riskDirty=true;checkAllRisk();if(Math.abs(price-reference)+1e-8>=reference*(a.kind==='crypto'?.30:.20)){a.pausedUntil=time+3*60000;a.pauseStartedAt=time;a.pauseReason='5分钟价格偏离达到'+(a.kind==='crypto'?'30%':'20%');const cancelledCount=cancelPausedOrders(s,a.id,time);report(s,a,time,a.name+'触发熔断，暂停交易3分钟',a.pauseReason+'。本标的立即暂停撮合，未成交委托已全部撤回（'+cancelledCount+'笔），已成交部分保留。预计'+D.time(a.pausedUntil,true)+'恢复。',{category:'熔断通告',source:'交易所公告',resumeAt:a.pausedUntil,cancelledCount});break;}
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
  a.newsPressure=(a.newsPressure||0)*.96;
  const bias=Math.max(-.35,Math.min(.35,(a.fair/a.price-1)*2+(a.lastReturn||0)*8+a.newsPressure*25-inventory/60000));let sign=random()<.5+bias?1:-1;
  if(inventory>=(a.kind==='crypto'?64000:16000))sign=-1;else if(inventory<=-(a.kind==='crypto'?64000:16000))sign=1;
  const flowBound=a.kind==='crypto'?80000:20000;const feasible=dir=>((dir===1?quotes.asks:quotes.bids).length>0)&&(dir!==1||s.flow.cash>=Math.max(a.price,...quotes.asks.map(l=>l.price))*100)&&(dir===1?inventory<flowBound:inventory>-flowBound);
  if(!feasible(sign)&&feasible(-sign))sign=-sign;
  const crypto=a.kind==='crypto',flowLimit=crypto?80000:20000,attempts=crypto?8+Math.floor(random()*9):1+Math.floor(random()*3);
  for(let i=0;i<attempts;i++){
   const currentInventory=s.flow.inventory[a.id]||0;
   const style=Math.floor(random()*3),valueBias=Math.max(-.4,Math.min(.4,(a.fair/a.price-1)*4)),trendBias=Math.max(-.4,Math.min(.4,(a.lastReturn||0)*20+a.newsPressure*20));
   let direction=i===0?sign:(random()<.5+(style===0?valueBias:style===1?trendBias:0)-currentInventory/(crypto?320000:80000)?1:-1);
   if(currentInventory>=flowLimit*.8)direction=-1;else if(currentInventory<=-flowLimit*.8)direction=1;
   const availableLevels=direction===1?quotes.asks:quotes.bids;
   if(!availableLevels.length)continue;
   const level=availableLevels[Math.min(availableLevels.length-1,Math.floor(random()*availableLevels.length))];
   const room=direction===1?flowLimit-currentInventory:flowLimit+currentInventory;
   const cashRoom=direction===1?Math.floor(s.flow.cash/level.price):Infinity;
   const qty=Math.floor(Math.min((crypto?2000:500)+Math.floor(random()*(crypto?160:55))*100,room,cashRoom)/100)*100;
   if(qty>=100)process({id:s.seq++,actor:'flow',asset:a.id,sign:direction,price:level.price,remaining:qty});
  }
  a.sentiment=E.round(Math.max(-a.price*(crypto?.04:.006),Math.min(a.price*(crypto?.04:.006),(a.sentiment||0)*.6+(random()-.5)*a.price*(crypto?.04:.006))));
  urgent();
  if(trades.length){a.price=trades.at(-1).price;const v=trades.reduce((n,t)=>n+t.qty,0);a.volume+=v;a.history.push({t:time,o:trades[0].price,h:Math.max(...trades.map(t=>t.price)),l:Math.min(...trades.map(t=>t.price)),c:a.price,v,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});}else a.history.push({t:time,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});a.lastReturn=a.price/priorPrice-1;
  const playerTrades=trades.filter(t=>t.source==='player'),playerQty=playerTrades.reduce((n,t)=>n+t.qty,0),changePct=(a.price/priorPrice-1)*100,windowChangePct=(a.price/reference-1)*100;
  if(playerQty>0&&(Math.abs(changePct)>=3||Math.abs(windowChangePct)>=8||playerQty>=5000)&&time-(a.lastPlayerReportAt||0)>=5*60000){const participants=new Map();for(const t of playerTrades)for(const id of new Set([t.buyUserId,t.sellUserId].filter(Boolean)))participants.set(id,(participants.get(id)||0)+t.qty);const leaders=[...participants].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,qty])=>({name:s.accounts[id]?.username||'玩家',qty}));const action=changePct>=3?'明显拉升':changePct<=-3?'明显下跌':windowChangePct>=8?'五分钟明显拉升':windowChangePct<=-8?'五分钟明显下跌':'出现大额成交';report(s,a,time,a.name+action+'，玩家参与成交'+playerQty+'份','本分钟从 '+priorPrice.toFixed(2)+' 变为 '+a.price.toFixed(2)+'，涨跌 '+changePct.toFixed(2)+'%，五分钟参考区间涨跌 '+windowChangePct.toFixed(2)+'%。玩家参与的成交量为 '+playerQty+'份；同一笔双边玩家成交只计一次。'+(leaders.length?' 主要参与：'+leaders.map(p=>p.name+'（'+p.qty+'份）').join('、')+'。':''),{playerQty,priceChangePct:E.round(changePct),windowChangePct:E.round(windowChangePct),participants:leaders});a.lastPlayerReportAt=time;}
  bookedQty=trades.reduce((n,t)=>n+t.qty,0);if(trades.length)a.mark=a.price;
 }
 for(let pass=0;pass<3;pass++){const count=s._trades.length;for(const urgent of urgentHandlers)urgent();if(s._trades.length===count)break;}
 for(const a of Object.values(s.accounts)){a.orders=a.orders.filter(o=>o.remaining>0);for(const o of a.orders)o.resting=true;warnings.push(...E.checkRisk(context(s,a.id)));for(const o of a.orders)if(o.liquidation){o.userId=a.id;o.resting=false;}}
 C.evaluate(s,time,order,book);s.round++;return {tradeCount,systemTradeCount,warnings};
}
function book(s,id){if(s.assets.find(a=>a.id===id).pausedUntil>s.lastTick)return {asks:[],bids:[]};const b=makerBook(s,id);for(const u of Object.values(s.accounts))for(const o of u.orders.filter(o=>o.asset===id&&!o.liquidation)){const levels=o.sign===1?b.bids:b.asks,l=levels.find(l=>l.price===o.price);if(l)l.qty+=o.remaining;else levels.push({price:o.price,qty:o.remaining});}b.asks.sort((a,b)=>a.price-b.price);b.bids.sort((a,b)=>b.price-a.price);return {asks:b.asks.slice(0,5),bids:b.bids.slice(0,5)};}
function ranking(s,board='assets'){
 const rows=Object.values(s.accounts).map(a=>{const c=context(s,a.id),equity=E.equity(c),pnl=E.round(equity-100000),dailyPnl=E.round(equity-(a.dayStartEquity??100000)),engaged=!!(a.hasTraded||a.fills.length||a.orders.length||Object.keys(a.positions).length||Object.keys(a.spotPositions).length||pnl!==0);return {userId:a.id,name:a.username,equity,returnPct:E.round(pnl/100000*100),pnl,dailyPnl,dailyReturnPct:(a.dayStartEquity??100000)>0?E.round(dailyPnl/(a.dayStartEquity??100000)*100):null,createdAt:a.createdAt,orders:orderSummary(s,a),engaged};}).filter(a=>a.engaged&&(board==='profit'?a.dailyPnl>0:board==='loss'?a.dailyPnl<0:true));
 rows.sort((a,b)=>(board==='profit'?b.dailyPnl-a.dailyPnl:board==='loss'?a.dailyPnl-b.dailyPnl:b.equity-a.equity)||a.createdAt-b.createdAt||a.userId-b.userId);
 return rows.map(({engaged,...a},i)=>({...a,rank:i+1}));
}
function overview(s){return {ok:true,updatedAt:s.lastTick,halted:!!s.halted,assets:s.assets.map(a=>{const base=a.history.findLast(b=>b.t<=s.lastTick-86400000)?.c||a.prev;return {id:a.id,name:a.name,kind:a.kind||'stock',price:a.price,changePct:E.round((a.price/base-1)*100),pausedUntil:a.pausedUntil||0};})};}
function snapshot(s,assetId,user){const assets=s.assets.map(a=>({...a,history:a.id===assetId?a.history:[]}));const account=user&&s.accounts[String(user.id)];return {ok:true,mode:'online',serverTime:Date.now(),revision:s.revision,market:{assets,news:s.news,round:s.round,lastTick:s.lastTick,books:Object.fromEntries(s.assets.map(a=>[a.id,book(s,a.id)])),marketTrades:(s.marketTrades||[]).map(({buyUserId,sellUserId,...t})=>t),insurance:s.insurance,halted:s.halted||false},account:account?JSON.parse(JSON.stringify({...account,conditions:C.list(account)})):null,identity:user?{id:user.id,username:user.username}:null,rank:user?ranking(s).find(r=>r.userId===user.id)?.rank||null:null};}
module.exports={overview,create,context,join,order,tick,ranking,snapshot,day};
