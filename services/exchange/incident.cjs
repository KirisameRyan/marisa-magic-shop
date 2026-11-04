'use strict';
/**
 * 红雾异变 · 事件状态机
 * P1 调查 → V1 投票 → P2 护盘 → V2 投票 → P3A 决战 → P3C 逼多 → resolved
 */
const E = require('../../js/gensokyo-engine.js');
const G = require('./price-guard.cjs');

const KEY = 'red-mist';
const HOUR = 3600000;

function cfg(fast) {
  const u = fast ? 60000 : HOUR;          // 正式 1 小时；演示 1 分钟
  return {
    fast: !!fast,
    unit: u,
    p1: { hours: 24, hp: 3000000, donate: 3000000, cap: 400000, keep: 100000, halt: ['scarlet'] },
    vote1: { hours: 6, candidates: ['hakugyokurou', 'myouren', 'kazami'] },
    p2: { hours: 24, donate: 4000000, cap: 400000, keep: 100000, short: 500000, floor: 0.9, defendMinutes: fast ? 2 : 360, defenders: fast ? 3 : 30, halt: ['mistlake'] },
    vote2: { hours: 6, options: ['limit', 'difficulty'] },
    p3: { aHours: 2, cHours: 4, hp: 5000000, target: -0.08, bossCash: 30000000, bossRate: 2000 },
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
  if (!s.incident) {
    s.incident = create(now, fast);
    start(s, s.incident, now);
  }
  const inc = s.incident;
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
    if (['hakugyokurou', 'myouren', 'kazami'].includes(a.id)) { a.fair = round(a.fair * 0.94); a.sentimentDev = (a.sentimentDev || 0) - 0.02; }
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
    inc.vote.result = winner;
    const a = asset(s, winner);
    inc.defend = { asset: winner, floor: round(a.price * (inc.p1Won ? 0.92 : 0.88)), minutes: 0, required: c.p2.defendMinutes, defenders: {}, defendersRequired: c.p2.defenders };
    inc.short = { asset: winner, qty: 0, total: inc.p1Won ? 350000 : 650000, cash: 0, avgPrice: 0 };
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
    inc.hp = c.p3.hp * (inc.gain === 'difficulty' ? 0.8 : 1);
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
    for (const a of s.assets) { a.bandFactor = 1; if (a.suspended) { delete a.suspended; a.suspendResumed = true; } if (a.pausedUntil && a.pausedUntil > now) a.pausedUntil = 0; }
    inc.log.push({ at: now, text: inc.won ? '异变被退治，红雾散去。' : '异变未被完全退治，红雾暂时退去。' });
    news(s, now, inc.won ? '红雾退治成功' : '红雾暂时退去', inc.won ? '红魔馆恢复营业，全服 debuff 解除。' : '异变未被彻底解决，风控将在 24 小时后解除。');
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
    if (done) { inc.p1Won = true; grant(inc, 1); next(s, inc, now, 'vote1'); return true; }
    if (now >= inc.deadline) { inc.p1Won = false; penalty(s, inc, now, '第一阶段超时，异变扩散：护盘空单增加到 65 万份。'); next(s, inc, now, 'vote1'); return true; }
  } else if (inc.phase === 'vote1') {
    if (now >= inc.deadline) { next(s, inc, now, 'p2'); return true; }
  } else if (inc.phase === 'p2') {
    const d = inc.defend;
    const done = inc.raised >= c.p2.donate && d.minutes >= d.required && Object.keys(d.defenders).length >= c.p2.defenders;
    if (done) { inc.p2Won = true; grant(inc, 2); next(s, inc, now, 'vote2'); return true; }
    if (now >= inc.deadline) { inc.p2Won = false; penalty(s, inc, now, '护盘失败，异变扩散：决战 Boss 血量提升 20%。'); next(s, inc, now, 'vote2'); return true; }
  } else if (inc.phase === 'vote2') {
    if (now >= inc.deadline) { inc.gain = voteWinner2(inc); next(s, inc, now, 'p3a'); return true; }
  } else if (inc.phase === 'p3a') {
    if (inc.hp <= 0 || now >= inc.deadline) { next(s, inc, now, 'p3c'); return true; }
  } else if (inc.phase === 'p3c') {
    const a = asset(s, inc.boss.asset);
    if (a.price >= inc.p3Target) { inc.won = true; grant(inc, 3); next(s, inc, now, 'resolved'); return true; }
    if (now >= inc.deadline) { inc.won = false; next(s, inc, now, 'resolved'); return true; }
  }
  return false;
}

function voteWinner2(inc) {
  const tally = {};
  for (const v of Object.values(inc.vote.ballots)) tally[v] = (tally[v] || 0) + 1;
  return (tally.limit || 0) >= (tally.difficulty || 0) ? 'limit' : 'difficulty';
}

function grant(inc, stage) {
  const rows = Object.entries(inc.contributors).sort((a, b) => b[1] - a[1]);
  const titles = stage === 1 ? ['红雾调查员'] : stage === 2 ? ['雾中守望者'] : ['红雾退治者'];
  for (const [id] of rows) {
    inc.points[id] = (inc.points[id] || 0) + 20;
    inc.titles[id] ||= [];
    if (!inc.titles[id].includes(titles[0])) inc.titles[id].push(titles[0]);
  }
  const top = rows.slice(0, 3).map(([id]) => id);
  const rank = ['首功', '次功', '三功'];
  top.forEach((id, i) => {
    inc.titles[id] ||= [];
    const t = '红雾退治·' + rank[i];
    if (!inc.titles[id].includes(t)) inc.titles[id].push(t);
  });
}

function support(s, user, body, now) {
  const inc = s.incident;
  if (!inc || inc.phase === 'resolved') throw Object.assign(Error('异变已经结束'), { status: 409 });
  const amount = Math.floor(Number(body.amount));
  if (!Number.isSafeInteger(amount) || amount < 1000) throw Object.assign(Error('单笔至少 1,000'), { status: 400 });
  const c = inc.cfg;
  const cap = inc.phase === 'p2' ? c.p2.cap : c.p1.cap;
  const keep = inc.phase === 'p2' ? c.p2.keep : c.p1.keep;
  const u = s.accounts[String(user.id)];
  if (!u) throw Object.assign(Error('尚未开通交易账户'), { status: 404 });
  const used = inc.contributors[user.id] || 0;
  if (used + amount > cap) throw Object.assign(Error('单人捐款上限 ' + Math.round(cap / 10000) + ' 万'), { status: 400 });
  if (u.cash - amount < keep) throw Object.assign(Error('捐款后账户余额必须保留 ' + Math.round(keep / 10000) + ' 万'), { status: 400 });
  u.cash = round(u.cash - amount);
  inc.raised += amount;
  inc.contributors[user.id] = used + amount;
  inc.points[user.id] = (inc.points[user.id] || 0) + Math.floor(amount / 10000);
  if (inc.phase === 'p3a') inc.hp = Math.max(0, inc.hp - amount);
  s._journal ||= [];
  s._journal.push({ event: 'incident-support-' + now + '-' + user.id, userId: Number(user.id), time: now, kind: 'incident-support', cashDelta: -amount, cashAfter: u.cash, raised: inc.raised });
  stageDone(s, inc, now);
  return { ok: true, raised: inc.raised, hp: inc.hp };
}

function vote(s, user, body, now) {
  const inc = s.incident;
  if (!inc || (inc.phase !== 'vote1' && inc.phase !== 'vote2')) throw Object.assign(Error('当前不是投票阶段'), { status: 409 });
  if ((inc.contributors[user.id] || 0) < 10000) throw Object.assign(Error('本轮捐款满 1 万才有投票资格'), { status: 403 });
  if (inc.vote.ballots[user.id]) throw Object.assign(Error('已经投过票了'), { status: 409 });
  const option = String(body.option);
  const pool = inc.vote.candidates || inc.vote.options;
  if (!pool.includes(option)) throw Object.assign(Error('无效选项'), { status: 400 });
  inc.vote.ballots[user.id] = option;
  return { ok: true, option };
}

function patrol(s, user, now) {
  const inc = s.incident;
  if (!inc || inc.phase === 'resolved') throw Object.assign(Error('异变已经结束'), { status: 409 });
  const u = s.accounts[String(user.id)];
  if (!u) throw Object.assign(Error('尚未开通交易账户'), { status: 404 });
  u.event ||= {};
  const last = u.event.lastPatrol || 0;
  if (now - last < 10 * 60000) throw Object.assign(Error('巡逻冷却中'), { status: 429 });
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  if (u.event.patrolDay !== day) { u.event.patrolDay = day; u.event.patrolCount = 0; }
  if ((u.event.patrolCount || 0) >= 8) throw Object.assign(Error('今天的巡逻次数用完了'), { status: 429 });
  u.event.lastPatrol = now; u.event.patrolCount = (u.event.patrolCount || 0) + 1;
  inc.points[user.id] = (inc.points[user.id] || 0) + 2; inc.patrols = (inc.patrols || 0) + 1;
  if (inc.phase === 'p3a') inc.hp = Math.max(0, inc.hp - 1000);
  if ((inc.phase === 'p1' || inc.phase === 'p2') && inc.defend) inc.defend.minutes = Math.min(inc.defend.required, inc.defend.minutes + 1);
  if (inc.phase === 'p2' && inc.defend) inc.defend.minutes = Math.min(inc.defend.required, inc.defend.minutes + 1);
  stageDone(s, inc, now);
  return { ok: true };
}

function investigate(s, user, now) {
  const inc = s.incident;
  if (!inc || inc.phase !== 'p1') throw Object.assign(Error('调查只在第一阶段开放'), { status: 409 });
  const u = s.accounts[String(user.id)];
  if (!u) throw Object.assign(Error('尚未开通交易账户'), { status: 404 });
  u.event ||= {};
  const last = u.event.lastInvestigate || 0;
  if (now - last < 10 * 60000) throw Object.assign(Error('调查冷却中'), { status: 429 });
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  if (u.event.investigateDay !== day) { u.event.investigateDay = day; u.event.investigateCount = 0; }
  if ((u.event.investigateCount || 0) >= 5) throw Object.assign(Error('今天的调查次数用完了'), { status: 429 });
  u.event.lastInvestigate = now; u.event.investigateCount = (u.event.investigateCount || 0) + 1;
  inc.points[user.id] = (inc.points[user.id] || 0) + 1;
  stageDone(s, inc, now);
  return { ok: true };
}

/** 每 tick 调用：P2 空头抛压，P3C Boss 做多 */
function pressure(s, a, process) {
  const inc = s.incident;
  if (!inc || (inc.phase !== 'p1' && inc.phase !== 'p2') || !inc.short || inc.short.asset !== a.id) return;
  if (inc.short.qty >= inc.short.total) return;
  const rate = Math.max(100, Math.ceil(inc.short.total / 1200));
  const qty = Math.min(rate, inc.short.total - inc.short.qty);
  const band = G.bands(a);
  process({ id: s.seq++, actor: 'system', asset: a.id, sign: -1, price: band.lower, remaining: qty });
  inc.short.qty += qty;
  inc.short.cash += band.lower * qty;
  inc.short.avgPrice = inc.short.qty ? inc.short.cash / inc.short.qty : 0;
}

function bossSell(s, a, process) {
  const inc = s.incident;
  if (!inc || inc.phase !== 'p3c' || !inc.boss || inc.boss.asset !== a.id) return;
  if (inc.boss.qty >= inc.boss.total) return;
  const band = G.bands(a);
  const qty = Math.min(inc.boss.rate, inc.boss.total - inc.boss.qty);
  if (qty <= 0) return;
  process({ id: s.seq++, actor: 'system', asset: a.id, sign: -1, price: band.lower, remaining: qty });
  inc.boss.qty += qty;
  inc.boss.cash += band.lower * qty;
}

/** 每 tick 末尾调用：防守判定与阶段推进 */
function afterTick(s, time) {
  const inc = s.incident;
  if (!inc) return;
  if ((inc.phase === 'p1' || inc.phase === 'p2') && inc.defend) {
    const a = asset(s, inc.defend.asset);
    const buys = (s._trades || []).filter(t => t.asset === a.id && t.t === time && t.buyUserId);
    for (const t of buys) inc.defend.defenders[t.buyUserId] = true;
    if (a.price >= inc.defend.floor && buys.length) inc.defend.minutes = Math.min(inc.defend.required, inc.defend.minutes + 1);
  }
  stageDone(s, inc, time);
}

function view(s, user) {
  const inc = s.incident;
  if (!inc) return null;
  const c = inc.cfg;
  const rows = Object.entries(inc.contributors).map(([id, amount]) => ({ id: Number(id), name: s.accounts[id]?.username || '玩家', amount })).sort((a, b) => b.amount - a.amount);
  const points = Object.entries(inc.points).map(([id, n]) => ({ id: Number(id), name: s.accounts[id]?.username || '玩家', points: n })).sort((a, b) => b.points - a.points);
  const d = inc.defend;
  return {
    id: inc.id, phase: inc.phase, startedAt: inc.startedAt, deadline: inc.deadline,
    participants: Object.keys(inc.contributors).length, patrols: inc.patrols || 0, myPoints: user ? (inc.points[user.id] || 0) : 0,
    hp: inc.phase === 'p3a' ? inc.hp : 0, hpMax: inc.phase === 'p3a' ? c.p3.hp * (inc.gain === 'difficulty' ? 0.8 : 1) : 0,
    raised: inc.raised,
    donateGoal: inc.phase === 'p2' ? c.p2.donate : c.p1.donate,
    donateCap: inc.phase === 'p2' ? c.p2.cap : c.p1.cap,
    defend: d ? { asset: d.asset, floor: d.floor, minutes: d.minutes, required: d.required, defenders: Object.keys(d.defenders).length, defendersRequired: d.defendersRequired || c.p2.defenders } : null,
    short: inc.short ? { asset: inc.short.asset, qty: inc.short.qty, total: inc.short.total } : null,
    boss: inc.boss ? { qty: inc.boss.qty, cash: inc.boss.cash } : null,
    p3Target: inc.p3Target || null, scarletPrice: (asset(s, 'scarlet') || {}).price || null,
    vote: inc.vote ? { round: inc.vote.round, candidates: inc.vote.candidates || inc.vote.options, ballots: inc.vote.ballots, tally: tally(inc) } : null,
    contributors: rows.slice(0, 10), points: points.slice(0, 10),
    titles: user ? (inc.titles[user.id] || []) : [],
    myContribution: user ? (inc.contributors[user.id] || 0) : 0,
    log: inc.log.slice(-8),
    gain: inc.gain, won: inc.won,
  };
}

function tally(inc) {
  const out = {};
  for (const v of Object.values(inc.vote?.ballots || {})) out[v] = (out[v] || 0) + 1;
  return out;
}

module.exports = { ensure, create, support, vote, patrol, investigate, pressure, bossSell, afterTick, view, KEY };
