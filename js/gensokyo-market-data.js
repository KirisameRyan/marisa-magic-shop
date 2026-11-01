/* Time series, public simulation news, and local wall-clock progression. */
(function(root){'use strict';
const E=typeof module!=='undefined'&&module.exports?require('./gensokyo-engine.js'):root.GensokyoEngine;
const TICK=60000,MINUTE=60000,ZONE='Asia/Shanghai';
const events=[
 {asset:'kappa',title:'河童重工披露首批设备意向订单',body:'守矢项目设备采购进入洽谈阶段，目前尚未签订最终交付协议。',category:'公司公告',source:'河童重工公告栏',direction:'利好',strength:'中等',delta:.6,reason:'订单预期改善，有望提高设备收入。',risk:'意向订单仍可能取消，原料成本与交付进度影响利润。',duration:'30—90分钟'},
 {asset:'moriya',title:'守矢能源更新施工进度，项目进入联调',body:'能源项目完成首轮设备安装。神社表示将进行负载测试，暂未公布正式投产日期。',category:'项目进展',source:'守矢神社公开通报',direction:'利好',strength:'中等',delta:.5,reason:'工程推进降低延期预期，能源供给可能增加。',risk:'联调结果未定，成本超支仍可能削弱收益。',duration:'1—3小时'},
 {asset:'scarlet',title:'红魔馆宴会增加采购，运输费用同步上涨',body:'宴会筹备带动红茶与夜间消费订单，雾区运输报价也有所上调。',category:'产业观察',source:'文文。新闻',direction:'偏利好',strength:'较弱',delta:.3,reason:'短期需求增加，但运费上涨抵消部分收益。',risk:'一次性宴会不一定转化为持续经营增长。',duration:'20—60分钟'},
 {asset:'eientei',title:'永远亭延长研发复核，上市时间待定',body:'药师宣布增加一轮效果复核，既定研发预算将作调整。现有药品供应维持正常。',category:'研发公告',source:'永远亭药务公告',direction:'利空',strength:'中等',delta:-.5,reason:'研发兑现延后，短期成本增加。',risk:'复核结果若好于预期，负面影响可能逆转。',duration:'1—2小时'},
 {asset:'kappa',title:'河童工坊检修，部分生产线短暂停工',body:'例行检修发现磨损，需要替换部件。预计后续公告将披露恢复情况。',category:'生产动态',source:'河童工坊通报',direction:'利空',strength:'较弱',delta:-.3,reason:'近期产能受限，交付可能延后。',risk:'若检修很快结束，对长期经营的影响可能有限。',duration:'20—60分钟'},
 {asset:'moriya',title:'人间之里用电需求回落，能源销售承压',body:'阶段性需求调查显示用电量下降，守矢方面尚未调整长期建设安排。',category:'产业数据',source:'人间之里商会',direction:'利空',strength:'较弱',delta:-.3,reason:'需求减弱，短期收入预期下调。',risk:'单次调查样本有限，后续需求可能恢复。',duration:'30—90分钟'},
 {asset:'hakugyoku',title:'白玉楼开放新赏樱路线，旅游预订增长',body:'冥界向导增加接待班次，商会披露短期预订有所改善。',category:'文旅动态',source:'白玉楼接待处',direction:'利好',strength:'较弱',delta:.3,reason:'接待量增加有望带动文旅收入。',risk:'花期与实际客流仍存在不确定性。',duration:'1—2小时'},
 {asset:'tengu',title:'天狗传媒推出产业专刊，广告订单增加',body:'新闻社公布新版发行计划，多家商户表达广告投放意向。',category:'公司公告',source:'天狗传媒公告',direction:'利好',strength:'较弱',delta:.3,reason:'发行与广告需求有望改善营收。',risk:'广告意向尚未全部转为付费订单。',duration:'30—90分钟'},
 {asset:'chirei',title:'地灵矿业矿道检修，部分产能暂缓',body:'旧地狱矿道将分段进行安全检修，近期出货计划调整。',category:'生产动态',source:'地灵矿业生产部',direction:'利空',strength:'中等',delta:-.4,reason:'短期矿石供给减少，交付与收入可能承压。',risk:'检修可能提前结束，库存也可缓冲影响。',duration:'1—3小时'},
 {asset:'myouren',title:'命莲物流新增跨区域航线',body:'命莲寺商运航线开放预约，增加山地与人间之里之间的运力。',category:'产业观察',source:'命莲物流运务处',direction:'利好',strength:'中等',delta:.4,reason:'覆盖范围扩大有利于货运订单增长。',risk:'新航线利用率与运营成本仍待验证。',duration:'1—2小时'}
];
function news(event,t){return {...event,time:t,effectiveAt:t+MINUTE,analysisSource:'交易所研究栏 · 游戏内估计',confidence:'中等',id:t+'-'+event.asset};}
function aggregate(bars,period){const out=[],offset=period>=86400000?8*3600000:0;for(const b of bars){if(!Number.isFinite(b.t)||(b.resolution||TICK)>period)continue;const t=Math.floor((b.t+offset)/period)*period-offset;let x=out.at(-1);if(!x||x.t!==t){x={t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,demo:!!b.demo,resolution:period,...(Number.isFinite(b.iopv)?{iopv:b.iopv}:{})};out.push(x);}else{x.h=Math.max(x.h,b.h);x.l=Math.min(x.l,b.l);x.c=b.c;x.v+=b.v;x.demo=x.demo||!!b.demo;if(Number.isFinite(b.iopv))x.iopv=b.iopv;}}return out;}
function movingAverage(bars,n){let sum=0;return bars.map((b,i)=>{sum+=b.c;if(i>=n)sum-=bars[i-n].c;return i>=n-1?sum/n:null;});}
function macd(bars){let fast=bars[0]?.c||0,slow=fast,signal=0;return bars.map((b,i)=>{if(i){fast+=(b.c-fast)*2/13;slow+=(b.c-slow)*2/27;}const dif=fast-slow;signal+=(dif-signal)*2/10;return {dif,dea:signal,hist:2*(dif-signal)};});}
function prepare(s,now=Date.now()){
 E.expandMarket(s);s.spotPositions ||= {};s.randomSeed ||= 20261101;
 if(s.marketSchema!==3&&Number.isFinite(s.lastTick)){s.lastTick=Math.floor(s.lastTick/MINUTE)*MINUTE;for(const a of s.assets)if(a.history.length&&a.history.every(b=>Number.isFinite(b.t)))a.history=aggregate(a.history,MINUTE);}
 if(!Number.isFinite(s.lastTick)){
  s.lastTick=Math.floor(now/TICK)*TICK;
  s.news=events.slice(0,4).map((e,i)=>news(e,s.lastTick-(i+1)*15*MINUTE));
  s.pendingEffects=[];
  // Old orders had no reliable timestamps; never execute them before this migration.
  for(const o of s.orders)o.submittedAt ||= now;
 }
 // Seed newly listed assets without resetting balances, old orders, or valid history.
 s.assets.filter(a=>a.kind!=='etf').forEach((a,index)=>{if(a.history.length&&a.history.every(b=>Number.isFinite(b.t)))return;const bars=[],end=s.lastTick,start=end-36*60*MINUTE;let previous=a.price;for(let t=start;t<=end;t+=MINUTE){const k=(t-start)/MINUTE,close=E.round(a.price+Math.sin(k*.027+index)*.65+Math.sin(k*.113)*.2);bars.push({t,o:previous,h:E.round(Math.max(previous,close)+.1),l:E.round(Math.min(previous,close)-.1),c:close,v:20+(k*17+index*13)%130,demo:true,resolution:MINUTE});previous=close;}const last=bars.at(-1);last.c=a.price;last.h=Math.max(last.h,a.price);last.l=Math.min(last.l,a.price);a.history=bars;});
 const etf=s.assets.find(a=>a.kind==='etf');
 if(!etf.history.length){const members=etf.basket.map(b=>({...b,history:s.assets.find(a=>a.id===b.asset).history,index:0})),timeline=s.assets.find(a=>a.id===etf.basket[0].asset).history;let prior=etf.price;
  etf.history=timeline.map(b=>{let value=0;for(const m of members){while(m.index+1<m.history.length&&m.history[m.index+1].t<=b.t)m.index++;value+=m.quantity*m.history[m.index].c;}const close=E.round(value*(1+Math.sin(b.t/MINUTE*.09)*.001));const bar={t:b.t,o:prior,h:Math.max(prior,close),l:Math.min(prior,close),c:close,v:80,demo:true,resolution:MINUTE,iopv:value};prior=close;return bar;});
  const last=etf.history.at(-1);last.c=etf.price;last.h=Math.max(last.h,etf.price);last.l=Math.min(last.l,etf.price);
 }
 if(s.marketSchema!==3)compact(s);s.marketSchema=3;
 return s;
}
function compact(s){for(const a of s.assets)a.history=a.history.filter(b=>b.t>=s.lastTick-36*60*MINUTE);}
function advance(s,now=Date.now(),options={}){
 prepare(s,now);let steps=0,result={tradeCount:0,systemTradeCount:0,warnings:[]};const max=options.maxSteps||360;
 while(s.lastTick+TICK<=now&&steps<max){const t=s.lastTick+TICK;
  s.pendingEffects ||= [];
  for(const effect of s.pendingEffects.filter(n=>n.effectiveAt<=t)){const a=s.assets.find(a=>a.id===effect.asset);a.fair=E.round(Math.max(1,a.fair+effect.delta));}
  s.pendingEffects=s.pendingEffects.filter(n=>n.effectiveAt>t);
  if(t%(15*MINUTE)===0){const index=options.eventIndex?options.eventIndex(events.length):Math.floor(t/(15*MINUTE))%events.length,event=events[index],n=news(event,t);s.news.unshift(n);s.news=s.news.slice(0,32);s.pendingEffects.push(n);}
  const random=()=>{s.randomSeed=(Math.imul(1664525,s.randomSeed)+1013904223)>>>0;return s.randomSeed/4294967296;};
  const boundary=t%MINUTE===0,r=(options.settle||E.settle)(s,{time:t,processPlayer:boundary,endRound:boundary,random});s.lastTick=t;steps++;
  result.tradeCount+=r.tradeCount;result.systemTradeCount+=r.systemTradeCount;result.warnings.push(...r.warnings);
  if(boundary)compact(s);
 }
 return {...result,steps,pending:s.lastTick+TICK<=now};
}
function time(t,full=false){return new Intl.DateTimeFormat('zh-CN',{timeZone:ZONE,...(full?{month:'2-digit',day:'2-digit'}:{}),hour:'2-digit',minute:'2-digit',...(full?{second:'2-digit'}:{}),hour12:false}).format(new Date(t));}
function axisTime(t,period){if(period>=86400000)return new Intl.DateTimeFormat('zh-CN',{timeZone:ZONE,month:'2-digit',day:'2-digit'}).format(t);if(period>=1800000)return time(t,true).slice(0,-3).replace(' ','\n');return time(t);}
const api={TICK,MINUTE,prepare,advance,aggregate,macd,movingAverage,time,axisTime};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GensokyoMarketData=api;
})(typeof window!=='undefined'?window:globalThis);
