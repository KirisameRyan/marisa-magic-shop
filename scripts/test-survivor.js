// ═══════════ 魔理沙幸存者 · Node 冒烟测试（DOM/Canvas 桩驱动核心流程）═══════════
'use strict';
const fs = require('fs');

// ── DOM 桩 ──
function stubCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return {};
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (typeof k === 'string') return () => {};
      return undefined;
    },
    set() { return true; }
  });
}
function makeEl(tag) {
  const el = {
    tag: tag || 'div',
    style: {},
    dataset: {},
    children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => el.classList._s.add(x)); },
      remove(...c) { c.forEach(x => el.classList._s.delete(x)); },
      toggle(c, on) { if (on === undefined) { el.classList._s.has(c) ? el.classList._s.delete(c) : el.classList._s.add(c); } else if (on) el.classList._s.add(c); else el.classList._s.delete(c); },
      contains(c) { return el.classList._s.has(c); }
    },
    width: 960, height: 540,
    textContent: '', innerHTML: '',
    getContext: () => stubCtx(),
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    setAttribute() {}, remove() {},
    get offsetWidth() { return 100; },
    focus() {}, click() {},
    play() { return { catch() {} }; },
    pause() {},
  };
  return el;
}
const els = {};
global.document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; },
  createElement(t) { return makeEl(t); },
  querySelector() { return makeEl(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  body: makeEl(),
  head: makeEl(),
  documentElement: makeEl(),
  hidden: false,
  readyState: 'complete'
};
global.window = global;
Object.defineProperty(global, 'navigator', { value: { userAgent: 'node-test' }, configurable: true, writable: true });
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.matchMedia = () => ({ matches: false, addEventListener() {} });
global.addEventListener = () => {};
// 虚拟时钟：frames() 手动推进，保证每帧恰好 1 个逻辑步
let fakeNow = 0;
global.performance = { now: () => fakeNow };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.Image = class {
  constructor() { this.width = 64; this.height = 64; }
  set src(v) {
    if (v.indexOf('yard') >= 0 || v.indexOf('library') >= 0) { this.width = 1536; this.height = 1024; }
    setImmediate(() => this.onload && this.onload());
  }
};
global.Audio = class { constructor() { this.loop = false; this.volume = 1; this.currentTime = 0; } play() { return { catch() {} }; } pause() {} cloneNode() { return new global.Audio(); } };
global.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; } };
global.fetch = () => Promise.reject(new Error('no net in test'));
global.__msErrors = [];
process.on('uncaughtException', e => { global.__msErrors.push(e); console.error('UNCAUGHT:', e.message); });

// ── 加载游戏 ──
const src = fs.readFileSync('D:/Marisa_Project/js/marisa-survivor.js', 'utf8');
eval(src);

function frames(n, label) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) throw new Error('no rAF callback');
    fakeNow += 16.67; // 手动推进时钟
    const cb = rafCb; rafCb = null; cb();
    if (global.__msErrors.length) throw global.__msErrors[0];
  }
  if (label) console.log('✓', label);
}
// 击破当前符卡（补足伤害跨阈值；血量被钳制在阈值，一次最多推进一张）
function breakCard(ms) {
  const sc = ms.sc();
  if (sc) ms.dmgBoss(sc.max * (sc.max ? 0.4 : 0));
  frames(130); // 等切卡无敌帧结束
}

(async () => {
  await new Promise(r => setTimeout(r, 60)); // 等 preload 完成
  const ms = global.__ms;
  if (!ms) throw new Error('__ms hook missing');

  // 1. 选人 → 开局（弱构筑，先测 Boss 流程）
  global.localStorage.setItem('ms_tut_done', '1'); // 跳过新手教程弹窗
  global.showSelect(); global.confirmSelect();
  const p = ms.p();
  p.maxHp = 1e6; p.hp = 1e6; // 测试期不死身（流程验证用）
  p.xpNeed = 1e18; // 跳过升级（卡池/进化已单独测试）
  frames(120, '开局 2 秒无异常 (state=' + ms.state().gameState + ')');

  // 1.5 智能卡池过滤（初始只有星星弹：灵/子弹）
  const pool0 = ms.pool();
  if (!pool0.some(c => c.type === 'attr' && c.id === 'rei')) throw new Error('应出现灵力强化');
  if (pool0.some(c => c.type === 'attr' && c.id === 'ma')) throw new Error('未持有魔系武器却出现魔力强化');
  if (!pool0.some(c => c.type === 'type' && c.id === 'bullet')) throw new Error('应出现弹道精通');
  if (pool0.some(c => c.type === 'type' && c.id === 'melee')) throw new Error('未持有近身武器却出现斩击精通');
  console.log('✓ 智能卡池过滤正确');

  // 2. 快进刷怪 + 精英词缀波
  ms.skip(150);
  frames(600, '2:30 刷怪/词缀精英 (enemies=' + ms.state().enemies + ')');

  // 3. Boss 符卡战：蕾米莉亚全 3 阶段（弱构筑，弹幕模式真正运行）
  ms.spawnBoss(0);
  frames(200, '蕾米莉亚入场演出');
  let sc = ms.sc();
  if (!sc) throw new Error('Boss 入场后消失');
  console.log('  符卡1:', sc.name, 'HP', sc.hp + '/' + sc.max, '倒计时', sc.cardT);
  frames(600, '符卡1「冈格尼尔」弹幕运行 10s');
  breakCard(ms);
  sc = ms.sc();
  if (!sc || sc.idx < 1) throw new Error('符卡1→2 切换失败: ' + JSON.stringify(sc));
  console.log('✓ 击破 →', sc.name);
  frames(600, '符卡2「吸血鬼黄昏」弹幕运行 10s');
  breakCard(ms);
  sc = ms.sc();
  if (!sc || sc.idx < 2) throw new Error('符卡2→3 切换失败: ' + JSON.stringify(sc));
  console.log('✓ 击破 →', sc.name);
  frames(700, '符卡3「绯红恶魔」弹幕运行 (含十字激光/突进)');
  ms.dmgBoss(1e9); frames(60);
  if (ms.b() && !ms.b().dead) throw new Error('Boss 未被击破');
  console.log('✓ 蕾米莉亚击破 (scBreaks=' + ms.state().scBreaks + ')');
  if (ms.state().gameState === 'relic') ms.pickRelic(0); // 战利品三选一

  // 4. 芙兰朵露（四重存在 + Q.E.D.）
  ms.spawnBoss(1);
  frames(200, '芙兰朵入场');
  sc = ms.sc();
  if (!sc) throw new Error('芙兰朵入场后消失');
  console.log('  符卡1:', sc.name);
  frames(500, '符卡1「星之弓」弹幕运行');
  breakCard(ms);
  sc = ms.sc();
  if (!sc || sc.idx < 1) throw new Error('芙兰朵符卡1→2 失败');
  console.log('✓ 击破 →', sc.name);
  frames(700, '符卡2「四重存在」弹幕运行');
  breakCard(ms);
  sc = ms.sc();
  if (!sc || sc.idx < 2) throw new Error('芙兰朵符卡2→3 失败');
  console.log('✓ 击破 →', sc.name);
  frames(800, '符卡3「495年的波纹」弹幕运行 (双螺旋+波纹环)');
  ms.dmgBoss(1e9); frames(60);
  console.log('✓ 芙兰朵击破 (scBreaks=' + ms.state().scBreaks + ')');
  if (ms.state().gameState === 'relic') ms.pickRelic(0); // 战利品三选一
  var relicStacks = 0, relicBag = ms.relics();
  for (var rk in relicBag) relicStacks += relicBag[rk];
  if (relicStacks < 2) throw new Error('两场 Boss 战后遗物层数不足: ' + JSON.stringify(relicBag));

  // 5. 现役武器全部获取并满级（绕过卡池直接注入）
  p.weapons = [{ id:'star', lv:5, t:1, ang:0 }];
  ['spark','orbit','frost','comet','yinyang','needle'].forEach(id => p.weapons.push({ id, lv: 5, t: 1, ang: 0 }));
  frames(500, '现役武器(星/炮/环/冰/陨/玉/针)满级开火 500 帧无异常');

  // 6. 超进化：条件 = 武器 Lv5 + 属性强化 Lv5 + 类型强化 Lv3
  Object.keys(p.passives).forEach(k => p.passives[k] = 5);
  p.attrs.rei = 5; p.attrs.ma = 5;
  p.types.bullet = 3; p.types.aoe = 3; p.types.summon = 3; p.types.field = 3; p.types.beam = 3; p.types.melee = 3;
  const pool = ms.pool();
  const evoCards = pool.filter(c => c.type === 'evo');
  if (!evoCards.length) throw new Error('属性/类型满级后卡池无超进化金卡！');
  if (pool.some(c => c.type === 'attr')) throw new Error('属性强化满级后不应再进池');
  if (pool.some(c => c.type === 'type')) throw new Error('类型强化满级后不应再进池');
  console.log('✓ 超进化金卡出现在卡池:', evoCards.map(c => c.id).join(','));
  ms.apply({ type: 'evo', id: 'star' });
  ms.apply({ type: 'evo', id: 'orbit' });
  ms.apply({ type: 'evo', id: 'needle' });
  ms.apply({ type: 'evo', id: 'spark' });
  ms.apply({ type: 'evo', id: 'frost' });
  ms.apply({ type: 'evo', id: 'yinyang' });
  frames(600, '流星群/银河星环/封魔阵/MasterSpark/PerfectFreeze/梦想妙珠觉醒后 600 帧无异常');

  // 7. 冰环 AOE 实战
  for (let k = 0; k < 8; k++) ms.spawn('fairy');
  frames(400, '冰环冻结混战 400 帧无异常');

  // 7.5 A2 新武器（上海&蓬莱 / 红色冥界 / 冈格尼尔 / 绯想剑 / 楼观&白楼）冒烟
  p.hp = 9999; p.maxHp = 9999;
  p.weapons = [
    { id:'star', lv:5, t:1, ang:0 }, { id:'shanghai', lv:5, t:1, ang:0 },
    { id:'netherworld', lv:5, t:1, ang:0 }, { id:'gungnir', lv:5, t:1, ang:0 },
    { id:'hisou', lv:5, t:1, ang:0 }, { id:'roukan', lv:5, t:1, ang:0 }
  ];
  for (let k = 0; k < 12; k++) ms.spawn('fairy');
  frames(600, 'A2 新武器满级混战 600 帧无异常');
  Object.keys(p.passives).forEach(k => p.passives[k] = 5);
  ['shanghai','netherworld','gungnir','hisou','roukan'].forEach(id => ms.apply({ type:'evo', id }));
  for (let k = 0; k < 12; k++) ms.spawn('fairy');
  frames(900, 'A2 新武器超进化 900 帧无异常');

  // 7.7 新敌人冒烟（魂蝶 / 向日葵 / 幽灵 / 野猪）
  p.hp = 9999; p.maxHp = 9999;
  ['butterfly','sunflower','ghost','boar'].forEach(t => ms.spawn(t, p.x + (Math.random()-0.5)*300, p.y + (Math.random()-0.5)*300));
  frames(600, '魂蝶/向日葵/幽灵/野猪混战 600 帧无异常');

  // 8. 玩家死亡 → 结算流程（重开一局清空残留领域/护盾，再让怪贴身）
  global.confirmSelect();
  frames(30);
  const p8 = ms.p(); // resetPlayer 会替换 player 对象，必须重新取引用
  p8.hp = 1; p8.maxHp = 100; p8.inv = 0; p8.shield = 0;
  p8.weapons = [];
  ms.spawn('fairy', p8.x, p8.y);
  frames(300);
  if (ms.state().gameState !== 'over') {
    p8.hp = 1; p8.inv = 0; p8.shield = 0; // 可能被不死鸟之羽复活，再打一次
    ms.spawn('fairy', p8.x, p8.y);
    frames(300);
  }
  if (ms.state().gameState !== 'over') throw new Error('玩家应死亡进入结算，当前: ' + ms.state().gameState);
  console.log('✓ 玩家死亡 → 结算流程完成 (scBreaks=' + ms.state().scBreaks + ')');

  // 9. 再来一局
  global.confirmSelect();
  frames(300, '二周目开局 300 帧无异常');

  // 10. A5：角色差异 / 暂停面板 / 重抽
  const pa = ms.p();
  if (pa.maxHp !== 140 || pa.weapons[0].id !== 'star') throw new Error('魔理沙初始不符合预期: hp=' + pa.maxHp + ' wpn=' + pa.weapons[0].id);
  ms.enterLv(); ms.reroll(); ms.pick(0); // 重抽一次后选卡退出
  ms.pauseToggle();
  const ps = document.getElementById('pauseStats');
  ms.renderPause('wpn');
  if (!ps.innerHTML || ps.innerHTML.indexOf('我的武器') < 0) throw new Error('暂停面板未渲染武器页');
  ms.renderPause('panel');
  ms.pauseToggle();
  global.showSelect(); window._selChar('reimu'); global.confirmSelect();
  const pr = ms.p();
  if (pr.maxHp !== 110 || pr.weapons[0].id !== 'needle') throw new Error('灵梦初始不符合预期: hp=' + pr.maxHp + ' wpn=' + pr.weapons[0].id);
  frames(120, '灵梦开局 120 帧');
  console.log('✓ A5 角色差异 / 暂停面板 / 重抽通过');

  // 11. 教程 / 公告冒烟
  window._openTutorial(true);
  if (!document.getElementById('tutPage').innerHTML) throw new Error('新手教程页未渲染');
  window._tutNav(1);
  window._tutSkip();
  console.log('✓ 新手教程 / 公告冒烟通过');

  // 12. 调试控制台钩子
  if (ms.wpnList().length !== 20) throw new Error('wpnList 应为 20 把武器，实际 ' + ms.wpnList().length);
  if (ms.pasList().length !== 10) throw new Error('pasList 应为 10，实际 ' + ms.pasList().length);
  if (ms.relicList().length !== 18) throw new Error('relicList 应为 18，实际 ' + ms.relicList().length);
  if (ms.typeList().length !== 6) throw new Error('typeList 应为 6，实际 ' + ms.typeList().length);
  ms.addWeapon('hisou', 5); ms.evoWeapon('hisou');
  ms.setAttr('rei', 5); ms.setType('melee', 3); ms.addPassive('atk', 1);
  ms.addRelic('core'); ms.god(true);
  frames(180, '调试钩子操作后 180 帧无异常');
  if (!ms.godState()) throw new Error('god 未生效');
  ms.god(false); ms.heal(); ms.magnetAll(); ms.clearEnemies();
  const au = ms.audio();
  if (typeof au.vol !== 'number' || typeof au.ctxState !== 'string' && au.ctxState !== null) throw new Error('audio 钩子异常: ' + JSON.stringify(au));
  console.log('✓ 调试控制台钩子通过');

  // 13. 本轮修复断言（红冥界/破魔针/绯想剑双轨/楼观连锁）
  const pq = ms.p();
  pq.hp = 1e6; pq.maxHp = 1e6; pq.xpNeed = 1e18; // 测试期不升级、不死身
  while (ms.state().gameState === 'levelup') ms.pick(0);
  pq.weapons = [{ id:'netherworld', lv:5, t:1, ang:0 }];
  ms.apply({ type:'evo', id:'netherworld' });
  for (let k = 0; k < 3; k++) ms.spawn('fairy');
  frames(300, '红冥界超进化 300 帧');
  const nf = ms.fxState().nether;
  if (!nf || !isFinite(nf.r) || !isFinite(nf.dmg) || nf.r <= 0 || nf.dmg <= 0) throw new Error('红冥界超进化数值异常: ' + JSON.stringify(nf));
  console.log('✓ 红冥界超进化数值正常 (r=' + Math.round(nf.r) + ', dmg=' + nf.dmg.toFixed(1) + ')');

  const ncfg = ms.wpnCfg('needle');
  if (ncfg.dmg[4] > 20 || ncfg.n[4] > 5 || ncfg.pr[4] > 3) throw new Error('破魔针削弱未生效: ' + JSON.stringify({ d:ncfg.dmg[4], n:ncfg.n[4], p:ncfg.pr[4] }));
  console.log('✓ 破魔针削弱生效 (dmg=' + ncfg.dmg[4] + ', n=' + ncfg.n[4] + ', pierce=' + ncfg.pr[4] + ')');

  // 魔炮重做：索敌蓄力 → 无限射程命中远处敌人；超进化持续光束
  pq.weapons = [{ id:'spark', lv:1, t:1, ang:0 }];
  ms.clearEnemies();
  ms.spawn('fairy', pq.x + 600, pq.y);
  const foeRef = ms.enemiesList()[ms.enemiesList().length - 1];
  const farMax = foeRef.hp;
  frames(60, '魔炮蓄力发射 60 帧');
  if (!foeRef.killed && foeRef.hp >= farMax) throw new Error('魔炮未命中远处目标（无限射程失效）: ' + JSON.stringify({ hp: foeRef.hp, max: farMax, killed: !!foeRef.killed }));
  console.log('✓ 魔炮脉冲命中 600px 外目标 (hp ' + foeRef.hp + '/' + farMax + ', killed=' + !!foeRef.killed + ')');
  pq.weapons = [{ id:'spark', lv:5, t:1, ang:0 }];
  ms.apply({ type:'evo', id:'spark' });
  pq.hp = 1e6; pq.maxHp = 1e6;
  for (let k = 0; k < 4; k++) ms.spawn('mini', pq.x + 200 + k * 80, pq.y);
  frames(160, '魔炮超进化 160 帧');
  if (!ms.fxState().sparkBeams) throw new Error('魔炮超进化没有持续光束');
  console.log('✓ 魔炮超进化持续光束生效');

  pq.weapons = [{ id:'hisou', lv:5, t:1, ang:0 }];
  ms.apply({ type:'evo', id:'hisou' });
  for (let k = 0; k < 6; k++) ms.spawn('fairy', pq.x + (Math.random()-0.5)*120, pq.y + (Math.random()-0.5)*120); // 近身目标
  const s0 = ms.slashCount(), f0 = ms.fallerCount();
  frames(420, '绯想剑超进化双轨 420 帧');
  if (ms.slashCount() <= s0) throw new Error('超进化绯想剑没有挥剑');
  if (ms.fallerCount() <= f0) throw new Error('超进化绯想剑没有要石');
  console.log('✓ 绯想剑超进化双轨（剑击+' + (ms.fallerCount() - f0) + ' 颗要石）');

  pq.weapons = [{ id:'roukan', lv:5, t:1, ang:0 }];
  ms.apply({ type:'evo', id:'roukan' });
  ms.clearEnemies();
  for (let k = 0; k < 5; k++) { // 分散站位的脆皮目标：避免一刀全清，验证跨目标连斩
    const ka = k * 1.25;
    ms.spawn('mini', pq.x + Math.cos(ka) * (220 + k * 40), pq.y + Math.sin(ka) * (220 + k * 40));
  }
  if (ms.state().enemies < 5) throw new Error('mini 生成失败: ' + ms.state().enemies);
  let maxDash = 0;
  for (let t = 0; t < 36; t++) {
    frames(10);
    const rs = ms.roukanState();
    if (rs && rs.dash && rs.dash.dashCount > maxDash) maxDash = rs.dash.dashCount;
  }
  if (ms.roukanChain() < 2) throw new Error('楼观未跨目标连斩，chainTotal=' + ms.roukanChain() + ' ' + JSON.stringify(ms.roukanState()));
  if (maxDash > 10) throw new Error('楼观换目标冲刺超上限: ' + maxDash);
  console.log('✓ 楼观冲刺连锁（targets=' + ms.roukanChain() + ', 峰值换目标冲刺=' + maxDash + '）');

  // 14. v2.1 平衡性更新：Boss 血量曲线 / 怪物成长 / 魂蝶减速 / 毒蘑菇毒坑 / 特殊怪潮横幅
  global.confirmSelect(); // 重开一局：时间与 Boss 计数归零，避免自动 Boss 干扰
  frames(30);
  const pb = ms.p();
  pb.hp = 1e6; pb.maxHp = 1e6; pb.xpNeed = 1e18;
  while (ms.state().gameState === 'levelup') ms.pick(0);
  if (ms.bg().index !== 0) throw new Error('开局背景应为庭院(index 0)，实际 ' + ms.bg().index);
  if (ms.bg().tw !== 768 || ms.bg().scale !== 0.5) throw new Error('庭院瓦片应为 768(0.5)，实际 ' + ms.bg().tw + '/' + ms.bg().scale);

  // 14.1 Boss 固定血量曲线：首 6000、第二 8400（不受时间倍率影响）
  function killBossAll() {
    let guard = 0;
    while (ms.b() && !ms.b().dead && guard++ < 12) { ms.killBoss(); frames(120); }
    if (ms.state().gameState === 'relic') ms.pickRelic(0);
  }
  ms.spawnBoss(0);
  if (!ms.b() || ms.b().maxHp !== 6000) throw new Error('首 Boss 血量应为 6000，实际 ' + (ms.b() && ms.b().maxHp));
  frames(200); // 入场演出结束
  killBossAll();
  if (ms.bg().index !== 1) throw new Error('首只 Boss 击破后背景应为图书馆，实际 ' + ms.bg().index);
  if (ms.bg().tw !== 1536 || ms.bg().scale !== 1.0) throw new Error('图书馆瓦片应为 1536(1.0)，实际 ' + ms.bg().tw + '/' + ms.bg().scale);
  ms.spawnBoss();
  if (!ms.b() || ms.b().maxHp !== 8400) throw new Error('第二 Boss 血量应为 8400，实际 ' + (ms.b() && ms.b().maxHp));
  frames(200);
  killBossAll();
  if (ms.bg().index !== 0) throw new Error('第二只 Boss 击破后背景应回庭院，实际 ' + ms.bg().index);
  console.log('✓ v2.1 Boss 血量曲线 6000 → 8400（不吃时间倍率）');

  // 14.2 普通怪 HP 成长 /145（受时间倍率影响明显放缓）
  ms.skip(120);
  ms.clearEnemies();
  const gtn = ms.state().gameTime;
  ms.spawn('fairy', pb.x + 900, pb.y);
  const elf14 = ms.enemiesList()[ms.enemiesList().length - 1];
  const wantHp14 = Math.round(16 * (1 + gtn / 145));
  if (elf14.hp !== wantHp14) throw new Error('hpMul 未按 /145 生效: ' + elf14.hp + ' vs ' + wantHp14);
  console.log('✓ v2.2 怪物 HP 成长放缓 (t=' + Math.round(gtn) + 's, fairy hp=' + elf14.hp + ')');

  // 14.3 魂蝶减速（基础 spd 1.5）
  if (ms.etype('butterfly').spd !== 1.5) throw new Error('魂蝶基础移速应为 1.5，实际 ' + ms.etype('butterfly').spd);
  ms.clearEnemies();
  ms.spawn('butterfly', pb.x + 700, pb.y);
  const bf14 = ms.enemiesList()[ms.enemiesList().length - 1];
  const spdCap = 1.5 * 1.15 * (1 + Math.min(ms.state().gameTime / 600, 0.4)) + 0.001;
  if (bf14.spd > spdCap) throw new Error('魂蝶实测移速超上限: ' + bf14.spd);
  console.log('✓ v2.1 魂蝶减速 (实测 spd=' + bf14.spd.toFixed(2) + ')');

  // 14.4 毒蘑菇死亡留毒坑 → 毒坑伤害怪物（不分敌我）
  ms.clearEnemies();
  pb.weapons = [{ id:'star', lv:5, t:1, ang:0 }];
  ms.spawn('poison', pb.x + 46, pb.y);
  const pm14 = ms.enemiesList()[ms.enemiesList().length - 1];
  pm14.hp = 1; pm14.maxHp = 1;
  frames(180, '毒蘑菇击杀');
  if (!ms.pits().length) throw new Error('毒蘑菇死亡未留下毒坑');
  console.log('✓ v2.1 毒蘑菇死亡留下毒坑 (pits=' + ms.pits().length + ')');
  pb.weapons = [];
  const pit0 = ms.pits()[ms.pits().length - 1];
  ms.spawn('fairy', pit0.x, pit0.y); // 按真实毒坑坐标站进去
  const ef14 = ms.enemiesList()[ms.enemiesList().length - 1];
  const efHp014 = ef14.hp;
  frames(70, '毒坑伤害怪物');
  if (!ef14.killed && ef14.hp >= efHp014) throw new Error('毒坑未对怪物造成伤害: ' + ef14.hp + '/' + efHp014);
  console.log('✓ v2.1 毒坑不分敌我伤害生效 (' + ef14.hp + '/' + efHp014 + ')');

  // 14.5 特殊怪潮 + 右上角事件横幅
  ms.skip(200); // 解锁全部主题（最晚 4:20 的野猪之潮）
  ms.clearEnemies();
  ms.wave();
  if (ms.state().enemies < 5) throw new Error('怪潮未生成足够敌人: ' + ms.state().enemies);
  if (!document.getElementById('eventBanner').classList.contains('show')) throw new Error('怪潮未触发事件横幅');
  if (!ms.bannerT()) throw new Error('事件横幅计时器未启动');
  console.log('✓ v2.1 特殊怪潮 + 事件横幅 (' + ms.state().enemies + ' 只)');

  // 14.6 近战对 Boss 加成（+25% ~ +55%，随斩击精通）
  ms.clearEnemies();
  ms.spawnBoss(0);
  frames(200); // 入场演出结束
  const bb14 = ms.b();
  if (!bb14) throw new Error('Boss 未入场');
  bb14.x = pb.x + 40; bb14.y = pb.y;
  frames(1); // 等网格重建，近身判定才能检索到 Boss
  bb14.x = pb.x + 40; bb14.y = pb.y;
  const rndBak14 = Math.random;
  const relicBak14 = pb.relics;
  pb.relics = {}; // 隔离此前随机遗物（如屠魔者 +20% 对 Boss）对伤害数值的影响
  Math.random = () => 0.99; // 关闭暴击随机，保证伤害确定
  ms.setType('melee', 0);
  const hb0 = bb14.hp; ms.swing(0, 40, 140); const dmgB0 = hb0 - bb14.hp;
  ms.setType('melee', 3);
  const hb1 = bb14.hp; ms.swing(0, 40, 140); const dmgB1 = hb1 - bb14.hp;
  Math.random = rndBak14;
  pb.relics = relicBak14;
  if (dmgB0 !== 50 || dmgB1 !== 62) throw new Error('近战对 Boss 加成异常: Lv0=' + dmgB0 + ' Lv3=' + dmgB1);
  console.log('✓ v2.2 近战对 Boss 加成 (Lv0 ×1.25=' + dmgB0 + ', 斩击精通满 ×1.55=' + dmgB1 + ')');

  // 14.7 背景轮换：击破 Boss → 图书馆
  killBossAll();
  if (ms.bg().index !== 1) throw new Error('实测 Boss 击破后背景应为图书馆，实际 index=' + ms.bg().index);
  console.log('✓ v2.2 背景轮换（庭院 → 图书馆）');

  // 14.8 刀削弹幕：只削非 Boss 弹（向日葵三向弹）
  let ebGuard = 0;
  while (ms.ebullets().length > 0 && ebGuard++ < 15) frames(60);
  ms.clearEnemies();
  pb.weapons = [];
  ms.spawn('sunflower', pb.x + 130, pb.y);
  let ebWait = 0, near = null;
  while (ebWait++ < 600) {
    frames(1);
    const list = ms.ebullets();
    let best = null, bd = 1e9;
    for (let bi = 0; bi < list.length; bi++) {
      const d2 = (list[bi].x - pb.x) * (list[bi].x - pb.x) + (list[bi].y - pb.y) * (list[bi].y - pb.y);
      if (d2 < bd) { bd = d2; best = list[bi]; }
    }
    if (best && bd < 200 * 200) { near = best; break; }
  }
  if (!near) throw new Error('向日葵弹幕未接近玩家');
  if (ms.ebullets().some(function (b) { return !b.cuttable; })) throw new Error('出现不可削的非 Boss 弹幕');
  const eb0 = ms.ebullets().length;
  const swingAng = Math.atan2(near.y - pb.y, near.x - pb.x);
  ms.swing(swingAng, 10, 220);
  const eb1 = ms.ebullets().length;
  if (eb1 >= eb0) throw new Error('刀未削掉向日葵弹幕: ' + eb0 + ' → ' + eb1 + ' @' + JSON.stringify({ dx: Math.round(near.x - pb.x), dy: Math.round(near.y - pb.y) }));
  console.log('✓ v2.2 刀削弹幕（非 Boss 弹 ' + eb0 + ' → ' + eb1 + '）');

  // 14.9 尸体强幂等：Boss 尸体入池后再受击，不应二次结算/二次切换背景
  ms.clearEnemies();
  pb.weapons = [];
  ms.spawnBoss(0);
  frames(200);
  const zref = ms.b();
  if (!zref) throw new Error('Boss 未入场（尸体幂等测试）');
  killBossAll();
  frames(1); // 尸体被回收：dead 重置为 false、killed 保持 true
  if (!zref.killed || zref.dead) throw new Error('测试前提不成立：尸体状态 killed=' + zref.killed + ' dead=' + zref.dead);
  const bgB9 = ms.bg().index;
  ms.dmgRef(zref, 9999);
  if (ms.bg().index !== bgB9) throw new Error('Boss 尸体被二次击杀，触发背景二次切换: ' + bgB9 + ' → ' + ms.bg().index);
  console.log('✓ v2.2 尸体强幂等（二次击杀已拦截）');

  // 14.10 动态分辨率（H 恒定 540，W 随宽高比伸缩）
  const vpA = ms.vp(844, 390);
  if (vpA.w !== 1169 || vpA.h !== 540) throw new Error('844×390 视口异常: ' + JSON.stringify(vpA));
  if (Math.abs(vpA.s * vpA.w - 844) > 1) throw new Error('844×390 未铺满: ' + vpA.s);
  const vpB = ms.vp(1920, 1080);
  if (vpB.w !== 960 || vpB.h !== 540 || vpB.s !== 2) throw new Error('1920×1080 视口异常: ' + JSON.stringify(vpB));
  const vpC = ms.vp(1024, 768);
  if (vpC.w !== 720 || vpC.h !== 540) throw new Error('1024×768 视口异常: ' + JSON.stringify(vpC));
  const vpD = ms.vp(390, 844);
  if (vpD.w !== 960 || vpD.h !== 540) throw new Error('竖屏应维持 960×540: ' + JSON.stringify(vpD));
  const vpE = ms.vp(3440, 1440);
  if (vpE.w !== 1290 || Math.abs(vpE.s - 2.6667) > 0.01) throw new Error('3440×1440 应 W=1290 且 s≈2.667: ' + JSON.stringify(vpE));
  if (Math.abs(vpE.w * vpE.s - 3440) > 1 || Math.abs(vpE.h * vpE.s - 1440) > 1) throw new Error('3440×1440 未精确填满: ' + JSON.stringify(vpE));
  const vpF = ms.vp(1920, 1200);
  if (Math.abs(vpF.w * vpF.s - 1920) > 1 || Math.abs(vpF.h * vpF.s - 1200) > 1) throw new Error('1920×1200 未精确填满: ' + JSON.stringify(vpF));
  const vpG = ms.vp(2560, 1440);
  if (Math.abs(vpG.w * vpG.s - 2560) > 1 || Math.abs(vpG.h * vpG.s - 1440) > 1) throw new Error('2560×1440 未精确填满: ' + JSON.stringify(vpG));
  console.log('✓ v2.3 动态分辨率 (844×390→' + vpA.w + '×540 铺满 / 1024×768→' + vpC.w + '×540 / 1920×1200·2560×1440 精确填满 / 竖屏降级 960×540)');

  // 15. Toy 排行榜 v2：双榜（board1 得分 / board2 存活秒数）+ 头像 + 本局机体
  let toySubmits = [];
  global.toy = {
    submitScore: function(o) { toySubmits.push(o); return Promise.resolve({ score: o.score }); },
    getRankList: function(o) { return Promise.resolve(o.board === 1 ? [{ rank: 1, score: 1234, nickname: '甲', avatar: '//p0.hdslb.com/a.jpg' }] : [{ rank: 1, score: 512, nickname: '乙', avatar: '' }]); },
    getMyRank: function(o) { return Promise.resolve({ ranked: true, rank: 1, score: o.board === 1 ? 1234 : 512 }); }
  };
  global.showSelect(); window._selChar('marisa'); global.confirmSelect();
  frames(30);
  const pt15 = ms.p();
  pt15.hp = 1; pt15.maxHp = 100; pt15.inv = 0; pt15.shield = 0; pt15.weapons = [];
  ms.skip(500); // 保证存活时间 >500s，便于断言 board2 提交值
  ms.spawn('fairy', pt15.x, pt15.y);
  let d15 = 0;
  while (ms.state().gameState !== 'over' && d15++ < 10) {
    frames(300);
    if (ms.state().gameState !== 'over') { pt15.hp = 1; pt15.inv = 0; pt15.shield = 0; ms.spawn('fairy', pt15.x, pt15.y); }
  }
  if (ms.state().gameState !== 'over') throw new Error('Toy 榜测试：未能死亡结算');
  await new Promise(function(r) { setTimeout(r, 80); }); // 等排行榜 promise 链渲染
  const lbHtml = document.getElementById('lbArea').innerHTML;
  if (lbHtml.indexOf('得分榜') < 0 || lbHtml.indexOf('存活榜') < 0) throw new Error('Toy 双榜 Tab 未渲染: ' + lbHtml.slice(0, 140));
  if (lbHtml.indexOf('8:32') < 0) throw new Error('存活榜未按 mm:ss 格式化 (期望 8:32)');
  if (lbHtml.indexOf('lb-av') < 0) throw new Error('B站头像未渲染');
  if (lbHtml.indexOf('魔理沙') < 0) throw new Error('本局机体未显示');
  const run15 = ms.lastRun();
  if (run15.char !== 'marisa' || run15.time < 500) throw new Error('lastRun 记录异常: ' + JSON.stringify(run15));
  ms.lbToySubmit();
  await new Promise(function(r) { setTimeout(r, 50); });
  const b1 = toySubmits.filter(function(o) { return o.board === 1; })[0];
  const b2 = toySubmits.filter(function(o) { return o.board === 2; })[0];
  if (!b1 || b1.score !== run15.score) throw new Error('board1 提交异常: ' + JSON.stringify(toySubmits));
  if (!b2 || b2.score !== Math.floor(run15.time)) throw new Error('board2 应提交存活秒数: ' + JSON.stringify(b2));
  delete global.toy;
  console.log('✓ v2.4 Toy 双榜（得分 board1 / 存活 board2=' + b2.score + 's）+ 头像 + 本局机体');

  // 16. P0：敌方抗性 / 吸血上限 / 主动结束
  global.showSelect(); window._selChar('marisa'); global.confirmSelect();
  frames(30);
  const r16a = ms.resNow();
  if (r16a.leech > 0.01 || r16a.freeze > 0.01) throw new Error('开局不应有抗性: ' + JSON.stringify(r16a));
  ms.skip(480);
  const r16b = ms.resNow();
  if (Math.abs(r16b.leech - 0.5) > 0.001 || Math.abs(r16b.freeze - 0.4) > 0.001) throw new Error('8 分钟抗性应封顶: ' + JSON.stringify(r16b));
  ms.skip(600);
  const r16c = ms.resNow();
  if (r16c.leech !== 0.5 || r16c.freeze !== 0.4) throw new Error('抗性不应超过上限: ' + JSON.stringify(r16c));
  const frzCfg = ms.wpnCfg('frost').frz;
  if (frzCfg[0] !== 75 || frzCfg[4] !== 105) throw new Error('冰冻前期补强未生效: ' + JSON.stringify(frzCfg));
  ms.clearEnemies();
  while (ms.state().gameState === 'levelup') ms.pick(0);
  const p16 = ms.p();
  p16.weapons = []; p16.xpNeed = 1e18; p16.inv = 9999; // 防打死怪升级/受伤干扰回血窗口测试
  frames(70); // 清空回血窗口
  p16.hp = 1; p16.maxHp = 1000; // 每秒上限 = max(8, 2%×1000) = 20
  const h1 = ms.healLeech(50); // 抗性 50% 后 25 点 → 被每秒 20 点上限截断
  const h2 = ms.healLeech(50); // 同秒内窗口已满
  if (h1 !== 20) throw new Error('吸血每秒上限（百分比档）失效: h1=' + h1);
  if (h2 !== 0) throw new Error('每秒回血上限未生效: h2=' + h2);
  p16.hp = 300; p16.maxHp = 300; p16.inv = 9999; // 防测试期间死亡，等待回血窗口过期
  frames(70);
  p16.hp = 1; p16.maxHp = 300; // 每秒上限 = max(8, 6) = 8
  const h3 = ms.healLeech(50);
  if (h3 !== 8) throw new Error('吸血每秒上限（保底档）失效: h3=' + h3);
  console.log('✓ P0 敌方抗性（吸血 -' + Math.round(r16b.leech * 100) + '% / 冰冻 -' + Math.round(r16b.freeze * 100) + '%）与吸血上限（1000血→20/s，300血→8/s）');
  ms.endRun();
  frames(5);
  if (ms.state().gameState !== 'over') throw new Error('主动结束未进入结算: ' + ms.state().gameState);
  if (document.getElementById('startOverlay').classList.contains('hide')) throw new Error('主动结束后开始页未显示');
  if (document.getElementById('startLogo').textContent.indexOf('本局已结束') < 0) throw new Error('主动结束标题未生效: ' + document.getElementById('startLogo').textContent);
  console.log('✓ P0 主动结束本局（结算页标题正确）');

  // 17. P1 批次1：精研 / 特性 / 武器页改版
  global.showSelect(); window._selChar('marisa'); global.confirmSelect();
  frames(30);
  const p17 = ms.p();
  p17.xpNeed = 1e18;
  p17.weapons = [{ id:'star', lv:5, t:1, ang:0 }];
  const resCard = ms.pool().filter(function(c) { return c.type === 'res' && c.id === 'star'; })[0];
  if (!resCard) throw new Error('Lv5 后卡池未出现精研卡');
  const d17a = ms.wpnDmg('star');
  ms.apply({ type:'res', id:'star' });
  const d17b = ms.wpnDmg('star');
  ms.apply({ type:'res', id:'star' });
  const d17c = ms.wpnDmg('star');
  if (!(d17b > d17a && Math.abs(d17b / d17a - 1.06) < 0.001)) throw new Error('精研 +6% 未生效: ' + d17a + ' → ' + d17b);
  if (!(d17c > d17b)) throw new Error('精研叠加异常: ' + d17b + ' → ' + d17c);
  ms.addWeapon('needle', 1);
  ms.bumpTrait('needle', 10);
  if (ms.traitText('needle').indexOf('+2 攻') < 0) throw new Error('封魔特性未生效: ' + ms.traitText('needle'));
  ms.bumpTrait('star', 40);
  if (ms.traitText('star').indexOf('+2 发') < 0) throw new Error('星印特性未生效: ' + ms.traitText('star'));
  ms.pauseToggle();
  ms.renderPause('wpn');
  const wHtml = document.getElementById('pauseStats').innerHTML;
  if (wHtml.indexOf('我的武器') < 0) throw new Error('武器页未改版');
  if (wHtml.indexOf('未获得') >= 0) throw new Error('武器页不应显示未获得武器');
  if (wHtml.indexOf('精研×2') < 0) throw new Error('武器页未显示精研层数');
  if (wHtml.indexOf('特性·封魔') < 0 || wHtml.indexOf('特性·星印') < 0) throw new Error('武器页未显示特性');
  if (wHtml.indexOf('超进化') < 0) throw new Error('武器页未显示进化进度');
  ms.pauseToggle();
  console.log('✓ P1 精研（×2 层 +12%）+ 特性（封魔/星印）+ 武器页改版');

  // 18. P1 批次2：灵系新武器（八云橙 / 灵符+夢想封印 / 白魂蝶+八分咲 / 天狗团扇）
  global.showSelect(); window._selChar('marisa'); global.confirmSelect();
  frames(30);
  const p18 = ms.p();
  p18.hp = 1e6; p18.maxHp = 1e6; p18.xpNeed = 1e18; p18.passives.haste = 5;
  p18.weapons = [
    { id:'chen', lv:5, t:1, ang:0 }, { id:'ofuda', lv:5, t:1, ang:0 },
    { id:'soulfly', lv:5, t:1, ang:0 }, { id:'fan', lv:5, t:1, ang:0 }
  ];
  for (let k = 0; k < 10; k++) ms.spawn('fairy');
  frames(400, '灵系新武器满级 400 帧');
  ['chen','ofuda','soulfly','fan'].forEach(function(id) { ms.apply({ type:'evo', id }); });
  const flags18 = { chen:false, orb:false, pet:false };
  for (let t = 0; t < 40; t++) {
    for (let k = 0; k < 5; k++) ms.spawn('fairy');
    frames(30);
    if (p18.buffDmgT > 0 || p18.buffMoveT > 0) flags18.chen = true;
    const fx18 = ms.fxState();
    if (fx18.orbs > 0) flags18.orb = true;
    if (fx18.pets > 0) flags18.pet = true;
    if (flags18.chen && flags18.orb && flags18.pet) break;
  }
  if (!flags18.chen) throw new Error('八云橙增益未触发');
  if (!flags18.orb) throw new Error('夢想封印光团未生成');
  if (!flags18.pet) throw new Error('白魂蝶召唤未生成');
  for (let k = 0; k < 10; k++) ms.spawn('fairy');
  frames(700, '灵系新武器超进化 700 帧');
  if (!p18.weapons.every(function(w) { return w.evoed; })) throw new Error('灵系新武器超进化失败');
  console.log('✓ P1 批次2 灵系新武器（橙/灵符/白魂蝶/团扇 + 超进化）');

  // 19. P1 批次3：魔系新武器（宫古芳香 / 银色飞刀+银刃八重 / 核反应堆+人工太阳 / 死神镰刀）
  global.showSelect(); window._selChar('marisa'); global.confirmSelect();
  frames(30);
  const p19 = ms.p();
  p19.hp = 1e6; p19.maxHp = 1e6; p19.xpNeed = 1e18; p19.passives.haste = 5;
  p19.weapons = [
    { id:'yoshika', lv:5, t:1, ang:0 }, { id:'knife', lv:5, t:1, ang:0 },
    { id:'nuke', lv:5, t:1, ang:0 }, { id:'reaper', lv:5, t:1, ang:0 }
  ];
  const nkCfg = ms.wpnCfg('nuke');
  if (nkCfg.br[0] !== 50 || nkCfg.zr[0] !== 50 || nkCfg.zr[4] !== 130) throw new Error('核反应堆半径配置异常: ' + JSON.stringify({ br: nkCfg.br, zr: nkCfg.zr }));
  let sawKnifeBullet = false;
  for (let t = 0; t < 30 && !sawKnifeBullet; t++) {
    for (let k = 0; k < 5; k++) ms.spawn('fairy');
    frames(20);
    if (ms.fxState().knifeBullets > 0) sawKnifeBullet = true;
  }
  if (!sawKnifeBullet) throw new Error('银色飞刀普通版未发射刀弹');
  ['yoshika','knife','nuke','reaper'].forEach(function(id) { ms.apply({ type:'evo', id }); });
  const flags19 = { ready:false, stab:false, zone:false };
  for (let t = 0; t < 120; t++) {
    for (let k = 0; k < 4; k++) ms.spawn('fairy');
    frames(6);
    const fx19 = ms.fxState();
    if (fx19.knifeOrbs > 0) flags19.ready = true;
    if (fx19.knifeStabs > 0) flags19.stab = true;
    if (fx19.zones > 0) flags19.zone = true;
    if (flags19.ready && flags19.stab && flags19.zone) break;
  }
  if (!flags19.ready) throw new Error('银刃八重未进入 ready 阶段');
  if (!flags19.stab) throw new Error('银刃八重未进入穿刺阶段');
  if (!flags19.zone) throw new Error('核污染区未生成');
  const zr19 = ms.fxState().zoneR;
  if (zr19 && zr19 !== 130) throw new Error('超进化污染区半径应为 130，实际 ' + zr19);
  for (let k = 0; k < 10; k++) ms.spawn('fairy');
  frames(700, '魔系新武器超进化 700 帧');
  if (!p19.weapons.every(function(w) { return w.evoed; })) throw new Error('魔系新武器超进化失败');
  console.log('✓ P1 批次3 魔系新武器（芳香/飞刀环敌穿刺/核半径成长/死神镰刀 + 超进化）');

  console.log('\n═══ 全部冒烟测试通过 ═══');
  process.exit(0);
})().catch(e => { console.error('\n✗ 测试失败:', e.message, '\n', (e.stack || '').split('\n').slice(0, 5).join('\n')); process.exit(1); });
