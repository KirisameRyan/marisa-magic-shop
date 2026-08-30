// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 弹幕系统 (bullets.js)
//  自机弹池 / 敌弹池 / pattern 库(自机狙/扇形/环形/螺旋)
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.bullets = (function() {
  var C = STG.CONFIG;

  // ── 自机弹池 ──
  var pbs = [];
  var PB_MAX = 160;
  function initPools() { for (var i = 0; i < PB_MAX; i++) pbs.push({ on: false }); }
  function firePlayer(x, y) { firePlayerAng(x, y, -Math.PI / 2, 1, false); }
  // opts: { dmg, heavy, track(追踪), turnRate, pierce(穿透剩余), spd(弹速) }
  function firePlayerAng(x, y, ang, dmg, heavy, opts) {
    opts = opts || {};
    for (var i = 0; i < PB_MAX; i++) {
      var b = pbs[i];
      if (!b.on) {
        b.on = true; b.x = x; b.y = y; b.ang = ang; b.t = 0;
        b.dmg = dmg || 1; b.heavy = !!heavy;
        b.track = !!opts.track; b.turnRate = opts.turnRate || 0; b.pierce = opts.pierce || 0;
        b.lockIdx = opts.lockIdx || 0;   // 多目标锁定: 追第 k 近的敌人
        b.ice = !!opts.ice;              // 冰弹: 冻结小怪/减速 Boss
        b.burst = !!opts.burst;          // 星爆: 命中溅射
        b.spd = opts.spd || C.SHOT_SPEED;
        return;
      }
    }
  }
  function bulletDmg(i) { return pbs[i] ? (pbs[i].dmg || 1) : 1; }
  function bulletIce(i) { return !!(pbs[i] && pbs[i].ice); }
  function bulletBurst(i) { return !!(pbs[i] && pbs[i].burst); }
  // 场上自机弹数量(调试/测试)
  function countPlayer() {
    var n = 0;
    for (var i = 0; i < PB_MAX; i++) if (pbs[i].on) n++;
    return n;
  }
  function updatePlayer(dt) {
    for (var i = 0; i < PB_MAX; i++) {
      var b = pbs[i];
      if (!b.on) continue;
      // 追踪: 直行锁敌延迟后转向最近敌人(无小怪时索敌 Boss)
      if (b.track && b.t > C.CHASE_LOCK_DELAY) {
        var tgt = STG.enemies.closestK(b.x, b.y, b.lockIdx || 0);
        if (!tgt && STG.boss.alive()) tgt = { x: STG.boss.x, y: STG.boss.y };
        if (tgt) {
          var want = STG.angleTo(b.x, b.y, tgt.x, tgt.y);
          var diff = want - b.ang;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          var maxTurn = (b.turnRate || 8) * dt;
          b.ang += Math.max(-maxTurn, Math.min(maxTurn, diff));
        }
      }
      b.x += Math.cos(b.ang) * b.spd * dt;
      b.y += Math.sin(b.ang) * b.spd * dt;
      b.t += dt;
      if (b.y < -20 || b.y > C.H + 20 || b.x < -20 || b.x > C.W + 20) b.on = false;
    }
  }
  // 命中消耗(穿透支持)
  function killPlayerBullet(i) {
    var b = pbs[i];
    if (!b) return;
    if (b.pierce > 0) { b.pierce--; return; }
    b.on = false;
  }

  // ── 魔炮激光(beam) ──
  // 光束跟随玩家横向移动, 横扫敌人; 光柱范围 0 → 玩家位置
  var beam = null;          // { x, w, dur, t }
  function fireBeam(x, w, dur) {
    beam = { x: x, w: w, dur: dur, t: 0 };
  }
  function updateBeam(dt, playerX) {
    if (!beam) return;
    beam.x = playerX;       // 跟随角色移动
    beam.t += dt;
    if (beam.t >= beam.dur) beam = null;
  }
  function beamActive() { return !!beam; }
  function beamX() { return beam ? beam.x : 0; }
  function beamW() { return beam ? beam.w : 0; }
  function drawBeam(ctx) {
    if (!beam) return;
    var x = beam.x, w = beam.w;
    var k = Math.min(1, beam.t / 0.15);                 // 发射展开度
    var pulse = 1 + 0.08 * Math.sin(beam.t * 26);       // 宽度脉动
    var w2 = w * k * pulse;
    var top = 0, bot = STG.player.y + 10;
    // 外层柔光(宽渐变)
    var g = null;
    try { g = ctx.createLinearGradient(x - w2 * 1.6, 0, x + w2 * 1.6, 0); } catch (e) {}
    if (g) {
      g.addColorStop(0, 'rgba(255,209,102,0)');
      g.addColorStop(0.2, 'rgba(255,209,102,.4)');
      g.addColorStop(0.5, 'rgba(255,232,176,.55)');
      g.addColorStop(0.8, 'rgba(255,209,102,.4)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g;
    } else ctx.fillStyle = 'rgba(255,209,102,.4)';
    ctx.beginPath();
    ctx.rect(x - w2 * 1.6, top, w2 * 3.2, bot - top);
    ctx.fill();
    // 中层主光柱
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.rect(x - w2 / 2, top, w2, bot - top);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 白芯
    ctx.fillStyle = 'rgba(255,246,224,.95)';
    ctx.beginPath();
    ctx.rect(x - w2 * 0.16, top, w2 * 0.32, bot - top);
    ctx.fill();
    // 顶端命中光斑
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#fff6e0';
    ctx.beginPath(); ctx.arc(x, top + 6, w2 * 0.5 + 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(x, top + 6, w2 * 0.95 + 6, 0, Math.PI * 2); ctx.fill();
    // 炮口辉光
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(x, bot - 14, w2 * 0.42 + 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawPlayer(ctx) {
    for (var i = 0; i < PB_MAX; i++) {
      var b = pbs[i];
      if (!b.on) continue;
      if (b.heavy) {
        // 魔炮: 粗长星弹
        var g = null;
        try { g = ctx.createLinearGradient(b.x, b.y - 26, b.x, b.y + 6); } catch (e) {}
        if (g) {
          g.addColorStop(0, 'rgba(255,224,130,0)');
          g.addColorStop(0.7, '#ffd166');
          g.addColorStop(1, '#fff6e0');
          ctx.fillStyle = g;
        } else ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(b.x - 8, b.y + 6);
        ctx.lineTo(b.x, b.y - 26);
        ctx.lineTo(b.x + 8, b.y + 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(b.x, b.y - 14, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        STG.player.drawShot(ctx, b.x, b.y, b.t);
      }
    }
  }
  // 命中检测: 返回命中的自机弹索引数组
  function hitPlayerBullets(x, y, r) {
    var hit = [];
    for (var i = 0; i < PB_MAX; i++) {
      var b = pbs[i];
      if (!b.on) continue;
      if (STG.dist2(b.x, b.y, x, y) <= (r + 10) * (r + 10)) hit.push(i);
    }
    return hit;
  }
  // ── 敌弹池 ──
  var ebs = [];
  var EB_MAX = 900;
  function initEB() { for (var i = 0; i < EB_MAX; i++) ebs.push({ on: false }); }
  // opts: { x,y,ang,speed,type,rot,spin,dur, hold(编队悬停s, 到时锁定玩家), home(追踪持续s) }
  function fire(x, y, ang, speed, type, opts) {
    opts = opts || {};
    for (var i = 0; i < EB_MAX; i++) {
      var b = ebs[i];
      if (!b.on) {
        b.on = true; b.x = x; b.y = y; b.ang = ang; b.sp = speed; b.type = type || 'b1'; b.t = 0; b.spin = 0;
        b.hold = opts.hold || 0; b.locked = false; b.home = opts.home || 0;
        b.bounce = !!opts.bounce; b.wrap = !!opts.wrap;
        b.life = (b.bounce || b.wrap) ? 12 : 0;   // 反弹/折返弹的存活上限
        b.radial = !!opts.radial; b.rad0 = ang;   // 编队绽放: hold 结束后沿原方向散射
        return;
      }
    }
  }
  function updateEB(dt) {
    for (var i = 0; i < EB_MAX; i++) {
      var b = ebs[i];
      if (!b.on) continue;
      b.t += dt;
      // 编队悬停: 到时锁定方向(默认锁玩家, radial 沿原方向绽放)
      if (b.hold > 0 && !b.locked) {
        if (b.t >= b.hold) {
          b.locked = true;
          if (b.radial) b.ang = b.rad0;
          else b.ang = STG.angleTo(b.x, b.y, STG.player.x, STG.player.y);
          b.t = 0;
        } else continue;   // 悬停中: 不移动不出界
      }
      // 反弹/折返弹: 存活上限
      if (b.life > 0) {
        b.life -= dt;
        if (b.life <= 0) { b.on = false; continue; }
      }
      // 追踪弹: 缓速转向玩家
      if (b.home > 0 && b.t < b.home) {
        var want = STG.angleTo(b.x, b.y, STG.player.x, STG.player.y);
        var diff = want - b.ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var mt = 2.0 * dt;
        b.ang += Math.max(-mt, Math.min(mt, diff));
      }
      b.x += Math.cos(b.ang) * b.sp * dt;
      b.y += Math.sin(b.ang) * b.sp * dt;
      if (b.bounce) {
        // 边界反弹(境界之牢)
        if ((b.x < 8 && Math.cos(b.ang) < 0) || (b.x > C.W - 8 && Math.cos(b.ang) > 0)) {
          b.ang = Math.PI - b.ang;
          b.x = Math.max(8, Math.min(C.W - 8, b.x));
        }
        if ((b.y < 8 && Math.sin(b.ang) < 0) || (b.y > C.H - 8 && Math.sin(b.ang) > 0)) {
          b.ang = -b.ang;
          b.y = Math.max(8, Math.min(C.H - 8, b.y));
        }
      } else if (b.wrap) {
        // 折返: 消失在边界后从对面返回(逆死之蝶)
        if (b.x < -30) b.x = C.W + 28; else if (b.x > C.W + 30) b.x = -28;
        if (b.y < -30) b.y = C.H + 28; else if (b.y > C.H + 30) b.y = -28;
      } else if (b.x < -30 || b.x > C.W + 30 || b.y < -30 || b.y > C.H + 30) {
        b.on = false;
      }
    }
  }
  function drawEB(ctx, assets) {
    for (var i = 0; i < EB_MAX; i++) {
      var b = ebs[i];
      if (!b.on) continue;
      var cfg = STG.EBULLET[b.type] || STG.EBULLET.b1;
      var r = cfg.r;
      var col = cfg.color;
      var pulse = (b.hold > 0 && !b.locked) ? 1 + 0.28 * Math.sin(STG.engine.time * 9 + b.x * 0.13) : 1;
      // 发光
      ctx.globalAlpha = cfg.glow;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(b.x, b.y, (r + 2.5) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 本体
      ctx.fillStyle = col;
      if (cfg.shape === 'dia') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      } else if (cfg.shape === 'star') {
        // 四角星: 两个旋转正方形
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      } else if (cfg.shape === 'big') {
        // 大玉: 多层光环 + 主球 + 白描边 + 高光
        ctx.globalAlpha = 0.26;
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.75, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.28, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, r - 1, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.arc(b.x - r * 0.32, b.y - r * 0.32, r * 0.28, 0, Math.PI * 2); ctx.fill();
      } else {
        // 圆弹: 主圆 + 亮心
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawLasers(ctx);
  }
  // 玩家判定 vs 敌弹: 返回是否中弹(自动消掉该弹; 激光命中不消弹)
  function hitPlayer(px, py, r) {
    if (laserHit(px, py, r)) return true;
    for (var i = 0; i < EB_MAX; i++) {
      var b = ebs[i];
      if (!b.on) continue;
      var cfg = STG.EBULLET[b.type] || STG.EBULLET.b1;
      if (STG.dist2(b.x, b.y, px, py) <= (r + cfg.r) * (r + cfg.r)) {
        b.on = false;
        return true;
      }
    }
    return false;
  }
  // 擦弹判定: 贴近但未命中 → graze
  function grazeCheck(px, py, r, extra) {
    for (var i = 0; i < EB_MAX; i++) {
      var b = ebs[i];
      if (!b.on) continue;
      var cfg = STG.EBULLET[b.type] || STG.EBULLET.b1;
      var rr = r + cfg.r + (extra || 6);
      if (STG.dist2(b.x, b.y, px, py) <= rr * rr) return true;
    }
    return false;
  }
  // 符卡: 全屏清弹
  function clearAll() { for (var i = 0; i < EB_MAX; i++) ebs[i].on = false; lasers.length = 0; }

  // ── 敌方激光(预警细线闪烁 → 展开光束; 支持旋转/漂移/限长/自定义色) ──
  var lasers = [];
  // opts: { w, warn, dur, len(光束长), spin(旋转 rad/s), vx, vy(漂移), color }
  function fireLaser(x, y, ang, opts) {
    opts = opts || {};
    lasers.push({
      x: x, y: y, ang: ang, w: opts.w || 12, warn: opts.warn || 0.9, dur: opts.dur || 1.6, t: 0,
      len: opts.len || 760, spin: opts.spin || 0, vx: opts.vx || 0, vy: opts.vy || 0,
      color: opts.color || '#ff9db8'
    });
  }
  function updateLasers(dt) {
    for (var i = lasers.length - 1; i >= 0; i--) {
      var l = lasers[i];
      l.t += dt;
      l.ang += l.spin * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (l.t >= l.warn + l.dur) lasers.splice(i, 1);
    }
  }
  // 激光命中: 点到射线距离(仅发射阶段)
  function laserHit(px, py, r) {
    for (var i = 0; i < lasers.length; i++) {
      var l = lasers[i];
      if (l.t < l.warn) continue;
      var dx = px - l.x, dy = py - l.y;
      var ca = Math.cos(l.ang), sa = Math.sin(l.ang);
      if (dx * ca + dy * sa < 0) continue;
      if (Math.abs(-sa * dx + ca * dy) <= r + l.w / 2) return true;
    }
    return false;
  }
  function drawLasers(ctx) {
    for (var i = 0; i < lasers.length; i++) {
      var l = lasers[i];
      var len = l.len || 760;
      var col = l.color || '#ff9db8';
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.ang);
      if (l.t < l.warn) {
        // 预警: 细线闪烁
        var blink = Math.floor(l.t * 16) % 2 === 0;
        ctx.globalAlpha = blink ? 0.55 : 0.22;
        ctx.fillStyle = col;
        ctx.fillRect(0, -1, len, 2);
      } else {
        var k = Math.min(1, (l.t - l.warn) / 0.12);          // 展开
        var fade = Math.min(1, (l.warn + l.dur - l.t) / 0.2); // 收束渐隐
        var w = l.w * k;
        ctx.globalAlpha = 0.32 * fade;
        ctx.fillStyle = col;
        ctx.fillRect(0, -w * 1.6, len, w * 3.2);
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillRect(0, -w / 2, len, w);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#fff6e0';
        ctx.fillRect(0, -w * 0.18, len, w * 0.36);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  // 敌弹坐标列表(供符卡转化星屑用)
  function ebPositions() {
    var out = [];
    for (var i = 0; i < EB_MAX; i++) if (ebs[i].on) out.push({ x: ebs[i].x, y: ebs[i].y });
    return out;
  }
  function count() { var n = 0; for (var i = 0; i < EB_MAX; i++) if (ebs[i].on) n++; return n; }

  // ═══ pattern 库(供敌人/Boss调用) ═══
  // 自机狙: 朝玩家打 n 发(可带偏移角)
  function pAimed(x, y, px, py, speed, offset, type, spread) {
    var base = STG.angleTo(x, y, px, py) + (offset || 0);
    var n = spread || 1;
    for (var i = 0; i < n; i++) {
      var d = (i - (n - 1) / 2) * 0.12;
      fire(x, y, base + d, speed, type);
    }
  }
  // 扇形: 朝角度 base 展开 n 发, 总角宽 span
  function pFan(x, y, base, n, span, speed, type) {
    for (var i = 0; i < n; i++) {
      var a = base - span / 2 + (span * i) / Math.max(1, n - 1);
      fire(x, y, a, speed, type);
    }
  }
  // 环形: 一圈 n 发(可带 opts: bounce/wrap/hold/radial/home)
  function pRing(x, y, n, speed, type, rot, opts) {
    for (var i = 0; i < n; i++) {
      fire(x, y, rot + (Math.PI * 2 * i) / n, speed, type, opts);
    }
  }
  // 螺旋: 单发, 由调用方维护旋转角
  function pSpiral(x, y, rot, speed, type, opts) { fire(x, y, rot, speed, type, opts); }

  return {
    initPools: initPools, initEB: initEB,
    firePlayer: firePlayer, firePlayerAng: firePlayerAng, updatePlayer: updatePlayer, drawPlayer: drawPlayer,
    hitPlayerBullets: hitPlayerBullets, killPlayerBullet: killPlayerBullet, bulletDmg: bulletDmg,
    bulletIce: bulletIce, bulletBurst: bulletBurst, countPlayer: countPlayer,
    fire: fire, updateEB: updateEB, drawEB: drawEB,
    fireLaser: fireLaser, updateLasers: updateLasers,
    hitPlayer: hitPlayer, grazeCheck: grazeCheck,
    clearAll: clearAll, ebPositions: ebPositions, count: count,
    fireBeam: fireBeam, updateBeam: updateBeam, beamActive: beamActive,
    beamX: beamX, beamW: beamW, drawBeam: drawBeam,
    pAimed: pAimed, pFan: pFan, pRing: pRing, pSpiral: pSpiral
  };
})();
