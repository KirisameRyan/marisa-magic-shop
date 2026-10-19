/* ═══════════════════════════════════════
   合成大BAKA · B站 Toy 版
   霧雨魔法店 — Suika-like 合成玩法
   ═══════════════════════════════════════ */
(function () {
'use strict';

/* ═══════ 常量 ═══════ */
var W = 400, H = 640, TOP = 170, FLOOR = H - 14;
var G = 1600, MAXV = 1400;
var REST = 0.25, FLOOR_REST = 0.35, WALL_REST = 0.4, ITER = 6;
var CLICK_GAP = 280;        // 点击间隔(ms) —— 手感调整
var CHAIN_WINDOW = 1100;    // 连锁重置窗口(ms) —— 手感调整
var LINE_MAX = 5, WARN_AT = 3;

var IMGS = [
  'images/cirno/cirno01.webp', 'images/cirno/cirno02.webp', 'images/cirno/cirno03.webp',
  'images/cirno/cirno04.webp', 'images/cirno/cirno05.webp', 'images/cirno/cirno06.webp',
  'images/cirno/cirno07.webp', 'images/cirno/cirno08.jpg', 'images/cirno/cirno09.webp'
];
var LOGO_SRC = 'images/cast/logo.png';
var LIHUI_SRC = 'images/cast/lihui.png';

/* 等级 1 = ⑨ 文字, 2~9 = 琪露诺贴图 */
function LV_R(lv) { return 20 * Math.pow(1.17, lv - 1); }

/* ═══════ 双模式配置 ═══════ */
var DYN_TIER = [0, 3000, 8000];
var TOY_BOARD = { big: 1, small: 2 };
var MODES = {
  big: {
    key: 'big', dir: 1, name: '合成大BAKA', sub: '小 → 大 · 笨蛋养成计划',
    finalLv: 10, finalTitle: '大BAKA!!!', dirWord: '进化',
    dropW: [[40, 25, 18, 12, 5], [28, 22, 17, 15, 12, 6], [20, 18, 17, 18, 17, 10]],
    score: function (lv, nl, mult) { return Math.round(lv * 100 * mult); },
    finalScore: function (mult) { return Math.round(8000 * Math.max(1, mult)); },
    overTitle: '💥 笨蛋太多了!',
    overSub: '灵梦:这么多⑨,还是退治了吧。',
    statLabel: '最高合成', tip: '相同琪露诺碰在一起<b>合体进化</b>,从⑨一路养到终极大BAKA。'
  },
  small: {
    key: 'small', dir: -1, name: '合成小BAKA', sub: '大 → 小 · ⑨ 完全体计划',
    finalLv: 2, finalTitle: '琪露诺⑨!!', dirWord: '退化',
    dropW: [[30, 25, 20, 15, 10], [25, 22, 20, 18, 15], [20, 20, 20, 20, 20]],
    score: function (lv, nl, mult) { return Math.round((10 - nl) * 100 * mult); },
    finalScore: function (mult) { return Math.round(8000 * Math.max(1, mult)); },
    overTitle: '🎀 ⑨ 全都完成了!',
    overSub: '大妖精:不愧是⑨,真正的完全体!',
    statLabel: '⑨完成数', tip: '反过来!大球合体<b>退化变小</b>,把满屏笨蛋压回完全体 ⑨。'
  }
};
var M = MODES.big;

/* ═══════ 状态 ═══════ */
var S = {
  running: false, paused: false, score: 0, best: 0, bestSmall: 0,
  maxLevel: 0, maxChain: 0, nines: 0,
  fruits: [], next: 1, holding: null, holdX: W / 2,
  chain: 0, hammers: 0, aiming: false,
  frozen: false, gameOver: false, muted: false
};

/* ═══════ DOM ═══════ */
var app, board, cv, ctx, bg, bgc, bgReady = false;
var imgs = {}, rafId = 0, lastT = 0;
var LS = { best: 'baka_toy_best_big', bestSmall: 'baka_toy_best_small', mute: 'baka_toy_mute' };

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmt(n) { return (n | 0).toLocaleString('en-US'); }
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

/* ═══════ 布局：固定竖井 400×640 等比缩放 ═══════ */
function isLandscape() {
  var aw = app.clientWidth, ah = app.clientHeight;
  return aw > 0 && ah > 0 && aw >= ah;
}
function fitBoard() {
  if (!app || !board || !cv) return;
  var aw = app.clientWidth, ah = app.clientHeight;
  if (!aw || !ah) return;
  var PAD = 10, availW, availH;
  if (isLandscape()) {
    availH = ah - PAD * 2;
    availW = Math.min(aw * 0.46, 470);   // 竖井最多占 46% 宽,其余留给两侧
  } else {
    var hud = $('hud');
    var hudH = hud ? hud.offsetHeight + 6 : 0;
    availH = ah - hudH - PAD * 2;
    availW = aw - PAD * 2;
  }
  var s = Math.max(0.25, Math.min(availW / W, availH / H));
  board.style.width = Math.round(W * s) + 'px';
  board.style.height = Math.round(H * s) + 'px';
  var k = Math.min(2.5, s * (window.devicePixelRatio || 1));
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);   // 设 .width 会重置状态,必须重设
  ctx.imageSmoothingEnabled = true;
  document.documentElement.style.setProperty('--bs', s);
}

/* ═══════ 背景（离屏缓存一次） ═══════ */
function buildBg() {
  if (!bg) { bg = document.createElement('canvas'); bg.width = W; bg.height = H; }
  bgc = bg.getContext('2d');
  var g = bgc.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2340'); g.addColorStop(.42, '#1e1828'); g.addColorStop(1, '#130f18');
  bgc.fillStyle = g; bgc.fillRect(0, 0, W, H);

  var t = bgc.createLinearGradient(0, 0, 0, TOP);
  t.addColorStop(0, 'rgba(143,216,255,.13)'); t.addColorStop(1, 'rgba(143,216,255,0)');
  bgc.fillStyle = t; bgc.fillRect(0, 0, W, TOP);

  bgc.strokeStyle = 'rgba(143,216,255,.05)'; bgc.lineWidth = 1;
  for (var x = 0; x <= W; x += 40) { bgc.beginPath(); bgc.moveTo(x + .5, 0); bgc.lineTo(x + .5, H); bgc.stroke(); }
  for (var y = 0; y <= H; y += 40) { bgc.beginPath(); bgc.moveTo(0, y + .5); bgc.lineTo(W, y + .5); bgc.stroke(); }

  var v = bgc.createRadialGradient(W / 2, H * .72, H * .18, W / 2, H * .72, H * .62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
  bgc.fillStyle = v; bgc.fillRect(0, 0, W, H);
  bgReady = true;
}

/* ═══════ 音效：外部音频优先,WebAudio 合成兜底 ═══════ */
var SND = (function () {
  var ac = null, audios = {}, broken = {};
  var FILES = { drop: 'audio/baka/baka.mp3' };
  function a() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function beep(f, dur, type, vol, slide) {
    var c = a(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + dur);
    g.gain.setValueAtTime(vol || .1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  var synths = {
    merge: function (lv) { beep(280 + (lv || 1) * 45, .12, 'triangle', .12, 500 + (lv || 1) * 80); },
    chain: function () { beep(700, .08, 'square', .08, 1000); },
    hammer: function () { beep(200, .14, 'square', .14, 80); },
    drop: function () { beep(150, .06, 'sine', .05, 120); },
    over: function () { beep(300, .5, 'sawtooth', .1, 80); },
    click: function () { beep(500, .05, 'triangle', .07); }
  };
  function load() {
    for (var k in FILES) {
      (function (k, src) {
        var el = new Audio();
        el.preload = 'auto'; el.src = src;
        el.addEventListener('error', function () { broken[k] = true; });
        audios[k] = el;
      })(k, FILES[k]);
    }
  }
  function off() { return !!S.muted; }
  function one(name, rate) {
    if (off()) return;
    if (broken[name] || !audios[name]) { (synths[name] || function () {})(); return; }
    try {
      var el = audios[name];
      el.currentTime = 0;
      if (rate) el.playbackRate = rate;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { (synths[name] || function () {})(); }
  }
  return {
    unlock: function () { a(); },
    load: load,
    merge: function (lv) { one('drop', 1 + (lv || 1) * .04); },
    chain: function () { synths.chain(); },
    hammer: function () { synths.hammer(); },
    drop: function () { one('drop'); },
    big: function () { if (off()) return; var n = 0; (function f() { if (n++ >= 3) return; one('drop'); setTimeout(f, 140); })(); },
    over: function () { synths.over(); },
    click: function () { synths.click(); }
  };
})();

/* ═══════ 图片加载（真进度） ═══════ */
function loadImgs(onProgress, cb) {
  var total = IMGS.length + 2, done = 0, fired = false;
  function tick() {
    done++; onProgress(Math.min(1, done / total));
    if (done >= total && !fired) { fired = true; cb(); }
  }
  IMGS.forEach(function (src) {
    var im = new Image();
    im.onload = im.onerror = tick; im.src = src; imgs[src] = im;
  });
  var lg = new Image(); lg.onload = lg.onerror = tick; lg.src = LIHUI_SRC; imgs['lihui'] = lg;
  var lo = new Image(); lo.onload = lo.onerror = tick; lo.src = LOGO_SRC; imgs['logo'] = lo;
  setTimeout(function () { if (!fired) { fired = true; cb(); } }, 4000);   // 兜底
}

/* ═══════ 飘雪氛围层 ═══════ */
var SNOW = (function () {
  var c, g, flakes = [], raf = 0;
  function seed(nw, nh) {
    var n = Math.round(Math.min(90, nw * nh / 9000));
    for (var i = 0; i < n; i++) {
      flakes.push({
        x: Math.random() * nw, y: Math.random() * nh,
        r: .8 + Math.random() * 2.2,
        v: .18 + Math.random() * .5,
        d: (Math.random() - .5) * .22,
        a: .18 + Math.random() * .5
      });
    }
  }
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(c.clientWidth * dpr));
    c.height = Math.max(1, Math.round(c.clientHeight * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = []; seed(c.clientWidth, c.clientHeight);
  }
  function step() {
    var nw = c.clientWidth, nh = c.clientHeight;
    g.clearRect(0, 0, nw, nh);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.v; f.x += f.d;
      if (f.y > nh + 4) { f.y = -4; f.x = Math.random() * nw; }
      if (f.x < -4) f.x = nw + 4; else if (f.x > nw + 4) f.x = -4;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, 6.2832);
      g.fillStyle = 'rgba(200,232,255,' + f.a + ')';
      g.fill();
    }
    raf = requestAnimationFrame(step);
  }
  return {
    start: function () {
      c = $('snow'); if (!c) return;
      g = c.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    }
  };
})();

/* ═══════ 分数 / 浮字 / 特效 ═══════ */
function addScore(n) {
  S.score += n;
  $('score').textContent = fmt(S.score);
}
function fxLayer() { return $('fx'); }
function pct(x, y) { return { l: (x / W * 100) + '%', t: (y / H * 100) + '%' }; }
function floater(x, y, txt, big) {
  var p = pct(x, y), f = document.createElement('div');
  f.className = 'floater' + (big ? ' big' : '');
  f.textContent = txt;
  f.style.left = p.l; f.style.top = p.t;
  fxLayer().appendChild(f);
  setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1000);
}
function ring(x, y, r, cls) {
  var p = pct(x, y), e = document.createElement('div');
  e.className = 'ring' + (cls ? ' ' + cls : '');
  e.style.left = p.l; e.style.top = p.t;
  e.style.setProperty('--d', (r * 2 / W * 100) + '%');
  fxLayer().appendChild(e);
  setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 620);
}
function shake(ms) {
  board.classList.remove('shake');
  void board.offsetWidth;
  board.style.setProperty('--shk-ms', (ms || 260) + 'ms');
  board.classList.add('shake');
  setTimeout(function () { board.classList.remove('shake'); }, (ms || 260) + 40);
}
var toastT = 0;
function toast(msg) {
  var t = $('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.classList.remove('show'); }, 1700);
}

/* ═══════ 物理 ═══════ */
function step(dt) {
  var fs = S.fruits, i, j;
  for (i = 0; i < fs.length; i++) {
    var f = fs[i];
    f.vy += G * dt;
    if (f.vy > MAXV) f.vy = MAXV;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.x - f.r < 0) { f.x = f.r; f.vx = -f.vx * WALL_REST; }
    else if (f.x + f.r > W) { f.x = W - f.r; f.vx = -f.vx * WALL_REST; }
    if (f.y + f.r > FLOOR) { f.y = FLOOR - f.r; f.vy = -f.vy * FLOOR_REST; }
  }
  /* 合并优先：重叠或相切即合并 */
  var merged = true, guard = 0;
  while (merged && guard++ < 20) {
    merged = false;
    for (i = 0; i < fs.length && !merged; i++) {
      for (j = i + 1; j < fs.length; j++) {
        var a = fs[i], b = fs[j];
        if (a.lv !== b.lv || a.lv >= 11) continue;
        var now = Date.now();
        if (a.cooldown > now || b.cooldown > now) continue;
        var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < a.r + b.r + 2) { doMerge(a, b); merged = true; break; }
      }
    }
  }
  /* 圆-圆碰撞：质量按半径²，大球几乎不动 */
  for (var it = 0; it < ITER; it++) {
    for (i = 0; i < fs.length; i++) {
      for (j = i + 1; j < fs.length; j++) {
        var c1 = fs[i], c2 = fs[j];
        var ex = c2.x - c1.x, ey = c2.y - c1.y, d2 = ex * ex + ey * ey, rr = c1.r + c2.r;
        if (d2 >= rr * rr || d2 === 0) continue;
        var dd = Math.sqrt(d2), nx = ex / dd, ny = ey / dd, ov = rr - dd;
        var m1 = c1.r * c1.r, m2 = c2.r * c2.r, mt = m1 + m2;
        c1.x -= nx * ov * (m2 / mt); c1.y -= ny * ov * (m2 / mt);
        c2.x += nx * ov * (m1 / mt); c2.y += ny * ov * (m1 / mt);
        var rvx = c1.vx - c2.vx, rvy = c1.vy - c2.vy, rel = rvx * nx + rvy * ny;
        if (rel > 0) {
          var imp = -(1 + REST) * rel * (m2 / mt);
          c1.vx += imp * nx; c1.vy += imp * ny;
          c2.vx -= imp * nx * (m1 / m2); c2.vy -= imp * ny * (m1 / m2);
        }
      }
    }
  }
  for (i = 0; i < fs.length; i++) {
    var cf = fs[i];
    if (cf.x < cf.r) cf.x = cf.r;
    else if (cf.x > W - cf.r) cf.x = W - cf.r;
    if (cf.y > FLOOR - cf.r) cf.y = FLOOR - cf.r;
  }
}

function doMerge(a, b) {
  var fs = S.fruits, lv = a.lv;
  fs.splice(fs.indexOf(a), 1);
  fs.splice(fs.indexOf(b), 1);
  var x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  var mult = Math.max(1, 1 + (S.chain) * .5);   // 递增前先算倍数

  if (lv === M.finalLv) {
    S.chain++; S.maxChain = Math.max(S.maxChain, S.chain);
    var fpts = M.finalScore(mult);
    addScore(fpts);
    S.maxLevel = Math.max(S.maxLevel, 10);
    if (M.dir < 0) S.nines++;
    SND.big();
    bigBaka(x, y, fpts, mult);
    resetChain();
    return;
  }

  var nl = lv + M.dir;
  var nr = LV_R(nl);
  fs.push({ x: x, y: y, vx: 0, vy: 0, r: nr, lv: nl, cooldown: Date.now() + 100, lineT: 0 });
  S.chain++;
  S.maxChain = Math.max(S.maxChain, S.chain);
  var mm = Math.max(1, 1 + (S.chain - 1) * .5);
  var pts = M.score(lv, nl, mm);
  addScore(pts);
  S.maxLevel = Math.max(S.maxLevel, nl);

  floater(x, y, '+' + pts, mm > 1.5);
  ring(x, y, nr, mm > 1.5 ? 'gold' : 'ice');
  if (mm >= 2) shake(180);
  SND.merge(nl);
  if (S.chain >= 3 && mm >= 2) grantHammer();
  clearTimeout(S._chainReset);
  S._chainReset = setTimeout(resetChain, CHAIN_WINDOW);
}
function resetChain() { S.chain = 0; }
function grantHammer() {
  if (S.hammers < 3) {
    S.hammers++;
    $('hammerCnt').textContent = S.hammers;
    $('hammerBtn').disabled = false;
    toast('🔨 连锁 3 连!获得<b>小锤子</b>');
    SND.chain();
  }
}

/* ═══════ 大BAKA 演出 ═══════ */
function bigBaka(x, y, pts, mult) {
  var el = $('bakaBurst'), bar = $('bakaBarrage');
  bar.innerHTML = '';
  var words = ['バカ', 'バカバカ', '⑨', 'BAKA!', 'バカバカバカ', '⑨⑨', '笨蛋!!', '⑨⑨⑨'];
  for (var i = 0; i < 26; i++) {
    var s = document.createElement('span');
    s.className = 'baka';
    s.textContent = words[i % words.length];
    s.style.left = (Math.random() * 90 + 2) + '%';
    s.style.top = (Math.random() * 60 + 10) + '%';
    s.style.fontSize = (Math.random() * 26 + 18) + 'px';
    s.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
    s.style.animationDelay = (Math.random() * .6) + 's';
    bar.appendChild(s);
  }
  $('bakaTitle').textContent = M.finalTitle;
  $('bakaScore').textContent = '+' + fmt(pts) + ' 分' + (mult > 1 ? ' ×' + mult.toFixed(1) : '');
  el.classList.remove('hide');
  $('flash').classList.add('go');
  shake(420);
  S.frozen = true;
  setTimeout(function () {
    el.classList.add('hide');
    S.frozen = false;
    checkOver(0);
  }, 2800);
}

/* ═══════ 绘制 ═══════ */
function loop(t) {
  rafId = requestAnimationFrame(loop);
  if (!S.running || S.frozen || S.paused) { lastT = t; return; }
  var dt = Math.min(0.033, (t - lastT) / 1000 || .016);
  lastT = t;
  if (S.holding) { S.holding.x = S.holdX; S.holding.y = TOP - S.holding.r; }
  step(dt);
  draw();
  checkOver(dt);
}
function draw() {
  if (!ctx) return;
  if (bgReady) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = '#1a1520'; ctx.fillRect(0, 0, W, H); }
  /* 危险线（画布内） */
  ctx.save();
  ctx.strokeStyle = 'rgba(239,68,68,.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(0, TOP + .5); ctx.lineTo(W, TOP + .5); ctx.stroke();
  ctx.restore();
  for (var i = 0; i < S.fruits.length; i++) drawFruit(S.fruits[i]);
  drawAim();
  if (S.aiming) {
    ctx.strokeStyle = 'rgba(239,68,68,.5)';
    ctx.lineWidth = 1.5;
    for (var k = 0; k < S.fruits.length; k++) {
      var t = S.fruits[k];
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 3, 0, 6.2832); ctx.stroke();
    }
  }
}
/* 瞄准辅助：垂线 + 落点圈（手感调整新增） */
function landingY(x, r) {
  var y = FLOOR;
  for (var i = 0; i < S.fruits.length; i++) {
    var f = S.fruits[i];
    if (Math.abs(f.x - x) < f.r + r * .5) {
      var t = f.y - f.r;
      if (t < y) y = t;
    }
  }
  return y;
}
function drawAim() {
  if (!S.holding || S.aiming || S.gameOver) return;
  var x = S.holdX, r = S.holding.r;
  var y = landingY(x, r);                    // 实际落点，不能被危险线夹住，否则反馈是假的
  var lineEnd = Math.min(y - r * .3, TOP);   // 垂线画到危险线为止，不穿过手
  ctx.save();
  ctx.strokeStyle = 'rgba(143,216,255,.28)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.moveTo(x, TOP - r); ctx.lineTo(x, lineEnd); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(143,216,255,.55)';
  ctx.beginPath(); ctx.ellipse(x, y, r * .82, r * .26, 0, 0, 6.2832); ctx.stroke();
  ctx.fillStyle = 'rgba(143,216,255,.10)';
  ctx.fill();
  ctx.restore();
}
function drawFruit(f) {
  var x = f.x, y = f.y, r = f.r;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
  if (f.lv === 1) {
    ctx.clip();
    ctx.fillStyle = '#f0c060';
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = r * .2; ctx.shadowOffsetY = r * .06;
    ctx.font = '900 ' + (r * 1.15) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⑨', x, y + r * .06);
  } else {
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.clip();
    var im = imgs[IMGS[f.lv - 2]];
    if (im && im.complete && im.naturalWidth > 0) ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
  if (f.lineT >= WARN_AT) {
    ctx.strokeStyle = 'rgba(239,68,68,' + Math.min(1, .4 + f.lineT * .12) + ')';
    ctx.lineWidth = 3;
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5;
  }
  ctx.stroke();
  if (f.lv >= 2) {
    var bw = r * .52, bh = r * .34, bx = x - bw / 2, by = y + r * .62;
    ctx.beginPath();
    ctx.moveTo(bx + bh / 2, by);
    ctx.lineTo(bx + bw - bh / 2, by); ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + bh / 2);
    ctx.lineTo(bx + bw, by + bh - bh / 2); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - bh / 2, by + bh);
    ctx.lineTo(bx + bh / 2, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - bh / 2);
    ctx.lineTo(bx, by + bh / 2); ctx.quadraticCurveTo(bx, by, bx + bh / 2, by);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15,10,20,.72)'; ctx.fill();
    ctx.fillStyle = '#ffe8b0';
    ctx.font = '900 ' + (bh * .78) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.lv, x, by + bh / 2 + bh * .03);
  }
}

/* ═══════ 掉落 ═══════ */
function currentDropW() {
  var tiers = M.dropW, w = tiers[0];
  for (var i = tiers.length - 1; i >= 0; i--) {
    if (S.score >= DYN_TIER[i]) { w = tiers[i]; break; }
  }
  return w;
}
function pickLevel() {
  var w = currentDropW(), total = 0, i;
  for (i = 0; i < w.length; i++) total += w[i];
  var r = Math.random() * total, acc = 0;
  for (i = 0; i < w.length; i++) { acc += w[i]; if (r < acc) return M.dir > 0 ? i + 1 : 10 - i; }
  return M.dir > 0 ? w.length : 10 - w.length + 1;
}
function newHolding() {
  S.holding = { x: S.holdX, y: TOP - 10, vx: 0, vy: 0, r: LV_R(S.next), lv: S.next, cooldown: 0, lineT: 0 };
  S.next = pickLevel();
  updatePreview();
}
function renderPreview(pid, lid, lv) {
  var p = $(pid);
  p.innerHTML = lv === 1
    ? '<span>⑨</span>'
    : '<img src="' + IMGS[lv - 2] + '" alt="" onerror="this.parentNode.innerHTML=\'<span>⑨</span>\'">';
  var l = $(lid);
  if (l) l.textContent = lv === 1 ? '⑨' : 'Lv' + lv;
}
function updatePreview() {
  renderPreview('curPreview', 'curLv', S.holding ? S.holding.lv : S.next);
  renderPreview('nextPreview', 'nextLv', S.next);
}
function drop() {
  var now = Date.now();
  if (!S.holding || S.gameOver || S.paused) return;
  if (S._lastDrop && now - S._lastDrop < CLICK_GAP) return;
  S._lastDrop = now;
  var f = S.holding;
  f.x = S.holdX;
  /* 防原地垒塔：落点随机散开，同级球附近加大偏移（手感调整：3 轮 / 0.35r 起） */
  var off = f.r * .35;
  for (var t = 0; t < 3; t++) {
    var tx = Math.max(f.r, Math.min(W - f.r, f.x + (Math.random() * 2 - 1) * off));
    var clash = false;
    for (var i = 0; i < S.fruits.length; i++) {
      var g = S.fruits[i];
      if (g.lv === f.lv && Math.abs(g.x - tx) < f.r * 2) { clash = true; break; }
    }
    if (!clash) { f.x = tx; break; }
    off = f.r * .85;
  }
  f.vy = 0; f.vx = 0; f.lineT = 0;
  S.fruits.push(f);
  S.holding = null;
  SND.drop();
  newHolding();
}

/* ═══════ 结束判定：持续压线计时 ═══════ */
function checkOver(dt) {
  var warn = false;
  for (var i = 0; i < S.fruits.length; i++) {
    var f = S.fruits[i];
    if (f.y - f.r < TOP - 2) {
      f.lineT = (f.lineT || 0) + dt;
      if (f.lineT >= WARN_AT) warn = true;
      if (f.lineT >= LINE_MAX) { gameOver(); return; }
    } else f.lineT = 0;
  }
  var line = $('lineEl');
  if (line) line.classList.toggle('warn', warn);
}
function gameOver() {
  S.gameOver = true; S.running = false;
  SND.over();
  shake(320);
  var key = M.key === 'big' ? LS.best : LS.bestSmall;
  if (S.score > S.best) { S.best = S.score; store(key, String(S.best)); }
  else S.best = Math.max(S.best, S.score);
  $('fsScore').textContent = fmt(S.score);
  $('fsMax').textContent = M.dir < 0 ? S.nines : 'Lv' + S.maxLevel;
  $('fsChain').textContent = '×' + S.maxChain;
  $('fsBest').textContent = fmt(S.best);
  $('overTitle').textContent = M.overTitle;
  $('overSub').textContent = M.overSub;
  $('fsMaxLabel').textContent = M.statLabel;
  $('overOverlay').classList.remove('hide');
  loadLB();
}

/* ═══════ 排行榜：Toy 官方 SDK ═══════ */
function loadLB() {
  var area = $('lbArea');
  if (!area) return;
  area.classList.remove('hide');
  if (window.toy && window.toy.getRankList) { loadLBToy(area, S.score); return; }
  area.innerHTML = '<div class="lb-wrap"><p class="lb-note">🏆 本机最高分 <b>' + fmt(S.best) + '</b></p>' +
    '<p class="lb-note" style="font-size:11px">在 B 站 Toy 内打开本页可参与全站榜单</p></div>';
}
function toyRankRows(list, mine) {
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var isMe = mine && mine.ranked && mine.rank === it.rank;
    var av = it.avatar ? '<img class="lb-av" src="' + esc(String(it.avatar)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '';
    html += '<tr' + (isMe ? ' class="lb-my"' : '') + '><td>' + (it.rank || i + 1) + '</td>' +
      '<td class="lb-user">' + av + esc(it.nickname || '匿名') + '</td><td>' + fmt(it.score || 0) + '</td></tr>';
  }
  if (!list.length) html += '<tr><td colspan="3" style="color:#8a7e9a;">暂无记录</td></tr>';
  return html;
}
function loadLBToy(area, sc) {
  var bd = TOY_BOARD[M.key] || 1;
  area.innerHTML = '<p class="lb-note">⏳ 加载 B站排行...</p>';
  /* 兜底：SDK 挂住不返回时别让「加载中」永远留在屏幕上 */
  function timeout(ms) {
    return new Promise(function (r) { setTimeout(function () { r(null); }, ms); });
  }
  Promise.all([
    toy.getRankList({ board: bd, period: 'all', limit: 20 }).catch(function () { return null; }),
    toy.getMyRank({ board: bd, period: 'all' }).catch(function () { return null; }),
    timeout(6000)
  ]).then(function (rs) {
    if (rs[0] === null && rs[1] === null) {
      area.innerHTML = '<p class="lb-note">B站排行暂不可用（本地最高分已保存）</p>';
      return;
    }
    var list = rs[0] || [], mine = rs[1];
    var rank = (mine && mine.ranked) ? mine.rank : 0;
    if (!rank) { for (var i = 0; i < list.length; i++) if (sc > list[i].score) { rank = i + 1; break; } if (!rank && list.length < 20) rank = list.length + 1; }

    var html = '<div class="lb-wrap">';
    if (sc > 0) {
      html += '<div class="lb-submit">' +
        '<button id="lbSubmit" class="lb-btn">提交成绩</button>' +
        '<button id="lbSkip" class="lb-btn-ghost">跳过</button></div>';
    } else if (list.length >= 20) {
      html += '<p class="lb-note">未进入前 20</p>';
    }
    html += '<p class="lb-note" style="color:#8fd8ff">本局 · ' + M.name + ' · ' + fmt(sc) + ' 分</p>';
    html += '<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>#</th><th>玩家</th><th>分数</th></tr></thead><tbody>' +
      toyRankRows(list, mine) + '</tbody></table></div>';
    if (mine && mine.ranked) html += '<p class="lb-note" style="color:#f0c060">我的排名 第 ' + mine.rank + ' 名 · ' + fmt(mine.score) + ' 分</p>';
    else if (mine) html += '<p class="lb-note">成绩未上榜</p>';
    html += '</div>';
    area.innerHTML = html;

    var sb = $('lbSubmit');
    if (sb) sb.addEventListener('click', function () { submitLBToy(area, bd, sc); });
    var sk = $('lbSkip');
    if (sk) sk.addEventListener('click', function () { area.innerHTML = ''; area.classList.add('hide'); });
  }).catch(function () {
    area.innerHTML = '<p class="lb-note">B站排行暂不可用（本地最高分已保存）</p>';
  });
}
function submitLBToy(area, bd, sc) {
  var btn = $('lbSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
  toy.submitScore({ board: bd, score: Math.floor(sc) }).then(function () {
    area.innerHTML = '<p class="lb-ok">✅ 成绩已提交 B站榜单</p>';
    setTimeout(function () { loadLB(); }, 800);
  }, function (e) {
    area.innerHTML = '<p class="lb-err">⚠️ ' + esc(String(e && e.message ? e.message : '提交失败（需登录 B站）')) + '</p>';
    if (btn) { btn.disabled = false; btn.textContent = '重试提交'; }
  });
}

/* ═══════ 锤子 ═══════ */
function toggleAim() {
  if (S.hammers <= 0 || S.gameOver || S.paused) return;
  S.aiming = !S.aiming;
  $('hammerBtn').classList.toggle('aiming', S.aiming);
  toast(S.aiming ? '🔨 点一下要敲掉的笨蛋' : '已取消');
  SND.click();
}
function smashAt(mx, my) {
  var best = null, besty = -1;
  for (var i = 0; i < S.fruits.length; i++) {
    var f = S.fruits[i];
    var dx = f.x - mx, dy = f.y - my;
    if (dx * dx + dy * dy < f.r * f.r) { if (best === null || f.y < besty) { best = f; besty = f.y; } }
  }
  if (!best) return;
  S.fruits.splice(S.fruits.indexOf(best), 1);
  S.hammers--;
  $('hammerCnt').textContent = S.hammers;
  if (S.hammers <= 0) $('hammerBtn').disabled = true;
  S.aiming = false;
  $('hammerBtn').classList.remove('aiming');
  $('lineEl').classList.remove('warn');
  SND.hammer();
  ring(best.x, best.y, best.r, 'red');
  shake(220);
  floater(best.x, best.y, '💥', false);
  toast('敲掉了一个笨蛋!');
}

/* ═══════ 输入 ═══════ */
function pt(e) {
  var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  var r = cv.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}
function bindInput() {
  board.addEventListener('mousemove', function (e) {
    S.holdX = Math.max(0, Math.min(W, pt(e).x));
  });
  board.addEventListener('mousedown', function (e) {
    e.preventDefault();
    var p = pt(e);
    if (S.aiming) { smashAt(p.x, p.y); return; }
    if (!S.running || S.gameOver || S.frozen || S.paused) return;
    S.holdX = Math.max(0, Math.min(W, p.x));
    drop();
  });
  board.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var p = pt(e);
    S.holdX = Math.max(0, Math.min(W, p.x));
    if (S.aiming) { smashAt(p.x, p.y); return; }
    if (!S.running || S.gameOver || S.frozen || S.paused) return;
    drop();
  }, { passive: false });
  board.addEventListener('touchmove', function (e) {
    e.preventDefault();
    S.holdX = Math.max(0, Math.min(W, pt(e).x));
  }, { passive: false });
  board.addEventListener('touchend', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if (!S.running) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); S.holdX = Math.max(0, S.holdX - 22); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); S.holdX = Math.min(W, S.holdX + 22); }
    else if (e.code === 'Space') { e.preventDefault(); if (!S.aiming) drop(); }
    else if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); }
  });
}

/* ═══════ 暂停 ═══════ */
function togglePause() {
  if (!S.running || S.frozen || S.gameOver) return;
  S.paused = !S.paused;
  $('pauseOverlay').classList.toggle('hide', !S.paused);
  $('pauseBtn').textContent = S.paused ? '▶' : '⏸';
  SND.click();
}

/* ═══════ 按钮 ═══════ */
function bindButtons() {
  $('hammerBtn').addEventListener('click', toggleAim);
  $('pauseBtn').addEventListener('click', togglePause);
  $('muteBtn').addEventListener('click', function () {
    S.muted = !S.muted;
    this.textContent = S.muted ? '🔇' : '🔊';
    this.classList.toggle('off', S.muted);
    store(LS.mute, S.muted ? '1' : '0');
    if (!S.muted) SND.click();
  });
}

/* ═══════ 启动 ═══════ */
function showSelect() {
  S.running = false; S.paused = false; S.gameOver = true; S.frozen = false;
  $('overOverlay').classList.add('hide');
  $('pauseOverlay').classList.add('hide');
  $('startOverlay').classList.remove('hide');
  $('pauseBtn').textContent = '⏸';
  SND.click();
}
function startGame(mode) {
  M = MODES[mode] || MODES.big;
  SND.unlock(); SND.click();
  $('startOverlay').classList.add('hide');
  $('overOverlay').classList.add('hide');
  $('pauseOverlay').classList.add('hide');
  document.title = M.name + ' · 霧雨魔法店';
  S.score = 0; S.maxLevel = 0; S.maxChain = 0; S.nines = 0;
  S.fruits = []; S.chain = 0; S.hammers = 0; S.aiming = false;
  S.gameOver = false; S.frozen = false; S.paused = false; S._lastDrop = 0;
  clearTimeout(S._chainReset);
  S.best = parseInt(read(M.key === 'big' ? LS.best : LS.bestSmall) || '0') || 0;
  $('score').textContent = '0';
  $('bestLine').textContent = 'HI ' + fmt(S.best);
  $('hammerCnt').textContent = '0';
  $('hammerBtn').disabled = true;
  $('hammerBtn').classList.remove('aiming');
  $('lineEl').classList.remove('warn');
  $('overTitle').textContent = M.overTitle;
  $('overSub').textContent = M.overSub;
  $('fsMaxLabel').textContent = M.statLabel;
  S.next = pickLevel();
  S.holdX = W / 2;
  newHolding();
  updatePreview();
  S.running = true;
  lastT = performance.now();
  if (!rafId) rafId = requestAnimationFrame(loop);
  fitBoard();
}

/* ═══════ 启动流程 ═══════ */
function boot() {
  app = $('app'); board = $('board'); cv = $('game');
  ctx = cv.getContext('2d');

  S.best = parseInt(read(LS.best) || '0') || 0;
  S.bestSmall = parseInt(read(LS.bestSmall) || '0') || 0;
  $('bestLine').textContent = 'HI ' + fmt(S.best);
  if (read(LS.mute) === '1') { S.muted = true; $('muteBtn').textContent = '🔇'; $('muteBtn').classList.add('off'); }

  buildBg();
  SND.load();
  SNOW.start();
  bindInput();
  bindButtons();
  fitBoard();

  window.addEventListener('resize', fitBoard);
  window.addEventListener('orientationchange', function () { setTimeout(fitBoard, 120); });
  if (window.ResizeObserver) new ResizeObserver(fitBoard).observe(app);

  /* 切后台自动暂停 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && S.running && !S.paused) togglePause();
  });

  var bar = $('loadBar');
  loadImgs(function (p) { if (bar) bar.style.width = Math.round(p * 100) + '%'; }, function () {
    $('loading').classList.add('hide');
    $('startOverlay').classList.remove('hide');
    fitBoard();
  });
}

window.startGame = startGame;
window.showSelect = showSelect;
window.togglePause = togglePause;
window.retryGame = function () { startGame(M.key); };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
