/* Local practice engine. No network or real-money transactions. */
(function(root){
 'use strict';
 const specs=[['kappa','河童重工','KAPPA · 001',101.3],['moriya','守矢能源','MORIYA · 002',86.7],['eientei','永远亭制药','EIENTEI · 003',128.4],['scarlet','红魔商事','SCARLET · 004',65.2],['hakugyoku','白玉楼文旅','HAKU · 005',72.5],['tengu','天狗传媒','TENGU · 006',58.6],['chirei','地灵矿业','CHIREI · 007',94.8],['myouren','命莲物流','MYOUREN · 008',46.3],['kourin','香霖古物','KOURIN · 010',38.8],['kazami','花田农业','KAZAMI · 011',52.6],['mistlake','冰湖冷链','MIST · 012',31.2],['forest','魔森工坊','FOREST · 013',118.5]];
 const LEVERAGES=[2,3,5,10,20],MMR=.01,FEE=.0005;
 const COINS=[['kirisame-coin','雾雨币','MRC · 虚拟币',80]],CRYPTO_LEVERAGES=[...LEVERAGES,50,75,100];
 const leverages=a=>a?.kind==='crypto'?CRYPTO_LEVERAGES:LEVERAGES,maintenanceRate=a=>a?.kind==='crypto'?.0025:MMR;
 const round=n=>Math.round(n*100)/100;
 function expandMarket(s){
  for(const [id,name,code,price] of COINS)if(!s.assets.some(a=>a.id===id))s.assets.push({id,name,code,kind:'crypto',price,prev:price,fair:price,mark:price,history:[],volume:0});
  for(const [id,name,code,price] of specs)if(!s.assets.some(a=>a.id===id))s.assets.push({id,name,code,price,prev:price,fair:price,mark:price,history:[],volume:0});
  if(!s.assets.some(a=>a.id==='gensokyo-etf'))s.assets.push({id:'gensokyo-etf',name:'幻想乡产业ETF',code:'GSKY · ETF009',kind:'etf',price:100,prev:100,fair:100,mark:100,history:[],volume:0,basket:specs.slice(0,8).map(([id,,,base])=>({asset:id,quantity:100/8/base,initialWeight:1/8}))});
  s.insurance ||= {balance:10000000,paid:0,uncovered:0,initialCapital:10000000};refreshEtf(s);s.assets.sort((a,b)=>(a.kind==='crypto')-(b.kind==='crypto'));return s;
 }
 function iopv(s,etf){return etf.basket.reduce((v,b)=>v+b.quantity*s.assets.find(a=>a.id===b.asset).price,0);}
 function refreshEtf(s){for(const a of s.assets.filter(a=>a.kind==='etf')){a.iopv=iopv(s,a);a.fair=a.iopv;}}
 function isCross(p){return p.marginMode==='cross';}
 function isolatedMargin(s){return Object.values(s.positions).filter(p=>!isCross(p)).reduce((n,p)=>n+p.margin,0);}
 function crossPnl(s){return Object.values(s.positions).filter(isCross).reduce((n,p)=>n+(s.assets.find(a=>a.id===p.asset).mark-p.entry)*p.qty*p.sign,0);}
 function otherCrossPnl(s,asset){return Object.values(s.positions).filter(p=>isCross(p)&&p.asset!==asset).reduce((n,p)=>n+(s.assets.find(a=>a.id===p.asset).mark-p.entry)*p.qty*p.sign,0);}
 function crossFunds(s){return Math.max(0,s.cash-isolatedMargin(s)-frozen(s));}
 function risk(s,p){const a=s.assets.find(a=>a.id===p.asset),ownNotional=a.mark*p.qty,cross=isCross(p),group=cross?Object.values(s.positions).filter(isCross):[p],notional=group.reduce((n,x)=>n+s.assets.find(a=>a.id===x.asset).mark*x.qty,0),equity=cross?crossFunds(s)+crossPnl(s):p.margin+(a.mark-p.entry)*p.qty*p.sign,maintenance=group.reduce((n,x)=>n+s.assets.find(a=>a.id===x.asset).mark*x.qty*maintenanceRate(s.assets.find(a=>a.id===x.asset)),0),feeReserve=notional*FEE,mmr=maintenanceRate(a);
 const otherPnl=cross?crossPnl(s)-(a.mark-p.entry)*p.qty*p.sign:0,effectiveMargin=cross?crossFunds(s)+otherPnl-(maintenance+feeReserve-ownNotional*(mmr+FEE)):p.margin;
 return {notional,equity,maintenance,feeReserve,initialRate:1/p.leverage,maintenanceRate:mmr,marginRate:equity/notional,riskRate:equity>0?(maintenance+feeReserve)/equity:Infinity,marginMode:cross?'cross':'isolated',liquidationPrice:Math.max(0,(p.entry*p.qty-p.sign*effectiveMargin)/(p.qty*(1-p.sign*(mmr+FEE))))};}
 function setMarginMode(s,asset,mode){const p=s.positions[asset];if(!p||!['isolated','cross'].includes(mode))throw Error('请选择有效的保证金模式');if((p.marginMode||'isolated')===mode)return;
 if(s.orders.some(o=>o.asset===asset&&o.product!=='spot'))throw Error('切换模式前请先撤销该合约委托');
 if(Object.values(s.positions).some(x=>x.liquidating||risk(s,x).riskRate>=.8)||available(s)<0)throw Error('仓位风险过高，暂时不能切换模式');
 const old=p.marginMode;p.marginMode=mode;
 if(Object.values(s.positions).some(x=>risk(s,x).riskRate>=.8)||available(s)<0){p.marginMode=old;throw Error('切换后保证金不足或风险过高，请先减仓或增加资金');}
 }
 function addMargin(s,asset,amount){const p=s.positions[asset];if(p&&isCross(p))throw Error('全仓共享可用现金，无需追加逐仓保证金');amount=Number(amount);if(!p||!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>1e-6)throw Error('请输入有效追加金额（最多两位小数）');if(amount>available(s))throw Error('可用资金不足');p.margin=round(p.margin+amount);if(risk(s,p).riskRate<1){p.liquidating=false;delete p.liquidationEventId;s.orders=s.orders.filter(o=>!(o.asset===asset&&o.liquidation));}}
 function createBase(){return {version:1,round:1,cash:100000,fees:0,realized:0,seq:1,orders:[],positions:{},fills:[],system:{cash:10000000,inventory:{}},news:[{round:1,title:'守矢神社公布能源项目建设计划',body:'项目仍在筹备阶段，设备订单有望流向河童重工。投产时间和实际成本尚未确定。',tag:'建设计划 · 公开消息'}],assets:specs.map(([id,name,code,price],idx)=>{let history=[],v=price*(1-.013*(idx%2? -1:1));for(let i=0;i<45;i++){let o=v;v=round(price+(i-44)*.025+Math.sin(i*.57+idx)*.45);history.push({o,h:round(Math.max(o,v)+.2),l:round(Math.min(o,v)-.2),c:v,v:200+((i*137+idx*53)%900)});}return{id,name,code,price,prev:history[0].o,fair:price,mark:price,history,volume:history.reduce((n,b)=>n+b.v,0)};})};}
 function create(){return expandMarket(createBase());}
 function equity(s){return round(s.cash+Object.values(s.positions).reduce((n,p)=>n+(s.assets.find(a=>a.id===p.asset).mark-p.entry)*p.qty*p.sign,0)+Object.values(s.spotPositions||{}).reduce((n,p)=>n+s.assets.find(a=>a.id===p.asset).price*p.qty,0));}
 function margin(s){return round(Object.values(s.positions).reduce((n,p)=>n+p.margin,0));}
 function frozen(s){return round(s.orders.filter(o=>o.intent!=='close'&&o.intent!=='sell').reduce((n,o)=>n+o.price*o.remaining/o.leverage+Math.ceil(o.price*o.remaining*.0005*100)/100+.05,0));}
 function available(s){return round(s.cash-margin(s)-frozen(s)+Math.min(0,crossPnl(s)));}
 function submit(s,asset,intent,price,qty,leverage,product='contract',time=Date.now(),marginMode='isolated'){
  if(product==='spot')return submitSpot(s,asset,intent,Number(price),Number(qty),time);
  const a=s.assets.find(x=>x.id===asset),p=s.positions[asset];price=Number(price);qty=Number(qty);leverage=Number(leverage);
  if(!a||!['long','short','close'].includes(intent)||!(leverages(a).includes(leverage)||(intent==='close'&&p?.leverage===1&&leverage===1))||!Number.isFinite(price)||price<=0||Math.abs(price*10-Math.round(price*10))>1e-6||!Number.isSafeInteger(qty)||qty<1||qty>100000)throw Error('请选择该标的支持的杠杆，并输入有效价格和整数数量');
  if(s.orders.length>=30)throw Error('最多保留30笔有效委托');
  if(price<a.price*.8||price>a.price*1.2)throw Error('委托价格须在最新价的±20%以内');
  const sign=intent==='close'?-(p?.sign||0):intent==='long'?1:-1;
  if(intent==='close'){
   const reserved=s.orders.filter(o=>o.asset===asset&&o.intent==='close').reduce((n,o)=>n+o.remaining,0);
   if(!p||qty>p.qty-reserved)throw Error('可平数量不足，请检查已有平仓委托');
   leverage=p.leverage;if(isCross(p)&&(-(price-p.entry)*qty*p.sign+price*qty*FEE)>Math.max(0,s.cash-isolatedMargin(s))+.01&&otherCrossPnl(s,asset)>.01)throw Error('全仓结算现金不足，请先平盈利仓位释放现金');
  }else{
   if(!['isolated','cross'].includes(marginMode))throw Error('保证金模式不正确');
   if(p&&(p.marginMode||'isolated')!==marginMode)throw Error('追加仓位请使用现有保证金模式');
   if(s.orders.some(o=>o.asset===asset&&o.product!=='spot'&&o.intent!=='close'&&(o.marginMode||'isolated')!==marginMode))throw Error('同一合约挂单不能混用保证金模式');
   if(s.insurance?.uncovered>0)throw Error('保险资金存在待处理缺口，暂时停止合约新开仓');
   if(Object.values(s.positions).some(pos=>risk(s,pos).riskRate>=.8||pos.liquidating))throw Error('存在高风险合约，请先追加保证金或减仓');
   if((p&&p.sign!==sign)||s.orders.some(o=>o.asset===asset&&o.product!=='spot'&&o.intent!=='close'&&o.sign!==sign))throw Error('请先平掉反向持仓并撤销反向开仓单');
   if(p&&p.leverage!==leverage)throw Error('追加仓位请使用与现有持仓相同的杠杆');
   if(s.orders.some(o=>o.asset===asset&&o.product!=='spot'&&o.intent!=='close'&&o.leverage!==leverage))throw Error('同一产业的开仓委托请使用相同杠杆');
   if(available(s)<price*qty/leverage+Math.ceil(price*qty*.0005*100)/100+.05)throw Error('可用资金不足，保证金和手续费已计入');
   if(equity(s)<margin(s)*.1)throw Error('账户处于风险状态，请先减仓');
  }
  const o={id:s.seq++,asset,intent,sign,price:round(price),qty,remaining:qty,leverage,marginMode:intent==='close'?(p.marginMode||'isolated'):marginMode,product:'contract',submittedAt:time};s.orders.push(o);return o;
 }
 function submitSpot(s,asset,intent,price,qty,time){
  s.spotPositions ||= {};const a=s.assets.find(x=>x.id===asset),p=s.spotPositions[asset];
  if(!a||!['buy','sell'].includes(intent)||!Number.isFinite(price)||price<=0||Math.abs(price*10-Math.round(price*10))>1e-6||!Number.isSafeInteger(qty)||qty<1||qty>100000)throw Error('请输入有效价格和整数数量');
  if(s.orders.length>=30)throw Error('最多保留30笔有效委托');
  if(price<a.price*.8||price>a.price*1.2)throw Error('委托价格须在最新价的±20%以内');
  if(intent==='buy'&&available(s)<price*qty+Math.ceil(price*qty*.0005*100)/100+.05)throw Error('可用资金不足，普通买入需要全额货款及手续费');
  const reserved=s.orders.filter(o=>o.asset===asset&&o.product==='spot'&&o.intent==='sell').reduce((n,o)=>n+o.remaining,0);
  if(intent==='sell'&&(!p||qty>p.qty-reserved))throw Error('可卖数量不足，普通卖出不能做空');
  const o={id:s.seq++,asset,intent,sign:intent==='buy'?1:-1,price,qty,remaining:qty,leverage:1,product:'spot',submittedAt:time};s.orders.push(o);return o;
 }
 function holding(s,o){return o.product==='spot'?s.spotPositions?.[o.asset]:s.positions[o.asset];}
 function reducing(o){return o.intent==='close'||o.intent==='sell';}
 function cancel(s,id){if(s.orders.some(o=>o.id===id&&o.liquidation))throw Error('强平委托不能直接撤销，请追加保证金降低风险');s.orders=s.orders.filter(o=>o.id!==id);}
 function book(s,asset){const a=s.assets.find(x=>x.id===asset),inv=s.system.inventory[asset]||0;const center=Math.max(1,Math.round((a.fair*.35+a.price*.65+(a.sentiment||0)-inv*.00002)*10)/10);const capacity=Math.max(0,Math.floor(s.system.cash/(Math.max(center,1)*5)));return {asks:Array.from({length:5},(_,i)=>({price:round(center+(i+1)*.1),qty:Math.min(capacity,100+i*100)})),bids:Array.from({length:5},(_,i)=>({price:round(center-(i+1)*.1),qty:Math.min(capacity,120+i*110)}))};}
 function contributeInsurance(s,fee){s.insurance ||= {balance:10000000,paid:0,uncovered:0,initialCapital:10000000};const i=s.insurance,halves=Math.round(fee*100)+(i.feeShareRemainder||0),amount=Math.floor(halves/2)/100;i.feeShareRemainder=halves%2;i.feeIncome=round((i.feeIncome||0)+amount);const covered=Math.min(amount,i.uncovered);i.uncovered=round(i.uncovered-covered);i.paid=round(i.paid+covered);i.balance=round(i.balance+amount-covered);return amount;}
 function applyFill(s,o,price,qty,counterparty=s.system){
  if(o.intent==='close'&&isCross(s.positions[o.asset]||{})){const p=s.positions[o.asset],cost=-(price-p.entry)*qty*p.sign+round(price*qty*FEE);if(cost>crossFunds(s))s.orders=s.orders.filter(x=>x.intent==='close'||x.intent==='sell');if(cost>crossFunds(s)+.01&&otherCrossPnl(s,o.asset)>.01)throw Error('全仓结算现金不足，请先平盈利仓位释放现金');}
  const crossBudget=o.intent==='close'&&isCross(s.positions[o.asset]||{})?crossFunds(s):null;
  const fee=round(price*qty*.0005);s.cash=round(s.cash-fee);s.fees=round(s.fees+fee);const insuranceFee=contributeInsurance(s,fee);let p=s.positions[o.asset];
  if(o.product==='spot'){
   p=s.spotPositions[o.asset];s.cash=round(s.cash-o.sign*price*qty);counterparty.cash=round(counterparty.cash+o.sign*price*qty);
   if(o.intent==='buy'){if(p){p.entry=(p.entry*p.qty+price*qty)/(p.qty+qty);p.qty+=qty;}else s.spotPositions[o.asset]={asset:o.asset,qty,entry:price,product:'spot'};}
   else{s.realized=round(s.realized+(price-p.entry)*qty);p.qty-=qty;if(!p.qty)delete s.spotPositions[o.asset];}
  }else{
  if(o.intent==='close'){
   const rawPnl=round((price-p.entry)*qty*p.sign),allocated=p.margin*qty/p.qty,pnl=Math.max(rawPnl,round(-(crossBudget===null?allocated:crossBudget)+fee)),gap=round(pnl-rawPnl);s.cash=round(s.cash+pnl);counterparty.cash=round(counterparty.cash-rawPnl);s.realized=round(s.realized+pnl);
   if(gap>0){s.insurance ||= {balance:10000000,paid:0,uncovered:0,initialCapital:10000000};const paid=Math.min(gap,s.insurance.balance);s.insurance.balance=round(s.insurance.balance-paid);s.insurance.paid=round(s.insurance.paid+paid);s.insurance.uncovered=round(s.insurance.uncovered+gap-paid);}
   p.margin=round(p.margin*(1-qty/p.qty));p.qty-=qty;if(!p.qty)delete s.positions[o.asset];
  }else if(p){p.entry=(p.entry*p.qty+price*qty)/(p.qty+qty);p.qty+=qty;p.margin=round(p.margin+price*qty/o.leverage);}
  else s.positions[o.asset]={asset:o.asset,sign:o.sign,qty,entry:price,margin:round(price*qty/o.leverage),leverage:o.leverage,marginMode:o.marginMode||'isolated'};
  }
  counterparty.inventory[o.asset]=(counterparty.inventory[o.asset]||0)-o.sign*qty;
  o.remaining-=qty;s.fills.unshift({id:s.seq++,orderId:o.id,asset:o.asset,intent:o.intent,product:o.product||'contract',price,qty,round:s.round,time:s.executionTime||Date.now(),fee,insuranceFee});s.fills=s.fills.slice(0,100);
 }
 function settle(s,opts={}){
  const results=[],rng=opts.random||Math.random;let tradeCount=0,systemTradeCount=0;s.executionTime=opts.time||Date.now();
  s.marketTrades ||= [];
  s.flow ||= {cash:1000000,inventory:{}};
  function record(a,price,qty,source,sign){s.marketTrades.unshift({id:s.seq++,asset:a.id,price,qty,source,sign,round:s.round,time:s.executionTime});s.marketTrades=s.marketTrades.slice(0,100);}
  for(const a of s.assets){if(a.kind==='etf')refreshEtf(s);const b=opts.books?.[a.id]||book(s,a.id),trades=[];
   for(const o of s.orders.filter(o=>o.asset===a.id&&opts.processPlayer!==false&&(!opts.time||!o.submittedAt||o.submittedAt<=opts.time))){
    if(reducing(o)&&!holding(s,o)){o.remaining=0;continue;}
    const levels=o.sign===1?b.asks:b.bids;
    for(const l of levels){if(!o.remaining)break;if(o.sign===1?l.price>o.price:l.price<o.price)break;
     let qty=Math.min(o.remaining,l.qty);if(reducing(o))qty=Math.min(qty,holding(s,o)?.qty||0);
     if(!reducing(o)&&l.price>o.price){const extra=(l.price-o.price)*(1/o.leverage+.0005);qty=Math.min(qty,Math.max(0,Math.floor((available(s)-.02)/extra)));}
     if(qty<=0)continue;applyFill(s,o,l.price,qty);l.qty-=qty;trades.push({price:l.price,qty});record(a,l.price,qty,'player',o.sign);tradeCount++;
    }
   }
   s.orders=s.orders.filter(o=>o.remaining>0);
   if(opts.autonomous!==false){
    // A separately funded system trader consumes real depth, including resting player orders.
    const inv=s.flow.inventory[a.id]||0;
    const bias=Math.max(-.25,Math.min(.25,(a.fair-a.price)*.05-inv/8000));
    const sign=rng()<.5+bias?1:-1;
    const levels=(sign===1?b.asks:b.bids).map(l=>({...l}));
    for(const o of s.orders.filter(o=>o.asset===a.id&&o.sign===-sign&&opts.processPlayer!==false&&(!opts.time||!o.submittedAt||o.submittedAt<=opts.time)))levels.push({price:o.price,qty:o.remaining,order:o});
    levels.sort((x,y)=>sign*(x.price-y.price)||(x.order?.id||0)-(y.order?.id||0));
    const limit=round(a.price+sign*.6);let remaining=80+Math.floor(rng()*270);
    for(const l of levels){
     if(sign===1?l.price>limit:l.price<limit)break;
     const currentInv=s.flow.inventory[a.id]||0;
     let qty=Math.min(remaining,l.qty,Math.max(0,sign===1?2000-currentInv:2000+currentInv));
     if(sign===1)qty=Math.min(qty,Math.floor(s.flow.cash/l.price));
     if(l.order&&reducing(l.order))qty=Math.min(qty,holding(s,l.order)?.qty||0);
     if(!l.order){qty=Math.min(qty,Math.max(0,sign===1?20000+(s.system.inventory[a.id]||0):20000-(s.system.inventory[a.id]||0)));if(sign===-1)qty=Math.min(qty,Math.floor(s.system.cash/l.price));}
     if(qty<=0)continue;
     if(l.order){applyFill(s,l.order,l.price,qty,s.flow);tradeCount++;}
     else{s.system.cash=round(s.system.cash+sign*l.price*qty);s.system.inventory[a.id]=(s.system.inventory[a.id]||0)-sign*qty;systemTradeCount++;s.flow.cash=round(s.flow.cash-sign*l.price*qty);s.flow.inventory[a.id]=(s.flow.inventory[a.id]||0)+sign*qty;}
     record(a,l.price,qty,l.order?'player':'system',sign);trades.push({price:l.price,qty});remaining-=qty;if(!remaining)break;
    }
    s.orders=s.orders.filter(o=>o.remaining>0);
    // Demand shifts next batch's quotes; last price itself only changes through fills.
    a.sentiment=round(Math.max(-.5,Math.min(.5,(a.sentiment||0)*.7+(rng()-.5)*.4)));
   }
   if(trades.length){a.price=trades.at(-1).price;const volume=trades.reduce((n,t)=>n+t.qty,0);a.volume+=volume;a.history.push({t:s.executionTime,o:trades[0].price,h:Math.max(...trades.map(t=>t.price)),l:Math.min(...trades.map(t=>t.price)),c:a.price,v:volume,resolution:60000});}
   else a.history.push({t:s.executionTime,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000});
   const bar=a.history.at(-1);bar.resolution=60000;if(a.kind==='etf')bar.iopv=a.iopv;
   a.mark=round(a.mark*.7+a.price*.3);
  }
  results.push(...checkRisk(s));
  if(opts.endRound!==false)s.round++;return {tradeCount,systemTradeCount,warnings:results};
 }
 function checkRisk(s){const results=[];
  if(Object.values(s.positions).some(p=>risk(s,p).riskRate>=1||p.liquidating))s.orders=s.orders.filter(o=>o.intent==='close'||o.intent==='sell');
  for(const p of Object.values(s.positions)){
   const a=s.assets.find(x=>x.id===p.asset);
   if(risk(s,p).riskRate>=1){p.liquidating=true;const existing=s.orders.find(o=>o.asset===p.asset&&o.liquidation&&o.remaining>0);if(existing){existing.price=p.sign===1?.1:1000000000;existing.submittedAt=s.executionTime;continue;}s.orders=s.orders.filter(o=>o.asset!==p.asset||o.product==='spot');s.orders.push({id:s.seq++,asset:p.asset,intent:'close',sign:-p.sign,price:p.sign===1?.1:1000000000,qty:p.qty,remaining:p.qty,leverage:p.leverage,product:'contract',submittedAt:s.executionTime,liquidation:true});p.liquidationEventId ||= s.orders.at(-1).id;results.push(a.name+'风险率达到100%，已排入强平委托');}
   else if(p.liquidating){p.liquidating=false;delete p.liquidationEventId;s.orders=s.orders.filter(o=>!(o.asset===p.asset&&o.liquidation));}
  }
  return results;
 }
 const api={create,submit,cancel,settle,book,equity,margin,frozen,available,round,expandMarket,refreshEtf,iopv,risk,addMargin,setMarginMode,isCross,crossFunds,otherCrossPnl,leverages,maintenanceRate,contributeInsurance,CRYPTO_LEVERAGES,LEVERAGES,MMR,applyFill,checkRisk};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GensokyoEngine=api;
})(typeof window!=='undefined'?window:globalThis);
