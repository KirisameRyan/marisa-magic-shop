'use strict';
const E=require('../../js/gensokyo-engine.js'),D=require('../../js/gensokyo-market-data.js');
const PERIODS=[60000,300000,900000,1800000,3600000,14400000,86400000];
const SIGNALS=['gold','death','gold2','death2','top','bottom'];
const active=c=>c.status==='watching';
const fail=m=>{throw Object.assign(Error(m),{status:400});};
function positive(n,name){if(typeof n!=='number'||!Number.isFinite(n)||n<=0)fail(name+'必须大于0');return n;}
function position(u,c){return c.product==='spot'?u.spotPositions[c.asset]:u.positions[c.asset];}
function reducing(c){return c.intent==='sell'||c.intent==='close';}
function availableExit(u,c){const p=position(u,c);return Math.max(0,(p?.qty||0)-u.orders.filter(o=>o.asset===c.asset&&o.product===c.product&&(o.intent==='sell'||o.intent==='close')).reduce((n,o)=>n+o.remaining,0));}
function reconcile(u){const budget=new Map();for(const c of (u.conditions||[]).filter(active)){if(!reducing(c))continue;const key=c.asset+':'+c.product,p=position(u,c);if(!p||(p.sign||1)!==c.positionSign){c.status='cancelled';c.reason='原持仓已关闭或方向改变';continue;}if(!budget.has(key))budget.set(key,availableExit(u,c));c.qty=Math.min(c.qty,budget.get(key));budget.set(key,budget.get(key)-c.qty);if(c.qty<=0){c.status='cancelled';c.reason='可平数量已用于其他委托';}}}
function add(s,u,body,now){
 u.conditions ||= [];reconcile(u);if(u.conditions.filter(active).length>=20)fail('最多同时监控20条条件单');
 const {asset,product,intent,type}=body,a=s.assets.find(a=>a.id===asset);
 if(!a||!['spot','contract'].includes(product)||!['bracket','macd','rebound','pullback'].includes(type))fail('条件单类型或标的不正确');
 if(!(product==='spot'?['buy','sell']:['long','short','close']).includes(intent))fail('交易方向不正确');
 if(!Number.isSafeInteger(body.qty)||body.qty<100||body.qty>100000||body.qty%100)fail('数量须为100份整数倍');
 const leverage=product==='spot'?1:body.leverage;if(product==='contract'&&!E.LEVERAGES.includes(leverage))fail('杠杆倍数不正确');
 if(!['limit','opponent'].includes(body.execution))fail('请选择委托方式');
 if(body.marginMode!==undefined&&!['isolated','cross'].includes(body.marginMode))fail('保证金模式不正确');
 const c={marginMode:body.marginMode||'isolated',id:s.seq++,asset,product,intent,type,qty:body.qty,leverage,execution:body.execution,createdAt:now,status:'watching',reference:a.price,extreme:a.price};
 if(c.execution==='limit'){c.limitPrice=positive(body.limitPrice,'限价');if(Math.abs(c.limitPrice*10-Math.round(c.limitPrice*10))>1e-6)fail('委托价格须以0.1递增');}else{c.slippage=positive(body.slippage,'最大滑点');if(c.slippage>10)fail('最大滑点不能超过10%');}
 const p=position(u,c);
 if(reducing(c)){if(!p)fail('没有可卖出或平仓的持仓');c.positionSign=p.sign||1;const locked=u.conditions.filter(x=>active(x)&&reducing(x)&&x.asset===asset&&x.product===product).reduce((n,x)=>n+x.qty,0);if(c.qty>availableExit(u,c)-locked)fail('持仓数量不足或已被其他条件单保护');}
 if(type==='bracket'){
  if(!reducing(c))fail('止盈止损只能卖出或平仓');if(!['price','percent'].includes(body.mode))fail('请选择价格或比例');c.mode=body.mode;c.reference=p.entry;
  const take=body.take||0,stop=body.stop||0;if(!take&&!stop)fail('至少设置一个止盈或止损条件');
  const sign=c.positionSign;
  for(const [key,value] of [['take',take],['stop',stop]])if(value){positive(value,key==='take'?'止盈':'止损');const price=c.mode==='price'?value:p.entry*(1+sign*(key==='take'?1:-1)*value/100);if(price<=0||(key==='take'?(price-p.entry)*sign<=0:(price-p.entry)*sign>=0))fail('止盈止损价格方向不正确');c[key+'Price']=E.round(price);}
  if((c.takePrice&&(a.price-c.takePrice)*sign>=0)||(c.stopPrice&&(a.price-c.stopPrice)*sign<=0))fail('条件已经满足，请调整触发价或直接下单');
 }else if(type==='macd'){
  if(!PERIODS.includes(body.period)||!SIGNALS.includes(body.signal))fail('MACD周期或形态不正确');c.period=body.period;c.signal=body.signal;c.window=body.window??30;if(!Number.isInteger(c.window)||c.window<3||c.window>100)fail('二次交叉窗口须为3至100根');c.note='等待至少35根完整K线';c.zero=body.zero||'any';if(!['any','above','below'].includes(c.zero))fail('零轴筛选不正确');
 }else{
  if(type==='rebound'&&!(intent==='buy'||intent==='long'))fail('反弹买入请选择买入或开多');if(type==='pullback'&&!(intent==='sell'||intent==='close'&&c.positionSign===1))fail('回落卖出请选择卖出或平多');
  c.mode=body.mode;if(!['percent','amount'].includes(c.mode))fail('请选择百分比或价差');c.distance=positive(body.distance,'反弹或回落幅度');if(c.mode==='percent'&&c.distance>=100)fail('幅度须小于100%');
  c.activationPct=body.activationPct||0;if(!Number.isFinite(c.activationPct)||c.activationPct<0||c.activationPct>=100)fail('激活幅度须为0至100%之间');c.activated=!c.activationPct;
 }
 // Bound history independently of the active-order quota.
 u.conditions=u.conditions.filter(active).concat(u.conditions.filter(x=>!active(x)).slice(-79),c);return c;
}
function cancel(u,id){const c=(u.conditions||[]).find(c=>c.id===id&&active(c));if(!c)throw Object.assign(Error('条件单不存在或不属于当前账户'),{status:404});c.status='cancelled';c.reason='玩家取消';}
function appendIndicator(series,b){const prev=series.bars.at(-1);series.count++;series.fast=series.count===1?b.c:series.fast+(b.c-series.fast)*2/13;series.slow=series.count===1?b.c:series.slow+(b.c-series.slow)*2/27;const dif=series.fast-series.slow;series.dea=(series.dea||0)+(dif-(series.dea||0))*2/10;series.bars.push({...b,dif,dea:series.dea,ready:series.count>=35});if(series.bars.length>300)series.bars.shift();}
function updateIndicators(s,time){s.indicators ||= {};for(const a of s.assets){s.indicators[a.id] ||= {};for(const period of PERIODS){let v=s.indicators[a.id][period];if(!v){v=s.indicators[a.id][period]={bars:[],count:0,lastSource:0};}
 const offset=period===86400000?28800000:0;
 for(const b of (v.lastSource>=time-120000?a.history.slice(-2):a.history)){if(b.t<=v.lastSource||b.t>=time||(b.resolution||60000)>60000)continue;const bucket=Math.floor((b.t+offset)/period)*period-offset;if(v.current&&v.current.t!==bucket){appendIndicator(v,v.current);v.current=null;}if(!v.current)v.current={t:bucket,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v};else{v.current.h=Math.max(v.current.h,b.h);v.current.l=Math.min(v.current.l,b.l);v.current.c=b.c;v.current.v+=b.v;}v.lastSource=b.t;}
 if(v.current&&v.current.t+period<=time){appendIndicator(v,v.current);v.current=null;}
 }}}
function cross(bars,i,dir){if(i<1)return false;const p=bars[i-1],b=bars[i];return b.ready&&(dir===1?p.dif<=p.dea&&b.dif>b.dea:p.dif>=p.dea&&b.dif<b.dea);}
function signal(bars,c){const i=bars.length-1,b=bars[i];if(i<1||!b.ready)return null;if(c.zero==='above'&&!(b.dif>0&&b.dea>0)||c.zero==='below'&&!(b.dif<0&&b.dea<0))return null;
 const dir=c.signal.startsWith('gold')?1:-1;
 if(['gold','death','gold2','death2'].includes(c.signal)){if(!cross(bars,i,dir))return null;if(c.signal.endsWith('2')){let opposite=false,found=false;for(let k=i-1;k>=Math.max(1,i-c.window+1);k--){if(cross(bars,k,-dir))opposite=true;if(cross(bars,k,dir)){found=opposite;break;}}if(!found)return null;}return String(b.t);}
 const high=c.signal==='top',field=high?'h':'l',pivots=[];for(let k=2;k<=i-2;k++){const p=bars[k];if(!p.ready)continue;if([-2,-1,1,2].every(d=>high?p[field]>bars[k+d][field]:p[field]<bars[k+d][field]))pivots.push(k);}
 if(pivots.length<2||pivots.at(-1)!==i-2)return null;const k=pivots.at(-1),j=pivots.at(-2),a=bars[j],z=bars[k];if(k-j>60)return null;if(high?z.h>a.h&&z.dif<a.dif:z.l<a.l&&z.dif>a.dif)return a.t+':'+z.t;return null;
}
function evaluate(s,time,place,quotes){updateIndicators(s,time);const cache=new Map();for(const u of Object.values(s.accounts)){reconcile(u);for(const c of (u.conditions||[]).filter(active)){
 if(c.createdAt>=time)continue;const a=s.assets.find(a=>a.id===c.asset);if(a.pausedUntil>time)continue;let hit=false,reason='';
 if(c.type==='bracket'){const sign=c.positionSign;if(c.stopPrice&&(a.price-c.stopPrice)*sign<=0){hit=true;reason='止损触发';}else if(c.takePrice&&(a.price-c.takePrice)*sign>=0){hit=true;reason='止盈触发';}}
 else if(c.type==='macd'){const bars=s.indicators[c.asset][c.period].bars,b=bars.at(-1);if(!b||b.t+c.period<=c.createdAt||b.t<=c.lastBar)continue;c.lastBar=b.t;const key=[c.asset,c.period,c.signal,c.window,c.zero].join(':');if(!cache.has(key))cache.set(key,signal(bars,c));const id=cache.get(key);hit=!!id;reason='MACD形态触发';if(!b.ready)c.note='等待至少35根完整K线';else delete c.note;}
 else{const rebound=c.type==='rebound';if(!c.activated){if(rebound?a.price<=c.reference*(1-c.activationPct/100):a.price>=c.reference*(1+c.activationPct/100)){c.activated=true;c.extreme=a.price;}else continue;}
 c.extreme=rebound?Math.min(c.extreme,a.price):Math.max(c.extreme,a.price);const distance=c.mode==='percent'?c.extreme*c.distance/100:c.distance;hit=rebound?a.price>=c.extreme+distance:a.price<=c.extreme-distance;reason=rebound?'反弹买入触发':'回落卖出触发';}
 if(!hit)continue;c.triggeredAt=time;c.reason=reason;
 try{const p=position(u,c),buy=c.intent==='buy'||c.intent==='long'||c.intent==='close'&&p?.sign===-1;let price=c.limitPrice;
 if(c.execution==='opponent'){const b=quotes(s,c.asset),level=(buy?b.asks:b.bids)[0];if(!level)throw Error('无可用对手报价');price=buy?Math.min(level.price,a.price*(1+c.slippage/100)):Math.max(level.price,a.price*(1-c.slippage/100));price=buy?Math.floor(price*10+1e-7)/10:Math.ceil(price*10-1e-7)/10;if(price<=0)throw Error('委托价格无效');}
 const o=place(s,{id:u.id},{asset:c.asset,product:c.product,intent:c.intent,qty:c.qty,price,leverage:c.leverage,marginMode:c.marginMode||'isolated'},time+1);o.conditionId=c.id;c.orderId=o.id;c.submittedQty=c.qty;c.filledQty=0;c.status='triggered';
 }catch(e){c.status='failed';c.reason=reason+'：'+e.message;}
 }}}
function list(u){return (u.conditions||[]).map(c=>{if(c.status!=='triggered')return c;const o=u.orders.find(o=>o.id===c.orderId);return {...c,remaining:o?.remaining||0,executionStatus:o?(o.remaining<c.submittedQty?'部分成交':'待撮合'):((c.filledQty||0)>=c.submittedQty?'全部成交':c.filledQty?'部分成交，余量已结束':'委托已结束')};});}
module.exports={add,cancel,evaluate,reconcile,list,signal,PERIODS,updateIndicators};
