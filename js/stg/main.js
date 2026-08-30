// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 主控 (main.js)
//  状态机 / 输入 / Stage编排 / Boss战 / 强化升级 / HUD / 音效
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.main = (function() {
  var C = STG.CONFIG;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');

  var gameState = 'loading'; // loading / title / howto / gunselect / playing / paused / levelup / dead
  var assets = null;

  // ── 玩家进度 ──
  var S = {
    score: 0, graze: 0, grazeT: 0, grazeCD: 0, grazeCombo: 0,
    power: C.POWER_START, powerMax: C.POWER_MAX,
    hp: C.PLAYER_START_HP, hpMax: C.PLAYER_HP_MAX,
    bombs: C.PLAYER_BOMBS, bombsMax: C.PLAYER_BOMBS,
    stage: 1, wave: 0, level: 1, xp: 0,
    nextLife: C.SCORE_LIFE, nextBomb: C.SCORE_BOMB,
    gun: 'chase',
    tempShield: 0,
    perks: { track_up:0, multi_lock:0, hit_splash:0, shot_num:0, rate_up:0, dmg_up:0,
             fan_up:0, close_up:0, splash_up:0,
             charge_up:0, pulse_up:0, cool_up:0, width_up:0, star_burst:0, greed:0 },
    mods: { dmgMul: 1, shield: 0, hitMul: 1, speedMul: 1, magnet: 0, grazeR: 0, expMul: 1, pierceChance: 0 }
  };
  var pendingLevels = 0;
  var doll = 0;                 // 替身人偶(致死满星复活)

  // ── 关卡状态(20 波制) ──
  var waveT = 0, bossMode = false;
  var warningT = 0, stageTitleT = 0, clearT = 0;
  var muted = false;
  try { muted = localStorage.getItem('stg_muted') === '1'; } catch (e) {}
  var bestScore = 0;
  try { bestScore = parseInt(localStorage.getItem('stg_best') || '0', 10) || 0; } catch (e) {}
  // ── BGM 音量档位(关0/小1/中2/大3), 偏好持久化 ──
  var BGM_LEVELS = [
    { label: '关', v: 0 },
    { label: '小', v: 0.3 },
    { label: '中', v: 0.5 },
    { label: '大', v: 0.8 }
  ];
  var bgmLv = 2;   // 默认「中」
  try {
    var savedLv = parseInt(localStorage.getItem('stg_bgmvol') || '2', 10);
    if (savedLv >= 0 && savedLv < BGM_LEVELS.length) bgmLv = savedLv;
  } catch (e) {}
  function bgmVolLabel() { return '🎵 BGM:' + BGM_LEVELS[bgmLv].label; }
  function applyBgmVol() { STG.midi.setVolume(BGM_LEVELS[bgmLv].v); }
  function toggleBgmVol(btn) {
    bgmLv = (bgmLv + 1) % BGM_LEVELS.length;
    try { localStorage.setItem('stg_bgmvol', String(bgmLv)); } catch (e) {}
    applyBgmVol();
    if (btn) btn.textContent = bgmVolLabel();
  }
  // ── 触屏 UI 仅在游戏中启用(摇杆区会遮挡菜单按钮左半区); 桌面端永远隐藏 ──
  var touchEnabled = false;
  function setTouchUI(on) {
    if (!touchEnabled) return;
    var ui = document.getElementById('touchUI');
    if (ui) ui.classList.toggle('hide', !on);
  }
  var bombFx = null;

  // ── 输入 ──
  var input = { left:false, right:false, up:false, down:false, slow:false, shoot:false, shootKey:false };
  // 触屏状态: 拖动跟手 + 双击 bomb
  var touchState = { dragId: null, dragging: false, sx: 0, sy: 0, lastTapT: 0, lastTapX: 0, lastTapY: 0 };
  var KEYS = {
    37:'left', 39:'right', 38:'up', 40:'down',
    65:'left', 68:'right', 87:'up', 83:'down',
    16:'slow', 90:'shootKey', 88:'bomb'
  };
  function onKey(e, down) {
    var k = KEYS[e.keyCode];
    if (k) e.preventDefault();        // 拦截方向键等, 防页面滚动
    if (down && e.repeat) return;     // 长按连发产生的重复 keydown 忽略
    // Esc: 介绍页返回标题, 其余暂停
    if (e.keyCode === 27 && down) { if (gameState === 'howto') { showTitle(); return; } togglePause(); return; }
    if (k && k !== 'bomb') input[k] = down;
    if (k === 'bomb' && down && gameState === 'playing') doBomb();
    if (k === 'shootKey' && down) {
      if (gameState === 'title') { showHowto(); return; }
      if (gameState === 'howto') { showGunSelect(); return; }
    }
    // 介绍页 ESC 返回标题已在上面的 Esc 分支处理
    if (gameState === 'gunselect' && down && ['1','2','3'].indexOf(String.fromCharCode(e.keyCode)) >= 0) {
      pickGun(['chase','spread','cannon'][parseInt(String.fromCharCode(e.keyCode), 10) - 1]);
    }
    if (gameState === 'levelup' && down && ['1','2','3'].indexOf(String.fromCharCode(e.keyCode)) >= 0) {
      pickCard(parseInt(String.fromCharCode(e.keyCode), 10) - 1);
    }
  }
  // ── 暂停 / 设置 ──
  // 失焦/切后台清空输入(防 keyup/touchend 丢失导致射击卡死)
  function clearInput() {
    input.left = input.right = input.up = input.down = input.slow = input.shoot = false;
    touchState.dragId = null;
    touchState.dragging = false;
    STG.player.setTouchTarget(null);
  }
  function togglePause() {
    if (gameState === 'playing') { gameState = 'paused'; setTouchUI(false); document.getElementById('pauseOverlay').classList.remove('hide'); }
    else if (gameState === 'paused') {
      gameState = 'playing';
      document.getElementById('pauseOverlay').classList.add('hide');
      document.getElementById('buildOverlay').classList.add('hide');
      setTouchUI(true);
      lastTs = performance.now();
    }
  }

  // ── 我的强化(Build 一览) ──
  function renderBuild() {
    var box = document.getElementById('buildList');
    var g = STG.GUNS[S.gun];
    var dmgUp = 1 + (S.gun === 'cannon' ? 0.15 : 0.12) * (S.perks.dmg_up || 0);
    // ── 属性数值面板 ──
    var stats =
      '<div class="build-stats">' +
      '<div>主炮 <b>' + g.name + ' P' + Math.min(5, Math.max(1, Math.floor(S.power))) + '</b></div>' +
      '<div>攻击 <b>×' + (STG.totalDmgMul(S.power) * dmgUp).toFixed(2) + '</b></div>' +
      '<div>移速 <b>×' + S.mods.speedMul.toFixed(2) + '</b></div>' +
      '<div>判定 <b>' + (C.PLAYER_HIT_R * S.mods.hitMul).toFixed(1) + 'px</b></div>' +
      '<div>星 <b>' + S.hp + '/' + S.hpMax + '</b></div>' +
      '<div>符卡 <b>' + S.bombs + '/' + S.bombsMax + '</b></div>' +
      '<div>吸附 <b>' + (90 + S.mods.magnet) + 'px</b></div>' +
      '<div>擦弹 <b>+' + (4 + S.mods.grazeR) + 'px</b></div>' +
      '<div>经验 <b>×' + S.mods.expMul.toFixed(2) + '</b></div>' +
      '<div>贯通 <b>' + Math.round(S.mods.pierceChance * 100) + '%</b></div>' +
      '<div>僚机 <b>' + (STG.options.count() ? STG.options.ownedList().map(function(id) { return STG.options.DEFS[id].icon; }).join('') : '无') + '</b></div>' +
      '<div>人偶 <b>' + doll + '</b></div>' +
      '</div>';
    var html = '<div class="build-head">' + g.icon + ' ' + g.name + ' · POWER ' + S.power.toFixed(2) + '</div>' + stats;
    var n = 0;
    for (var pid in g.perks) {
      if (S.perks[pid] > 0) {
        var p = g.perks[pid];
        html += '<div class="build-item"><span>' + p.icon + ' ' + p.name + '</span><span class="build-lv">×' + S.perks[pid] + '</span></div>';
        n++;
      }
    }
    for (var id in STG.UPGRADES) {
      var lv = countBy(id);
      if (lv > 0) {
        var u = STG.UPGRADES[id];
        html += '<div class="build-item"><span>' + u.icon + ' ' + u.name + '</span><span class="build-lv">×' + lv + '</span></div>';
        n++;
      }
    }
    if (n === 0) html += '<div class="build-empty">还没有强化<br>击败敌人收集经验升级</div>';
    box.innerHTML = html;
  }
  function showBuild() {
    document.getElementById('pauseOverlay').classList.add('hide');
    renderBuild();
    document.getElementById('buildOverlay').classList.remove('hide');
  }
  function hideBuild() {
    document.getElementById('buildOverlay').classList.add('hide');
    document.getElementById('pauseOverlay').classList.remove('hide');
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('stg_muted', muted ? '1' : '0'); } catch (e) {}
    if (sndGain) sndGain.gain.value = muted ? 0 : 0.5;
    STG.midi.setMuted(muted);   // BGM 同步静音
    var btn = document.getElementById('btnMute');
    if (btn) btn.textContent = muted ? '🔇 音效关' : '🔊 音效开';
  }

  // ── WebAudio 合成音效 ──
  var AC = null, sndGain = null;
  function ensureAC() {
    if (AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      sndGain = AC.createGain();
      sndGain.gain.value = muted ? 0 : 0.5;
      sndGain.connect(AC.destination);
    } catch (e) { AC = null; }
  }
  function tone(f0, f1, dur, type, vol) {
    if (!AC) return;
    var t0 = AC.currentTime;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(sndGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var sfx = {
    shot: function() { tone(880, 420, 0.05, 'square', 0.035); },
    hit:  function() { tone(320, 120, 0.08, 'sawtooth', 0.06); },
    boom: function() { tone(160, 40, 0.3, 'sawtooth', 0.12); },
    pick: function() { tone(720, 1080, 0.08, 'sine', 0.07); },
    graze:function() { tone(1400, 1600, 0.04, 'sine', 0.04); },
    bomb: function() { tone(90, 900, 0.5, 'sawtooth', 0.14); tone(60, 30, 0.6, 'sine', 0.1); },
    hurt: function() { tone(300, 60, 0.4, 'square', 0.1); },
    level:function() { tone(523, 660, 0.12, 'triangle', 0.09); tone(659, 784, 0.12, 'triangle', 0.09); },
    warn: function() { tone(120, 90, 0.5, 'sawtooth', 0.1) },
  };
  // 敌方开火: 低音调短促声, 0.12s 全局节流(多怪同帧开火只发一声)
  var eshotT = -1;
  sfx.eshot = function() {
    if (STG.engine.time - eshotT < 0.12) return;
    eshotT = STG.engine.time;
    tone(240, 130, 0.06, 'square', 0.028);
  };

  // ── 游戏循环 ──
  var lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    STG.engine.tick(dt);

    if (gameState === 'playing') { update(dt); draw(dt); }
    else if (gameState === 'loading') {
      ctx.fillStyle = '#0a0612'; ctx.fillRect(0, 0, C.W, C.H);
      ctx.fillStyle = '#8a7e9a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('加载中…', C.W / 2, C.H / 2);
    } else if (gameState === 'title' || gameState === 'howto' || gameState === 'gunselect' || gameState === 'levelup' || gameState === 'dead' || gameState === 'paused') {
      draw(dt);   // 冻结画面当背景
    }
  }

  // ── 更新 ──
  function update(dt) {
    var P = STG.player, EB = STG.bullets, EN = STG.enemies;

    // 经验升级(战斗暂停)
    if (pendingLevels > 0) { enterLevelUp(); return; }

    // 触屏: 按住拖动 = 自动开火(Boss 时符期间停火); 桌面: 键盘 Z 走 shootKey
    if (touchEnabled) {
      var timeStop = STG.boss.alive() && STG.boss.phaseName() === 'time';
      input.shoot = (touchState.dragging || input.shootKey) && !timeStop;
    } else {
      input.shoot = input.shootKey;
    }

    // 低速时缓: 世界侧(敌弹/敌人/Boss/道具/自机弹)乘 SLOW_FACTOR
    var gdt = input.slow ? dt * C.SLOW_FACTOR : dt;

    P.update(dt, input, { shot: doShot, charge: chargeSfx });

    EB.updatePlayer(gdt);
    EB.updateEB(gdt);
    EB.updateLasers(gdt);

    // 敌人(普通编排阶段)
    if (!bossMode) EN.update(gdt, S.stage, S.wave, S.power, {
      kill: function(e, t) {
        S.score += t.score;
        sfx.boom();
        STG.engine.label(e.x, e.y, '+' + t.score, '#ffe8b0', 12);
      }
    });

    // Boss
    if (STG.boss.alive()) {
      STG.boss.update(gdt, S.power, { died: onBossDied, capture: onSpellCapture });
    }

    // Boss 体术接触判定(冲刺撞到玩家也受伤)
    if (STG.boss.alive() && STG.boss.phaseName() !== 'enter') {
      var bcx = P.x - STG.boss.x, bcy = P.y - STG.boss.y;
      if (bcx * bcx + bcy * bcy < 44 * 44) onHurt();
    }

    // 僚机系统
    S.tempShield = Math.max(0, S.tempShield - dt);
    STG.options.update(dt, P.x, P.y, {
      heal: function() {
        if (S.hp < S.hpMax) { S.hp++; STG.engine.label(P.x, P.y - 46, '八卦炉 · 星 +1', '#ff9db8', 14); }
        else STG.engine.label(P.x, P.y - 46, '星已满', '#8a7e9a', 11);
        sfx.level();
      },
      iceShot: function(ox, oy) { EB.firePlayerAng(ox, oy, -Math.PI / 2, 0.4, false, { spd: 420, track: true, turnRate: 6, ice: true }); },
      magnet: function() { EN.magnetAll(); },
      shield: function() { S.tempShield = 5; STG.engine.label(P.x, P.y - 46, '护盾展开', '#b89fff', 13); },
      missile: function(ox, oy) { EB.firePlayerAng(ox, oy, -Math.PI / 2, 4.0, true, { spd: 380, track: true, turnRate: 4, pierce: STG.options.has('pierce') ? 1 : 0 }); },
      starRing: function(pos, sdt) {
        EN.damageAt(pos.x, pos.y, 12, 55 * sdt);
        if (STG.boss.alive() && STG.dist2(STG.boss.x, STG.boss.y, pos.x, pos.y) < 46 * 46) STG.boss.damage(55 * sdt);
      }
    });

    // 魔炮激光判定(接触即伤, 光束内敌人每 0.2s 掉血)
    STG.bullets.updateBeam(dt, P.x);
    updateBeam(dt);

    // 掉落物(上半屏自动回收)
    var autoRecover = P.y < C.AUTO_RECOVER_Y;
    EN.updateItems(gdt, P.x, P.y, autoRecover, {
      pick: function(it) { onItem(it, false); },
      recover: function(it) { onItem(it, true); }
    }, 90 + S.mods.magnet);

    // 擦弹 Graze Combo: grazeT=连击窗口, grazeCD=触发冷却(防每帧重复计)
    S.grazeT -= dt;
    S.grazeCD -= dt;
    if (S.grazeT <= 0) S.grazeCombo = 0;
    if (P.invuln <= 0 && P.bombInvuln <= 0 && S.grazeCD <= 0 &&
        EB.grazeCheck(P.x, P.y, P.hitR(), 4 + S.mods.grazeR)) {
      S.grazeCombo = S.grazeT > 0 ? S.grazeCombo + 1 : 1;
      S.grazeT = C.GRAZE_WINDOW;
      S.grazeCD = C.GRAZE_CD;
      S.graze++;
      S.score += 50 + S.graze * S.grazeCombo;
      sfx.graze();
      STG.engine.spark(P.x + STG.rnd(-8, 8), P.y + STG.rnd(-8, 8), '#7cc4ff', 2, 90);
    }

    // 被弹
    if (P.bombInvuln <= 0 && P.invuln <= 0 && EB.hitPlayer(P.x, P.y, P.hitR())) onHurt();

    // 决死窗口倒计时
    if (pendingHit > 0) {
      pendingHit -= dt;
      if (pendingHit <= 0) resolveHit();
    }

    // 关卡流程(20 波制)
    if (stageTitleT > 0) stageTitleT -= dt;
    else if (clearT > 0) {
      clearT -= dt;
      if (clearT <= 0) {
        if (pendingStageClear) { pendingStageClear = false; afterStageClear(); }
        // 否则: 仅喘息(道中Boss/小过渡), 波次由 runWaves 继续
      }
    }
    else if (!bossMode) runWaves(dt);
    else if (!STG.boss.alive()) { clearT = 2.5; pendingStageClear = true; }   // 完整Boss已死, 进通关

    // WARNING 横幅
    if (warningT > 0) warningT -= dt;

    // Bomb 演出: 旋转扫射激光(扫完全场, 扫到即死)
    if (bombFx) {
      bombFx.t += dt / 0.95;
      bombFx.ang = -Math.PI + bombFx.t * Math.PI * 2;   // 从左水平起转一整圈
      EN.sweepHit(bombFx.x, bombFx.y, bombFx.ang, 60, 460, 2500);
      if (bombFx.t >= 1) bombFx = null;
    }

    // 分数奖励
    while (S.score >= S.nextLife) { S.nextLife += C.SCORE_LIFE; if (S.hp < S.hpMax) { S.hp++; STG.engine.label(P.x, P.y - 40, '残机 +1', '#6fcf97', 14); } }
    while (S.score >= S.nextBomb) { S.nextBomb += C.SCORE_BOMB; S.bombs = Math.min(S.bombsMax, S.bombs + 1); STG.engine.label(P.x, P.y - 40, '符卡 +1', '#7cc4ff', 14); }
  }

  // ── 20 波制: 连续刷, 小怪波/精英波/道中Boss/Boss 波 ──
  var pendingStageClear = false;
  function runWaves(dt) {
    var W = STG.WAVE_CFG;
    if (S.wave <= 0) { nextWave(); return; }
    if (S.wave >= W.bossWave && !bossMode) return;   // Boss 波已触发
    // 清场即刷下一波; 6s 超时兜底(防卡怪)
    if (STG.enemies.alive === 0 && S.wave < W.perStage) { nextWave(); return; }
    waveT -= dt;
    if (waveT <= 0) nextWave();
  }
  function nextWave() {
    var W = STG.WAVE_CFG;
    S.wave++;
    if (S.wave > W.perStage) S.wave = W.perStage;
    var EN = STG.enemies;
    if (S.wave === W.miniBossWave) {
      // 道中简版 Boss(第 10 波)
      var mb = STG.bossFor(S.stage);
      warningT = 2.0;
      sfx.warn();
      STG.midi.play(mb.bgm);   // Boss 登场切角色曲
      STG.boss.start(S.stage, { mini: true });
      bossMode = true;
      EN.evacuateAll();   // Boss 入场, 残敌退场
      showBanner({ img: mb.img, name: '道中 BOSS · ' + mb.name, sub: mb.title, kind: 'enter', t: 2.0 });
      STG.engine.label(C.W / 2, 110, '道中 BOSS · ' + mb.name, '#ffb3c9', 18);
      return;
    }
    if (S.wave === W.bossWave) {
      // Boss 波: WARNING 演出
      var fb = STG.bossFor(S.stage);
      warningT = 3.0;
      sfx.warn();
      STG.engine.shake(6, 0.8);
      STG.midi.play(fb.bgm);   // Boss 登场切角色曲
      STG.boss.start(S.stage);
      bossMode = true;
      EN.evacuateAll();   // Boss 入场, 残敌退场
      showBanner({ img: fb.img, name: fb.name, sub: fb.title, kind: 'enter', t: 2.2 });
      STG.engine.label(C.W / 2, 110, 'WAVE 20 · ' + fb.name, '#ff7b7b', 20);
      return;
    }
    if (W.eliteWaves.indexOf(S.wave) >= 0) EN.spawnEliteWave(S.wave, S.stage);
    else EN.spawnMookWave(S.wave, S.stage);
    waveT = W.waveDur;
    STG.engine.label(C.W / 2, 60, 'WAVE ' + S.wave + ' / ' + W.perStage, '#f0c060', 15);
  }

  // ── 符卡取得: 干净击破未被 bomb/中弹弄脏的符卡 ──
  function onSpellCapture(name) {
    S.score += 10000;
    STG.engine.label(C.W / 2, 240, '符卡取得 · ' + name + ' +10000', '#ffe8b0', 16);
    sfx.level();
  }

  function onBossDied() {
    // 残弹回收: 击破瞬间全场残余弹幕转化为分数
    var left = STG.bullets.count();
    if (left > 0) {
      var bonus = left * 100;
      S.score += bonus;
      STG.engine.label(C.W / 2, 160, '残弹回收 +' + bonus, '#ffe8b0', 14);
      var bb = STG.bullets.ebPositions();
      for (var bi = 0; bi < bb.length; bi++) STG.engine.spark(bb[bi].x, bb[bi].y, '#ffe8b0', 1, 90);
    }
    STG.bullets.clearAll();
    // 道中 Boss 击破: 短暂喘息后恢复波次
    if (STG.boss.isMini()) {
      S.score += 20000;
      STG.engine.label(C.W / 2, 200, '道中 BOSS 击破 +20000', '#ffb3c9', 18);
      STG.engine.shake(8, 0.5);
      for (var m = 0; m < 12; m++) STG.enemies.drop('power', STG.boss.x + STG.rnd(-40, 40), STG.boss.y + STG.rnd(-30, 30));
      STG.boss.clear();
      bossMode = false;
      STG.midi.play(C.BGM_STAGE);   // 道中王击破, 切回道中曲
      clearT = 1.5;
      return;
    }
    // 完整 Boss 击破: 通关
    S.bombs = Math.min(S.bombsMax, S.bombs + 1);
    S.score += 50000;
    STG.engine.label(C.W / 2, 200, 'BOSS 击破 +50000', '#ffe8b0', 20);
    STG.engine.shake(10, 0.6);
    for (var i = 0; i < 30; i++) STG.enemies.drop('power', STG.boss.x + STG.rnd(-40, 40), STG.boss.y + STG.rnd(-30, 30));
    STG.enemies.drop('score', STG.boss.x, STG.boss.y);
    sfx.bomb();
    clearT = 2.2;
    pendingStageClear = true;
  }
  function afterStageClear() {
    stageUpgrade = true;
    // 僚机已满 → 通关奖励改为双强化三选一
    pendingLevels = STG.options.count() >= STG.options.max() ? 2 : 1;
    enterLevelUp();
  }
  // ── 僚机三选一(击破关底 Boss 后) ──
  var optionPickActive = false;
  function enterOptionPick(offers) {
    optionPickActive = true;
    gameState = 'levelup';
    currentCards = offers.map(function(id) { return { id: id, option: true }; });
    var box = document.getElementById('lvCards');
    var title = document.getElementById('lvTitle');
    if (title) title.textContent = '选 择 僚 机';
    box.innerHTML = '';
    for (var i = 0; i < offers.length; i++) {
      (function(idx) {
        var d = STG.options.DEFS[offers[idx]];
        var div = document.createElement('div');
        div.className = 'lv-card';
        div.style.borderColor = '#7cc4ff';
        div.innerHTML = '<div class="lv-tag">僚机 · ' + d.kind + '</div>' +
          '<div class="lv-icon">' + d.icon + '</div>' +
          '<div class="lv-name">' + d.name + '</div>' +
          '<div class="lv-rarity" style="color:#7cc4ff">' + (STG.options.count() + 1) + '/' + STG.options.max() + ' 台</div>' +
          '<div class="lv-desc">' + d.desc + '</div>' +
          '<div class="lv-key">' + (idx + 1) + '</div>';
        div.addEventListener('click', function() { pickCard(idx); });
        box.appendChild(div);
      })(i);
    }
    document.getElementById('lvOverlay').classList.remove('hide');
    sfx.level();
  }
  function nextStage() {
    S.stage++;
    S.wave = 0; waveT = 0; bossMode = false;
    STG.boss.clear();
    STG.midi.play(C.BGM_STAGE);   // 下一面道中曲
    stageTitleT = 2.0;
    STG.engine.label(C.W / 2, C.H / 2 - 40, 'STAGE ' + S.stage + ' · ' + STG.bossFor(S.stage).name, '#f0c060', 22);
  }

  // ── 射击(按主炮三模式) ──
  function perkLv(k) { return S.perks[k] || 0; }
  function doShot(x, y, kind) {
    var EB = STG.bullets;
    var g = STG.GUNS[S.gun];
    var gp = STG.gunPower(S.gun, S.power);
    var pierce = (Math.random() < S.mods.pierceChance ? 1 : 0) + (STG.options.has('pierce') ? 1 : 0);
    var burst = STG.options.has('burst') || undefined;

    if (kind === 'beam') {
      // 魔炮: 发射激光
      var w = gp.w * (1 + 0.2 * perkLv('width_up'));
      EB.fireBeam(x, w, C.CANNON_BEAM * (1 + 0.2 * perkLv('pulse_up')));
      // 发射轰鸣 + 白闪震动
      tone(70, 45, 0.45, 'sawtooth', 0.16);
      tone(140, 60, 0.35, 'square', 0.08);
      STG.engine.flash(0.3);
      STG.engine.shake(6, 0.4);
      // 星尘汇聚
      if (perkLv('star_burst') > 0) {
        for (var sb = 0; sb < 6; sb++) {
          var sa = -Math.PI / 2 + (sb - 2.5) * 0.3;
          EB.firePlayerAng(x, y, sa, 1, false, { spd: 500, pierce: pierce, burst: burst });
        }
      }
      sfx.shot();
      return;
    }

    if (S.gun === 'chase') {
      // 星追: 索敌追踪弹(多目标锁定: 各弹轮流追第 k 近的敌人)
      var n = gp.n + perkLv('shot_num');
      var lockN = 1 + (gp.lockBonus || 0) + perkLv('multi_lock');
      var turn = g.turnRate * (1 + 0.4 * perkLv('track_up'));
      var spd = g.speed * (1 + 0.25 * perkLv('track_up'));
      var dmgK = g.dmg / C.SHOT_DAMAGE * (1 + 0.12 * perkLv('dmg_up'));
      for (var i = 0; i < n; i++) {
        EB.firePlayerAng(x + (i - (n - 1) / 2) * 6, y, -Math.PI / 2, dmgK, false,
          { track: true, turnRate: turn, spd: spd, pierce: pierce, lockIdx: i % lockN, burst: burst });
      }
      sfx.shot();
    } else if (S.gun === 'spread') {
      // 星散: 扇形散射
      var n2 = gp.n + perkLv('shot_num');
      var half = C.SPREAD_ANGLE * (1 + 0.15 * perkLv('fan_up'));
      var dmgK2 = g.dmg / C.SHOT_DAMAGE * (1 + 0.12 * perkLv('dmg_up'));
      for (var j = 0; j < n2; j++) {
        var a2 = -Math.PI / 2 - half + (2 * half * j) / Math.max(1, n2 - 1);
        EB.firePlayerAng(x, y, a2, dmgK2, false, { spd: g.speed, pierce: pierce, burst: burst });
      }
      if (gp.center) EB.firePlayerAng(x, y, -Math.PI / 2, dmgK2, false, { spd: g.speed, pierce: pierce, burst: burst });
      sfx.shot();
    }
  }

  // ── 魔炮激光伤害(逐帧结算): 接触越久伤害越高, 脱离从零累计 ──
  function updateBeam(dt) {
    if (!STG.bullets.beamActive()) return;
    var bx = STG.bullets.beamX(), bw = STG.bullets.beamW();
    var base = C.CANNON_DMG * STG.totalDmgMul(S.power) * (1 + 0.15 * perkLv('dmg_up'));   // 基础 DPS
    STG.enemies.beamSweep(bx - bw / 2, bx + bw / 2, STG.player.y, dt, base);
    var inBeam = STG.boss.alive() && STG.boss.y < STG.player.y &&
        STG.boss.x > bx - bw / 2 && STG.boss.x < bx + bw / 2;
    if (inBeam) STG.boss.beamHit(dt, base);
    else if (STG.boss.alive()) STG.boss.beamHit(0, 0);
    // 光束沿途火花
    if (Math.random() < dt * 45) {
      var sx2 = bx + STG.rnd(-1, 1) * bw * 0.5;
      STG.engine.spark(sx2, STG.rnd(20, STG.player.y - 10), '#ffe8b0', 1, 90);
    }
  }

  // ── 蓄力音效(复用站内音频) ──
  var chargeSnd = null;
  function chargeSfx() {
    if (!chargeSnd) {
      try { chargeSnd = new Audio('audio/sfx/charge_up.wav'); chargeSnd.preload = 'auto'; } catch (e) {}
    }
    if (chargeSnd) {
      try { chargeSnd.currentTime = 0; chargeSnd.volume = 0.8; chargeSnd.play(); } catch (e) {}
    }
  }

  // ── 道具 ──
  function onItem(it, recover) {
    var mul = recover ? 2 : 1;
    if (it.kind === 'power') { S.power = Math.min(S.powerMax, S.power + C.POWER_PICK * mul); sfx.pick(); }
    else if (it.kind === 'score') { S.score += 500 * mul * (1 + perkLv('greed')); }
    else if (it.kind === 'exp') { gainXp(1 * (recover ? 2 : 1)); }
  }
  function gainXp(v) {
    S.xp += v * S.mods.expMul;
    while (S.xp >= STG.expNeed(S.level)) {
      S.xp -= STG.expNeed(S.level);
      S.level++;
      pendingLevels++;
      sfx.level();
      STG.engine.label(STG.player.x, STG.player.y - 50, '✨ LEVEL UP!', '#f0c060', 15);
    }
  }

  // ── 中弹 / 决死 ──
  var pendingHit = 0;   // 决死窗口剩余: 被弹瞬间按 X 消耗符卡可免伤
  function onHurt() {
    var P = STG.player;
    if (P.invuln > 0 || P.bombInvuln > 0 || pendingHit > 0) return;
    pendingHit = 0.28;    // 决死窗口 0.28s
  }
  function resolveHit() {
    var P = STG.player;
    P.invuln = C.INVULN;
    sfx.hurt();
    // 符卡演出被中弹弄脏(取消取得资格)
    STG.boss.markSpellDirty();
    // 八卦护盾僚机: 临时护盾挡一次
    if (S.tempShield > 0) { S.tempShield = 0; STG.engine.label(P.x, P.y - 40, '护盾抵挡', '#b89fff', 13); return; }
    // 护身结界: 主状态自减并同步
    if (S.mods.shield > 0) { S.mods.shield--; syncMods(); STG.engine.label(P.x, P.y - 40, '结界抵挡', '#7cc4ff', 13); return; }
    S.hp--;
    S.power = Math.max(1.0, S.power - C.POWER_LOSE);
    S.bombs = Math.max(S.bombs, 2);   // 中弹补符卡至 2(原作掉命补满, 平衡取 2)
    // 替身人偶: 致死时以 2 星复活(一次性)
    if (S.hp <= 0 && doll > 0) { doll--; S.hp = Math.min(S.hpMax, 2); STG.engine.label(P.x, P.y - 40, '替身人偶 · 复活!', '#ffb3c9', 15); }
    // 正作重生机制: 清弹 + 白闪爆B + 底部中央重生 + 短无敌
    STG.bullets.clearAll();
    STG.engine.flash(0.45);
    STG.engine.shake(6, 0.3);
    STG.engine.spark(P.x, P.y, '#ff7b7b', 26, 340);
    STG.engine.spark(P.x, P.y, '#ffe8b0', 16, 280);
    P.reset();                     // 底部中央 + 无敌 1.2s
    if (S.hp <= 0) { gameState = 'dead'; STG.midi.stop(); showDead(); }
  }

  function doBomb() {
    if (S.bombs <= 0) return;
    // 决死: 被弹瞬间放符卡 → 免除本次受创
    if (pendingHit > 0) {
      pendingHit = 0;
      STG.engine.label(STG.player.x, STG.player.y - 60, '决 死!', '#ffe8b0', 24);
    }
    // 符卡演出被 bomb 弄脏(取消取得资格)
    STG.boss.markSpellDirty();
    S.bombs--;
    sfx.bomb();
    // 符卡宣言(玩家侧)
    showBanner({ img: 'marisaP', name: '星符「星尘狂欢」', sub: 'STAR MAGIC BULLET', kind: 'player', t: 1.5 });
    // 演出: 白闪 + 星环爆发 + 魔法阵 + 星屑喷泉 + 震动
    STG.engine.flash(0.7);
    STG.engine.shake(10, 0.5);
    bombFx = { t: 0, x: STG.player.x, y: STG.player.y, ang: -Math.PI };
    for (var f2 = 0; f2 < 26; f2++) {
      STG.engine.spark(STG.player.x + STG.rnd(-60, 60), STG.player.y + STG.rnd(-40, 40),
        f2 % 2 ? '#ffe8b0' : '#7cc4ff', 2, 420);
    }
    var pts = STG.bullets.ebPositions();
    for (var i = 0; i < pts.length; i++) {
      STG.engine.spark(pts[i].x, pts[i].y, '#ffe8b0', 1, 60);
    }
    STG.bullets.clearAll();
    STG.player.invuln = C.BOMB_INVULN;
    STG.player.bombInvuln = C.BOMB_INVULN;
    STG.enemies.damageAll(2000);
    STG.boss.damage(2000);
    STG.engine.label(C.W / 2, C.H / 2, '✦ 星符·星尘狂欢', '#7cc4ff', 26);
  }

  // ── 强化三选一 ──
  var currentCards = [];
  var stageUpgrade = false;
  function countBy(id) {
    // 主炮专属 perk
    if (STG.GUNS[S.gun].perks[id]) return S.perks[id] || 0;
    // 通用
    var c = { atk_dmg:'dmgMul', shield:'shield',
      hit_small:'hitMul', speed:'speedMul', magnet:'magnet', graze_r:'grazeR', exp_up:'expMul' }[id];
    if (c === 'shield') return S.mods.shield;
    if (c === 'hitMul') return Math.round((1 - S.mods.hitMul) / 0.15);
    if (c === 'speedMul') return Math.round((S.mods.speedMul - 1) / 0.12);
    if (c === 'magnet') return Math.round(S.mods.magnet / 40);
    if (c === 'grazeR') return Math.round(S.mods.grazeR / 8);
    if (c === 'expMul') return Math.round((S.mods.expMul - 1) / 0.35);
    if (c === 'dmgMul') return Math.round((S.mods.dmgMul - 1) / 0.15);
    if (id === 'power_max') return S.powerMax - C.POWER_MAX;
    if (id === 'bomb_up') return S.bombsMax - C.PLAYER_BOMBS;
    if (id === 'pierce_up') return Math.round(S.mods.pierceChance / 0.25);
    if (id === 'crystal') return S.hpMax - C.PLAYER_HP_MAX;
    if (id === 'doll') return doll;
    if (id === 'greed') return S.perks.greed || 0;
    return 0;
  }
  function buildCardPool() {
    var pool = [];
    // 主炮专属
    var gperks = STG.GUNS[S.gun].perks;
    for (var pid in gperks) {
      if ((S.perks[pid] || 0) < gperks[pid].max) pool.push({ id: pid, gun: true });
    }
    // 通用
    for (var id in STG.UPGRADES) {
      if (countBy(id) < STG.UPGRADES[id].max) pool.push({ id: id });
    }
    return pool;
  }
  function rollCards() {
    var pool = buildCardPool();
    var cards = [];
    while (cards.length < 3 && pool.length > 0) {
      var i = Math.floor(Math.random() * pool.length);
      cards.push(pool.splice(i, 1)[0]);
    }
    return cards;
  }
  function applyCard(card) {
    var id = card.id, m = S.mods;
    if (card.gun) { S.perks[id] = (S.perks[id] || 0) + 1; }
    else switch (id) {
      case 'atk_dmg':   m.dmgMul += 0.08; break;
      case 'power_max': S.powerMax = Math.min(5, S.powerMax + 1); break;
      case 'pierce_up': m.pierceChance = Math.min(0.75, m.pierceChance + 0.25); break;
      case 'shield':    m.shield++; break;
      case 'doll':      doll++; break;
      case 'hit_small': m.hitMul = Math.max(0.7, m.hitMul - 0.15); break;
      case 'crystal':   S.hpMax++; S.hp = Math.min(S.hpMax, S.hp + 1); break;
      case 'speed':     m.speedMul += 0.12; break;
      case 'bomb_up':   S.bombsMax++; S.bombs = Math.min(S.bombsMax, S.bombs + 1); break;
      case 'magnet':    m.magnet += 40; break;
      case 'graze_r':   m.grazeR += 8; break;
      case 'exp_up':    m.expMul += 0.35; break;
      case 'greed':     S.perks.greed++; break;
    }
    syncMods();
  }
  function syncMods() {
    STG.mods = S.mods;   // 供 enemies/boss 伤害公式读取 atk_dmg 乘数
    STG.player.setMods({ speedMul: S.mods.speedMul, hitMul: S.mods.hitMul, shield: S.mods.shield });
    STG.player.setPerks(S.perks);
  }

  function enterLevelUp() {
    if (pendingLevels <= 0) return;
    gameState = 'levelup';
    setTouchUI(false);
    currentCards = rollCards();
    var box = document.getElementById('lvCards');
    box.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      (function(idx) {
        var card = currentCards[idx];
        if (!card) return;
        var id = card.id;
        var u = card.gun ? STG.GUNS[S.gun].perks[id] : STG.UPGRADES[id];
        var colors = ['', '#e0d8ec', '#7cc4ff', '#f0c060'];
        var rarity = card.gun ? 3 : u.rarity;   // 主炮专属按金卡显示
        var rar = rarity === 3 ? '金' : (rarity === 2 ? '蓝' : '白');
        var tag = card.gun ? '<div class="lv-tag">主炮专属</div>' : '';
        var div = document.createElement('div');
        div.className = 'lv-card';
        div.style.borderColor = colors[rarity] || '#3a3045';
        div.innerHTML = tag +
          '<div class="lv-icon">' + u.icon + '</div>' +
          '<div class="lv-name">' + u.name + '</div>' +
          '<div class="lv-rarity" style="color:' + (colors[rarity] || '#8a7e9a') + '">' + rar + '级 · 层 ' + (countBy(id) + 1) + '/' + u.max + '</div>' +
          '<div class="lv-desc">' + u.desc + '</div>' +
          '<div class="lv-key">' + (idx + 1) + '</div>';
        div.addEventListener('click', function() { pickCard(idx); });
        box.appendChild(div);
      })(i);
    }
    document.getElementById('lvOverlay').classList.remove('hide');
    sfx.level();
  }
  function pickCard(i) {
    if (gameState !== 'levelup' || !currentCards[i]) return;
    // 僚机三选一分支
    if (optionPickActive) {
      var picked = STG.options.add(currentCards[i].id);
      if (picked) STG.engine.label(STG.player.x, STG.player.y - 50, '僚机加入: ' + STG.options.DEFS[currentCards[i].id].name, '#7cc4ff', 14);
      optionPickActive = false;
      currentCards = [];
      var title = document.getElementById('lvTitle');
      if (title) title.textContent = '选择你的魔法';
      document.getElementById('lvOverlay').classList.add('hide');
      gameState = 'playing';
      setTouchUI(true);
      lastTs = performance.now();
      nextStage();
      return;
    }
    applyCard(currentCards[i]);
    currentCards = [];
    pendingLevels--;
    if (pendingLevels > 0) { enterLevelUp(); return; }
    document.getElementById('lvOverlay').classList.add('hide');
    gameState = 'playing';
    setTouchUI(true);
    lastTs = performance.now();
    if (stageUpgrade) {
      stageUpgrade = false;
      var offers = STG.options.rollOffers();
      if (offers.length > 0) { enterOptionPick(offers); return; }   // 僚机未满: 追加三选一
      nextStage();
    }
  }

  // ── 符卡宣言横幅(东方风: 暗幕 + 右侧立绘 + 符卡名 + 装饰线) ──
  var banner = null;
  function showBanner(bn) { bn.dur = bn.t; banner = bn; }
  function roundClip(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.clip();
  }
  function drawBanner(ctx, dt) {
    var bn = banner;
    if (bn) {
      bn.t -= dt;
      if (bn.t <= 0) banner = null;
    }
    var b2 = bn || STG.boss.banner;   // boss 侧宣言(符卡/时符)
    if (!b2) return;
    var a = Math.max(0, Math.min(1, b2.t / 0.35, (b2.dur - b2.t) / 0.25));
    var slide = (1 - Math.min(1, (b2.dur - b2.t) / 0.3)) * 70;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#06030c';
    ctx.fillRect(-8, -8, C.W + 16, C.H + 16);
    // 立绘(右侧, 圆角裁切 cover)
    var img = assets[b2.img];
    if (img) {
      var pw = 176, ph2 = 216;
      var px0 = C.W - pw - 26 + slide, py0 = C.H / 2 - ph2 / 2 - 10;
      ctx.save();
      ctx.globalAlpha = a;
      roundClip(ctx, px0, py0, pw, ph2, 12);
      var s = Math.max(pw / img.width, ph2 / img.height);
      var sw = pw / s, sh = ph2 / s;
      try {
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, px0, py0, pw, ph2);
      } catch (e) {}
      ctx.restore();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = 'rgba(240,192,96,.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px0, py0, pw, ph2);
    }
    // 左侧符卡名 + 金色装饰线
    ctx.globalAlpha = a;
    ctx.textAlign = 'left';
    var tx = 26, ty = C.H / 2 - 40;
    ctx.strokeStyle = '#f0c060';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty - 28); ctx.lineTo(tx + 264, ty - 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, ty + 34); ctx.lineTo(tx + 264, ty + 34); ctx.stroke();
    ctx.fillStyle = b2.kind === 'time' ? '#c4b5fd' : '#ffe8b0';
    ctx.font = '900 21px sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText(b2.name, tx, ty + 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8a7e9a';
    ctx.font = '11px sans-serif';
    var tag = b2.kind === 'enter' ? 'BOSS APPEARANCE' : (b2.kind === 'time' ? 'TIME SPELL' : 'SPELL CARD');
    ctx.fillText(tag + (b2.sub ? ' · ' + b2.sub : ''), tx, ty + 26);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── 绘制 ──
  function draw(dt) {
    ctx.save();
    STG.engine.applyShake(ctx, dt);
    STG.engine.drawSky(ctx, dt);
    var P = STG.player, EB = STG.bullets, EN = STG.enemies;
    EN.drawItems(ctx, assets);
    EB.drawEB(ctx, assets);
    EN.draw(ctx, assets);
    STG.boss.draw(ctx, assets);
    EB.drawBeam(ctx);
    EB.drawPlayer(ctx);
    P.draw(ctx, assets, 1);
    STG.options.draw(ctx, P.x, P.y, STG.engine.time);
    if (S.tempShield > 0) {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(STG.engine.time * 8);
      ctx.strokeStyle = '#b89fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(P.x, P.y, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    STG.engine.drawParticles(ctx, dt);
    STG.engine.drawLabels(ctx, dt);
    // Bomb 演出: 旋转扫射超大激光(Master Spark 回旋版)
    if (bombFx) {
      var btx = bombFx.t;
      var bw3 = 120 * Math.min(1, btx / 0.15) * (btx > 0.85 ? Math.max(0.05, (1 - btx) / 0.15) : 1);
      ctx.save();
      ctx.translate(bombFx.x, bombFx.y);
      ctx.rotate(bombFx.ang || -Math.PI);
      var g3 = null;
      try { g3 = ctx.createLinearGradient(0, -bw3, 0, bw3); } catch (e3) {}
      if (g3) {
        g3.addColorStop(0, 'rgba(255,209,102,0)');
        g3.addColorStop(0.25, 'rgba(255,209,102,.55)');
        g3.addColorStop(0.5, 'rgba(255,246,224,.8)');
        g3.addColorStop(0.75, 'rgba(255,209,102,.55)');
        g3.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = g3;
      } else ctx.fillStyle = 'rgba(255,209,102,.5)';
      ctx.fillRect(0, -bw3, 460, bw3 * 2);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(0, -bw3 * 0.42, 460, bw3 * 0.84);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillRect(0, -bw3 * 0.13, 460, bw3 * 0.26);
      ctx.restore();
      STG.engine.starburst(ctx, bombFx.x, bombFx.y, Math.min(1, btx * 1.4), 110, '#ffe8b0');
    }
    // 蕾米「夜符·黑夜狂欢」: 黑夜降临, 只有自机周围一圈视野
    if (STG.boss.alive() && STG.bossFor(S.stage).night && STG.boss.phaseName() === 'spell2') {
      var g4 = null;
      try { g4 = ctx.createRadialGradient(P.x, P.y, 40, P.x, P.y, 85); } catch (e4) {}
      if (g4) {
        g4.addColorStop(0, 'rgba(3,1,10,0)');
        g4.addColorStop(0.72, 'rgba(3,1,10,.9)');
        g4.addColorStop(1, 'rgba(3,1,10,.99)');
        ctx.fillStyle = g4;
      } else ctx.fillStyle = 'rgba(3,1,10,.96)';
      ctx.fillRect(-8, -8, C.W + 16, C.H + 16);
    }
    STG.engine.drawFlash(ctx, dt);
    drawHUD();
    // WARNING 横幅
    if (warningT > 0) {
      var blink = Math.floor(warningT * 8) % 2 === 0;
      ctx.textAlign = 'center';
      ctx.font = '700 34px sans-serif';
      ctx.fillStyle = blink ? '#ff4444' : '#ff8888';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18;
      ctx.fillText('WARNING', C.W / 2, 170);
      ctx.shadowBlur = 0;
      ctx.font = '700 18px sans-serif';
      ctx.fillStyle = '#ffd0d0';
      var warnName = STG.boss.alive() && STG.boss.isMini()
        ? '道中 BOSS「' + STG.bossFor(S.stage).name + '」'
        : '「' + STG.bossFor(S.stage).name + '」出现';
      ctx.fillText(warnName, C.W / 2, 200);
    }
    drawBanner(ctx, dt);
    // STAGE CLEAR
    if (clearT > 0) {
      ctx.textAlign = 'center';
      ctx.font = '700 30px sans-serif';
      ctx.fillStyle = '#ffe8b0';
      ctx.shadowColor = '#f0c060'; ctx.shadowBlur = 16;
      ctx.fillText('STAGE CLEAR', C.W / 2, C.H / 2 - 20);
      ctx.shadowBlur = 0;
    }
    // 开局回收线提示(自机高于此线 → 全场道具自动回收)
    if (stageTitleT > 0) {
      ctx.strokeStyle = 'rgba(124,196,255,.5)';
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(20, C.AUTO_RECOVER_Y);
      ctx.lineTo(C.W - 20, C.AUTO_RECOVER_Y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(124,196,255,.85)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('回收线 · 移到线上方自动回收全场道具', C.W / 2, C.AUTO_RECOVER_Y - 8);
    }
    ctx.restore();
  }

  // ── HUD ──
  function drawHUD() {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe8b0';
    ctx.font = '700 20px sans-serif';
    ctx.fillText(pad(S.score), 12, 28);
    ctx.fillStyle = '#8a7e9a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Graze ' + S.graze + (S.grazeCombo > 1 ? ' ×' + S.grazeCombo : ''), 12, 46);

    // Power + 形态
    ctx.textAlign = 'right';
    var pt = STG.GUNS[S.gun];
    ctx.fillStyle = '#f0c060';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('POWER ' + S.power.toFixed(2) + ' ' + pt.name, C.W - 12, 22);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(C.W - 132, 28, 120, 5);
    ctx.fillStyle = '#f0c060';
    ctx.fillRect(C.W - 132, 28, 120 * (S.power / S.powerMax), 5);
    // 符卡(明示数量)
    ctx.fillStyle = '#7cc4ff';
    ctx.font = '700 13px sans-serif';
    ctx.fillText('✦ × ' + S.bombs, C.W - 12, 46);

    // 残机星
    for (var s = 0; s < S.hpMax; s++) {
      ctx.globalAlpha = s < S.hp ? 1 : 0.18;
      if (assets.star) ctx.drawImage(assets.star, 12 + s * 20, 54, 16, 16);
      else { ctx.fillStyle = s < S.hp ? '#f0c060' : '#4a3f5c'; ctx.fillText('★', 12 + s * 20, 70); }
    }
    ctx.globalAlpha = 1;

    // Stage / 波次 / 等级
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240,192,96,.75)';
    ctx.font = '12px sans-serif';
    var waveTxt = S.wave > 0 ? 'WAVE ' + S.wave + '/' + STG.WAVE_CFG.perStage : 'WAVE -';
    ctx.fillText('STAGE ' + S.stage + ' · ' + waveTxt + ' · Lv' + S.level, C.W / 2, 22);
    // 经验条
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(C.W / 2 - 60, 26, 120, 4);
    ctx.fillStyle = '#b89fff';
    ctx.fillRect(C.W / 2 - 60, 26, 120 * (S.xp / STG.expNeed(S.level)), 4);

    // Boss 血条(常规=本体色 / 符卡=金 / 时符=紫色倒计时)
    if (STG.boss.alive()) {
      var bw = C.W - 40, bx = 20, by = 64, bh = 8;
      var bph = STG.boss.phaseName();
      var isTime = bph === 'time';
      var isSpell = bph === 'spell1' || bph === 'spell2' || bph === 'spell3';
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(bx, by, bw, bh);
      if (isTime) {
        ctx.fillStyle = '#b89fff';
        ctx.fillRect(bx, by, bw * STG.boss.timeFrac, bh);
      } else {
        ctx.fillStyle = isSpell ? '#ffd166' : STG.bossFor(S.stage).color;
        ctx.fillRect(bx, by, bw * STG.boss.hpPct(), bh);
      }
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      var segN = STG.boss.segCount;
      for (var d = 1; d < segN; d++) {
        ctx.fillRect(bx + bw * d / segN - 1, by - 2, 2, bh + 4);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = isTime ? '#c4b5fd' : (isSpell ? '#ffe8b0' : '#c4b5fd');
      ctx.font = '700 11px sans-serif';
      var bossName = STG.boss.isMini() ? '道中·' + STG.bossFor(S.stage).name : STG.bossFor(S.stage).name;
      ctx.fillText('「' + bossName + '」 ' + STG.boss.segName() + (STG.boss.lockT > 0 ? ' · 演出中' : ''), C.W / 2, by - 6);
      // 时符: 大字倒计时
      if (isTime) {
        var tLeft = STG.boss.timeFrac * (STG.bossFor(S.stage).timeSpell ? STG.bossFor(S.stage).timeSpell.dur : 30);
        ctx.font = '900 30px sans-serif';
        ctx.fillStyle = '#b89fff';
        ctx.shadowColor = '#7c5cd6'; ctx.shadowBlur = 14;
        ctx.fillText(tLeft.toFixed(1), C.W / 2, 118);
        ctx.shadowBlur = 0;
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#8a7e9a';
        ctx.fillText('撑过倒计时即击破', C.W / 2, 134);
      }
    }
  }
  function pad(n) {
    var s = String(n);
    while (s.length < 8) s = '0' + s;
    return s;
  }

  // ── 界面 ──
  function showTitle() {
    gameState = 'title';
    setTouchUI(false);
    var tb = document.getElementById('titleBest');
    if (tb) tb.textContent = bestScore > 0 ? '🏆 最高分 ' + pad(bestScore) : '';
    document.getElementById('titleOverlay').classList.remove('hide');
  }
  function hideTitle() { document.getElementById('titleOverlay').classList.add('hide'); }
  function showDead() {
    submitLB();
    var isNew = S.score > bestScore;
    if (isNew) { bestScore = S.score; try { localStorage.setItem('stg_best', String(bestScore)); } catch (e) {} }
    document.getElementById('deadScore').textContent = pad(S.score) + ' 分 · Graze ' + S.graze + ' · Stage ' + S.stage +
      (isNew ? ' · 🏆 新纪录!' : ' · 最高 ' + pad(bestScore));
    document.getElementById('deadOverlay').classList.remove('hide');
    setTouchUI(false);
  }
  function hideDead() { document.getElementById('deadOverlay').classList.add('hide'); }

  // ── 玩法介绍 ──
  function showHowto() {
    gameState = 'howto';
    setTouchUI(false);
    document.getElementById('titleOverlay').classList.add('hide');
    document.getElementById('howtoOverlay').classList.remove('hide');
  }
  function hideHowto() { document.getElementById('howtoOverlay').classList.add('hide'); }

  // ── 主炮选择 ──
  function showGunSelect() {
    hideTitle(); hideHowto();
    gameState = 'gunselect';
    setTouchUI(false);
    var box = document.getElementById('gunCards');
    box.innerHTML = '';
    var guns = ['chase', 'spread', 'cannon'];
    for (var i = 0; i < 3; i++) {
      (function(idx) {
        var g = STG.GUNS[guns[idx]];
        var div = document.createElement('div');
        div.className = 'gun-card';
        div.innerHTML = '<div class="gun-icon">' + g.icon + '</div>' +
          '<div class="gun-name">' + g.name + '</div>' +
          '<div class="gun-sub">' + g.sub + '</div>' +
          '<div class="gun-desc">' + g.desc + '</div>' +
          '<div class="gun-stats">射速 ' + (g.interval * 10).toFixed(1) + '/s · 伤害 ' + g.dmg + '</div>' +
          '<div class="lv-key">' + (idx + 1) + '</div>';
        div.addEventListener('click', function() { pickGun(guns[idx]); });
        box.appendChild(div);
      })(i);
    }
    document.getElementById('gunOverlay').classList.remove('hide');
  }
  function hideGunSelect() { document.getElementById('gunOverlay').classList.add('hide'); }
  function pickGun(gun) {
    if (gameState !== 'gunselect') return;
    S.gun = gun;
    hideGunSelect();
    startGame(gun);
  }

  function startGame(gun) {
    ensureAC();
    hideTitle(); hideDead(); hideGunSelect(); hideHowto();
    document.getElementById('lvOverlay').classList.add('hide');
    document.getElementById('pauseOverlay').classList.add('hide');
    STG.bullets.clearAll();
    STG.enemies.clear();
    STG.boss.clear();
    S.gun = gun || S.gun || 'chase';
    STG.player.setGun(S.gun);
    STG.player.reset();
    S.score = 0; S.graze = 0; S.grazeCombo = 0; S.grazeT = 0; S.grazeCD = 0;
    S.power = C.POWER_START; S.powerMax = C.POWER_MAX;
    S.hp = C.PLAYER_START_HP; S.hpMax = C.PLAYER_HP_MAX;
    S.bombs = C.PLAYER_BOMBS; S.bombsMax = C.PLAYER_BOMBS;
    S.stage = 1; S.level = 1; S.xp = 0;
    S.wave = 0;
    S.tempShield = 0;
    STG.options.reset();
    S.nextLife = C.SCORE_LIFE; S.nextBomb = C.SCORE_BOMB;
    S.perks = { track_up:0, multi_lock:0, hit_splash:0, shot_num:0, rate_up:0, dmg_up:0,
                fan_up:0, close_up:0, splash_up:0,
                charge_up:0, pulse_up:0, cool_up:0, width_up:0, star_burst:0, greed:0 };
    S.mods = { dmgMul: 1, shield: 0, hitMul: 1, speedMul: 1, magnet: 0, grazeR: 0, expMul: 1, pierceChance: 0 };
    doll = 0;
    syncMods();
    pendingLevels = 0;
    waveT = STG.WAVE_CFG.startDelay; bossMode = false;
    warningT = 0; clearT = 0; bombFx = null;
    stageTitleT = 2.0;
    gameState = 'playing';
    setTouchUI(true);             // 游戏中才启用摇杆/按钮层
    STG.midi.setMuted(muted);   // 恢复静音状态
    applyBgmVol();              // 恢复 BGM 音量档
    STG.midi.play(C.BGM_STAGE);   // 道中曲开跑
  }

  // ── 移动端触摸(摇杆 + 右侧按钮 + 双指低速) ──
  function initTouch() {
    // 收紧检测: 需要 touch 事件 + 粗指针(触摸屏), 触控板(maxTouchPoints>0)不算; ?forcetouch 可在桌面预览
    var isTouch = /forcetouch/i.test(window.location.search) ||
      (('ontouchstart' in window) &&
      ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1)));
    if (!isTouch) return;
    touchEnabled = true;   // 仅触屏设备启用 setTouchUI 切换
    var ui = document.getElementById('touchUI');
    if (ui) ui.classList.remove('hide');
    var btnBomb = document.getElementById('btnBomb');

    function evPos(t) {
      var r = cv.getBoundingClientRect();
      return { x: (t.clientX - r.left) * (C.W / r.width), y: (t.clientY - r.top) * (C.H / r.height) };
    }
    // 触摸起点(轻点判定用)
    function touchStart(e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      var now = performance.now();
      // 双击: 350ms 内两次轻点(几乎无位移) → 放符卡
      if (now - touchState.lastTapT < 350 &&
          Math.abs(t.clientX - touchState.lastTapX) < 30 &&
          Math.abs(t.clientY - touchState.lastTapY) < 30) {
        touchState.lastTapT = 0;
        if (gameState === 'playing') doBomb();
        return;
      }
      touchState.lastTapT = now;
      touchState.lastTapX = t.clientX;
      touchState.lastTapY = t.clientY;
      if (gameState !== 'playing') return;
      if (touchState.dragId === null) {
        touchState.dragId = t.identifier;
        touchState.dragging = false;          // 移动超阈值才进入拖动
        touchState.sx = t.clientX;
        touchState.sy = t.clientY;
      }
    }
    function touchMove(e) {
      e.preventDefault();
      if (gameState !== 'playing' || touchState.dragId === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier !== touchState.dragId) continue;
        var dd = Math.abs(t.clientX - touchState.sx) + Math.abs(t.clientY - touchState.sy);
        if (!touchState.dragging && dd > 12) touchState.dragging = true;
        if (touchState.dragging) {
          var pp = evPos(t);
          STG.player.setTouchTarget({ x: pp.x, y: pp.y - 90 });   // 角色保持在手指上方 90px
        }
      }
    }
    function touchEnd(e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchState.dragId) {
          touchState.dragId = null;
          touchState.dragging = false;
          STG.player.setTouchTarget(null);   // 松手: 停止移动/停火
        }
      }
    }
    cv.addEventListener('touchstart', touchStart, { passive: false });
    cv.addEventListener('touchmove', touchMove, { passive: false });
    cv.addEventListener('touchend', touchEnd, { passive: false });
    cv.addEventListener('touchcancel', touchEnd, { passive: false });
    window.addEventListener('blur', function() { touchState.dragId = null; touchState.dragging = false; STG.player.setTouchTarget(null); });
    // 符卡按钮
    btnBomb.addEventListener('touchstart', function(e) { e.preventDefault(); if (gameState === 'playing') doBomb(); }, { passive: false });
  }

  // ── 调试模式(URL 带 ?debug 启用): 跳关 / 满P / 满符 / 无敌 ──
  var debugMode = /debug/i.test(window.location.search) || /debug/i.test(window.location.hash);
  var godOn = false;
  function ensurePlaying() {
    if (gameState !== 'playing') {
      if (optionPickActive) {
        optionPickActive = false;
        var t = document.getElementById('lvTitle');
        if (t) t.textContent = '选择你的魔法';
      }
      if (gameState === 'paused') document.getElementById('pauseOverlay').classList.add('hide');
      startGame(S.gun || 'chase');
    }
  }
  function debugGoto(stage) {
    ensurePlaying();
    S.stage = Math.max(1, Math.min(6, stage));
    S.wave = STG.WAVE_CFG.bossWave - 1;
    bossMode = false;
    STG.boss.clear();
    STG.enemies.clear();
    STG.bullets.clearAll();
    pendingStageClear = false;
    stageUpgrade = false;
    clearT = 0;
    warningT = 0;
    stageTitleT = 1.0;
    STG.engine.label(C.W / 2, 60, 'DEBUG → STAGE ' + S.stage + ' BOSS', '#ff9db8', 15);
    nextWave();   // 直接触发第 20 波: WARNING + Boss 登场
  }
  function debugMaxPower() {
    ensurePlaying();
    S.power = S.powerMax;
    STG.engine.label(STG.player.x, STG.player.y - 46, 'POWER MAX', '#f0c060', 14);
  }
  function debugFullBombs() {
    ensurePlaying();
    S.bombs = S.bombsMax;
    STG.engine.label(STG.player.x, STG.player.y - 46, '符卡补满', '#7cc4ff', 14);
  }
  function debugInvuln(btn) {
    ensurePlaying();
    godOn = !godOn;
    STG.player.invuln = godOn ? 9999999 : 0;
    if (btn) { btn.classList.toggle('dbg-on', godOn); btn.textContent = godOn ? '无敌✓' : '无敌'; }
    STG.engine.label(STG.player.x, STG.player.y - 46, godOn ? '无敌 ON' : '无敌 OFF', '#b89fff', 13);
  }
  function buildDebugBar() {
    var bar = document.createElement('div');
    bar.id = 'dbgBar';
    var html = '<span class="dbg-t">DEBUG</span><span class="dbg-s">跳关</span>';
    for (var i = 1; i <= 6; i++) html += '<button class="dbg-btn" data-dbg="goto" data-n="' + i + '">' + i + '</button>';
    html += '<span class="dbg-s">·</span>' +
      '<button class="dbg-btn" data-dbg="power">满P</button>' +
      '<button class="dbg-btn" data-dbg="bomb">满符</button>' +
      '<button class="dbg-btn" data-dbg="god" id="dbgGod">无敌</button>';
    bar.innerHTML = html;
    document.body.appendChild(bar);
    bar.addEventListener('click', function(e) {
      var b = e.target.closest('button[data-dbg]');
      if (!b) return;
      var k = b.getAttribute('data-dbg');
      if (k === 'goto') debugGoto(parseInt(b.getAttribute('data-n'), 10));
      else if (k === 'power') debugMaxPower();
      else if (k === 'bomb') debugFullBombs();
      else if (k === 'god') debugInvuln(b);
    });
  }

  // ── 在线排行榜(api/leaderboard.php?game=stg) ──
  function lbEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function lbRender(data) {
    var area = document.getElementById('lbArea');
    if (!area) return;
    var html = '<div class="lb-mini"><div class="lb-t">🏆 星之魔弹排行</div>';
    if (!data.length) html += '<div class="lb-empty">暂无记录 · 来抢第一</div>';
    for (var i = 0; i < Math.min(5, data.length); i++) {
      var d = data[i];
      html += '<div class="lb-row"><span class="lb-rank">' + (i + 1) + '</span><span class="lb-name">' + lbEsc(d.name || '匿名') + '</span><span class="lb-score">' + pad(Number(d.score) || 0) + '</span></div>';
    }
    html += '</div>';
    area.innerHTML = html;
  }
  function lbRenderToy(area, list) {
    var html = '<div class="lb-mini"><div class="lb-t">🏆 B站排行 · 星之魔弹</div>';
    if (!list.length) html += '<div class="lb-empty">暂无记录 · 来抢第一</div>';
    for (var i = 0; i < Math.min(5, list.length); i++) {
      var d = list[i];
      html += '<div class="lb-row"><span class="lb-rank">' + (d.rank || i + 1) + '</span>' +
        (d.avatar ? '<img class="lb-ava" src="' + lbEsc(d.avatar) + '">' : '') +
        '<span class="lb-name">' + lbEsc(d.nickname || '匿名') + '</span>' +
        '<span class="lb-score">' + pad(Number(d.score) || 0) + '</span></div>';
    }
    html += '</div>';
    area.innerHTML = html;
  }
  function loadLB() {
    try {
      var area = document.getElementById('lbArea');
      if (!area) return;
      // Toy 平台: 官方排行榜 SDK(getRankList 游客可读)
      if (window.toy) {
        window.toy.getRankList({ board: 1, limit: 5 }).then(function(list) {
          lbRenderToy(area, list || []);
        }).catch(function() {});
        return;
      }
      fetch(API_BASE + 'api/leaderboard.php?game=stg', { headers: { 'Authorization': 'Bearer ' + Auth.token() } })
        .then(function(r) {
          if (r.status === 401) {
            area.innerHTML = '<div class="lb-mini"><div class="lb-t">🏆 星之魔弹排行</div><div class="lb-empty">登录后查看排行并上榜</div></div>';
            return null;
          }
          return r.json();
        })
        .then(function(j) { if (j) lbRender(Array.isArray(j) ? j : (j.list || [])); })
        .catch(function() {});
    } catch (e) { /* 排行榜加载失败不影响游戏启动 */ }
  }
  function submitLB() {
    try {
      if (debugMode || S.score <= 0) return;   // debug 局不入榜
      // Toy 平台: 官方排行上报(服务端只保留历史最高分, 重复上报安全)
      if (window.toy) {
        window.toy.submitScore({ board: 1, score: S.score })
          .then(function() {
            STG.engine.label(C.W / 2, 300, '已上报 B站排行', '#ffe8b0', 13);
            loadLB();
          })
          .catch(function() { STG.engine.label(C.W / 2, 300, '登录 B站 后可上榜', '#8a7e9a', 12); });
        return;
      }
      var form = new FormData();
      form.append('score', String(S.score));
      form.append('graze', String(S.graze));
      form.append('game', 'stg');
      fetch(API_BASE + 'api/leaderboard.php', { method: 'POST', body: form, headers: { 'Authorization': 'Bearer ' + Auth.token() } })
        .then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j }; }); })
        .then(function(res) {
          if (res.status === 401) { STG.engine.label(C.W / 2, 300, '登录后可提交成绩上榜', '#8a7e9a', 12); return; }
          if (res.body && res.body.ok) {
            STG.engine.label(C.W / 2, 300, '上榜成功 · 第 ' + res.body.rank + ' 名', '#ffe8b0', 14);
            loadLB();
          }
        })
        .catch(function() {});
    } catch (e) { /* 提交失败不影响结算 */ }
  }

  // ── 启动 ──
  function boot() {
    document.addEventListener('keydown', function(e) { onKey(e, true); });
    document.addEventListener('keyup', function(e) { onKey(e, false); });
    // 失焦/切后台: 清空输入(防 keyup 丢失导致射击卡死)
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) clearInput();
    });
    document.getElementById('btnStart').addEventListener('click', showHowto);
    document.getElementById('btnHowtoGo').addEventListener('click', showGunSelect);
    document.getElementById('btnRestart').addEventListener('click', function() { startGame(S.gun); });
    document.getElementById('btnPause').addEventListener('click', function() { if (gameState === 'playing' || gameState === 'paused') togglePause(); });
    document.getElementById('btnResume').addEventListener('click', togglePause);
    document.getElementById('btnBuild').addEventListener('click', showBuild);
    document.getElementById('btnBuildBack').addEventListener('click', hideBuild);
    document.getElementById('btnMute').addEventListener('click', toggleMute);
    var mb = document.getElementById('btnMute');
    if (mb) mb.textContent = muted ? '🔇 音效关' : '🔊 音效开';   // 恢复上次静音偏好
    document.getElementById('btnBgm').addEventListener('click', function() { toggleBgmVol(this); });
    var bb = document.getElementById('btnBgm');
    if (bb) bb.textContent = bgmVolLabel();   // 恢复上次 BGM 音量档
    document.getElementById('btnPauseRestart').addEventListener('click', function() { togglePause(); startGame(S.gun); });
    initTouch();
    if (debugMode) buildDebugBar();
    STG.engine.initSky();
    STG.engine.preloadAll().then(function(a) {
      assets = a;
      STG.bullets.initPools();
      STG.bullets.initEB();
      STG.player.init(assets);
      syncMods();
      showTitle();
      loadLB();   // 排行榜在游戏就绪后加载(带保护, 不影响启动)
      requestAnimationFrame(loop);
    }).catch(function(err) { alert(err.message); });
  }

  document.addEventListener('DOMContentLoaded', boot);
  return {
    startGame: startGame,
    sfx: sfx,
    debugEnabled: debugMode,
    debug: { goto: debugGoto, maxPower: debugMaxPower, fullBombs: debugFullBombs, invuln: debugInvuln },
    getState: function() {
      return { state: gameState, hp: S.hp, bombs: S.bombs, score: S.score, stage: S.stage, wave: S.wave, level: S.level, xp: S.xp, power: S.power,
        bossMode: bossMode, stageTitleT: stageTitleT, clearT: clearT, waveT: waveT };
    }
  };
})();
