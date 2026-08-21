// =============================================
//  抽象角色大乱斗 · 引擎
//  固定矩形框 + 圆形碰撞体物理弹跳 + 技能自动触发 + 观战
//  玩家只负责: 选人 / 观战 / 重开
// =============================================
(function () {
  'use strict';

  var cvs = document.getElementById('game');
  var ctx = cvs.getContext('2d');
  var W = 480, H = 480;
  var DEG = Math.PI / 180;

  // ── 可调参数 ──
  var OPT = {
    STEP: 1 / 60,          // 物理固定步长
    REST_WALL: 0.94,       // 墙壁反弹系数
    REST_BALL: 0.92,       // 角色互撞弹性
    MIN_SPEED: 70,         // 死球保护速度
    KICK_TIME: 1.5,        // 随机动力脉冲间隔(秒)
    KICK_POWER: [50, 100], // 脉冲力度范围
    CHIP_DAMAGE: 20,       // 角色互撞擦伤伤害
    CHIP_CD: 0.4,          // 擦伤冷却
    BASE_SPEED: 170,       // 初始速度
    SPEED_JITTER: 50,      // 初始速度随机浮动
    ENRAGE_HP: 0.25,       // 残血狂暴线
    ENRAGE_CD: 0.5,        // 狂暴攻速倍率(间隔 × this)
    ENRAGE_DMG: 1.7,       // 狂暴伤害倍率
    SLOWMO_SCALE: 0.2,     // 击杀慢动作时间倍率
    SLOWMO_TIME: 1.1,      // 慢动作持续(秒)
    REST_OB: 0.6,          // 障碍反弹系数
    OB_DAM_CD: 0.9,        // 障碍撞击伤害冷却
    ATTRACT_RANGE: 260,    // 缠斗引力生效距离
    ATTRACT_POWER: 42      // 缠斗引力强度(保持对撞频率)
  };

  // ── DOM ──
  var el = {};
  ['ovSelect','ovResult','btnFight','btnAgain','btnPick','pickA','pickB',
   'resIcon','resTitle','resSub','seedInput','seedGo','p1Name','p2Name',
   'p1Hp','p2Hp','p1HpTxt','p2HpTxt','btnSfx','btnMusic','timer'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  // ── 状态 ──
  var state = 'select';          // select | count | fight | result
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  // ── 音效 / BGM ──
  // 策略: 有现成音频文件走文件, 没有则 WebAudio 合成兜底; ≥60ms 节流防刷屏
  var SND = (function () {
    var AC = null, sfxLast = {}, sfxMuted = false, bgmMuted = false;
    var files = {
      charge: 'audio/sfx/charge_up.wav',
      shatter: 'audio/sfx/shatter_glass.wav',
      splash: 'audio/sfx/splash.mp3',
      ko: 'audio/sfx/KO.mp3',
      victory: 'audio/sfx/victory.wav'
    };
    var loaded = {};
    function ensureAC() {
      if (AC) return AC;
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
      return AC;
    }
    function loadFile(name) {
      if (loaded[name] !== undefined) return loaded[name];
      loaded[name] = 'missing';
      try {
        var a = new Audio();
        a.src = files[name]; a.preload = 'auto';
        a.onerror = function () { loaded[name] = 'missing'; };
        loaded[name] = a;
      } catch (e) { loaded[name] = 'missing'; }
      return loaded[name];
    }
    function tone(opts) {
      var ac = ensureAC();
      if (!ac) return;
      var t0 = ac.currentTime;
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(opts.f0 || 440, t0);
      if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t0 + opts.dur);
      g.gain.setValueAtTime(opts.vol || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + opts.dur + 0.02);
    }
    function synth(name) {
      switch (name) {
        case 'hit_light': tone({ f0: 800, f1: 500, dur: 0.06, type: 'square', vol: 0.06 }); break;
        case 'hit_heavy': tone({ f0: 170, f1: 70, dur: 0.22, type: 'sawtooth', vol: 0.15 }); tone({ f0: 90, f1: 45, dur: 0.3, vol: 0.08 }); break;
        case 'charge': tone({ f0: 300, f1: 900, dur: 0.5, type: 'sine', vol: 0.07 }); break;
        case 'beam': tone({ f0: 1200, f1: 140, dur: 0.4, type: 'sawtooth', vol: 0.1 }); break;
        case 'dash': tone({ f0: 500, f1: 1100, dur: 0.18, type: 'triangle', vol: 0.09 }); break;
        case 'runaway': tone({ f0: 300, f1: 700, dur: 0.3, type: 'sine', vol: 0.1 }); tone({ f0: 500, f1: 900, dur: 0.25, type: 'sine', vol: 0.08 }); break;
      }
    }
    function play(name) {
      if (sfxMuted) return;
      var now = Date.now();
      if (sfxLast[name] && now - sfxLast[name] < 60) return;
      sfxLast[name] = now;
      if (files[name]) {
        var a = loadFile(name);
        if (a && a !== 'missing') {
          try { a.currentTime = 0; a.volume = 0.9; a.play(); } catch (e) {}
          return;
        }
      }
      synth(name);
    }
    var bgmEl = null, bgmNow = null;
    function playTheme(src) {
      if (bgmNow === src) { if (bgmEl && bgmEl.paused && !bgmMuted) { try { bgmEl.play(); } catch (e) {} } return; }
      bgmNow = src;
      if (bgmEl) { try { bgmEl.pause(); bgmEl.src = ''; } catch (e) {} }
      bgmEl = null;
      if (!src) return;
      try {
        bgmEl = new Audio();
        bgmEl.src = src; bgmEl.loop = true; bgmEl.volume = 0.45;
        if (!bgmMuted) bgmEl.play();
      } catch (e) { bgmEl = null; }
    }
    function themeOf(c) { return c.bgm || ''; }
    return {
      play: play, playTheme: playTheme, themeOf: themeOf,
      toggleSfx: function () { sfxMuted = !sfxMuted; return sfxMuted; },
      toggleBgm: function () { bgmMuted = !bgmMuted; if (bgmEl) { if (bgmMuted) bgmEl.pause(); else { try { bgmEl.play(); } catch (e) {} } } return bgmMuted; },
      isSfxMuted: function () { return sfxMuted; },
      isBgmMuted: function () { return bgmMuted; }
    };
  })();

  // 种子随机
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32((Math.random() * 1e9) | 0);
  var seed = 0;

  var fighters = [], orbs = [], beams = [], floats = [], particles = [];
  var shots = [], warns = [], obstacles = [];
  var shake = 0, timeScale = 1, targetTS = 1;
  var countT = 0, fightT = 0, slowmoT = 0, fightT_kick = -1;
  var overtime = false;
  var pickA = 0, pickB = 1;
  var pendingSeed = null;

  // ── 大门素材(许家印天降大门) ──
  var gateImg = new Image();
  gateImg.src = 'images/polo/damen.png';

  // ── 立绘加载 ──
  var placeCache = {};
  function makePlaceholder(char) {
    if (placeCache[char.id]) return placeCache[char.id];
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, char.color1);
    grad.addColorStop(1, char.color2);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 48px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(char.name.charAt(0), 64, 66);
    placeCache[char.id] = c;
    return c;
  }
  function loadImage(char, src) {
    var img = new Image();
    img.onload = function () { char._img = img; };
    img.onerror = function (e) {
      if (src !== char.imgFallback && char.imgFallback) { loadImage(char, char.imgFallback); }
    };
    img.src = src;
  }

  function makeFighter(char) {
    var sk = char.skill;
    var f = {
      char: char,
      x: 0, y: 0, vx: 0, vy: 0,
      r: char.radius,
      hp: char.maxHp, maxHp: char.maxHp, barHp: char.maxHp,
      enraged: false, flashT: 0, dead: false, chipCd: 0,
      cd: (sk.interval != null ? sk.interval : sk.milkInterval || 1) * 0.6, // 技能首次冷却(错开开局齐射)
      laser: null,             // 魔理沙专用
      orbs: [],                // 灵梦专用(玉角)
      shield: 0, shieldCd: 0, milkCd: sk.milkInterval || 0, regenCd: sk.regenInterval || 0,
      waterCd: sk.waterInterval || 0,
      dash: null,              // 猪冲刺状态
      dashHitCd: 0,            // 冲刺撞人冷却
      goStones: 0,             // 褚嬴已落子数
      revived: false,          // 许家印跑路标记
      invulnT: 0,              // 无敌计时(跑路)
      timeStop: false,         // 狗奶时停(发动后全场冻结)
      auraAcc: 0               // 时停光环伤害累积器
    };
    if (!char._img) { try { loadImage(char, char.img); } catch (e) {} }
    return f;
  }

  // ── 对局初始化 ──
  function newFight(seedVal) {
    seed = seedVal;
    pendingSeed = null;
    rng = mulberry32(seedVal);
    fighters = [makeFighter(POLO_CHARS[pickA]), makeFighter(POLO_CHARS[pickB])];
    orbs = []; beams = []; floats = []; particles = [];
    shots = []; warns = []; obstacles = [];
    shake = 0; timeScale = 1; targetTS = 1;
    fightT = 0; slowmoT = 0;
    overtime = false;

    var a = fighters[0], b = fighters[1];
    var sp = function () { return OPT.BASE_SPEED + rng() * OPT.SPEED_JITTER; };
    var ang = function () { return rng() * Math.PI * 2; };
    a.x = W * (0.22 + rng() * 0.14); a.y = H * (0.30 + rng() * 0.15);
    b.x = W * (0.64 + rng() * 0.14); b.y = H * (0.55 + rng() * 0.15);
    var da = ang(), db = ang();
    a.vx = Math.cos(da) * sp(); a.vy = Math.sin(da) * sp();
    b.vx = Math.cos(db) * sp(); b.vy = Math.sin(db) * sp();

    selText();
    state = 'count'; countT = 0;
    ovHide(el.ovResult);
    ovHide(el.ovSelect);
    // 开局 BGM: 优先选拥有专属 BGM 的一方, 双方都没有则静音
    var tmA = SND.themeOf(a.char), tmB = SND.themeOf(b.char);
    SND.playTheme(tmA || tmB);
  }

  function selText() {
    el.p1Name.textContent = POLO_CHARS[pickA].name;
    el.p2Name.textContent = POLO_CHARS[pickB].name;
  }

  // ── 伤害 ──
  function applyDamage(f, dmg, srcFighter, kx, ky, kb, big, pierce) {
    if (f.dead || state === 'select' || state === 'result') return;
    if (f.timeStop) return;       // 时停发动者: 免疫一切伤害
    if (f.invulnT > 0) return;
    var mul = f.enraged ? OPT.ENRAGE_DMG : 1;
    var eff = dmg * mul;
    // 一次性奶盾: 任意一击全额挡下, 盾碎反伤 (pierce 冲刺碎盾可无视)
    if (f.shield > 0 && !pierce) {
      f.shield = 0;
      addFloat(f.x, f.y - f.r - 34, '盾破!', '#ff7a7a', 19);
      SND.play('shatter');
      spawnSparks(f.x, f.y, '#7ce8ff', 16, 260);
      if (srcFighter && !srcFighter.dead) applyDamage(srcFighter, (f.char.skill && f.char.skill.reflect) || 35, f, -(kx || 0), -(ky || 0), 120, false);
      if (kx || ky) { f.vx += kx * kb * 0.4; f.vy += ky * kb * 0.4; }
      return;
    }
    var real = Math.min(f.hp, eff);
    f.hp -= real;
    f.flashT = 0.13;
    addFloat(f.x, f.y - f.r - 26, '-' + Math.round(real), big ? '#ffe066' : '#ff8a8a', big ? 26 : 17);
    if (kx || ky) { f.vx += kx * kb; f.vy += ky * kb; }
    shake = Math.min(12, shake + (big ? 5 : 2));
    if (big) spawnSparks(f.x, f.y, '#ffe066', 14, 320);
    else spawnSparks(f.x + kx * 8, f.y + ky * 8, f.char.color1, 5, 180);
    SND.play(big ? 'hit_heavy' : 'hit_light');

    // 残血狂暴
    if (!f.enraged && f.hp <= f.maxHp * OPT.ENRAGE_HP) {
      f.enraged = true;
      addFloat(W / 2, H / 2 - 60, f.char.name + ' 狂暴!', '#ff4d4d', 30, 1.2);
      addFloat(f.x, f.y - f.r - 14, '狂暴!', '#ff4d4d', 20, 1.2);
    }
    if (f.hp <= 0) {
      f.hp = 0;
      // 许家印: 首死卷款跑路
      if (f.char.skill.type === 'gate_revive' && !f.revived) {
        var foe = fighters[0] === f ? fighters[1] : fighters[0];
        f.revived = true;
        f.hp = Math.round(f.maxHp * f.char.skill.reviveHp);
        f.invulnT = f.char.skill.reviveInvuln;
        var a2 = Math.atan2(f.y - foe.y, f.x - foe.x);
        f.x = clamp(foe.x + Math.cos(a2) * W * 0.42, f.r + 24, W - f.r - 24);
        f.y = clamp(foe.y + Math.sin(a2) * W * 0.42, f.r + 24, H - f.r - 24);
        f.vx *= -1; f.vy *= -1;
        addFloat(W / 2, H / 2 - 60, '许家印跑路了!', '#7ce8ff', 26, 1.4);
        spawnSparks(f.x, f.y, '#7ce8ff', 20, 300);
        SND.play('runaway');
        return;
      }
      f.dead = true;
      finish(f);
    }
  }

  function finish(loser) {
    var winner = fighters[0].dead ? fighters[1] : fighters[0];
    SND.play('ko');
    targetTS = OPT.SLOWMO_SCALE;
    slowmoT = OPT.SLOWMO_TIME;
    shake = 14;
    spawnSparks(loser.x, loser.y, '#ffffff', 26, 420);
    addFloat(loser.x, loser.y - 30, 'KO!', '#ffffff', 40, 1.3);
    addFloat(W / 2, H / 2 - 120, winner.char.name + ' 获胜!', '#f0c060', 36, 1.4);
    el.resIcon.textContent = POLO_CHARS.indexOf(winner.char) === pickA ? '👑' : '🌟';
    el.resTitle.textContent = winner.char.name + ' 获胜';
    el.resSub.textContent = winner.char.name + ' 笑到了最后 · 用时 ' + fightT.toFixed(1) + 's';
    var s = String(seed).padStart ? String(seed).padStart(6, '0') : seed;
    el.seedInput.value = s;
    setTimeout(function () { showResult(); }, OPT.SLOWMO_TIME * 1000);
  }

  function showResult() {
    state = 'result';
    targetTS = 1;
    SND.play('victory');
    var w = fighters[0].dead ? fighters[1] : fighters[0];
    SND.playTheme(SND.themeOf(w.char));
    ovShow(el.ovResult);
  }

  // ── 飘字 / 粒子 ──
  function addFloat(x, y, text, color, size, life) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 17, t: 0, life: life || 0.9 });
  }
  function spawnSparks(x, y, color, n, spd) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, 7), s = rand(spd * 0.3, spd);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.3, 0.7), size: rand(1.5, 3.5), color: color });
    }
  }

  // ── 物理: 固定步长 ──
  function sim(dt) {
    if (state !== 'fight') return;
    fightT += dt;
    var i;
    // 随机动力脉冲: 保持局面活跃, 避免两球磨蹭成死局
    var kick = Math.floor(fightT / OPT.KICK_TIME);
    if (kick > fightT_kick) {
      fightT_kick = kick;
      for (i = 0; i < fighters.length; i++) {
        var fk = fighters[i];
        if (fk.dead) continue;
        var ka = rand(0, 6.2832), kp = rand(OPT.KICK_POWER[0], OPT.KICK_POWER[1]);
        fk.vx += Math.cos(ka) * kp; fk.vy += Math.sin(ka) * kp;
      }
    }
    // 时停探测: 狗奶满 readyTime 未败 → 发动「ザ・ワールド」
    var tstop = null;
    for (i = 0; i < fighters.length; i++) {
      var tfz = fighters[i];
      if (tfz.dead || tfz.char.skill.type !== 'milk_guard') continue;
      var rT = tfz.char.skill.readyTime || 15;
      if (!tfz.timeStop && fightT >= rT) {
        tfz.timeStop = true;
        targetTS = 0.25; slowmoT = 0.9;      // 变身瞬间短暂慢放
        shake = 16;
        addFloat(W / 2, H / 2 - 60, 'ザ・ワールド 时停!', '#ffe066', 40, 1.6);
        SND.play('beam');
        spawnSparks(W / 2, H / 2, '#ffe066', 40, 460);
      }
      if (tfz.timeStop) tstop = tfz;
    }
    for (i = 0; i < fighters.length; i++) {
      var f = fighters[i];
      if (f.dead) continue;
      // 时停: 全场冻结, 只保留血条动画、受击闪光与状态计时(无敌帧应在时空中自然流逝)
      if (tstop) {
        f.barHp += (f.hp - f.barHp) * Math.min(1, dt * 8);
        if (f.flashT > 0) f.flashT -= dt;
        if (f.invulnT > 0) f.invulnT -= dt;
        continue;
      }
      var mul = 1;
      if (f.char.speedMul) mul *= f.char.speedMul;
      if (f.laser && f.laser.phase === 'charge') mul = f.char.skill.chargeSpeedMul;
      if (f.invulnT > 0) f.invulnT -= dt;
      if (f.dashHitCd > 0) f.dashHitCd -= dt;
      f.x += f.vx * mul * dt;
      f.y += f.vy * mul * dt;
      // 墙
      if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx) * OPT.REST_WALL; }
      if (f.x > W - f.r) { f.x = W - f.r; f.vx = -Math.abs(f.vx) * OPT.REST_WALL; }
      if (f.y < f.r) { f.y = f.r; f.vy = Math.abs(f.vy) * OPT.REST_WALL; }
      if (f.y > H - f.r) { f.y = H - f.r; f.vy = -Math.abs(f.vy) * OPT.REST_WALL; }
      // 死球保护
      var sp2 = f.vx * f.vx + f.vy * f.vy;
      if (sp2 < OPT.MIN_SPEED * OPT.MIN_SPEED && state === 'fight') {
        var da2 = rand(0, 7);
        f.vx += Math.cos(da2) * 60 * dt; f.vy += Math.sin(da2) * 60 * dt;
        var s = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
        if (s > 0) { f.vx = f.vx / s * OPT.MIN_SPEED; f.vy = f.vy / s * OPT.MIN_SPEED; }
      }
      // 血条动画 / 闪光
      f.barHp += (f.hp - f.barHp) * Math.min(1, dt * 8);
      if (f.flashT > 0) f.flashT -= dt;
      if (f.chipCd > 0) f.chipCd -= dt;
      updateSkill(f, dt);
    }
    // 时停: 金色光环每秒 5 次 10 伤磨死敌人
    if (tstop) {
      var foeT = fighters[0] === tstop ? fighters[1] : fighters[0];
      if (!foeT.dead && !foeT.timeStop) {
        tstop.auraAcc += dt * (tstop.char.skill.auraTicks || 5);
        while (tstop.auraAcc >= 1) {
          tstop.auraAcc -= 1;
          if (foeT.invulnT > 0) continue;
          applyDamage(foeT, tstop.char.skill.auraDmg || 10, tstop, 0, 0, 0, false);
        }
      }
    }
    // 加时狂暴: 45秒后全员狂暴 + 擦伤翻三倍, 保证对局收尾
    if (fightT > 45) {
      overtime = true;
      for (i = 0; i < fighters.length; i++) {
        var fe = fighters[i];
        if (!fe.enraged && !fe.dead) {
          fe.enraged = true;
          addFloat(fe.x, fe.y - fe.r - 14, '加时狂暴!', '#ffb347', 20, 1.2);
        }
      }
    }
    // 90秒强制结算: 血量百分比高者胜(观战不设平局)
    if (fightT >= 90 && !fighters[0].dead && !fighters[1].dead) {
      var h1 = fighters[0].hp / fighters[0].maxHp, h2 = fighters[1].hp / fighters[1].maxHp;
      var loser = h1 <= h2 ? fighters[0] : fighters[1];
      loser.hp = 0; loser.dead = true;
      addFloat(W / 2, H / 2 - 80, '时间耗尽 · 按血量判定', '#f0c060', 22, 2.0);
      finish(loser);
    }
    // 缠斗引力: 距离超过 260 时轻微相吸, 保证擦伤/互撞密度(加时翻三倍强制收尾)
    if (!tstop && !fighters[0].dead && !fighters[1].dead) {
      var gdx = fighters[1].x - fighters[0].x, gdy = fighters[1].y - fighters[0].y;
      var gd = Math.sqrt(gdx * gdx + gdy * gdy);
      if (gd > OPT.ATTRACT_RANGE && gd > 0.001) {
        var gx2 = gdx / gd, gy2 = gdy / gd;
        var gv = OPT.ATTRACT_POWER * (overtime ? 3 : 1) * dt;
        if (fighters[0].invulnT <= 0) { fighters[0].vx += gx2 * gv; fighters[0].vy += gy2 * gv; }
        if (fighters[1].invulnT <= 0) { fighters[1].vx -= gx2 * gv; fighters[1].vy -= gy2 * gv; }
      }
    }
    // 角色互撞 (擦伤 + 弹性反弹)
    var a = fighters[0], b = fighters[1];
    if (!tstop && !a.dead && !b.dead) {
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
      var rr = a.r + b.r;
      if (d < rr && d > 0.001) {
        var nx = dx / d, ny = dy / d;
        var push = (rr - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        var rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          var j = -(1 + OPT.REST_BALL) * rvn / 2;
          a.vx -= nx * j; a.vy -= ny * j;
          b.vx += nx * j; b.vy += ny * j;
        }
        if (a.chipCd <= 0 && b.chipCd <= 0) {
          a.chipCd = OPT.CHIP_CD; b.chipCd = OPT.CHIP_CD;
          var chipDmg = overtime ? OPT.CHIP_DAMAGE * 3 : OPT.CHIP_DAMAGE;
          var aArmor = !!a.dash, bArmor = !!b.dash;   // 冲刺期间免擦伤
          // 蓄力狗奶: 站桩闭门, 互撞双方都不受擦伤(技能伤害照吃)
          var aGod = a.char.skill.type === 'milk_guard' && !a.timeStop && fightT < (a.char.skill.readyTime || 15);
          var bGod = b.char.skill.type === 'milk_guard' && !b.timeStop && fightT < (b.char.skill.readyTime || 15);
          // 互撞伤害 = 撞击方(对方)的碰撞值: 大运撞人 300, 常规 20; 蓄力狗奶双向免疫擦伤
          if (!aArmor && !aGod) applyDamage(a, b.char.collideDmg || chipDmg, b, -nx, -ny, 60, false);
          if (!bArmor && !bGod) applyDamage(b, a.char.collideDmg || chipDmg, a, nx, ny, 60, false);
        }
      }
    }
    // 猪冲刺
    for (i = 0; i < fighters.length; i++) {
      if (tstop) break;          // 时停: 冲刺凝固
      var pd = fighters[i];
      if (!pd.dash || pd.dead) continue;
      pd.dash.t += dt;
      var dsp = OPT.BASE_SPEED * pd.char.skill.dashMult;
      pd.x += pd.dash.dx * dsp * dt;
      pd.y += pd.dash.dy * dsp * dt;
      var bone = false;
      if (pd.x < pd.r) { pd.x = pd.r; bone = true; }
      if (pd.x > W - pd.r) { pd.x = W - pd.r; bone = true; }
      if (pd.y < pd.r) { pd.y = pd.r; bone = true; }
      if (pd.y > H - pd.r) { pd.y = H - pd.r; bone = true; }
      var pfoe = fighters[0] === pd ? fighters[1] : fighters[0];
      if (!pfoe.dead && pfoe.invulnT <= 0) {
        var pdx = pfoe.x - pd.x, pdy = pfoe.y - pd.y;
        var pdd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdd < pd.r + pfoe.r + 16 && pd.dashHitCd <= 0) {
          pd.dashHitCd = 0.5;
          // 冲刺物理破盾: 直接撞碎一次性奶盾(盾不挡, 无反伤)
          if (pfoe.shield > 0) {
            pfoe.shield = 0;
            addFloat(pfoe.x, pfoe.y - pfoe.r - 34, '盾碎!', '#7ce8ff', 15);
            spawnSparks(pfoe.x, pfoe.y, '#7ce8ff', 8, 200);
          }
          applyDamage(pfoe, pd.char.skill.dashDamage, pd, pdx / (pdd || 1), pdy / (pdd || 1), pd.char.skill.dashKnock, false, true);
        } else if (pdd < 80 && pd.dashHitCd <= 0) {
          // 冲刺冲击波: 擦身而过也能刮到
          pd.dashHitCd = 0.5;
          applyDamage(pfoe, 30, pd, pdx / (pdd || 1), pdy / (pdd || 1), 90, false);
        }
      }
      // 冲刺免擦伤: 双方互撞判定会基于 dash 覆盖层, 这里直接拆弹
      if (Math.random() < 0.5) {
        particles.push({ x: pd.x + rand(-10, 10), y: pd.y + rand(-6, 6), vx: rand(-50, -pd.dash.dx * 60), vy: rand(-20, 20), t: 0, life: 0.4, size: rand(2, 4.5), color: '#e8c08a' });
      }
      if (pd.dash.t >= pd.dash.dur || bone) pd.dash = null;
    }
    // 预警 → 砸落(褚嬴棋子 / 许家印天降大门)
    for (i = warns.length - 1; i >= 0; i--) {
      if (tstop) break;          // 时停: 预警凝固, 不会落下
      var wn = warns[i];
      wn.t += dt;
      if (wn.t < wn.dur) continue;
      warns.splice(i, 1);
      var wo = wn.owner;
      var sk2 = wo.char.skill;
      if (wn.kind === 'gate') {
        // 天降大门: 落下后成障碍(方形碰撞体), 落地瞬间冲击范围伤害
        obstacles.push({ x: wn.x, y: wn.y, life: sk2.gateLife, damCd: 0, dmg: sk2.gateDamage, knock: sk2.gateKnock, kind: 'gate', owner: wo, fallT: 0, fallDur: sk2.gateFall || 0.3 });
        addFloat(wn.x, wn.y - 30, '天降大门!', '#ff9a3c', 18);
        SND.play('dash');
        continue;
      }
      // 褚嬴落子
      var isWhite = wn.type === 'white';
      var landed = 0;
      for (var li = 0; li < obstacles.length; li++) if (obstacles[li].kind === 'stone' && obstacles[li].owner === wo) landed++;
      if (landed >= sk2.maxStones) {
        for (var ri = 0; ri < obstacles.length; ri++) {
          if (obstacles[ri].kind === 'stone' && obstacles[ri].owner === wo) { obstacles.splice(ri, 1); break; }
        }
      }
      obstacles.push({ x: wn.x, y: wn.y, r: sk2.stoneRadius, life: sk2.stoneLife, damCd: 0, dmg: 0, kind: 'stone', type: wn.type, owner: wo });
      wo.goStones++;
      for (var dit = 0; dit < 2; dit++) {
        var tf = fighters[dit];
        if (tf.dead || tf === wo) continue;   // 棋子不砸自己人
        var sdx = tf.x - wn.x, sdy = tf.y - wn.y;
        var sd = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sd < wn.r + tf.r) {
          var inner = sd < wn.r * 0.6;
          var ndx = sd > 0.001 ? sdx / sd : 0, ndy = sd > 0.001 ? sdy / sd : 0;
          var sdmg = isWhite ? (inner ? sk2.whiteDamage : sk2.whiteEdge) : (inner ? (sk2.innerDamage || 90) : sk2.damage);
          applyDamage(tf, sdmg, wo, ndx, ndy, sk2.knockback, inner);
        }
      }
      // 白子: 砸落轻伤后放出追踪小棋
      if (isWhite) {
        var foeW = fighters[0] === wo ? fighters[1] : fighters[0];
        var tn = sk2.trackN || 2;
        for (var tqi = 0; tqi < tn; tqi++) {
          if (foeW.dead) break;
          var ta = Math.atan2(foeW.y - wn.y, foeW.x - wn.x) + (tqi === 0 ? 0 : rand(-0.55, 0.55));
          shots.push({ x: wn.x, y: wn.y, vx: Math.cos(ta) * sk2.trackSpeed, vy: Math.sin(ta) * sk2.trackSpeed, r: 25, dmg: sk2.trackDamage, life: 3, t: 0, owner: wo, homing: true, target: foeW, turn: 3.5 });
        }
        spawnSparks(wn.x, wn.y, '#f5f2ea', 10, 220);
      }
      shake = Math.max(shake, isWhite ? 5 : 7);
      spawnSparks(wn.x, wn.y, isWhite ? '#f5f2ea' : '#9a9ab0', isWhite ? 8 : 12, 240);
      SND.play('hit_heavy');
    }
    // 障碍(残留棋子 / 大门): 双方都挡
    for (i = obstacles.length - 1; i >= 0; i--) {
      if (tstop) break;          // 时停: 障碍凝固
      var ob = obstacles[i];
      ob.life -= dt;
      if (ob.life <= 0) { obstacles.splice(i, 1); continue; }
      // 大门下落动画: 落地前不参与碰撞
      if (ob.kind === 'gate' && ob.fallT < ob.fallDur) {
        ob.fallT += dt;
        if (ob.fallT >= ob.fallDur) {
          shake = Math.max(shake, 9);
          SND.play('hit_heavy');
          spawnSparks(ob.x, ob.y, '#caa86a', 14, 260);
          for (var dg = 0; dg < 2; dg++) {
            var dfg = fighters[dg];
            if (dfg.dead || dfg.invulnT > 0) continue;
            var gdx2 = dfg.x - ob.x, gdy2 = dfg.y - ob.y;
            var gdd = Math.sqrt(gdx2 * gdx2 + gdy2 * gdy2);
            var gr = (ob.owner.char.skill.gateShockR || 46) + dfg.r;
            if (gdd < gr) {
              var gndx = gdd > 0.001 ? gdx2 / gdd : 0, gndy = gdd > 0.001 ? gdy2 / gdd : 0;
              applyDamage(dfg, ob.dmg, ob.owner, gndx, gndy, 170, true);
            }
          }
        }
        continue;
      }
      if (ob.damCd > 0) ob.damCd -= dt;
      for (var j = 0; j < 2; j++) {
        var fj = fighters[j];
        if (fj.dead) continue;
        // 大门: 方形碰撞体(对齐视觉 220×156, 圆-矩形最近点法); 其余障碍: 圆形碰撞
        var hit = false, onx = 0, ony = 0, pen = 0;
        if (ob.kind === 'gate') {
          var hw = 110, hh = 78;
          var cx = clamp(fj.x, ob.x - hw, ob.x + hw);
          var cy = clamp(fj.y, ob.y - hh, ob.y + hh);
          var ddx = fj.x - cx, ddy = fj.y - cy;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < fj.r * fj.r) {
            hit = true;
            if (d2 < 0.001) { onx = fj.x < ob.x ? -1 : 1; ony = 0; pen = fj.r; }
            else {
              var dd = Math.sqrt(d2);
              onx = ddx / dd; ony = ddy / dd; pen = fj.r - dd;
            }
          }
        } else {
          var obx = fj.x - ob.x, oby = fj.y - ob.y;
          var obd = Math.sqrt(obx * obx + oby * oby);
          var obr = fj.r + ob.r;
          if (obd < obr && obd > 0.001) {
            hit = true; onx = obx / obd; ony = oby / obd; pen = obr - obd;
          }
        }
        if (hit) {
          fj.x += onx * pen; fj.y += ony * pen;
          var rvn = fj.vx * onx + fj.vy * ony;
          if (rvn < 0) {
            fj.vx -= onx * rvn * (1 + OPT.REST_OB);
            fj.vy -= ony * rvn * (1 + OPT.REST_OB);
          }
          // 大门不认人: 许家印自己撞自己的门也掉血(平衡代价); 其余障碍不伤自己人
          if (ob.dmg > 0 && ob.damCd <= 0 && (ob.kind === 'gate' || fj !== ob.owner)) {
            ob.damCd = OPT.OB_DAM_CD;
            applyDamage(fj, ob.dmg, ob.owner, onx, ony, ob.knock || 0, false);
          }
        }
      }
    }
    // 飞行物(奶弹 / 白子追踪小棋 / 美团外卖袋)
    for (i = shots.length - 1; i >= 0; i--) {
      if (tstop) break;          // 时停: 飞行物凝固
      var sh = shots[i];
      sh.t += dt;
      if (sh.homing && sh.target && !sh.target.dead) {
        var want = Math.atan2(sh.target.y - sh.y, sh.target.x - sh.x);
        var cur = Math.atan2(sh.vy, sh.vx);
        var diff = want - cur;
        while (diff > Math.PI) diff -= 6.2832;
        while (diff < -Math.PI) diff += 6.2832;
        var trn = clamp(diff, -(sh.turn || 0) * dt, (sh.turn || 0) * dt);
        var tsp = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
        sh.vx = Math.cos(cur + trn) * tsp;
        sh.vy = Math.sin(cur + trn) * tsp;
      }
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (sh.t >= sh.life || sh.x < 0 || sh.x > W || sh.y < 0 || sh.y > H) {
        if (sh.kind === 'meal') spawnMealBox(sh);
        shots.splice(i, 1);
        continue;
      }
      for (var sd2 = 0; sd2 < 2; sd2++) {
        var sf2 = fighters[sd2];
        if (sf2.dead || sf2 === sh.owner || sf2.invulnT > 0) continue;
        var shx = sf2.x - sh.x, shy = sf2.y - sh.y;
        var shd = Math.sqrt(shx * shx + shy * shy);
        if (shd < sf2.r + sh.r) {
          shots.splice(i, 1);
          applyDamage(sf2, sh.dmg, sh.owner, shx / (shd || 1), shy / (shd || 1), 80, false);
          if (sh.kind === 'meal' && sh.owner && !sh.owner.dead) {
            var mealHeal = sh.owner.char.skill.heal || 0;
            if (mealHeal > 0 && sh.owner.hp < sh.owner.maxHp) {
              sh.owner.hp = Math.min(sh.owner.maxHp, sh.owner.hp + mealHeal);
              addFloat(sh.owner.x, sh.owner.y - sh.owner.r - 26, '+' + mealHeal, '#7ce8a0', 15);
            }
            spawnMealBox(sh);
          }
          spawnSparks(sf2.x, sf2.y, sh.kind === 'meal' ? '#ffb400' : '#e8e0c8', 6, 140);
          SND.play('splash');
          break;
        }
      }
    }
    // 阴阳玉
    for (i = 0; i < orbs.length; i++) {
      if (tstop) break;          // 时停: 阴阳玉凝固
      var o = orbs[i];
      var foe = o.owner === a ? b : a;
      // 玉有轻微对敌引力: 距离近时角速度向敌人方向歪(保持旋转观感)
      var steer = 0;
      if (!foe.dead) {
        var tAng = Math.atan2(foe.y - o.owner.y, foe.x - o.owner.x);
        var dAng = tAng - o.ang;
        while (dAng > Math.PI) dAng -= 6.2832;
        while (dAng < -Math.PI) dAng += 6.2832;
        var dFoe = Math.sqrt((foe.x - o.owner.x) * (foe.x - o.owner.x) + (foe.y - o.owner.y) * (foe.y - o.owner.y));
        if (dFoe < 220) steer = clamp(dAng, -3.2, 3.2) * (1 - dFoe / 260);
      }
      o.ang += (o.spd + steer) * dt;
      o.spin += o.spinSpeed * dt;
      if (o.cd > 0) o.cd -= dt;
      o.x = o.owner.x + Math.cos(o.ang) * o.orbit;
      o.y = o.owner.y + Math.sin(o.ang) * o.orbit;
      if (!foe.dead && o.cd <= 0) {
        var odx = foe.x - o.x, ody = foe.y - o.y;
        var od = Math.sqrt(odx * odx + ody * ody);
        var orr = o.r + foe.r;
        if (od < orr && od > 0.001) {
          o.cd = o.owner.char.skill.orbCd;
          applyDamage(foe, o.dmg, o.owner, odx / od, ody / od, o.kb, false);
        }
      }
    }
    // 激光(含扫射: 光束朝敌人方向缓慢偏转追尾)
    for (i = 0; i < beams.length; i++) {
      if (tstop) break;          // 时停: 激光凝固
      var bm = beams[i];
      bm.t += dt;
      if (bm.t >= bm.total) { beams.splice(i, 1); i--; continue; }
      if (bm.turn && bm.foe && !bm.foe.dead) {
        var aimB = Math.atan2(bm.foe.y - bm.y0, bm.foe.x - bm.x0);
        var curB = Math.atan2(bm.dy, bm.dx);
        var ddB = aimB - curB;
        while (ddB > Math.PI) ddB -= 6.2832;
        while (ddB < -Math.PI) ddB += 6.2832;
        var rotB = clamp(ddB, -bm.turn * dt, bm.turn * dt);
        if (rotB !== 0) {
          var cB = Math.cos(curB + rotB), sB = Math.sin(curB + rotB);
          bm.dx = cB; bm.dy = sB;
          var segB = laserSegment(bm.x0, bm.y0, bm.dx, bm.dy);
          bm.x1 = segB.x1; bm.y1 = segB.y1; bm.len = segB.t1;
        }
      }
      if (!bm.hit && bm.foe && !bm.foe.dead) {
        var c = bm.caster, ex = bm.foe.x - c.x, ey = bm.foe.y - c.y;
        var t = ex * bm.dx + ey * bm.dy;
        if (t >= 0 && t <= bm.len) {
          var px = c.x + bm.dx * t, py = c.y + bm.dy * t;
          var dd = Math.sqrt((bm.foe.x - px) * (bm.foe.x - px) + (bm.foe.y - py) * (bm.foe.y - py));
          if (dd < bm.halfW + bm.foe.r) {
            bm.hit = true;
            applyDamage(bm.foe, bm.dmg, c, bm.dx, bm.dy, bm.kb, true);
          }
        }
      }
    }
    // 粒子
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
      if (p.t >= p.life) particles.splice(i, 1);
    }
    // 飘字
    for (i = floats.length - 1; i >= 0; i--) {
      var fl = floats[i];
      fl.t += dt;
      fl.y -= 34 * dt;
      if (fl.t >= fl.life) floats.splice(i, 1);
    }
  }

  // ── 技能 ──
  function updateSkill(f, dt) {
    var sk = f.char.skill;
    if (sk.type === 'orbit_orb') {
      f.cd -= dt;
      if (f.cd <= 0 && !f.dead) {
        f.cd = sk.interval * (f.enraged ? OPT.ENRAGE_CD : 1);
        orbs.push({
          owner: f, ang: rand(0, 7), spd: sk.orbitSpeed * DEG, spin: rand(0, 7), spinSpeed: -1.5,
          orbit: sk.orbRadius, r: sk.orbSize, dmg: sk.orbDamage, kb: sk.knockback, cd: 0
        });
      }
    } else if (sk.type === 'laser') {
      if (!f.laser) f.laser = { phase: 'idle', t: 0, dir: 0 };
      var L = f.laser;
      if (L.phase === 'idle') {
        f.cd -= dt;
        if (f.cd <= 0 && !f.dead) {
          f.cd = sk.interval * (f.enraged ? OPT.ENRAGE_CD : 1);
          L.phase = 'charge'; L.t = 0;
          // 蓄力锁定: 预判敌人 leadTime 秒后的走位(带少量随机, 保持"普通魔法使"感)
          var foeL = fighters[0] === f ? fighters[1] : fighters[0];
          if (!foeL.dead) {
            var lt = sk.leadTime || 1;
            L.dir = Math.atan2(foeL.y + foeL.vy * lt - f.y, foeL.x + foeL.vx * lt - f.x) + rand(-0.18, 0.18);
          } else {
            L.dir = rand(0, 6.2832);
          }
          SND.play('charge');
        }
      } else if (L.phase === 'charge') {
        L.t += dt;
        if (L.t >= sk.chargeTime) {
          L.phase = 'beam'; L.t = 0;
          SND.play('beam');
          var dx = Math.cos(L.dir), dy = Math.sin(L.dir);
          var seg = laserSegment(f.x, f.y, dx, dy);
          var foe = fighters[0] === f ? fighters[1] : fighters[0];
          beams.push({
            caster: f, foe: foe, dx: dx, dy: dy,
            x0: f.x, y0: f.y, x1: seg.x1, y1: seg.y1,
            len: seg.t1,
            halfW: sk.beamWidth / 2, dmg: sk.damage, kb: sk.knockback,
            duration: sk.beamTime, total: sk.beamTime, t: 0, hit: false,
            turn: sk.beamTurn || 0
          });
          shake = Math.max(shake, 8);
        }
      } else if (L.phase === 'beam') {
        L.t += dt;
        if (L.t >= sk.beamTime + 0.15) L.phase = 'idle';
      }
    } else if (sk.type === 'go_stone') {
      f.cd -= dt;
      if (f.cd <= 0 && !f.dead) {
        var grow = Math.floor(f.goStones / sk.growEvery) * sk.growStep;
        f.cd = Math.max(sk.interval - grow, sk.intervalMin) * (f.enraged ? OPT.ENRAGE_CD : 1);
        var foeS = fighters[0] === f ? fighters[1] : fighters[0];
        var sx = clamp(foeS.x + rand(-60, 60), 42, W - 42);
        var sy = clamp(foeS.y + rand(-60, 60), 42, H - 42);
        warns.push({ x: sx, y: sy, r: sk.aoe, t: 0, dur: sk.warnTime, owner: f, type: rng() < 0.5 ? 'black' : 'white' });
      }
    } else if (sk.type === 'desert_dash') {
      if (!f.dash) {
        f.cd -= dt;
        if (f.cd <= 0 && !f.dead) {
          f.cd = sk.interval * (f.enraged ? OPT.ENRAGE_CD : 1);
          var foeP = fighters[0] === f ? fighters[1] : fighters[0];
          // 朝敌人方向冲刺(带 ±40° 随机, 保持"溜达"感)
          var dAng2 = Math.atan2(foeP.y - f.y, foeP.x - f.x) + rand(-0.7, 0.7);
          f.dash = { t: 0, dur: sk.dashTime, dx: Math.cos(dAng2), dy: Math.sin(dAng2) };
          SND.play('dash');
        }
      }
      f.waterCd -= dt;
      if (f.waterCd <= 0 && f.hp > 0 && f.hp < f.maxHp) {
        f.waterCd = sk.waterInterval;
        f.hp = Math.min(f.maxHp, f.hp + sk.waterHeal);
        addFloat(f.x, f.y - f.r - 26, '+' + sk.waterHeal, '#7ce8a0', 16);
      }
    } else if (sk.type === 'milk_guard') {
      // 蓄力期: 全部技能禁用, cd 冻结; 15s 后由 sim() 时停逻辑接管, 此处无事可做
      if (fightT < (sk.readyTime || 15)) return;
    } else if (sk.type === 'gate_revive') {
      f.cd -= dt;
      if (f.cd <= 0 && !f.dead) {
        f.cd = sk.interval * (f.enraged ? OPT.ENRAGE_CD : 1);
        var foeG = fighters[0] === f ? fighters[1] : fighters[0];
        var cnt = 0;
        for (var gi = 0; gi < obstacles.length; gi++) if (obstacles[gi].kind === 'gate' && obstacles[gi].owner === f) cnt++;
        if (cnt < sk.maxGates && !foeG.dead) {
          // 预判敌人 0.3s 后的位置, 预警天降大门
          var gx = clamp(foeG.x + foeG.vx * 0.3, 30, W - 30);
          var gy = clamp(foeG.y + foeG.vy * 0.3, 30, H - 30);
          warns.push({ x: gx, y: gy, r: (sk.gateShockR || 46) + 8, t: 0, dur: 0.5, owner: f, kind: 'gate' });
          SND.play('charge');
        }
      }
    } else if (sk.type === 'deliver') {
      f.cd -= dt;
      if (f.cd <= 0 && !f.dead) {
        f.cd = sk.interval * (f.enraged ? OPT.ENRAGE_CD : 1);
        var foeX = fighters[0] === f ? fighters[1] : fighters[0];
        if (!foeX.dead) {
          var xAng = Math.atan2(foeX.y - f.y, foeX.x - f.x);
          shots.push({ x: f.x + Math.cos(xAng) * (f.r + 6), y: f.y + Math.sin(xAng) * (f.r + 6), vx: Math.cos(xAng) * sk.throwSpeed, vy: Math.sin(xAng) * sk.throwSpeed, r: 45, dmg: sk.throwDamage, life: 4, t: 0, owner: f, kind: 'meal' });
          SND.play('dash');
        }
      }
    }
  }

  // 外卖袋落地: 生成外卖箱障碍(同场上限, 超限顶掉最旧)
  function spawnMealBox(sh) {
    if (!sh.owner || sh.owner.dead) return;
    var mk = sh.owner.char.skill;
    var cnt = 0;
    for (var bi = 0; bi < obstacles.length; bi++) {
      if (obstacles[bi].kind === 'box' && obstacles[bi].owner === sh.owner) cnt++;
    }
    if (cnt >= (mk.maxBoxes || 4)) {
      for (var bj = 0; bj < obstacles.length; bj++) {
        if (obstacles[bj].kind === 'box' && obstacles[bj].owner === sh.owner) { obstacles.splice(bj, 1); break; }
      }
    }
    obstacles.push({ x: sh.x, y: sh.y, r: mk.boxRadius, life: mk.boxLife, damCd: 0, dmg: mk.boxDmg, knock: 40, kind: 'box', owner: sh.owner });
  }

  // 从 (px,py) 出发、沿单位向量 (dx,dy) 的前向射线, 打到场地边界为止
  function laserSegment(px, py, dx, dy) {
    var ts = [];
    if (Math.abs(dx) > 1e-9) {
      var tx0 = (0 - px) / dx, tx1 = (W - px) / dx;
      var y0 = py + tx0 * dy, y1 = py + tx1 * dy;
      if (tx0 > 1e-6 && y0 >= 0 && y0 <= H) ts.push(tx0);
      if (tx1 > 1e-6 && y1 >= 0 && y1 <= H) ts.push(tx1);
    }
    if (Math.abs(dy) > 1e-9) {
      var ty0 = (0 - py) / dy, ty1 = (H - py) / dy;
      var x0 = px + ty0 * dx, x1 = px + ty1 * dx;
      if (ty0 > 1e-6 && x0 >= 0 && x0 <= W) ts.push(ty0);
      if (ty1 > 1e-6 && x1 >= 0 && x1 <= W) ts.push(ty1);
    }
    // 前向射线从场内出发只离开一次: 取最小正交点
    ts.sort(function (a, b) { return a - b; });
    var t1 = ts.length ? ts[0] : 1000;
    return { x1: px + t1 * dx, y1: py + t1 * dy, t1: t1 };
  }

  // ── 渲染 ──
  function draw(dt) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88; if (shake < 0.3) shake = 0;
    }
    drawArena();
    var i;
    for (i = 0; i < warns.length; i++) drawAoe(warns[i]);
    for (i = 0; i < fighters.length; i++) drawFighter(fighters[i]);
    for (i = 0; i < obstacles.length; i++) drawObstacle(obstacles[i]);
    for (i = 0; i < orbs.length; i++) drawOrb(orbs[i]);
    for (i = 0; i < shots.length; i++) drawShot(shots[i]);
    for (i = 0; i < beams.length; i++) drawBeam(beams[i]);
    for (i = 0; i < fighters.length; i++) {
      var f = fighters[i];
      if (f.laser && f.laser.phase === 'charge') drawWarn(f);
    }
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < floats.length; i++) drawFloat(floats[i]);
    if (state === 'count') drawCount();
    drawVignette();
    // 时停全屏特效: 泛黄 + 金色裂纹四角 + 顶部大字
    var tstNow = null;
    for (i = 0; i < fighters.length; i++) if (fighters[i].timeStop && !fighters[i].dead) tstNow = fighters[i];
    if (tstNow) {
      var tt = Date.now() / 1000;
      ctx.save();
      ctx.fillStyle = 'rgba(255,214,90,0.13)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,200,80,0.55)';
      ctx.lineWidth = 2;
      // 四角金色爪痕裂纹
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(46, 8); ctx.lineTo(8, 44); ctx.lineTo(0, 34);
      ctx.moveTo(W, 0); ctx.lineTo(W - 46, 8); ctx.lineTo(W - 8, 44); ctx.lineTo(W, 34);
      ctx.moveTo(0, H); ctx.lineTo(46, H - 8); ctx.lineTo(8, H - 44); ctx.lineTo(0, H - 34);
      ctx.moveTo(W, H); ctx.lineTo(W - 46, H - 8); ctx.lineTo(W - 8, H - 44); ctx.lineTo(W, H - 34);
      ctx.stroke();
      // 顶部大字
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tt * 3);
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffd24d';
      ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 6;
      ctx.fillText('TIME STOP', W / 2, 14);
      ctx.restore();
    }
    // 水印: 格斗台底部
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3;
    ctx.fillText('抖音：@春雪莎', W / 2, H - 8);
    ctx.restore();
    ctx.restore();
  }

  function drawArena() {
    ctx.fillStyle = '#141019';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(240,192,96,.08)';
    ctx.lineWidth = 1;
    for (var x = 48; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 48; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = '#f0c060';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = 'rgba(240,192,96,.25)';
    ctx.lineWidth = 10;
    ctx.strokeRect(7, 7, W - 14, H - 14);
  }

  function drawFighter(f) {
    var r = f.r;
    var img = f.char._img || makePlaceholder(f.char);
    var d = r * 2 + 8;   // 立绘尺寸: 碰撞体外的可视余量
    // 蓄力抖动(纯视觉, 不影响物理)
    var jx = 0, jy = 0, jr = 0, jp = 1;
    if (f.laser && f.laser.phase === 'charge' && !f.dead) {
      jx = rand(-2.5, 2.5); jy = rand(-2.5, 2.5);
      jr = rand(-0.05, 0.05);
      jp = 1 + 0.05 * Math.sin(Date.now() / 40);
    }
    ctx.save();
    ctx.translate(f.x + jx, f.y + jy);
    ctx.rotate(jr);
    ctx.scale(jp, jp);
    // 狂暴光环
    if (f.enraged) {
      var a = 0.35 + 0.3 * Math.sin(Date.now() / 90);
      ctx.strokeStyle = 'rgba(255,60,60,' + a + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r + 11 + 2 * Math.sin(Date.now() / 70), 0, 7); ctx.stroke();
    }
    // 运动风尾
    var sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (sp > 20 && !f.dead) {
      var ux = f.vx / sp, uy = f.vy / sp;
      for (var i = 3; i > 0; i--) {
        ctx.globalAlpha = 0.10 * (4 - i);
        ctx.fillStyle = f.char.color1;
        ctx.beginPath();
        ctx.arc(-ux * i * 15, -uy * i * 15, r * (1 - i * 0.14), 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // 立绘直出(保持比例, 无圆形裁剪/圆环)
    var sc = Math.max(d / img.width, d / img.height);
    var sw = d / sc, sh = d / sc;
    // 跑路无敌: 高频闪烁
    if (f.invulnT > 0) ctx.globalAlpha = Math.floor(f.invulnT * 24) % 2 === 0 ? 0.35 : 1;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -d / 2, -d / 2, d, d);
    ctx.restore();

    // 受击白闪
    if (f.flashT > 0) {
      ctx.save();
      ctx.globalAlpha = f.flashT / 0.13 * 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(f.x, f.y, d * 0.56, 0, 7); ctx.fill();
      ctx.restore();
    }

    // 血条 + 名字
    var bw = 62, bx = f.x - bw / 2, by = f.y - r - 26;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 9);
    ctx.fillStyle = f.hp <= f.maxHp * OPT.ENRAGE_HP ? '#ff4d4d' : f.char.color1;
    ctx.fillRect(bx, by, clamp(f.barHp / f.maxHp, 0, 1) * bw, 7);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 1, by - 1, bw + 2, 9);
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9b0';
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 4;
    ctx.fillText(f.char.name, f.x, f.y + r + 20);
    ctx.shadowBlur = 0;

    // 奶盾环
    if (f.shield > 0) {
      var shA = 0.5 + 0.3 * Math.sin(Date.now() / 80);
      ctx.save();
      ctx.strokeStyle = 'rgba(124,232,255,' + shA + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 8, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(Date.now() / 60);
      ctx.fillStyle = '#7ce8ff';
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 8, 0, 7); ctx.fill();
      ctx.restore();
    }

    // 狗奶蓄力倒计时: 收拢金圈 + 中央大数字
    var gsk = f.char.skill;
    if (gsk.type === 'milk_guard' && !f.dead && fightT < (gsk.readyTime || 15)) {
      var gReady = gsk.readyTime || 15;
      var remain = Math.ceil(gReady - fightT);
      var gProg = clamp(fightT / gReady, 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,77,' + (0.5 + 0.3 * Math.sin(Date.now() / 70)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 18 + 16 * (1 - gProg), 0, 7); ctx.stroke();
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd24d';
      ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 6;
      ctx.fillText(remain, f.x, f.y);
      ctx.restore();
    }
    // 时停冻结方: 灰色调凝固罩 + 金色细线框
    var tstF = null;
    for (var tf2 = 0; tf2 < fighters.length; tf2++) if (fighters[tf2].timeStop && !fighters[tf2].dead) tstF = fighters[tf2];
    if (tstF && tstF !== f && !f.dead) {
      ctx.save();
      var fzA = 0.45 + 0.1 * Math.sin(Date.now() / 200);
      ctx.globalAlpha = fzA;
      ctx.fillStyle = '#7c7c84';
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 6, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(255,210,77,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 6, 0, 7); ctx.stroke();
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText('冻', f.x, f.y);
      ctx.restore();
    }
    // 时停发动者: 金色光柱 + 脉冲金环 + 上升金粒子
    if (tstF === f && !f.dead) {
      var gT2 = Date.now() / 1000;
      ctx.save();
      var grd = ctx.createRadialGradient(f.x, f.y, r * 0.2, f.x, f.y, r + 74);
      grd.addColorStop(0, 'rgba(255,228,120,.55)');
      grd.addColorStop(1, 'rgba(255,228,120,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 74, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(gT2 * 6);
      ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 12 + 4 * Math.sin(gT2 * 4), 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffe98a';
      for (var gp = 0; gp < 8; gp++) {
        var ga = (gp / 8) * Math.PI * 2;
        var gy2 = f.y + Math.sin(ga) * (r + 20 + rand(0, 30)) - ((gT2 * 40 + gp * 46) % 40);
        var gx2 = f.x + Math.cos(ga) * (r + 20 + rand(0, 30));
        ctx.beginPath(); ctx.arc(gx2, gy2, 1.5 + (gp % 2), 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawOrb(o) {
    var idx = orbs.indexOf(o);
    var col = idx % 2 === 0 ? o.owner.char.color1 : '#5aa7f0';
    var R = o.r + 3;   // 绘制半径略大于碰撞半径
    ctx.save();
    ctx.translate(o.x, o.y);
    // 柔光
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, R + 5, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    // 太极图(缓慢自转)
    ctx.rotate(o.spin);
    ctx.fillStyle = '#f5f2ea';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    ctx.fillStyle = '#1c1a24';
    ctx.beginPath();
    ctx.arc(0, 0, R, Math.PI / 2, -Math.PI / 2);
    ctx.arc(0, -R / 2, R / 2, -Math.PI / 2, Math.PI / 2);
    ctx.arc(0, R / 2, R / 2, Math.PI / 2, -Math.PI / 2);
    ctx.fill();
    // 对立圆点
    ctx.fillStyle = '#f5f2ea';
    ctx.beginPath(); ctx.arc(0, R / 2, R * 0.14, 0, 7); ctx.fill();
    ctx.fillStyle = '#1c1a24';
    ctx.beginPath(); ctx.arc(0, -R / 2, R * 0.14, 0, 7); ctx.fill();
    // 高光
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-R * 0.38, -R * 0.38, R * 0.32, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawWarn(f) {
    var sk = f.char.skill;
    var L = f.laser;
    var prog = clamp(L.t / sk.chargeTime, 0, 1);
    var dx = Math.cos(L.dir), dy = Math.sin(L.dir);
    var seg = laserSegment(f.x, f.y, dx, dy);
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 60);
    // 扇形蓄力指针(随蓄力由窄变宽)
    var halfA = 0.10 + 0.30 * prog;
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.12 * pulse;
    ctx.fillStyle = '#ffcf6e';
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, seg.t1, L.dir - halfA, L.dir + halfA);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 方向虚线
    ctx.strokeStyle = 'rgba(255,220,150,' + (0.35 + 0.4 * pulse) + ')';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(seg.x1, seg.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // 蓄力进度环
    var rr = f.r + 15;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr, -Math.PI / 2, -Math.PI / 2 + prog * 6.2832); ctx.stroke();
    ctx.restore();
    // 倒计时数字
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24d';
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 4;
    ctx.fillText((sk.chargeTime - L.t).toFixed(1), f.x, f.y - f.r - 34);
    ctx.restore();
    // 枪口蓄能光点
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(f.x + dx * (f.r + 8), f.y + dy * (f.r + 8), 4 + 6 * prog, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBeam(bm) {
    var life = clamp(1 - (bm.t / bm.duration), 0, 1);
    var ang = Math.atan2(bm.dy, bm.dx);
    ctx.save();
    ctx.translate(bm.x0, bm.y0);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    // 外圈辉光
    ctx.globalAlpha = 0.6 * life;
    ctx.strokeStyle = '#ff9a3c';
    ctx.lineWidth = bm.halfW * 2 + 40;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 46;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(bm.len, 0); ctx.stroke();
    // 主光柱(起点亮奶油白 → 远端渐隐金)
    var grad = ctx.createLinearGradient(0, 0, bm.len, 0);
    grad.addColorStop(0, 'rgba(255,240,190,' + (0.95 * life) + ')');
    grad.addColorStop(0.6, 'rgba(255,214,130,' + (0.55 * life) + ')');
    grad.addColorStop(1, 'rgba(240,192,96,' + (0.08 * life) + ')');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = bm.halfW * 2;
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(bm.len, 0); ctx.stroke();
    // 白色核心
    ctx.globalAlpha = 0.9 * life;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = bm.halfW * 0.9;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(bm.len, 0); ctx.stroke();
    ctx.restore();
    // 枪口光球 + 星芒
    var p = 0.6 + 0.4 * Math.sin(Date.now() / 45);
    var mw = bm.halfW * (0.8 + 0.5 * p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g2 = ctx.createRadialGradient(bm.x0, bm.y0, 2, bm.x0, bm.y0, mw);
    g2.addColorStop(0, 'rgba(255,255,255,' + life + ')');
    g2.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(bm.x0, bm.y0, mw, 0, 7); ctx.fill();
    ctx.globalAlpha = life;
    ctx.fillStyle = '#fff';
    var sx = mw * 0.7;
    ctx.beginPath();
    ctx.moveTo(bm.x0, bm.y0 - sx); ctx.lineTo(bm.x0 + sx * 0.3, bm.y0 - sx * 0.3);
    ctx.lineTo(bm.x0 + sx, bm.y0); ctx.lineTo(bm.x0 + sx * 0.3, bm.y0 + sx * 0.3);
    ctx.lineTo(bm.x0, bm.y0 + sx); ctx.lineTo(bm.x0 - sx * 0.3, bm.y0 + sx * 0.3);
    ctx.lineTo(bm.x0 - sx, bm.y0); ctx.lineTo(bm.x0 - sx * 0.3, bm.y0 - sx * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // 末端墙边火花
    if (Math.random() < 0.8) {
      particles.push({ x: bm.x1 + rand(-4, 4), y: bm.y1 + rand(-4, 4), vx: rand(-70, 70), vy: rand(-120, -10), t: 0, life: 0.35, size: rand(2, 4.5), color: '#ffd24d' });
    }
    // 光柱游走粒子
    if (Math.random() < 0.6) {
      var tt = Math.random() * bm.len;
      particles.push({ x: bm.x0 + bm.dx * tt, y: bm.y0 + bm.dy * tt, vx: rand(-30, 30), vy: rand(-30, 30), t: 0, life: 0.25, size: rand(2, 4), color: '#ffe066' });
    }
  }

  function drawAoe(w) {
    var prog = clamp(w.t / w.dur, 0, 1);
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 50);
    ctx.save();
    // ── 许家印天降大门预警: 红光圈 + 门影从顶部落向落点 ──
    if (w.kind === 'gate') {
      ctx.globalAlpha = 0.26 + 0.14 * pulse;
      ctx.fillStyle = 'rgba(255,80,50,.28)';
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.75 + 0.25 * pulse;
      ctx.strokeStyle = '#ff5a3c';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      // 门影: 横向巨门从半空滑向落点
      var my = w.y - 260 * (1 - prog);
      ctx.globalAlpha = 0.55;
      if (gateImg && gateImg.complete && gateImg.width > 0) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.drawImage(gateImg, w.x - 110, my - 78, 220, 156);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(180,120,60,.6)';
        ctx.fillRect(w.x - 110, my - 78, 220, 156);
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd28a';
      ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 4;
      ctx.fillText((w.dur - w.t).toFixed(1), w.x, w.y - w.r - 10);
      ctx.restore();
      return;
    }
    // ── 褚嬴落子预警: 黑白子配色, 旋转虚影 + 倒计时 ──
    var isWhite = w.type === 'white';
    var base = isWhite ? '#e8ecf5' : '#9a9ab0';
    var ring = isWhite ? '#ffffff' : '#c9c9d6';
    ctx.globalAlpha = 0.30 + 0.18 * pulse;
    ctx.fillStyle = isWhite ? 'rgba(205,220,240,.30)' : 'rgba(20,18,40,.50)';
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill();
    // 旋转棋子虚影
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(Date.now() / 140);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = isWhite ? '#f5f2ea' : '#2a2734';
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = base;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.stroke();
    ctx.restore();
    // 双环
    ctx.globalAlpha = 0.55 + 0.4 * pulse;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([9, 9]);
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r + 5, 0, 7); ctx.stroke();
    ctx.strokeStyle = isWhite ? '#ffffff' : '#c9c9d6';
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r + 5, -Math.PI / 2, -Math.PI / 2 + prog * 6.2832); ctx.stroke();
    // 倒计时数字
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isWhite ? '#ffffff' : '#d6d6e0';
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 4;
    ctx.fillText((w.dur - w.t).toFixed(1), w.x, w.y - w.r - 10);
    ctx.restore();
  }

  function drawObstacle(ob) {
    ctx.save();
    // ── 褚嬴棋子: 黑白子凸透镜(黑子深墨高光 / 白子米白蓝光) ──
    if (ob.kind === 'stone') {
      var fade = clamp(ob.life / 0.6, 0, 1);
      var isWhite = ob.type === 'white';
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(ob.x + 3, ob.y + 5, ob.r + 3, ob.r + 1, 0, 0, 7); ctx.fill();
      var g1 = ctx.createRadialGradient(ob.x - ob.r * 0.35, ob.y - ob.r * 0.4, ob.r * 0.15, ob.x, ob.y, ob.r);
      if (isWhite) {
        g1.addColorStop(0, '#ffffff');
        g1.addColorStop(0.6, '#efe9d8');
        g1.addColorStop(1, '#b8b09a');
      } else {
        g1.addColorStop(0, '#4c495e');
        g1.addColorStop(0.7, '#2a2734');
        g1.addColorStop(1, '#17151f');
      }
      ctx.fillStyle = g1;
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, 7); ctx.fill();
      ctx.strokeStyle = isWhite ? 'rgba(90,120,160,.85)' : 'rgba(160,155,180,.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r - 0.8, 0, 7); ctx.stroke();
      ctx.globalAlpha = (isWhite ? 0.85 : 0.5) * fade;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ob.x - ob.r * 0.35, ob.y - ob.r * 0.42, ob.r * 0.32, ob.r * 0.2, -0.6, 0, 7); ctx.fill();
    } else if (ob.kind === 'gate') {
      // ── 许家印天降大门: 下落动画 + 大门图片 ──
      var fad2 = clamp(ob.life / 0.5, 0, 1);
      var gy3 = ob.fallT < ob.fallDur ? ob.y - (1 - ob.fallT / ob.fallDur) * 260 : ob.y;
      ctx.globalAlpha = fad2;
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(ob.x + 4, gy3 + 82, 118, 11, 0, 0, 7); ctx.fill();
      if (gateImg && gateImg.complete && gateImg.width > 0) {
        var pulse3 = 0.6 + 0.4 * Math.sin(Date.now() / 90);
        if (ob.fallT < ob.fallDur) ctx.globalAlpha = 0.55 + 0.3 * pulse3;
        ctx.drawImage(gateImg, ob.x - 110, gy3 - 78, 220, 156);
        ctx.strokeStyle = 'rgba(255,220,150,' + (0.5 + 0.5 * pulse3) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ob.x - 110, gy3 - 78); ctx.lineTo(ob.x + 110, gy3 - 78); ctx.stroke();
      } else {
        var grad3 = ctx.createLinearGradient(0, gy3 - 78, 0, gy3 + 78);
        grad3.addColorStop(0, 'rgba(201,138,58,.85)');
        grad3.addColorStop(1, 'rgba(90,58,26,.4)');
        ctx.fillStyle = grad3;
        ctx.fillRect(ob.x - 110, gy3 - 78, 220, 156);
        ctx.strokeStyle = '#c98a3a';
        ctx.lineWidth = 3;
        ctx.strokeRect(ob.x - 110, gy3 - 78, 220, 156);
        ctx.fillStyle = 'rgba(255,220,150,.9)';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('售', ob.x, gy3 + 12);
      }
    } else if (ob.kind === 'box') {
      // ── 美团外卖箱: 黄箱 + 袋 ──
      var fad3 = clamp(ob.life / 0.6, 0, 1);
      ctx.globalAlpha = fad3;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(ob.x + 2, ob.y + 3, ob.r + 2, ob.r * 0.55, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb400';
      ctx.fillRect(ob.x - ob.r * 0.9, ob.y - ob.r * 0.75, ob.r * 1.8, ob.r * 1.5);
      ctx.strokeStyle = '#9a6a10';
      ctx.lineWidth = 2;
      ctx.strokeRect(ob.x - ob.r * 0.9, ob.y - ob.r * 0.75, ob.r * 1.8, ob.r * 1.5);
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ob.x - ob.r * 0.55, ob.y - ob.r * 0.6, ob.r * 1.1, ob.r * 1.2);
      ctx.fillStyle = '#7a4a00';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('袋', ob.x, ob.y + 1);
    }
    ctx.restore();
  }

  function drawShot(sh) {
    // ── 美团外卖袋: 旋转黄袋 + 提手 ──
    if (sh.kind === 'meal') {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.t * 5);
      var s = sh.r + 3;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(2.5, 3, s * 0.95, s * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb400';
      ctx.fillRect(-s, -s * 0.55, s * 2, s * 1.25);
      ctx.strokeStyle = '#9a6a10';
      ctx.lineWidth = 2;
      ctx.strokeRect(-s, -s * 0.55, s * 2, s * 1.25);
      ctx.strokeStyle = '#ffb400';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#7a4a00';
      ctx.font = 'bold ' + s + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('袋', 0, s * 0.18);
      ctx.restore();
      return;
    }
    // ── 追踪小棋(白子): 白色光点 + 尾迹 ──
    if (sh.homing) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r + 1.5, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#dfe8f5';
      ctx.beginPath(); ctx.arc(sh.x - sh.vx * 0.06, sh.y - sh.vy * 0.06, sh.r * 0.8, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(sh.x - sh.vx * 0.13, sh.y - sh.vy * 0.13, sh.r * 0.6, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }
    // ── 奶弹 ──
    var wob = 1 + 0.2 * Math.sin(Date.now() / 30 + sh.x);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#f7f3e8';
    ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r * wob, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sh.x - sh.r * 0.3, sh.y - sh.r * 0.3, sh.r * 0.4, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#f7f3e8';
    ctx.beginPath(); ctx.arc(sh.x - sh.vx * 0.04, sh.y - sh.vy * 0.04, sh.r * 0.7, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawFloat(fl) {
    var k = 1 - fl.t / fl.life;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = 'bold ' + fl.size + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 5;
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x, fl.y);
    ctx.restore();
  }

  function drawCount() {
    var phase = Math.floor(countT / 0.7);
    var t = ['3', '2', '1', '开打！'][phase];
    if (t === undefined) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '900 84px sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 16;
    ctx.fillStyle = phase === 3 ? '#f0c060' : '#ffffff';
    ctx.fillText(t, W / 2, H / 2 + 26);
    ctx.restore();
  }

  function drawVignette() {
    var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ── 主循环 ──
  var last = 0, acc = 0;
  function frame(ts) {
    var dt = Math.min(0.1, (ts - last) / 1000 || 0);
    last = ts;
    timeScale += (targetTS - timeScale) * Math.min(1, dt * 8);
    dt *= timeScale;

    // 倒计时
    if (state === 'count') {
      countT += dt;
      if (countT >= 2.8) { state = 'fight'; countT = 2.8; }
    }
    if (state === 'fight' && slowmoT > 0) {
      slowmoT -= dt;
      if (slowmoT <= 0) targetTS = 1;
    }
    // 固定步长物理
    acc += dt;
    var n = 0;
    while (acc >= OPT.STEP && n < 6) { sim(OPT.STEP); acc -= OPT.STEP; n++; }
    if (state === 'fight') {
      el.timer.textContent = fightT.toFixed(1) + 's';
      el.p1Hp.style.width = clamp(fighters[0].hp / fighters[0].maxHp * 100, 0, 100) + '%';
      el.p2Hp.style.width = clamp(fighters[1].hp / fighters[1].maxHp * 100, 0, 100) + '%';
      el.p1HpTxt.textContent = Math.max(0, Math.round(fighters[0].hp)) + '/' + fighters[0].maxHp;
      el.p2HpTxt.textContent = Math.max(0, Math.round(fighters[1].hp)) + '/' + fighters[1].maxHp;
      el.p1Name.textContent = fighters[0].char.name + (fighters[0].enraged ? ' 🔥' : '');
      el.p2Name.textContent = fighters[1].char.name + (fighters[1].enraged ? ' 🔥' : '');
    }
    draw(dt);
    requestAnimationFrame(frame);
  }

  // ── 选人界面 ──
  function buildPick() {
    function makeGrid(container, side) {
      container.innerHTML = '';
      var sel = side === 'A' ? pickA : pickB;
      POLO_CHARS.forEach(function (c, i) {
        var card = document.createElement('div');
        card.className = 'char-card' + (i === sel ? ' sel' : '');
        card.innerHTML =
          '<div class="cc-img-wrap"><img src="' + c.img + '" alt="" onerror="this.style.display=\'none\'">' +
          '<span class="cc-emoji">' + c.emoji + '</span></div>' +
          '<div class="cc-name">' + c.name + '</div>' +
          '<div class="cc-sub">' + c.title + '</div>' +
          '<div class="cc-skill">💠 ' + c.skill.name + '</div>' +
          '<div class="cc-stats">HP ' + c.maxHp + '</div>';
        card.onclick = function () {
          if (side === 'A') pickA = i; else pickB = i;
          SND.playTheme(SND.themeOf(c));
          buildPick();
        };
        container.appendChild(card);
      });
    }
    makeGrid(el.pickA, 'A');
    makeGrid(el.pickB, 'B');
    selText();
  }

  // ── 界面工具 ──
  function ovShow(ov, hideOther) {
    if (hideOther) { ovHide(el.ovSelect); ovHide(el.ovResult); }
    ov.classList.remove('hide');
  }
  function ovHide(ov) { if (ov) ov.classList.add('hide'); }

  // ── 事件 ──
  el.btnFight.addEventListener('click', function () {
    newFight((pendingSeed != null) ? pendingSeed : ((Math.random() * 900000 + 100000) | 0));
  });
  el.btnAgain.addEventListener('click', function () {
    var s = parseInt(el.seedInput.value, 10);
    ovHide(el.ovResult);
    newFight(isNaN(s) ? ((Math.random() * 900000 + 100000) | 0) : s);
  });
  el.btnPick.addEventListener('click', function () {
    ovHide(el.ovResult);
    ovHide(el.ovSelect);
    ovShow(el.ovSelect);
  });
  el.seedGo.addEventListener('click', function () {
    var s = parseInt(el.seedInput.value, 10);
    pendingSeed = isNaN(s) ? null : s;
    ovHide(el.ovResult);
    newFight(pendingSeed != null ? pendingSeed : ((Math.random() * 900000 + 100000) | 0));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && state !== 'fight' && !el.ovSelect.classList.contains('hide')) {
      el.btnFight.click();
    }
    if ((e.key === 'r' || e.key === 'R') && state === 'result') el.btnAgain.click();
  });
  if (el.btnSfx) el.btnSfx.addEventListener('click', function () {
    var m = SND.toggleSfx();
    el.btnSfx.textContent = m ? '🔇' : '🔊';
  });
  if (el.btnMusic) el.btnMusic.addEventListener('click', function () {
    var m = SND.toggleBgm();
    el.btnMusic.textContent = m ? '🔇' : '🎵';
  });
  // 测试/观战外部钩子
  window.__poloSetPick = function (a, b) { pickA = a; pickB = b; };
  window.__poloDebug = function () {
    return {
      obstacles: obstacles.length, warns: warns.length, shots: shots.length,
      gates: 0, stones: 0, goStones: fighters[0].goStones + fighters[1].goStones,
      revived: fighters[0].revived + fighters[1].revived,
      shield: [Math.round(fighters[0].shield), Math.round(fighters[1].shield)],
      cd: [fighters[0].cd.toFixed(1), fighters[1].cd.toFixed(1)],
      hp: [Math.round(fighters[0].hp), Math.round(fighters[1].hp)],
      timeStop: [fighters[0].timeStop, fighters[1].timeStop]
    };
  };

  // ── 启动 ──
  buildPick();
  requestAnimationFrame(frame);
})();