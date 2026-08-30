// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 僚机系统 (options.js)
//  击破 Boss 后三选一, 最多携带 2 台; 功能型 4 种 + 火力型 4 种
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.options = (function() {
  var MAX = 2;              // 携带上限(想改 4 只需改这里)
  var DEFS = {
    furnace:  { name: '小型八卦炉', icon: '🔥', kind: '功能', color: '#ff9db8',
                desc: '每 90 秒生成一条命' },
    icefairy: { name: '寒冰妖精',   icon: '❄', kind: '功能', color: '#7cc4ff',
                desc: '每 1.5s 发射跟踪冰弹: 冻结小怪 / 减速 Boss' },
    collector:{ name: '星屑采集器', icon: '🧲', kind: '功能', color: '#f0c060',
                desc: '自动吸附全场 P 点' },
    aegis:    { name: '八卦护盾',   icon: '🛡', kind: '功能', color: '#b89fff',
                desc: '每 30s 生成持续 5s 的护盾' },
    cannon:   { name: '迷你魔炮',   icon: '🔆', kind: '火力', color: '#ffd166',
                desc: '每 0.6s 发射高伤害追踪导弹' },
    starring: { name: '星环炮',     icon: '⭐', kind: '火力', color: '#ffe8b0',
                desc: '环绕玩家的星星持续撞击敌人' },
    pierce:   { name: '贯穿魔炮',   icon: '➡', kind: '火力', color: '#e0d8ec',
                desc: '全部子弹可穿透一名敌人' },
    burst:    { name: '星爆炮',     icon: '💥', kind: '火力', color: '#ff6b6b',
                desc: '子弹命中后产生小范围溅射' }
  };

  var owned = [];
  var timers = {};
  var ringA = 0;   // 星环炮公转角

  function count() { return owned.length; }
  function max() { return MAX; }
  function has(id) { return owned.indexOf(id) >= 0; }
  function ownedList() { return owned.slice(); }
  function add(id) {
    if (owned.length >= MAX || has(id)) return false;
    owned.push(id);
    timers[id] = 0;
    return true;
  }
  function reset() { owned = []; timers = {}; ringA = 0; }
  // 三选一: 从未持有僚机中抽取
  function rollOffers() {
    var pool = [];
    for (var id in DEFS) if (!has(id)) pool.push(id);
    var out = [];
    while (out.length < 3 && pool.length > 0) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }

  // 僚机位置: 交替挂在自机两侧
  function slotPos(i, px, py) {
    return { x: px + (i === 0 ? -30 : 30), y: py - 4 };
  }
  function starPos(px, py) {
    return { x: px + Math.cos(ringA) * 40, y: py + Math.sin(ringA) * 40 };
  }

  function update(dt, px, py, api) {
    ringA += dt * 2.6;
    for (var i = 0; i < owned.length; i++) {
      var id = owned[i];
      timers[id] = (timers[id] || 0) + dt;
      var pos = slotPos(i, px, py);
      switch (id) {
        case 'furnace':
          if (timers[id] >= 90) { timers[id] = 0; api.heal(); }
          break;
        case 'icefairy':
          if (timers[id] >= 1.5) { timers[id] = 0; api.iceShot(pos.x, pos.y); }
          break;
        case 'collector':
          api.magnet();
          break;
        case 'aegis':
          if (timers[id] >= 30) { timers[id] = 0; api.shield(); }
          break;
        case 'cannon':
          if (timers[id] >= 0.6) { timers[id] = 0; api.missile(pos.x, pos.y); }
          break;
        case 'starring':
          api.starRing(starPos(px, py), dt);
          break;
        // pierce / burst: 被动, main 射击时读取 has()
      }
    }
  }

  function draw(ctx, px, py, time) {
    for (var i = 0; i < owned.length; i++) {
      var d = DEFS[owned[i]];
      var pos = slotPos(i, px, py);
      var x = pos.x, y = pos.y - Math.sin(time * 3 + i * 2) * 2;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff6e0';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.icon, x, y + 3);
    }
    // 星环炮: 环绕的星星
    if (has('starring')) {
      var s = starPos(px, py);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ffe8b0';
      ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ringA * 2);
      ctx.fillStyle = '#fff6e0';
      ctx.beginPath();
      for (var k = 0; k < 8; k++) {
        var an = (Math.PI * 2 * k) / 8;
        var rr = k % 2 === 0 ? 6 : 2.6;
        if (k === 0) ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
        else ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  return {
    DEFS: DEFS,
    count: count, max: max, has: has, ownedList: ownedList,
    add: add, reset: reset, rollOffers: rollOffers,
    update: update, draw: draw, starPos: starPos
  };
})();
