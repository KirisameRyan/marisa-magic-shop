// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 自机 (player.js)
//  魔理沙: 8向移动 / Shift低速判定点 / 射击(火力形态由 main 决定)
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.player = (function() {
  var C = STG.CONFIG, F = STG.FRAMES;

  var p = {
    x: 240, y: 560,
    anim: 0,
    face: 'stand',  // stand / left / right
    slow: false,
    invuln: 0,
    bombInvuln: 0,
    shootT: 0,
    touchTarget: null,      // 触屏拖动目标点(角色跟随)
    gun: 'chase',           // chase / spread / cannon
    cState: 'charge',       // 魔炮: charge / beam / cool
    chargeT: 0, beamT: 0, coolT: 0,
    perks: { track_up:0, multi_lock:0, hit_splash:0, shot_num:0, rate_up:0, dmg_up:0,
             fan_up:0, close_up:0, splash_up:0,
             charge_up:0, pulse_up:0, cool_up:0, width_up:0, star_burst:0 },
    mods: { speedMul: 1, hitMul: 1, shield: 0 }
  };

  var sprStand = [], sprLeft = [], sprRight = [], sprShot = [], sprSpell = null;

  function init(assets) {
    var f = F.marisa, sc = C.PLAYER_SPRITE_SCALE;
    for (var i = 0; i < 8; i++) {
      sprStand.push(STG.engine.slice(assets, 'marisa', i * f.fw, f.stand, f.fw, f.fh, sc));
      sprLeft.push(STG.engine.slice(assets, 'marisa', i * f.fw, f.left, f.fw, f.fh, sc));
      sprRight.push(STG.engine.slice(assets, 'marisa', i * f.fw, f.right, f.fw, f.fh, sc));
    }
    var ps = F.pshot;
    for (var j = 0; j < ps.frames; j++) {
      sprShot.push(STG.engine.slice(assets, 'marisa', ps.x + j * ps.fw, ps.y, ps.fw, ps.fh, 1));
    }
    var sp = F.spell;
    sprSpell = STG.engine.slice(assets, 'marisa', sp.x, sp.y, sp.fw, sp.fh, 1);
    reset();
  }

  function reset() {
    p.x = C.W / 2; p.y = 560;
    p.invuln = 1.2;
    p.bombInvuln = 0;
    p.shootT = 0;
    p.face = 'stand';
    p.slow = false;
    p.touchTarget = null;
    p.cState = 'charge'; p.chargeT = 0; p.beamT = 0; p.coolT = 0;
  }
  function setTouchTarget(pt) { p.touchTarget = pt || null; }
  function setGun(gun) { p.gun = gun; p.cState = 'charge'; p.chargeT = 0; }
  function setMods(m) { p.mods = m || { speedMul: 1, hitMul: 1, shield: 0 }; }
  function setPerks(perks) { if (perks) p.perks = perks; }
  function perkLv(k) { return p.perks[k] || 0; }

  function update(dt, input, cb) {
    p.slow = false;
    if (p.touchTarget) {
      // 触屏拖动: 角色以低速平滑跟随触点(目标点在手指上方 90px)
      p.slow = true;
      var spd = C.PLAYER_SLOW * p.mods.speedMul * dt;
      var tdx = p.touchTarget.x - p.x, tdy = p.touchTarget.y - p.y;
      var tdist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tdist <= spd || tdist < 1) { p.x = p.touchTarget.x; p.y = p.touchTarget.y; }
      else { p.x += tdx / tdist * spd; p.y += tdy / tdist * spd; }
      if (tdx < -2) p.face = 'left';
      else if (tdx > 2) p.face = 'right';
    } else {
      var vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      var vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      p.slow = input.slow;
      var spd = (p.slow ? C.PLAYER_SLOW : C.PLAYER_SPEED) * p.mods.speedMul;
      // 魔炮蓄力减速
      if (p.gun === 'cannon' && p.cState === 'charge' && input.shoot) spd *= C.CANNON_CHARGE_SLOW;
      if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
      p.x += vx * spd * dt;
      p.y += vy * spd * dt;
      if (vx < 0) p.face = 'left';
      else if (vx > 0) p.face = 'right';
      else if (vy === 0 && !input.shoot) p.face = 'stand';
    }
    p.x = Math.max(14, Math.min(C.W - 14, p.x));
    p.y = Math.max(20, Math.min(C.RECOVER_Y - 6, p.y));
    p.anim += dt * 12;
    if (p.anim >= 8) p.anim -= 8;

    // ── 射击(按主炮) ──
    if (p.gun === 'cannon') updateCannon(dt, input, cb);
    else {
      var g = STG.GUNS[p.gun];
      var interval = g.interval * (1 - 0.07 * perkLv('rate_up'));
      if (!input.shoot) {
        p.shootT = interval;   // 松开即重置, 防积压
      } else {
        p.shootT += dt;
        if (p.shootT >= interval) {
          p.shootT -= interval;
          cb.shot(p.x, p.y, null);
        }
      }
    }

    if (p.invuln > 0) p.invuln -= dt;
    if (p.bombInvuln > 0) p.bombInvuln -= dt;
  }

  // 魔炮: 蓄力 → 发射(beam) → 冷却 循环
  function updateCannon(dt, input, cb) {
    var chargeDur = C.CANNON_CHARGE * (1 - 0.15 * perkLv('charge_up'));
    var beamDur = C.CANNON_BEAM * (1 + 0.2 * perkLv('pulse_up'));
    var coolDur = C.CANNON_COOL * (1 - 0.3 * perkLv('cool_up'));
    if (!input.shoot) { p.cState = 'charge'; p.chargeT = 0; return; }
    switch (p.cState) {
      case 'charge':
        if (p.chargeT === 0 && cb.charge) cb.charge();   // 蓄力开始音效
        p.chargeT += dt;
        if (p.chargeT >= chargeDur) {
          p.cState = 'beam'; p.beamT = beamDur;
          cb.shot(p.x, p.y, 'beam');
        }
        break;
      case 'beam':
        p.beamT -= dt;
        if (p.beamT <= 0) { p.cState = 'cool'; p.coolT = coolDur; }
        break;
      case 'cool':
        p.coolT -= dt;
        if (p.coolT <= 0) { p.cState = 'charge'; p.chargeT = 0; }
        break;
    }
  }

  // 中弹: 返回 true=真的掉星(护盾/无敌由 main 统一处理)
  function hurt() {
    if (p.invuln > 0 || p.bombInvuln > 0) return false;
    p.invuln = C.INVULN;
    return true;
  }
  // 当前实际判定半径
  function hitR() { return C.PLAYER_HIT_R * p.mods.hitMul; }

  function draw(ctx, assets, blink) {
    if (p.slow) {
      var sf = F.slowfx;
      var fxc = STG.engine.slice(assets, 'slowfx', sf.x, sf.y, sf.fw, sf.fh, 1);
      if (fxc) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(fxc, p.x - 26, p.y - 26, 52, 52);
        ctx.globalAlpha = 1;
      }
    }
    // 魔炮充能进度条(无引导光柱)
    if (p.gun === 'cannon' && p.cState === 'charge') {
      var chargeDur = C.CANNON_CHARGE * (1 - 0.15 * perkLv('charge_up'));
      var prog = Math.min(1, p.chargeT / chargeDur);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(p.x - 22, p.y - 58, 44, 5);
      ctx.fillStyle = prog >= 1 ? '#fff6e0' : '#ffd166';
      ctx.fillRect(p.x - 22, p.y - 58, 44 * prog, 5);
    }
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    var f = Math.floor(p.anim) % 8;
    var spr = p.face === 'left' ? sprLeft[f] : (p.face === 'right' ? sprRight[f] : sprStand[f]);
    if (spr) ctx.drawImage(spr, Math.round(p.x) - 24, Math.round(p.y) - 36);
    ctx.globalAlpha = 1;
    if (p.slow) {
      ctx.fillStyle = '#ff7b7b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, C.PLAYER_HIT_VIS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShot(ctx, x, y, t) {
    // ── 星尘弹(程序化): 拖尾 + 柔光 + 菱形本体 + 亮心 ──
    var tg = null;
    try { tg = ctx.createLinearGradient(x, y - 14, x, y + 10); } catch (e) {}
    if (tg) {
      tg.addColorStop(0, 'rgba(255,209,102,0)');
      tg.addColorStop(1, 'rgba(255,209,102,.4)');
      ctx.fillStyle = tg;
    } else ctx.fillStyle = 'rgba(255,209,102,.4)';
    // 拖尾(上尖到后方的金色渐变)
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y + 10);
    ctx.lineTo(x, y - 14);
    ctx.lineTo(x + 3.5, y + 10);
    ctx.closePath();
    ctx.fill();
    // 柔光
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(x, y - 5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 菱形本体(脉动)
    var s = 1 + 0.06 * Math.sin(t * 30);
    var w = 6.5 * s, top = 14 * s, bot = 5 * s;
    var gg = null;
    try { gg = ctx.createLinearGradient(x, y - top, x, y + bot); } catch (e) {}
    if (gg) {
      gg.addColorStop(0, '#fff6e0');
      gg.addColorStop(0.55, '#ffd166');
      gg.addColorStop(1, '#e8a020');
      ctx.fillStyle = gg;
    } else ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(x, y - top);
    ctx.lineTo(x + w, y - bot);
    ctx.lineTo(x, y + bot);
    ctx.lineTo(x - w, y - bot);
    ctx.closePath();
    ctx.fill();
    // 亮心
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(x, y - 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    init: init, reset: reset, setMods: setMods, setGun: setGun, setPerks: setPerks, perkLv: perkLv,
    update: update, draw: draw, drawShot: drawShot,
    hurt: hurt, hitR: hitR, setTouchTarget: setTouchTarget,
    get x() { return p.x; }, get y() { return p.y; },
    get invuln() { return p.invuln; }, get bombInvuln() { return p.bombInvuln; },
    set invuln(v) { p.invuln = v; },
    get slow() { return p.slow; },
    get sprSpell() { return sprSpell; },
    get gun() { return p.gun; },
    get cState() { return p.cState; }
  };
})();
