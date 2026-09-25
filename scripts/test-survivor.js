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
  set src(v) { setImmediate(() => this.onload && this.onload()); }
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
  if (!ps.innerHTML || ps.innerHTML.indexOf('武器矩阵') < 0) throw new Error('暂停面板未渲染武器矩阵');
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
  if (ms.wpnList().length !== 12) throw new Error('wpnList 应为 12 把武器，实际 ' + ms.wpnList().length);
  if (ms.pasList().length !== 10) throw new Error('pasList 应为 10，实际 ' + ms.pasList().length);
  if (ms.relicList().length !== 18) throw new Error('relicList 应为 18，实际 ' + ms.relicList().length);
  if (ms.typeList().length !== 6) throw new Error('typeList 应为 6，实际 ' + ms.typeList().length);
  ms.addWeapon('hisou', 5); ms.evoWeapon('hisou');
  ms.setAttr('rei', 5); ms.setType('melee', 3); ms.addPassive('atk', 1);
  ms.addRelic('core'); ms.god(true);
  frames(180, '调试钩子操作后 180 帧无异常');
  if (!ms.godState()) throw new Error('god 未生效');
  ms.god(false); ms.heal(); ms.magnetAll(); ms.clearEnemies();
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
  frames(360, '楼观超进化连锁 360 帧');
  if (ms.roukanChain() < 2) throw new Error('楼观未跨目标连斩，chainTotal=' + ms.roukanChain() + ' ' + JSON.stringify(ms.roukanState()));
  console.log('✓ 楼观跨目标连斩 (targets=' + ms.roukanChain() + ')');

  console.log('\n═══ 全部冒烟测试通过 ═══');
  process.exit(0);
})().catch(e => { console.error('\n✗ 测试失败:', e.message, '\n', (e.stack || '').split('\n').slice(0, 5).join('\n')); process.exit(1); });
