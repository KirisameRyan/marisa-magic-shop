/* Time series, public simulation news, and local wall-clock progression. */
(function(root){'use strict';
const E=typeof module!=='undefined'&&module.exports?require('./gensokyo-engine.js'):root.GensokyoEngine;
const TICK=60000,MINUTE=60000,ZONE='Asia/Shanghai';

/* ---------- 资产模型：三类资产，一套公式 ---------- */
const MODELS={
 stock:{kind:'stock',gamma:3.85e-6,rho:.90,lambda:.20,depth:100000,spread:.0010,anchorVol:0,limit:20000},
 etf:{kind:'etf',gamma:1.48e-6,rho:.50,lambda:.10,depth:200000,spread:.0010,anchorVol:0,limit:20000},
 crypto:{kind:'crypto',gamma:6.35e-7,rho:.95,lambda:.50,depth:200000,spread:.0020,anchorVol:.00050,limit:160000},
};
const NET_OI={stock:20000,etf:20000,crypto:150000};
const ACCOUNT_NOTIONAL=3000000;
const NEWS_PER_HOUR=3.5,NEWS_FLOOR=2,NEWS_CAP=6,QUIET_MS=10*60000;

function modelKey(a){return a.kind==='crypto'?'crypto':a.kind==='etf'?'etf':'stock';}
function ensureAsset(a){
 if(a.model&&a.model.kind)return a;
 a.model={...MODELS[modelKey(a)]};
 a.momentum=Number(a.momentum)||0;
 a.sentimentDev=Number(a.sentimentDev)||0;
 a.newsShock=Number(a.newsShock)||0;
 if(a.model.kind==='stock'){
  a.targetPE=Number(a.targetPE)||20;
  a.eps=Number(a.eps)||E.round(a.price/a.targetPE);
 }
 if(!Number.isFinite(a.anchorTarget))a.anchorTarget=a.fair||a.price;
 if(!Number.isFinite(a.prevClose))a.prevClose=a.price;
 if(!Number.isFinite(a.open))a.open=a.price;
 return a;
}
function ensureAssets(s){for(const a of s.assets)ensureAsset(a);return s;}

function inventory(s,a){return (s.system&&s.system.inventory&&s.system.inventory[a.id]||0)+(s.flow&&s.flow.inventory&&s.flow.inventory[a.id]||0);}
/* P = A · exp(m + s − γI) */
function reservePrice(s,a){const base=a.model.limit,raw=(s.system&&s.system.inventory&&s.system.inventory[a.id])||0,inv=Math.max(-base,Math.min(base,raw)),delta=a.model.kind==='crypto'?.08:.03;return a.fair*Math.exp((a.momentum||0)+(a.sentimentDev||0)-Math.log(1+delta)*inv/base);}
function pe(a){return Number.isFinite(a.eps)&&a.eps>0?a.price/a.eps:null;}

/* ---------- 消息模板（盘中，泊松到达） ---------- */
const TEMPLATES={
 订单:[['获得新一批设备订单','需求端出现改善迹象'],['签订长期供货协议','收入可见度提升']],
 检修:[['生产线例行检修','短期产能受限'],['设备故障停机','交付可能延后']],
 政策:[['行业协会发布新规','合规成本可能变化'],['地方补贴政策落地','需求预期改善']],
 人事:[['核心管理层变动','战略方向存在不确定性'],['新任负责人到岗','市场关注执行力度']],
 合作:[['与同业达成合作','渠道与客户资源互补'],['联合项目启动','前期投入增加']],
 事故:[['厂区发生小型事故','短期停产核查'],['运输环节受阻','交付节奏受影响']],
 财报预告:[['发布业绩预告','市场重新评估全年预期'],['披露经营数据','毛利率变化受到关注']],
 行业数据:[['行业景气指数更新','需求端出现边际变化'],['原材料价格波动','成本端压力变化']],
};
const CATEGORIES=Object.keys(TEMPLATES);
function drawSigma(random){const r=random();return r<.70?.003:r<.95?.010:.020;}
function strengthOf(sigma){return sigma>=.015?'较强':sigma>=.006?'中等':'较弱';}
function pickAsset(s,random,lastByAsset,time){
 const pool=s.assets.filter(a=>a.kind!=='etf'&&!a.pausedUntil&&!a.suspended);
 if(!pool.length)return null;
 const fresh=pool.filter(a=>!lastByAsset[a.id]||time-lastByAsset[a.id]>=20*MINUTE);
 const list=fresh.length?fresh:pool;
 return list[Math.floor(random()*list.length)];
}
function quietWindow(time){
 const d=new Date(time+8*3600000); // 北京时间
 const minutes=d.getUTCHours()*60+d.getUTCMinutes();
 const open=4*60;
 return minutes>=open-10&&minutes<=open+10;
}
function newsTick(s,time,random){
 const hour=Math.floor(time/3600000);
 if(!s.newsClock||s.newsClock.hour!==hour)s.newsClock={hour,count:0,nextAt:0,lastByAsset:{}};
 const c=s.newsClock;
 if(quietWindow(time)||c.count>=NEWS_CAP)return null;
 const overdue=c.count<NEWS_FLOOR&&(time-hour*3600000)>45*MINUTE;
 if(time<c.nextAt&&!overdue)return null;
 if(!overdue&&random()>=NEWS_PER_HOUR/60)return null;
 const a=pickAsset(s,random,c.lastByAsset,time);
 if(!a)return null;
 const sigma=drawSigma(random),dir=random()<.5?1:-1;
 const cat=CATEGORIES[Math.floor(random()*CATEGORIES.length)];
 const tpl=TEMPLATES[cat][Math.floor(random()*TEMPLATES[cat].length)];
 const title=a.name+(dir>0?tpl[0]:tpl[0])+'（'+(dir>0?'利好':'利空')+'）';
 const item={
  id:'news-'+time+'-'+a.id,kind:'intraday',asset:a.id,category:cat,source:'幻想乡快讯',
  title,body:(dir>0?'消息偏正面：':'消息偏负面：')+tpl[1]+'。影响幅度约 '+(sigma*100).toFixed(1)+'%。',
  direction:dir>0?'利好':'利空',strength:strengthOf(sigma),delta:dir*sigma*10,duration:'10—30分钟',
  reason:(dir>0?'消息偏正面，短期买盘意愿上升':'消息偏负面，短期卖盘意愿上升'),risk:'快讯只影响短期情绪，不改变每日基准价值；价格可能快速回落。',
  time,effectiveAt:time,sigma,
 };
 s.news.unshift(item);s.news=s.news.slice(0,64);
 a.sentimentDev=(a.sentimentDev||0)+dir*sigma;
 a.newsShock=Math.max(a.newsShock||0,sigma);
 c.count++;c.lastByAsset[a.id]=time;c.nextAt=time+(15+random()*30)*MINUTE;
 return item;
}

/* ---------- 财报：每天 04:00 一次性应用 ---------- */
function applyReports(s,reports,time,version){
 let applied=0;
 for(const r of reports){
  const a=s.assets.find(x=>x.id===r.asset);if(!a||a.model.kind==='crypto')continue;
  const eps=Number(r.eps);if(!(eps>0))continue;
  const guidance=Number(r.guidance)||0;
  a.eps=E.round(eps);
  a.targetPE=E.round((a.targetPE||20)*(1+guidance)*100)/100;
  a.anchorTarget=E.round(a.eps*a.targetPE);
  a.lastReport={period:r.period||'',eps:a.eps,consensus:Number(r.consensus)||null,guidance,time,note:r.note||''};
  applied++;
 }
 if(applied){
  s.fundamentalsVersion=version;
  s.news.unshift({id:'reports-'+version,kind:'report',category:'财报',source:'交易所公告',
   title:'今日 '+applied+' 家公司发布财报',body:'财报已计入基准价值，价格将在开盘后逐步反映。',
   time,delta:0,direction:'中性',strength:'中等',duration:'当日有效',reason:'财报改变 EPS 与目标 PE，从而改变基准价值',risk:'价格需要时间收敛，不保证一次到位'});
  s.news=s.news.slice(0,64);
 }
 return applied;
}

/* ---------- 每日滚动：昨收、开盘、维护窗口 ---------- */
function dailyRollover(s,time){
 const d=new Date(time+4*3600000).toISOString().slice(0,10);
 if(s.lastRolloverDay===d)return s.maintenanceUntil||0;
 s.lastRolloverDay=d;
 const prevDay=s.businessDay;
 s._snapshots ||= [];
 for(const u of Object.values(s.accounts||{})){
  const equity=E.equity({cash:u.cash,positions:u.positions,spotPositions:u.spotPositions,assets:s.assets});
  s._snapshots.push({day:prevDay,userId:u.id,equity,time});
  u.dayStartEquity=equity;
 }
 s.businessDay=d;
 for(const a of s.assets){a.prevClose=a.price;a.open=null;}
 s.maintenanceUntil=time+3*MINUTE;
 return s.maintenanceUntil;
}

/* ---------- 时间聚合 ---------- */
function aggregate(bars,period){const out=[],offset=period>=86400000?8*3600000:0;for(const b of bars){if(!Number.isFinite(b.t)||(b.resolution||TICK)>period)continue;const t=Math.floor((b.t+offset)/period)*period-offset;let x=out.at(-1);if(!x||x.t!==t){x={t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,demo:!!b.demo,resolution:period,...(Number.isFinite(b.iopv)?{iopv:b.iopv}:{})};out.push(x);}else{x.h=Math.max(x.h,b.h);x.l=Math.min(x.l,b.l);x.c=b.c;x.v+=b.v;x.demo=x.demo||!!b.demo;if(Number.isFinite(b.iopv))x.iopv=b.iopv;}}return out;}
function movingAverage(bars,n){let sum=0;return bars.map((b,i)=>{sum+=b.c;if(i>=n)sum-=bars[i-n].c;return i>=n-1?sum/n:null;});}
function macd(bars){let fast=bars[0]?.c||0,slow=fast,signal=0;return bars.map((b,i)=>{if(i){fast+=(b.c-fast)*2/13;slow+=(b.c-slow)*2/27;}const dif=fast-slow;signal+=(dif-signal)*2/10;return {dif,dea:signal,hist:2*(dif-signal)};});}

function seedNews(s,time){
 const feed=[['河童重工','设备订单进入交付期','订单落地进度受到关注'],
  ['守矢能源','项目联调开始','投产时间仍是市场焦点'],
  ['红魔商事','夜间消费订单增加','短期需求边际改善'],
  ['永远亭制药','研发复核延长','上市时间存在不确定性']];
 s.news=[];
 for(let i=0;i<feed.length;i++){
  const it=feed[i];
  s.news.push({id:'seed-'+i,kind:'intraday',asset:s.assets[i]?.id,category:'公司公告',source:'幻想乡快讯',
   title:it[0]+'：'+it[1],body:it[2],direction:'中性',strength:'较弱',delta:0,duration:'10—30分钟',reason:'公开信息，影响有限',risk:'不构成交易建议',time:time-(i+1)*15*MINUTE});
 }
 s.pendingEffects=[];
}

function prepare(s,now=Date.now()){
 E.expandMarket(s);s.spotPositions ||= {};s.randomSeed ||= 20261101;
 if(s.marketSchema!==3&&Number.isFinite(s.lastTick)){s.lastTick=Math.floor(s.lastTick/MINUTE)*MINUTE;for(const a of s.assets)if(a.history.length&&a.history.every(b=>Number.isFinite(b.t)))a.history=aggregate(a.history,MINUTE);}
 if(!Number.isFinite(s.lastTick)){
  s.lastTick=Math.floor(now/TICK)*TICK;
  s.news=[];
  s.pendingEffects=[];
  for(const o of s.orders)o.submittedAt ||= now;
 }
 ensureAssets(s);
 for(const n of s.news||[])if(n.kind!=='market-report'&&!n.reason){n.reason='公开信息，影响有限';n.risk='不构成交易建议';n.duration=n.duration||'10—30分钟';}
 s.assets.filter(a=>a.kind!=='etf').forEach((a,index)=>{if(a.history.length&&a.history.every(b=>Number.isFinite(b.t)))return;const bars=[],end=s.lastTick,start=end-36*60*MINUTE;let previous=a.price;for(let t=start;t<=end;t+=MINUTE){const k=(t-start)/MINUTE,close=E.round(a.price+Math.sin(k*.027+index)*(a.kind==='crypto'?a.price*.04:.65)+Math.sin(k*.113)*(a.kind==='crypto'?a.price*.015:.2));bars.push({t,o:previous,h:E.round(Math.max(previous,close)+.1),l:E.round(Math.min(previous,close)-.1),c:close,v:20+(k*17+index*13)%130,demo:true,resolution:MINUTE});previous=close;}const last=bars.at(-1);last.c=a.price;last.h=Math.max(last.h,a.price);last.l=Math.min(last.l,a.price);a.history=bars;});
 const etf=s.assets.find(a=>a.kind==='etf');
 if(etf&&!etf.history.length){const members=etf.basket.map(b=>({...b,history:s.assets.find(a=>a.id===b.asset).history,index:0})),timeline=s.assets.find(a=>a.id===etf.basket[0].asset).history;let prior=etf.price;
  etf.history=timeline.map(b=>{let value=0;for(const m of members){while(m.index+1<m.history.length&&m.history[m.index+1].t<=b.t)m.index++;value+=m.quantity*m.history[m.index].c;}const close=E.round(value*(1+Math.sin(b.t/MINUTE*.09)*.001));const bar={t:b.t,o:prior,h:Math.max(prior,close),l:Math.min(prior,close),c:close,v:80,demo:true,resolution:MINUTE,iopv:value};prior=close;return bar;});
  const last=etf.history.at(-1);last.c=etf.price;last.h=Math.max(last.h,etf.price);last.l=Math.min(last.l,etf.price);
 }
 if(!s.news||!s.news.length)seedNews(s,s.lastTick);
 if(s.marketSchema!==3)compact(s);s.marketSchema=3;
 return s;
}
function compact(s){for(const a of s.assets)a.history=a.history.filter(b=>b.t>=s.lastTick-36*60*MINUTE);}

function advance(s,now=Date.now(),options={}){
 prepare(s,now);let steps=0,result={tradeCount:0,systemTradeCount:0,warnings:[]};const max=options.maxSteps||360;
 while(s.lastTick+TICK<=now&&steps<max){const t=s.lastTick+TICK;
  const random=()=>{s.randomSeed=(Math.imul(1664525,s.randomSeed)+1013904223)>>>0;return s.randomSeed/4294967296;};
  ensureAssets(s);
  const dayKey=new Date(t+4*3600000).toISOString().slice(0,10);
  if(!s.businessDay)s.businessDay=dayKey;else if(s.businessDay!==dayKey)dailyRollover(s,t);
  if(s.maintenanceUntil&&t<s.maintenanceUntil){
   if(s.incident&&s.incident.phase!=='resolved')s.incident.deadline+=TICK;
   for(const a of s.assets){a.fair+=(a.anchorTarget-a.fair)*.35;a.history.push({t,o:a.price,h:a.price,l:a.price,c:a.price,v:0,resolution:60000,...(a.kind==='etf'?{iopv:a.iopv}:{})});}
   s.lastTick=t;steps++;continue;
  }
  if(s.maintenanceUntil&&t>=s.maintenanceUntil){for(const a of s.assets){a.open=a.price;}delete s.maintenanceUntil;}
  s.pendingEffects ||= [];
  for(const effect of s.pendingEffects.filter(n=>n.effectiveAt<=t)){
   const a=s.assets.find(x=>x.id===effect.asset);if(!a)continue;
   if(!Number.isFinite(effect.impactPct)){a.fair=E.round(Math.max(1,a.fair+effect.delta));a.anchorTarget=a.fair;effect.finished=true;continue;}
   effect.stepChange ??= a.fair*effect.impactPct/effect.impactMinutes;
   a.fair=Math.max(1,a.fair+effect.stepChange);a.anchorTarget=a.fair;
   effect.appliedSteps=(effect.appliedSteps||0)+1;
   effect.finished=effect.appliedSteps>=effect.impactMinutes;
  }
  s.pendingEffects=s.pendingEffects.filter(n=>!n.finished);
  newsTick(s,t,random);
  for(const a of s.assets){
   if(a.model.anchorVol>0){const z=(random()+random()+random()-1.5)*2;a.anchorTarget=Math.max(1,a.anchorTarget*Math.exp(a.model.anchorVol*z*.5));}
   a.fair+=(a.anchorTarget-a.fair)*.12;
   a.sentimentDev*=0.92;
   a.newsShock*=0.90;
  }
  const boundary=t%MINUTE===0,r=(options.settle||E.settle)(s,{time:t,processPlayer:boundary,endRound:boundary,random});s.lastTick=t;steps++;
  result.tradeCount+=r.tradeCount;result.systemTradeCount+=r.systemTradeCount;result.warnings.push(...r.warnings);
  if(boundary)compact(s);
 }
 return {...result,steps,pending:s.lastTick+TICK<=now};
}
function time(t,full=false){return new Intl.DateTimeFormat('zh-CN',{timeZone:ZONE,...(full?{month:'2-digit',day:'2-digit'}:{}),hour:'2-digit',minute:'2-digit',...(full?{second:'2-digit'}:{}),hour12:false}).format(new Date(t));}
function axisTime(t,period){if(period>=86400000)return new Intl.DateTimeFormat('zh-CN',{timeZone:ZONE,month:'2-digit',day:'2-digit'}).format(t);if(period>=1800000)return time(t,true).slice(0,-3).replace(' ','\n');return time(t);}
const api={TICK,MINUTE,MODELS,NET_OI,ACCOUNT_NOTIONAL,prepare,advance,aggregate,macd,movingAverage,time,axisTime,ensureAssets,ensureAsset,reservePrice,pe,inventory,newsTick,applyReports,dailyRollover,drawSigma};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GensokyoMarketData=api;
})(typeof window!=='undefined'?window:globalThis);








