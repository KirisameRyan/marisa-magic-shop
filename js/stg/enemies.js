// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 敌人与波次 (enemies.js)
//  杂鱼(直线/蛇形/绕圈/之字/悬停/俯冲) + 精英 + 组合刷新 + 掉落
//  血量/弹速随 Stage+波次 递增
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.enemies = (function() {
  var C = STG.CONFIG, F = STG.FRAMES;

  var enemies = [];
  var ET = {
    mook:    { hp: 100,  r: 14, score: 1000,  drop: 2, exp: 1 },
    snake:   { hp: 150,  r: 14, score: 1500,  drop: 3, exp: 1 },
    circler: { hp: 250,  r: 15, score: 2500,  drop: 4, exp: 2 },
    zigzag:  { hp: 140,  r: 13, score: 1300,  drop: 3, exp: 1 },
    hover:   { hp: 320,  r: 16, score: 3000,  drop: 5, exp: 2 },
    diver:   { hp: 120,  r: 12, score: 1200,  drop: 2, exp: 1 },
    elite:   { hp: 900,  r: 20, score: 10000, drop: 12, exp: 5 },
    midboss: { hp: 3000, r: 26, score: 30000, drop: 20, exp: 8 }
  };

  // mul: 难度血量系数(Stage+波次); 出场纵深随机抖动, 不再全部整齐排在 -30
  function spawn(type, x, y, mul) {
    var t = ET[type];
    var hp = Math.round(t.hp * (mul || 1));
    if (y < -20) y -= STG.rnd(0, 55);
    var e = {
      type: type, hp: hp, maxHp: hp, r: t.r,
      x: x, y: y, t: 0, anim: 0,
      state: 'enter', fireT: 1.5 + Math.random() * 2,
      sx: 0, cx: 0, cy: 0, ang: 0, spin: Math.random() * Math.PI * 2,
      dir: Math.random() < 0.5 ? -1 : 1,
      hoverT: 0,
      frozenT: 0,
      dead: false
    };
    enemies.push(e);
    return e;
  }

  // ═══ 波次模板库(基础 + 组合刷新) ═══
  function template(id, n, stage) {
    var esc = Math.min(6, Math.floor(n / 3) + (stage - 1) * 2);
    var mookN = 4 + esc;
    var mul = hpMulNow(n, stage);
    switch (id) {
      case 'flank':
        spawnFlank(mookN, 'mook', mul);
        break;
      case 'row':
        spawnRow(mookN + 2, STG.rnd() < 0.4 ? 'snake' : 'mook', mul);
        break;
      case 'snake':
        spawnSnakePair(2 + esc, mul);
        break;
      case 'center':
        spawnCenter(mul);
        if (n > 8) spawn('mook', STG.rnd(70, C.W - 70), -30, mul);
        break;
      case 'flankRow':
        spawnFlank(3, 'mook', mul);
        spawnRow(mookN - 1, 'mook', mul);
        break;
      case 'snakeFlank':
        spawnSnakePair(2, mul);
        spawnFlank(3, 'mook', mul);
        break;
      case 'dualSnake':
        spawn('snake', C.W * 0.28, -30, mul);
        spawn('snake', C.W * 0.72, -30, mul);
        spawn('snake', C.W * 0.28, -70, mul);
        spawn('snake', C.W * 0.72, -70, mul);
        break;
      case 'ringCross':
        spawn('circler', C.W * 0.3, -40, mul);
        spawn('circler', C.W * 0.7, -80, mul);
        break;
      case 'vform':
        for (var v = 0; v < 4; v++) {
          spawn('mook', C.W / 2 - (v + 1) * 70, -30 - v * 36, mul);
          spawn('mook', C.W / 2 + (v + 1) * 70, -30 - v * 36, mul);
        }
        break;
      case 'centerRow':
        spawnCenter(mul);
        spawnRow(3, 'mook', mul);
        break;
      case 'hoverLine':
        for (var h2 = 0; h2 < 4; h2++) {
          spawn('hover', C.W * (h2 + 0.5) / 4, -40 - h2 * 30, mul);
        }
        break;
      case 'diveSquad':
        for (var d2 = 0; d2 < 5; d2++) {
          spawn('diver', C.W * (d2 + 0.5) / 5, -30 - d2 * 26, mul);
        }
        break;
      case 'zigzagRow':
        for (var z2 = 0; z2 < 5; z2++) {
          spawn('zigzag', C.W * (z2 + 0.5) / 5, -30 - z2 * 30, mul);
        }
        break;
      case 'elite':
        spawnElite(n, stage, mul);
        spawnFlank(4, 'mook', mul);
        spawn('snake', C.W * 0.5, -60, mul);
        break;
      default:
        spawnFlank(3, 'mook', mul);
    }
  }
  function hpMulNow(wave, stage) { return STG.hpMul(stage || 1, wave || 1); }

  // 小怪波: 随机模板(不连续重复), Stage 越高越倾向新花样
  var lastTpl = '';
  function spawnMookWave(n, stage) {
    var pool = STG.WAVE_TEMPLATES.slice();
    if (stage >= 2) pool = pool.concat(['hoverLine', 'diveSquad', 'zigzagRow']);
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === lastTpl) {
      pool = pool.filter(function(t) { return t !== lastTpl; });
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    lastTpl = pick;
    template(pick, n, stage);
  }
  // 精英波
  function spawnEliteWave(n, stage) {
    template('elite', n, stage);
  }

  // ═══ 基础 spawn 系列 ═══
  function spawnFlank(n, type, mul) {
    for (var i = 0; i < n; i++) {
      var left = i % 2 === 0;
      var x = left ? STG.rnd(55, 120) : STG.rnd(C.W - 120, C.W - 55);
      spawn(type || 'mook', x, -30 - Math.floor(i / 2) * 46, mul || 1);
    }
  }
  function spawnRow(n, type, mul) {
    for (var i = 0; i < n; i++) {
      spawn(type || 'mook', C.W * (i + 1) / (n + 1), -30 - i * 34, mul || 1);
    }
  }
  function spawnSnakePair(n, mul) {
    for (var i = 0; i < n; i++) {
      spawn('snake', C.W * (i + 1) / (n + 1), -30 - i * 40, mul || 1);
    }
  }
  function spawnCenter(mul) { spawn('circler', C.W / 2, -40, mul || 1); }
  function spawnElite(wave, stage, mul) { spawn('elite', STG.rnd(120, C.W - 120), -40, mul || hpMulNow(wave, stage)); }
  function spawnMidBoss(stage) { spawn('midboss', C.W / 2, -60, STG.hpMul(1, 1) * (1 + 0.35 * ((stage || 1) - 1))); }

  var curWave = 1, curStage = 1;   // 当前波次/关卡(供移速与弹幕成长用)

  function update(dt, stage, wave, power, cb) {
    curWave = wave || 1; curStage = stage || 1;
    var eb = STG.bullets;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }
      if (e.evac && e.y < -60) { e.dead = true; continue; }
      e.t += dt; e.anim += dt * 12;
      // 冰冻: 停止移动与开火
      if (e.frozenT > 0) {
        e.frozenT -= dt;
      } else {
        moveEnemy(e, dt);
      }
      e.x = Math.max(20, Math.min(C.W - 20, e.x));
      if (e.y > C.H + 60) { e.dead = true; continue; }

      // 入场瞬间弹幕(波次≥5 或 Stage≥2): 小型敌机报到先打一轮三向自机狙
      if (e.justEnter) {
        e.justEnter = false;
        if (!e.evac && (curWave >= 5 || curStage >= 2) &&
            (e.type === 'mook' || e.type === 'snake' || e.type === 'zigzag' || e.type === 'diver')) {
          eb.pAimed(e.x, e.y, STG.player.x, STG.player.y,
            (150 + curWave * 12) * STG.spMul(curStage) * 0.85, 0, 'b4', 3);
        }
      }

      if (e.state === 'fight' && !e.evac && e.frozenT <= 0) {
        e.fireT -= dt;
        if (e.fireT <= 0) { e.fireT = fireInterval(e.type, wave); doFire(e, wave, stage); }
      }

      var hits = eb.hitPlayerBullets(e.x, e.y, e.r);
      for (var h = 0; h < hits.length; h++) {
        var dmg = C.SHOT_DAMAGE * STG.totalDmgMul(power) * eb.bulletDmg(hits[h]);
        // 星散贴脸强化(150px 内)
        if (STG.player.gun === 'spread' && STG.player.perkLv('close_up') > 0 &&
            STG.dist2(e.x, e.y, STG.player.x, STG.player.y) < 150 * 150) {
          dmg *= 1 + 0.2 * STG.player.perkLv('close_up');
        }
        e.hp -= dmg;
        // 冰弹: 冻结小怪(道中王减半)
        if (eb.bulletIce(hits[h])) e.frozenT = Math.max(e.frozenT, e.type === 'midboss' ? 1 : 2);
        eb.killPlayerBullet(hits[h]);
        // 溅射(星追命中溅射 / 星散溅射爆破 / 星爆炮僚机)
        var splR = 0, splDmg = 0;
        if (STG.player.gun === 'chase' && STG.player.perkLv('hit_splash') > 0) {
          splR = 18 * STG.player.perkLv('hit_splash'); splDmg = dmg * 0.5;
        } else if (STG.player.gun === 'spread' && STG.player.perkLv('splash_up') > 0) {
          splR = 20 * STG.player.perkLv('splash_up'); splDmg = dmg * 0.5;
        } else if (eb.bulletBurst(hits[h])) {
          splR = 30; splDmg = dmg * 0.6;
        }
        if (splR > 0) {
          for (var si = 0; si < enemies.length; si++) {
            var o = enemies[si];
            if (o === e || o.dead) continue;
            if (STG.dist2(o.x, o.y, e.x, e.y) < splR * splR) {
              o.hp -= splDmg;
              if (o.hp <= 0 && !o.dead) killEnemy(o, cb);
            }
          }
        }
        STG.engine.spark(e.x + STG.rnd(-8, 8), e.y + STG.rnd(-8, 8), '#ffe8b0', 3, 160);
      }
      if (e.hp <= 0 && !e.dead) killEnemy(e, cb);
    }
  }

  // ── 移动(相位衔接修复: 进 fight 时用当前位置反推相位) ──
  function moveEnemy(e, dt) {
    if (e.evac) { e.y -= 260 * dt; return; }   // Boss 入场退场: 直线飞离屏幕顶部
    // 成长: 移速随波次 +2.5%/波(封顶+40%), Stage 每级再 +8%
    var sp = (60 + 6) * (1 + Math.min(0.4, 0.025 * (curWave - 1)) + 0.08 * (curStage - 1));
    switch (e.type) {
      case 'mook':
        if (e.state === 'enter') { e.y += sp * dt; if (e.y > 80) { e.state = 'fight'; e.justEnter = true; } }
        else e.y += sp * 0.6 * dt;
        break;
      case 'snake':
        if (e.state === 'enter') { e.y += sp * dt; if (e.y > 100) { e.state = 'fight'; e.justEnter = true; e.sx = Math.asin(clamp01(e.x / 120)); } }
        else { e.sx += dt * 2.2; e.x += Math.sin(e.sx) * 60 * dt; e.y += sp * 0.45 * dt; }
        break;
      case 'circler':
        if (e.state === 'enter') {
          e.y += sp * 0.8 * dt;
          if (e.y > 150) {
            // 相位衔接: 圆心设在正上方70px, 从圆的下缘入轨, 位置零跳变
            e.state = 'fight'; e.cx = e.x; e.cy = e.y - 70;
            e.ang = Math.PI / 2;
          }
        }
        else { e.ang += dt * 1.1; e.x = e.cx + Math.cos(e.ang) * 70; e.y = e.cy + Math.sin(e.ang) * 70; }
        break;
      case 'zigzag':   // 之字折返
        if (e.state === 'enter') { e.y += sp * dt; if (e.y > 90) { e.state = 'fight'; e.justEnter = true; } }
        else {
          e.x += e.dir * 90 * dt;
          if (e.x < 30 || e.x > C.W - 30) e.dir *= -1;
          e.y += sp * 0.35 * dt;
        }
        break;
      case 'hover':    // 悬停炮台: 到位后停住射击, 定时离开
        if (e.state === 'enter') { e.y += sp * dt; if (e.y > 130) { e.state = 'fight'; e.hoverT = 4; } }
        else {
          e.hoverT -= dt;
          if (e.hoverT <= 0) e.y += sp * 0.8 * dt;
        }
        break;
      case 'diver':    // 俯冲: 高速下落, 近玩家区减速
        if (e.state === 'enter') { e.y += sp * 2.2 * dt; if (e.y > 320) { e.state = 'fight'; e.justEnter = true; } }
        else e.y += sp * 0.5 * dt;
        break;
      case 'elite':
        if (e.state === 'enter') { e.y += sp * 0.5 * dt; if (e.y > 160) { e.state = 'fight'; e.sx = Math.asin(clamp01((e.x - C.W / 2) / 130)); } }
        else { e.sx += dt * 1.2; e.x = C.W / 2 + Math.sin(e.sx) * 130; }
        break;
      case 'midboss':
        if (e.state === 'enter') { e.y += sp * 0.4 * dt; if (e.y > 190) { e.state = 'fight'; e.sx = 0; } }
        else { e.sx += dt * 0.9; e.x = C.W / 2 + Math.sin(e.sx) * 140; }
        break;
    }
  }
  function clamp01(v) { return Math.max(-1, Math.min(1, v)); }

  function fireInterval(type, wave) {
    var stBoost = (curStage - 1) * 0.12;   // Stage 越高开火越密
    if (type === 'elite') return Math.max(0.9, 2.2 - wave * 0.05 - stBoost);
    if (type === 'midboss') return Math.max(1.1, 1.6 - stBoost);
    if (type === 'hover') return Math.max(0.5, 0.95 - wave * 0.02 - stBoost * 0.5);
    return Math.max(1.0, 2.6 - wave * 0.08 - stBoost);
  }
  function doFire(e, wave, stage) {
    var eb = STG.bullets;
    var px = STG.player.x, py = STG.player.y;
    var bsp = (150 + wave * 12) * STG.spMul(stage || 1);
    switch (e.type) {
      case 'mook':
        eb.pAimed(e.x, e.y, px, py, bsp, 0, 'b4', curWave >= 8 ? 2 : 1);
        break;
      case 'snake':
        eb.pAimed(e.x, e.y, px, py, bsp, 0, 'b2', curWave >= 6 ? 5 : 3);
        break;
      case 'circler':
        e.spin += 0.4;
        eb.pSpiral(e.x, e.y, e.spin, bsp, 'b3');
        eb.pSpiral(e.x, e.y, e.spin + Math.PI, bsp, 'b3');
        break;
      case 'zigzag':
        eb.pAimed(e.x, e.y, px, py, bsp * 1.1, 0, 'b4', 1);
        break;
      case 'hover':    // 炮台: 扇形(高波次加密)
        eb.pFan(e.x, e.y, Math.PI / 2, curWave >= 8 ? 7 : 5, 1.6, bsp * 0.7, 'b3');
        break;
      case 'diver':    // 俯冲: 高速自机狙
        eb.pAimed(e.x, e.y, px, py, bsp * 1.4, 0, 'b2', 1);
        break;
      case 'elite':
        eb.pRing(e.x, e.y, 10 + wave, bsp * 0.8, 'b1', e.spin);
        eb.pAimed(e.x, e.y, px, py, bsp * 1.3, 0, 'b2', 5);
        break;
      case 'midboss':
        if (Math.floor(e.t * 1.2) % 2 === 0) eb.pRing(e.x, e.y, 14, bsp * 0.7, 'b3', e.spin);
        else eb.pFan(e.x, e.y, STG.angleTo(e.x, e.y, px, py), 7, 2.2, bsp * 1.1, 'b4');
        break;
    }
    if (STG.main.sfx) STG.main.sfx.eshot();   // 敌方开火音效(全局节流)
  }

  function killEnemy(e, cb) {
    e.dead = true;
    var t = ET[e.type];
    var big = e.type === 'elite' || e.type === 'midboss';
    STG.engine.spark(e.x, e.y, '#f472b6', big ? 26 : 14, big ? 360 : 260);
    STG.engine.spark(e.x, e.y, '#ffe8b0', big ? 20 : 10, big ? 300 : 200);
    STG.engine.shake(big ? 5 : 2, 0.2);
    for (var i = 0; i < t.drop; i++) drop('power', e.x + STG.rnd(-14, 14), e.y + STG.rnd(-8, 8));
    drop('score', e.x, e.y);
    if (t.exp > 0) drop('exp', e.x + STG.rnd(-10, 10), e.y + STG.rnd(-6, 6));
    if (cb) cb.kill(e, t);
  }

  // 符卡: 全场敌人掉血
  function damageAll(dmg) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.hp -= dmg;
      if (e.hp <= 0 && !e.dead) killEnemy(e, null);
    }
  }

  // 魔炮激光: 矩形范围伤害(贯穿)
  function damageRect(x0, x1, yMax, dmg) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (e.x > x0 && e.x < x1 && e.y < yMax) {
        e.hp -= dmg;
        STG.engine.spark(e.x + STG.rnd(-6, 6), e.y + STG.rnd(-6, 6), '#ffd166', 2, 120);
        if (e.hp <= 0 && !e.dead) killEnemy(e, null);
      }
    }
  }

  // 魔炮光束(逐帧): 快速递增(0.5s 即满), 脱离从零累计; 光束对小型敌机特攻 ×1.6
  function beamSweep(x0, x1, yMax, dt, base) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (e.x > x0 && e.x < x1 && e.y < yMax) {
        e.beamT = (e.beamT || 0) + dt;
        var mul = 1 + Math.min(1.5, e.beamT * 3.0);   // 封顶 ×2.5
        e.hp -= base * mul * dt * 1.6;
        if (Math.random() < dt * 14) STG.engine.spark(e.x + STG.rnd(-8, 8), e.y + STG.rnd(-8, 8), '#ffd166', 1, 130);
        if (e.hp <= 0 && !e.dead) killEnemy(e, null);
      } else if (e.beamT) {
        e.beamT = 0;
      }
    }
  }

  // Bomb 旋转扫射: 角度路径上的敌人受巨额伤害(扫到即死)
  function sweepHit(px, py, ang, halfW, len, dmg) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var dx = e.x - px, dy = e.y - py;
      var proj = dx * ca + dy * sa;
      if (proj < 0 || proj > len) continue;
      if (Math.abs(-sa * dx + ca * dy) <= halfW + e.r) {
        e.hp -= dmg;
        STG.engine.spark(e.x, e.y, '#ffe8b0', 4, 200);
        if (e.hp <= 0 && !e.dead) killEnemy(e, null);
      }
    }
  }

  // ── 掉落物 ──
  var items = [];
  function drop(kind, x, y) {
    items.push({ kind: kind, x: x, y: y, vy: 70, mag: false, t: 0 });
  }
  function updateItems(dt, px, py, autoRecover, cb, magnetR) {
    magnetR = magnetR || 90;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.t += dt;
      var dx = px - it.x, dy = py - it.y;
      var d2 = dx * dx + dy * dy;
      if (autoRecover || d2 < magnetR * magnetR || it.mag) { it.mag = true; it.x += dx * 10 * dt; it.y += dy * 10 * dt; }
      else it.y += it.vy * dt;
      if (d2 < 26 * 26) { items.splice(i, 1); if (cb) cb.pick(it); continue; }
      if (it.y > C.RECOVER_Y) { items.splice(i, 1); if (cb) cb.recover(it); continue; }
      if (it.y > C.H + 20) items.splice(i, 1);
    }
  }
  function drawItems(ctx, assets) {
    var f = F.item;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var bob = Math.sin(it.t * 5) * 1.5;
      if (it.kind === 'exp') {
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(it.t * 8);
        ctx.fillStyle = '#ffe8b0';
        ctx.beginPath();
        ctx.arc(it.x, it.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f0c060';
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
        continue;
      }
      var sx = it.kind === 'power' ? f.power.x : f.score.x;
      var img = assets.item;
      if (!img) {
        ctx.fillStyle = it.kind === 'power' ? '#f0c060' : '#7cc4ff';
        ctx.beginPath();
        ctx.arc(it.x, it.y, 5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.drawImage(img, sx, 0, f.fw, f.fh, it.x - 8, it.y - 8 + bob, 16, 16);
    }
  }

  // 各类型辨识光晕色
  var TINTS = { mook: '#cfc8d8', snake: '#7cc4ff', circler: '#6fcf97', zigzag: '#ffd166',
                hover: '#ff6b6b', diver: '#ff9db8', elite: '#c084fc', midboss: '#ffb3c9' };

  function draw(ctx, assets) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;   // 尸体只等 update 回收, 不再绘制(防 Boss 期冻结残影)
      var f = F.enemy;
      var img = assets.enemy;
      // 类型光晕(一眼区分 8 种小怪)
      var tint = TINTS[e.type];
      if (tint) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = tint;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      var frame = Math.floor(e.anim);
      if (e.type === 'midboss') {
        // 大蝴蝶 64x64(行 12-13, 4 帧)
        var bf = frame % 4;
        if (!img) {
          ctx.fillStyle = '#ffb3c9';
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.drawImage(img, bf * 64, f.rows.midboss, 64, 64, e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
        }
      } else {
        // 小妖精 32x32(各行 8 帧)
        var rowY = f.rows[e.type] !== undefined ? f.rows[e.type] : 0;
        var fr = frame % f.frames;
        if (!img) {
          ctx.fillStyle = e.type === 'elite' ? '#c084fc' : '#f472b6';
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.drawImage(img, fr * 32, rowY, 32, 32, e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
        }
      }
      // 冰冻覆盖
      if (e.frozenT > 0) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#7cc4ff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (e.type === 'elite' || e.type === 'midboss') {
        var bw = e.type === 'midboss' ? 60 : 48;
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 5);
        ctx.fillStyle = e.type === 'midboss' ? '#f0c060' : '#c084fc';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * (e.hp / e.maxHp), 5);
      }
    }
  }

  function clear() { enemies.length = 0; items.length = 0; }

  // 全场道具吸附(星屑采集器僚机)
  function magnetAll() { for (var i = 0; i < items.length; i++) items[i].mag = true; }

  // 圆形范围持续伤害(星环炮僚机)
  function damageAt(x, y, r, dmg) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (STG.dist2(e.x, e.y, x, y) <= (r + e.r) * (r + e.r)) {
        e.hp -= dmg;
        STG.engine.spark(e.x + STG.rnd(-5, 5), e.y + STG.rnd(-5, 5), '#ffe8b0', 1, 90);
        if (e.hp <= 0 && !e.dead) killEnemy(e, null);
      }
    }
  }

  // Boss 入场: 残敌全部退场(向上飞离, 不给分不掉落; 离场途中仍可被击落), 未清除的尸体一并移除
  function evacuateAll() {
    for (var i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) { enemies.splice(i, 1); continue; }
      enemies[i].evac = true;
    }
  }

  // 最近存活敌人(追踪弹索敌用)
  function closest(x, y) { return closestK(x, y, 0); }
  // 第 k 近的存活敌人(多目标锁定: lockIdx 轮流分配)
  function closestK(x, y, k) {
    var list = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var dx = e.x - x, dy = e.y - y;
      list.push({ e: e, d: dx * dx + dy * dy });
    }
    if (!list.length) return null;
    list.sort(function(a, b) { return a.d - b.d; });
    return list[Math.min(k || 0, list.length - 1)].e;
  }

  return {
    ET: ET,
    spawn: spawn,
    spawnFlank: spawnFlank, spawnRow: spawnRow, spawnSnakePair: spawnSnakePair,
    spawnCenter: spawnCenter, spawnElite: spawnElite, spawnMidBoss: spawnMidBoss,
    template: template, spawnMookWave: spawnMookWave, spawnEliteWave: spawnEliteWave,
    update: update, draw: draw,
    drop: drop, updateItems: updateItems, drawItems: drawItems,
    damageAll: damageAll, damageRect: damageRect, damageAt: damageAt,
    beamSweep: beamSweep, sweepHit: sweepHit,
    magnetAll: magnetAll,
    clear: clear, evacuateAll: evacuateAll, closest: closest, closestK: closestK,
    stats: function() {
      var alive = 0, hp = 0, dead = 0;
      for (var i = 0; i < enemies.length; i++) { if (enemies[i].dead) dead++; else { alive++; hp += enemies[i].hp; } }
      return { list: enemies.length, alive: alive, deadFlagged: dead, totalHp: hp };
    },
    get alive() {
      var n = 0;
      for (var i = 0; i < enemies.length; i++) if (!enemies[i].dead) n++;
      return n;
    }
  };
})();
