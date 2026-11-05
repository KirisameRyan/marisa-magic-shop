'use strict';
/**
 * 红雾异变 · 事件状态机
 * P1 调查 → V1 投票 → P2 护盘 → V2 投票 → P3A 决战 → P3C 逼多 → resolved
 */
const E = require('../../js/gensokyo-engine.js');
const G = require('./price-guard.cjs');
const Release = require('./release.cjs');

const KEY = 'red-mist';
const HOUR = 3600000;

function cfg(fast) {
  const u = fast ? 60000 : HOUR;          // 正式 1 小时；演示 1 分钟
  return {
    fast: !!fast,
    unit: u,
    p1: { hours: 24, hp: 3000000, donate: 3000000, cap: 400000, keep: 100000, halt: ['scarlet'] },
    vote1: { hours: 6, candidates: ['hakugyoku', 'myouren', 'kazami'] },
    p2: { hours: 24, donate: 4000000, cap: 400000, keep: 100000, short: 500000, floor: 0.9, defendMinutes: fast ? 2 : 360, defenders: fast ? 3 : 30, halt: ['mistlake'] },
    vote2: { hours: 6, options: ['limit', 'difficulty'] },
    p3: { aHours: 2, cHours: 4, hp: 5000000, target: -0.08, bossCash: 30000000, bossRate: 5000 },
  };
}

function asset(s, id) { return s.assets.find(a => a.id === id); }
function round(n, d = 2) { return Math.round(n * 10 ** d) / 10 ** d; }
function pct(n) { return Math.round(n * 1000) / 1000; }

function create(now, fast) {
  const c = cfg(fast);
  return {
    id: KEY, phase: 'p1', startedAt: now, phaseStartedAt: now,
    deadline: now + c.p1.hours * c.unit,
    hp: 0, raised: 0, patrols: 0, p1Won: null, p2Won: null,
    contributors: {}, points: {}, titles: {}, log: [],
    vote: null, defend: null, short: null, boss: null, gain: null,
    cfg: c,
  };
}

function ensure(s, now, fast) {
  if (!enabled(now)) return s.incident || null;
  if (!s.incident) {
    s.incident = create(now, fast);
    start(s, s.incident, now);
  }
  const inc = s.incident;
  inc.cfg.vote1.candidates=inc.cfg.vote1.candidates.map(id=>id==='hakugyokurou'?'hakugyoku':id);
  if(inc.vote?.candidates)inc.vote.candidates=inc.vote.candidates.map(id=>id==='hakugyokurou'?'hakugyoku':id);
  if(inc.vote?.ballots)for(const id of Object.keys(inc.vote.ballots))if(inc.vote.ballots[id]==='hakugyokurou')inc.vote.ballots[id]='hakugyoku';
  inc.cfg.p3.bossRate=5000;
  inc.reachedAt ||= {}; inc.members ||= {}; inc.phaseDonations ||= {};
  for (const a of s.assets) { if (a.pausedUntil && a.pausedUntil > now + 30 * 86400000 && !a.suspended) { a.suspended = { at: now, reason: a.id === 'scarlet' ? '红雾异变：红魔商事停牌' : '异变停牌' }; delete a.pausedUntil; } }
  if (inc.phase === 'p1' && !inc.defend) {
    const m = asset(s, 'mistlake');
    if (m) {
      inc.hp = 0;
      inc.defend = { asset: 'mistlake', floor: round(m.price * 0.9), minutes: 0, required: inc.cfg.fast ? 2 : 360, defenders: {}, defendersRequired: inc.cfg.fast ? 3 : 30 };
      inc.short = { asset: 'mistlake', qty: 0, total: 300000, cash: 0, avgPrice: 0 };
    }
  }
  return inc;
}

function start(s, inc, now) {
  if (inc.started) return;
  inc.started = true;
  const c = inc.cfg;
  for (const a of s.assets) {
    a.bandFactor = 1;
    if (a.kind === 'crypto') continue;
    if (['hakugyoku', 'myouren', 'kazami'].includes(a.id)) { a.fair = round(a.fair * 0.94); a.sentimentDev = (a.sentimentDev || 0) - 0.02; }
    if (a.id === 'eientei') { a.fair = round(a.fair * 1.06); a.sentimentDev = (a.sentimentDev || 0) + 0.02; }
  }
  for (const id of c.p1.halt) { const a = asset(s, id); if (a) a.suspended = { at: now, reason: '红雾异变：红魔商事停牌' }; }
  const mist = asset(s, 'mistlake');
  if (mist) {
    inc.defend = { asset: 'mistlake', floor: round(mist.price * 0.9), minutes: 0, required: c.fast ? 2 : 360, defenders: {}, defendersRequired: c.fast ? 3 : 30 };
    inc.short = { asset: 'mistlake', qty: 0, total: 300000, cash: 0, avgPrice: 0 };
  }
  news(s, now, '红雾笼罩红魔馆，红魔商事停牌', '幻想乡上空出现异常红雾，红魔商事即日起停牌，交易所启动临时风控：单账户限额减半、价格保护带收窄。');
  inc.log.push({ at: now, phase: 'p1', text: '红雾异变开始。红魔商事停牌，全服进入临时风控。' });
}

function news(s, time, title, body) {
  s.news ||= [];
  s.news.unshift({ id: 'incident-' + time + '-' + s.news.length, kind: 'market-report', category: '异变通告', source: '幻想乡交易所', title, body, time, delta: 0 });
  s.news = s.news.slice(0, 64);
}

function penalty(s, inc, now, text) {
  news(s, now, '异变扩散', text);
  inc.log.push({ at: now, phase: inc.phase, text });
}

function next(s, inc, now, phase) {
  inc.phase = phase;
  inc.phaseStartedAt = now;
  const c = inc.cfg;
  if (phase === 'vote1') {
    inc.deadline = now + c.vote1.hours * c.unit;
    inc.vote = { round: 1, candidates: c.vote1.candidates.slice(), ballots: {}, result: null };
    inc.log.push({ at: now, text: '雾之湖外围调查完成，进入护盘投票。' });
    news(s, now, '第一阶段结束，护盘投票开启', '灵梦拿到了重组经费。请选择第二阶段要守住的股票：白玉楼文旅、命莲物流、花田农业。');
  } else if (phase === 'p2') {
    const winner = voteWinner(inc);
    inc.vote.result = winner; inc.vote1Result=winner;
    const a = asset(s, winner);
    inc.defend = { asset: winner, floor: round(a.price * (inc.p1Won ? 0.92 : inc.p1Partial ? 0.9 : 0.88)), minutes: 0, required: c.p2.defendMinutes, defenders: {}, defendersRequired: c.p2.defenders };
    inc.short = { asset: winner, qty: 0, total: inc.p1Won ? 350000 : inc.p1Partial ? 500000 : 650000, cash: 0, avgPrice: 0 };
    inc.raised = 0;
    inc.deadline = now + c.p2.hours * c.unit;
    for (const id of c.p2.halt) { const h = asset(s, id); if (h) h.suspended = { at: now, reason: '雾之湖封湖' }; }
    inc.log.push({ at: now, text: '护盘目标选定：' + a.name + '，地板 ' + inc.defend.floor + '。' });
    news(s, now, '护盘战开始：' + a.name, '异变空头入场，目标 ' + inc.short.total + ' 份。守住 ' + a.name + ' 不低于 ' + inc.defend.floor + '，累计 ' + (inc.cfg.fast ? inc.defend.required + ' 分钟' : '6 小时') + '。');
  } else if (phase === 'vote2') {
    inc.deadline = now + c.vote2.hours * c.unit;
    inc.vote = { round: 2, options: c.vote2.options.slice(), ballots: {}, result: null };
    const mistLift = asset(s, 'mistlake'); if (mistLift && mistLift.suspended) { delete mistLift.suspended; mistLift.suspendResumed = true; }
    inc.log.push({ at: now, text: inc.p2Won ? '护盘成功，进入增益投票。' : '护盘失败，进入增益投票（决战难度提升）。' });
    news(s, now, '第二阶段结束，增益投票开启', '请选择：放宽投资限制，或降低决战难度。');
  } else if (phase === 'p3a') {
    inc.hpMax=round(c.p3.hp*(inc.p2Partial?1.1:inc.p2Won===false?1.2:1)*(inc.gain==='difficulty'?.8:1)*((inc.patrols||0)>=1000?.9:1));
    inc.hp=inc.hpMax;inc.baseDamage=0;inc.damage={};inc.actionDamage={};
    inc.raised = 0;
    inc.deadline = now + c.p3.aHours * c.unit;
    const a = asset(s, 'scarlet');
    if (a) { delete a.suspended; a.suspendResumed = true; }
    inc.log.push({ at: now, text: '红魔商事复牌，决战开始。' });
    news(s, now, '红魔商事复牌，决战打响', '异变本体现身红魔馆。击穿它的护盾，然后逼空她的空头仓位。');
  } else if (phase === 'p3c') {
    const a = asset(s, 'scarlet');
    inc.boss = { asset: 'scarlet', qty: 0, total: 500000, cash: 0, rate: c.p3.bossRate, avgPrice: a.price, start: a.price };
    inc.p3Target = round(a.price * (1.08));
    inc.deadline = now + c.p3.cHours * c.unit;
    inc.log.push({ at: now, text: '异变本体开始做空红魔商事，目标价 ' + inc.p3Target + '。' });
    news(s, now, '最终阶段：做空红魔商事', '异变本体正在做空红魔商事。把价格推过 ' + inc.p3Target + '，逼她回补。');
  } else if (phase === 'resolved') {
    inc.deadline = 0;
    settleRewards(s,inc,now);
    for (const a of s.assets) { a.bandFactor = 1; if (a.suspended) { delete a.suspended; a.suspendResumed = true; } }
    inc.log.push({ at: now, text: inc.won ? '异变被退治，红雾散去。' : '异变未被完全退治，红雾暂时退去。' });
    news(s, now, inc.won ? '红雾退治成功' : '红雾暂时退去', inc.won ? '红魔馆恢复营业，全服 debuff 解除。' : '异变未被彻底解决，本轮活动结束，活动风控已解除。');
  }
}

function voteWinner(inc) {
  const tally = {};
  for (const v of Object.values(inc.vote.ballots)) tally[v] = (tally[v] || 0) + 1;
  let best = null, bestN = -1;
  for (const c of inc.vote.candidates) {
    const n = tally[c] || 0;
    if (n > bestN) { best = c; bestN = n; }
    else if (n === bestN && n > 0) {
      const a = inc.contributors, b = inc.contributors;
      if ((a[best] || 0) < (b[c] || 0)) best = c;
    }
  }
  return best || inc.vote.candidates[0];
}

function stageDone(s, inc, now) {
  const c = inc.cfg;
  if (inc.phase === 'p1') {
    const d = inc.defend;
    const done = d && inc.raised >= c.p1.donate && d.minutes >= d.required && Object.keys(d.defenders).length >= d.defendersRequired;
    if (done) { inc.p1Won = true; grant(inc, 1,now); next(s, inc, now, 'vote1'); return true; }
    if (now >= inc.deadline) { inc.p1Won = false; inc.p1Partial=inc.raised>=c.p1.donate*.6&&inc.defend.minutes>=inc.defend.required*.5; penalty(s, inc, now, '第一阶段超时，异变扩散：护盘空单增加到 65 万份。'); next(s, inc, now, 'vote1'); return true; }
  } else if (inc.phase === 'vote1') {
    if (now >= inc.deadline) { next(s, inc, now, 'p2'); return true; }
  } else if (inc.phase === 'p2') {
    const d = inc.defend;
    const done = inc.raised >= c.p2.donate && d.minutes >= d.required && Object.keys(d.defenders).length >= c.p2.defenders;
    if (done) { inc.p2Won = true; grant(inc, 2,now); next(s, inc, now, 'vote2'); return true; }
    if (now >= inc.deadline) { inc.p2Won = false; inc.p2Partial=inc.raised>=c.p2.donate*.7&&inc.defend.minutes>=inc.defend.required*.6; penalty(s, inc, now, '护盘失败，异变扩散：决战 Boss 血量提升 20%。'); next(s, inc, now, 'vote2'); return true; }
  } else if (inc.phase === 'vote2') {
    if (now >= inc.deadline) { inc.gain = voteWinner2(inc); next(s, inc, now, 'p3a'); return true; }
  } else if (inc.phase === 'p3a') {
    if (inc.hp <= 0 || now >= inc.deadline) { next(s, inc, now, 'p3c'); return true; }
  } else if (inc.phase === 'p3c') {
    const a = asset(s, inc.boss.asset);
    if(!inc.boss.settling && (a.mark>=inc.p3Target && (inc.boss.opened||0)>=Math.min(5000,inc.boss.total) || now>=inc.deadline)){inc.boss.settling=true;inc.boss.success=a.mark>=inc.p3Target&&(inc.boss.opened||0)>=Math.min(5000,inc.boss.total);}
    if(inc.boss.settling && (inc.boss.qty||0)===0){inc.won=!!inc.boss.success; if(inc.won)grant(inc,3,now);next(s,inc,now,'resolved');return true;}
  }
  return false;
}

function voteWinner2(inc) {
  const tally = {};
  for (const v of Object.values(inc.vote.ballots)) tally[v] = (tally[v] || 0) + 1;
  return (tally.limit || 0) >= (tally.difficulty || 0) ? 'limit' : 'difficulty';
}

function grant(inc, stage, now) {
  const title=['','红雾调查员','雾中守望者','红雾退治者'][stage];
  for(const id of Object.keys(inc.members||{})){score(inc,id,20,now);inc.titles[id] ||= [];if(!inc.titles[id].includes(title))inc.titles[id].push(title);}
}

function support(s, user, body, now) {
  const inc = s.incident;
  if (!enabled(now) || !inc || inc.phase === 'resolved') throw Object.assign(Error('异变已经结束'), { status: 409 });
  if(!['p1','p2','p3a'].includes(inc.phase))throw Object.assign(Error('当前阶段不接受捐款'),{status:409});
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 1000) throw Object.assign(Error('单笔至少 1,000'), { status: 400 });
  const c = inc.cfg;
  const cap = inc.phase === 'p2' ? c.p2.cap : c.p1.cap;
  const keep = inc.phase === 'p2' ? c.p2.keep : c.p1.keep;
  const u = s.accounts[String(user.id)];
  if (!u) throw Object.assign(Error('尚未开通交易账户'), { status: 404 });
  const stageDonations=inc.phaseDonations ||= {};const stage=stageDonations[inc.phase] ||= {};const used=stage[user.id]||0;
  if (used + amount > cap) throw Object.assign(Error('单人捐款上限 ' + Math.round(cap / 10000) + ' 万'), { status: 400 });
  if (Math.min(u.cash,E.available({ ...u,assets:s.assets })) - amount < keep) throw Object.assign(Error('捐款后账户余额必须保留 ' + Math.round(keep / 10000) + ' 万'), { status: 400 });
  const actionPhase=inc.phase,hpBefore=inc.hp,pointsBefore=inc.points[user.id]||0;
  u.cash = round(u.cash - amount);
  inc.raised += amount;
  stage[user.id]=used+amount;inc.contributors[user.id]=(inc.contributors[user.id]||0)+amount;
  const beforePoints=Math.floor((inc.contributors[user.id]-amount)/10000);score(inc,user.id,Math.floor(inc.contributors[user.id]/10000)-beforePoints,now);
  const insured=round(amount*.3);s.insurance ||= {balance:0,paid:0,uncovered:0};const covered=Math.min(insured,s.insurance.uncovered||0);s.insurance.uncovered=round((s.insurance.uncovered||0)-covered);s.insurance.paid=round((s.insurance.paid||0)+covered);s.insurance.balance=round(s.insurance.balance+insured-covered);
  if (inc.phase === 'p3a'){inc.actionDamage ||= {};inc.actionDamage[user.id]=(inc.actionDamage[user.id]||0)+amount;updateHp(inc);}
  s._journal ||= [];
  s._journal.push({ event: 'incident-support-' + s.seq++, userId: Number(user.id), time: now, kind: 'incident-support', cashDelta: -amount, cashAfter: u.cash, raised: inc.raised,insuranceContribution:insured,insuranceCovered:covered,burned:round(amount*.7) });
  const feedback={action:'donate',phase:actionPhase,amount,insuranceContribution:insured,burned:round(amount*.7),points:(inc.points[user.id]||0)-pointsBefore,damage:actionPhase==='p3a'?Math.max(0,hpBefore-inc.hp):0,at:now};
  stageDone(s, inc, now);
  return { ok: true, raised: inc.raised, hp: inc.hp,feedback };
}

function vote(s, user, body, now) {
  const inc = s.incident;
  if (!enabled(now) || !inc || (inc.phase !== 'vote1' && inc.phase !== 'vote2')) throw Object.assign(Error('当前不是投票阶段'), { status: 409 });
  const eligiblePhase=inc.phase==='vote1'?'p1':'p2';
  if ((inc.phaseDonations?.[eligiblePhase]?.[user.id] || 0) < 10000) throw Object.assign(Error('本轮捐款满 1 万才有投票资格'), { status: 403 });
  if (inc.vote.ballots[user.id]) throw Object.assign(Error('已经投过票了'), { status: 409 });
  const option = String(body.option);
  const pool = inc.vote.candidates || inc.vote.options;
  if (!pool.includes(option)) throw Object.assign(Error('无效选项'), { status: 400 });
  inc.vote.ballots[user.id] = option; touch(inc,user.id,now);
  return { ok: true, option };
}

function patrol(s, user, now) {
  const inc = s.incident;
  if (!enabled(now) || !inc || inc.phase === 'resolved') throw Object.assign(Error('异变已经结束'), { status: 409 });
  const u = s.accounts[String(user.id)];
  if (!u) throw Object.assign(Error('尚未开通交易账户'), { status: 404 });
  u.event ||= {};
  const last = u.event.lastPatrol || 0;
  if (now - last < 10 * 60000) throw Object.assign(Error('巡逻冷却中'), { status: 429 });
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  if (u.event.patrolDay !== day) { u.event.patrolDay = day; u.event.patrolCount = 0; }
  if ((u.event.patrolCount || 0) >= 8) throw Object.assign(Error('今天的巡逻次数用完了'), { status: 429 });
  u.event.lastPatrol = now; u.event.patrolCount = (u.event.patrolCount || 0) + 1;
  const actionPhase=inc.phase,hpBefore=inc.hp;
  score(inc,user.id,2,now); inc.patrols = (inc.patrols || 0) + 1;
  if (inc.phase === 'p3a'){inc.actionDamage ||= {};inc.actionDamage[user.id]=(inc.actionDamage[user.id]||0)+1000;updateHp(inc);}
  const feedback={action:'patrol',phase:actionPhase,points:2,damage:actionPhase==='p3a'?Math.max(0,hpBefore-inc.hp):0,patrols:inc.patrols,count:u.event.patrolCount,remaining:8-u.event.patrolCount,nextAt:now+10*60000,at:now};
  stageDone(s, inc, now);
  return { ok: true,feedback };
}

function investigate(s, user, now) {
  const inc = s.incident;
  if (!enabled(now) || !inc || inc.phase !== 'p1') throw Object.assign(Error('调查只在第一阶段开放'), { status: 409 });
  const u = s.accounts[String(user.id)];
  if (!u) throw Object.assign(Error('尚未开通交易账户'), { status: 404 });
  u.event ||= {};
  const last = u.event.lastInvestigate || 0;
  if (now - last < 10 * 60000) throw Object.assign(Error('调查冷却中'), { status: 429 });
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  if (u.event.investigateDay !== day) { u.event.investigateDay = day; u.event.investigateCount = 0; }
  if ((u.event.investigateCount || 0) >= 5) throw Object.assign(Error('今天的调查次数用完了'), { status: 429 });
  u.event.lastInvestigate = now; u.event.investigateCount = (u.event.investigateCount || 0) + 1;
  score(inc,user.id,1,now);
  const feedback={action:'investigate',phase:inc.phase,points:1,count:u.event.investigateCount,remaining:5-u.event.investigateCount,nextAt:now+10*60000,at:now};
  stageDone(s, inc, now);
  return { ok: true,feedback };
}

// Dedicated event dealers exchange only real spot principal and keep actual inventory.
function dealer(s,leg,phase){
  if(leg.actor)return s[leg.actor];
  const key='eventDealer-'+s.incident.startedAt+'-'+phase;
  leg.actor=key;leg.qty=0;leg.opened=0;leg.cash=0;leg.net={};
  s[key]={cash:30000000,inventory:{},eventDealer:true,asset:leg.asset,limit:leg.total,initialCapital:30000000,phase};
  s._journal ||= [];s._journal.push({event:'capital-'+key,userId:0,time:s.executionTime||s.lastTick,kind:'incident-capital',cashDelta:30000000,actor:key});
  return s[key];
}
// Ordinary market makers are helpers on a battle asset, not the opposing army.
function battlePolicy(s,a){const i=s.incident;if(!enabled(s.executionTime||s.lastTick||Date.now())||!i||i.phase==='resolved')return null;const defense=['p1','p2'].includes(i.phase)&&i.defend?.asset===a.id,boss=['p3a','p3c'].includes(i.phase)&&a.id==='scarlet';if(!defense&&!boss)return null;return {retreat:.01,depthScale:.1,sideCap:100,spotCap:Math.max(20000,Math.ceil((defense?(i.short?.total||300000):500000)*1.25/100)*100)};}
function dealerPlans(s,a,boss){
 const inc=s.incident;if(!enabled(s.executionTime||s.lastTick||Date.now())||!inc)return [];
 const current=boss?inc.boss:inc.short,active=current?.asset===a.id&&(boss?inc.phase==='p3c':['p1','p2'].includes(inc.phase));
 const rows=Object.entries(s).filter(([,d])=>d?.eventDealer&&d.asset===a.id&&(d.phase==='p3c')===boss);
 if(active&&!current.actor)rows.push(['eventDealer-'+inc.startedAt+'-'+inc.phase,{phase:inc.phase,asset:a.id,cash:30000000,inventory:{},limit:current.total}]);
 const band=G.bands(a),reference=Math.max(.1,a.mark||a.price),out=[];
 for(const [key,d] of rows){const leg=active&&(current.actor===key||!current.actor)?current:null,held=Math.max(0,-(d.inventory[a.id]||0)),closing=!leg||inc.phase!==d.phase||leg.settling||inc.phase==='resolved';if(d.settled)continue;const rate=boss?5000:Math.max(100,Math.ceil(d.limit/120000)*100),room=closing?Math.min(held,Math.floor(Math.max(0,d.cash)/Math.max(.1,reference*1.003))):Math.max(0,d.limit-(leg?.opened||0)),qty=Math.floor(Math.min(room,rate)/100)*100;
  if(qty<100)continue;const price=closing?Math.min(band.upper,Math.ceil(reference*1.003*10)/10):Math.max(band.lower,.1,Math.floor(reference*.997*10)/10);
  out.push({actor:key,asset:a.id,product:'spot',sign:closing?1:-1,price:round(price),remaining:qty});
 }return out;
}
function runDealer(s,a,process,boss){
 const inc=s.incident;if(!enabled(s.executionTime||s.lastTick||Date.now())||!inc)return;
 const current=boss?inc.boss:inc.short;
 if(current&&current.asset===a.id&&(boss?inc.phase==='p3c':['p1','p2'].includes(inc.phase)))dealer(s,current,boss?'p3c':inc.phase);
 for(const [key,d] of Object.entries(s).filter(([,d])=>d?.eventDealer&&d.asset===a.id&&(d.phase==='p3c')===boss)){
  const closing=current?.actor!==key||inc.phase!==d.phase||current?.settling||inc.phase==='resolved';
  if(closing&&!(d.inventory[a.id]||0)&&!d.settled){const profit=Math.max(0,round(d.cash-d.initialCapital));d.cash=round(d.cash-profit);s.insurance.balance=round(s.insurance.balance+profit);d.settled=true;s._journal ||= [];s._journal.push({event:'settle-'+key,userId:0,time:s.executionTime,kind:'incident-dealer-settlement',cashDelta:-profit,profit,actor:key});}
 }
 for(const plan of dealerPlans(s,a,boss))process({id:s.seq++,...plan});
}
function pressure(s,a,process){runDealer(s,a,process,false);}
function bossSell(s,a,process){runDealer(s,a,process,true);}
function publicBook(s,a){return [...dealerPlans(s,a,false),...dealerPlans(s,a,true)];}
function auxiliaryRemaining(s,a,sign){const p=battlePolicy(s,a);if(!p)return Infinity;const b=a.battleLiquidity,time=s.executionTime||s.lastTick;return Math.max(0,p.sideCap-(b?.time===time?(sign===1?b.buy:b.sell)||0:0));}
function noteAuxiliary(s,a,o,qty,time){if(o.userId||s[o.actor]?.eventDealer||!battlePolicy(s,a))return;let b=a.battleLiquidity;if(b?.time!==time)b=a.battleLiquidity={time,buy:0,sell:0};b[o.sign===1?'buy':'sell']+=qty;}
function dealerFill(s,o,price,qty,time,tradeId){
  if(!s[o.actor]?.eventDealer)return;
  const inc=s.incident,leg=[inc.short,inc.boss].find(x=>x?.actor===o.actor);
  if(leg){leg.qty=Math.max(0,-(s[o.actor].inventory[o.asset]||0));leg.cash=s[o.actor].cash-s[o.actor].initialCapital;if(o.sign<0)leg.opened=(leg.opened||0)+qty;}
  s._journal.push({event:'event-fill-'+tradeId+'-'+o.actor,userId:0,time,kind:'incident-dealer-fill',actor:o.actor,asset:o.asset,qty,price,sign:o.sign,cashAfter:s[o.actor].cash,inventory:s[o.actor].inventory[o.asset]||0});
}
function afterTick(s,time){
 const inc=s.incident;if(!enabled(time)||!inc||inc.phase==='resolved')return;
 const tickKey=inc.phase+':'+time;if(inc.processedTickKey===tickKey)return;inc.processedTickKey=tickKey;
 const phase=inc.phase,target=['p1','p2'].includes(phase)?inc.defend?.asset:phase==='p3a'?'scarlet':null;
 const net=inc.tradeNet ||= {};const stage=net[phase] ||= {},minuteNet=new Map(),attackBuyers=new Set();
 if(target){for(const t of (s._trades||[]).filter(t=>t.asset===target&&t.time===time&&t.spotQty>0)){
   for(const [id,sign] of [[t.buyUserId,1],[t.sellUserId,-1]])if(id){minuteNet.set(id,(minuteNet.get(id)||0)+sign*t.spotQty);if(sign===1&&t.eventSellQty>0)attackBuyers.add(id);const row=stage[id] ||= {qty:0,notional:0,awarded:0};row.qty+=sign*t.spotQty;row.notional=round(row.notional+sign*t.price*t.spotQty);touch(inc,id,time);}
 }
 for(const [id,row] of Object.entries(stage)){const valid=row.qty>0?Math.max(0,row.notional):0,points=Math.min(50,Math.floor(valid/10000));score(inc,id,points-(row.awarded||0),time);row.awarded=points;}
 if(['p1','p2'].includes(phase)){const d=inc.defend;d.defenders=Object.fromEntries(Object.entries(stage).filter(([,r])=>r.qty>=100&&r.notional>0).map(([id])=>[id,true]));if(d.lastCounted!==time&&asset(s,target).price>=d.floor&&[...attackBuyers].some(id=>minuteNet.get(id)>0&&stage[id]?.qty>0)){d.minutes=Math.min(d.required,d.minutes+1);d.lastCounted=time;}}
 if(phase==='p3a'){inc.damage=Object.fromEntries(Object.entries(stage).map(([id,r])=>[id,r.qty>0?Math.min(500000,Math.max(0,round(r.notional*10))):0]));updateHp(inc);}
 }
 stageDone(s,inc,time);
}
function enabled(time=Date.now()){return Release.enabled(time);}
function touch(inc,id,time){inc.members ||= {};inc.members[id] ||= {joinedAt:time};}
function score(inc,id,delta,time){touch(inc,id,time);if(!delta)return;inc.points[id]=Math.max(0,(inc.points[id]||0)+delta);inc.reachedAt ||= {};inc.reachedAt[id]=time;}
function updateHp(inc){const ids=new Set([...Object.keys(inc.damage||{}),...Object.keys(inc.actionDamage||{})]);const damage=[...ids].reduce((n,id)=>n+Math.min(500000,(inc.damage?.[id]||0)+(inc.actionDamage?.[id]||0)),0);inc.hp=Math.max(0,(inc.hpMax||inc.cfg.p3.hp)-(inc.baseDamage||0)-damage);}
function leaderboard(s){const inc=s.incident;if(!inc)return [];return Object.entries(inc.points||{}).filter(([,n])=>n>0).map(([id,n])=>({userId:Number(id),name:s.accounts[id]?.username||'玩家',points:n,reachedAt:inc.reachedAt?.[id]||inc.startedAt})).sort((a,b)=>b.points-a.points||a.reachedAt-b.reachedAt||a.userId-b.userId).map((r,i)=>({...r,rank:i+1}));}
function settleRewards(s,inc,time){if(inc.rewardsSettledAt)return;inc.finalRanking=leaderboard(s);for(const row of inc.finalRanking.slice(0,10)){const u=s.accounts[row.userId];if(!u)continue;const key=inc.id+'-'+inc.startedAt+'-top10';u.achievements ||= [];if(u.achievements.some(a=>a.id===key))continue;const title=row.rank===1?'红雾首席退治者':row.rank<=3?'红雾退治·三杰':'红雾退治·十杰';u.achievements.push({id:key,name:'红雾异变积分前十',title,rank:row.rank,points:row.points,earnedAt:time});u.titles ||= [];if(!u.titles.includes(title))u.titles.push(title);s._journal ||= [];s._journal.push({event:'reward-'+key+'-'+row.userId,userId:row.userId,time,kind:'incident-reward',cashDelta:0,title,rank:row.rank,points:row.points});}inc.rewardsSettledAt=time;}
function pause(s,time,duration=60000){const inc=s.incident;if(inc&&inc.phase!=='resolved'){inc.deadline+=duration;inc.pausedAt=time;}}

function view(s, user) {
  const inc = s.incident;
  if (!inc) return null;
  const c = inc.cfg;
  const rows = Object.entries(inc.contributors).map(([id, amount]) => ({ id: Number(id), name: s.accounts[id]?.username || '玩家', amount })).sort((a, b) => b.amount - a.amount);
  const points = Object.entries(inc.points).map(([id, n]) => ({ id: Number(id), name: s.accounts[id]?.username || '玩家', points: n })).sort((a, b) => b.points - a.points);
  const d = inc.defend;
  return {
    id: inc.id, phase: inc.phase, startedAt: inc.startedAt, deadline: inc.deadline,
    participants: Object.keys(inc.members||{}).length, patrols: inc.patrols || 0, myPoints: user ? (inc.points[user.id] || 0) : 0,
    hp: inc.phase === 'p3a' ? inc.hp : 0, hpMax: inc.phase === 'p3a' ? (inc.hpMax||c.p3.hp) : 0,
    raised: inc.raised,
    donateGoal: inc.phase === 'p2' ? c.p2.donate : c.p1.donate,
    donateCap: inc.phase === 'p2' ? c.p2.cap : c.p1.cap,
    defend: d ? { asset: d.asset, floor: d.floor, minutes: d.minutes, required: d.required, defenders: Object.keys(d.defenders).length, defendersRequired: d.defendersRequired || c.p2.defenders } : null,
    short: inc.short ? { asset: inc.short.asset, qty: inc.short.qty, total: inc.short.total } : null,
    boss: inc.boss ? { qty: inc.boss.qty, total:inc.boss.total, opened:inc.boss.opened||0,settling:!!inc.boss.settling,cash: inc.boss.cash } : null,
    p3Target: inc.p3Target || null, scarletPrice: (asset(s, 'scarlet') || {}).price || null,
    vote: inc.vote ? { round: inc.vote.round, candidates: inc.vote.candidates || inc.vote.options, ballots: inc.vote.ballots, tally: tally(inc) } : null,
    contributors: rows.slice(0, 10), points: points.slice(0, 10),
    titles: user ? (inc.titles[user.id] || []) : [],
    myContribution: user ? (inc.contributors[user.id] || 0) : 0,
    log: inc.log.slice(-8),
    gain: inc.gain, won: inc.won,p1Won:inc.p1Won,p2Won:inc.p2Won,vote1Result:inc.vote1Result||null,
    pointsBoard:(inc.finalRanking||leaderboard(s)).slice(0,100),myRank:user?(inc.finalRanking||leaderboard(s)).find(r=>r.userId===user.id)||null:null,rewardsSettled:!!inc.rewardsSettledAt,achievements:user?s.accounts[user.id]?.achievements||[]:[],enabled:enabled(),
  };
}

function tally(inc) {
  const out = {};
  for (const v of Object.values(inc.vote?.ballots || {})) out[v] = (out[v] || 0) + 1;
  return out;
}

module.exports = { ensure, create, support, vote, patrol, investigate, pressure, bossSell, afterTick, view, KEY, enabled, dealerFill,leaderboard,pause,battlePolicy,publicBook,auxiliaryRemaining,noteAuxiliary };
