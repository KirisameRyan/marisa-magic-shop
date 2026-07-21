// ═══════════════════════════════════════
//  魔理沙幸存者 · 霧雨魔法店
//  幸存者like：自动攻击 + 走位 + 升级三选一
// ═══════════════════════════════════════
(function(){

var cv = document.getElementById('game');
var ctx = cv.getContext('2d');
var W = 960, H = 540;
var CELL = 64;

// ═══════════ 可配置素材（填路径即生效，留空 '' 关闭）═══════════
var CONFIG = {
  BGM: 'audio/bgm.mp3',      // 背景音乐（首次点击/按键后自动起播，循环）
  BG: 'images/game_bg.jpg'   // 背景图（自动压暗 + 世界坐标视差平铺），留空用程序星空
};

// ═══════════ 素材 ═══════════
var assets = {};
function loadImage(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('Failed: ' + src)); };
    img.src = src;
  });
}
function preloadAll() {
  var base = 'images/sprites/';
  var jobs = [];
  function ld(key, file) { jobs.push(loadImage(base + file).then(function(i) { assets[key] = i; })); }
  ld('m1', 'marisa_run1.png'); ld('m2', 'marisa_run2.png'); ld('m3', 'marisa_run3.png'); ld('m4', 'marisa_run4.png');
  ld('r0', 'reimu_run0.png'); ld('r1', 'reimu_run1.png'); ld('r2', 'reimu_run2.png'); ld('r3', 'reimu_run3.png');
  ld('fairy', 'yaojing.png'); ld('mogu', 'mogu.png');
  // 可选素材：失败不阻塞游戏（Boss 图缺失时回退金色大妖精）
  function ldOpt(key, file) { jobs.push(loadImage(base + file).then(function(i) { assets[key] = i; }, function() { assets[key] = null; })); }
  ldOpt('bossR', 'boss_remilia.png'); ldOpt('bossF', 'boss_flandre.png');
  if (CONFIG.BG) jobs.push(loadImage(CONFIG.BG).then(function(i) { assets.bgimg = i; }, function() { assets.bgimg = null; }));
  return Promise.all(jobs);
}
// 离屏预缩放，避免每帧缩放 1252px 大图
function makeSprite(img, size) {
  if (!img) return null;
  var c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c;
}
// 离屏染色（source-atop 兼容全平台，机制小怪专用）
function makeTinted(img, size, color, alpha) {
  if (!img) return null;
  var c = document.createElement('canvas');
  c.width = size; c.height = size;
  var g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha; g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  return c;
}
var marisaFrames = [], reimuFrames = [];
var spr = {};
function setupFrames() {
  marisaFrames = [assets.m1, assets.m2, assets.m3, assets.m4];
  reimuFrames  = [assets.r0, assets.r1, assets.r2, assets.r3];
  spr.fairy  = makeSprite(assets.fairy, 52);
  spr.mogu   = makeSprite(assets.mogu, 44);
  spr.elite  = makeSprite(assets.fairy, 116);
  spr.split  = makeTinted(assets.mogu, 52, '#3fae5a', 0.45);
  spr.mini   = makeSprite(assets.mogu, 26);
  spr.boom   = makeTinted(assets.mogu, 48, '#ef4444', 0.5);
  spr.shield = makeTinted(assets.fairy, 56, '#f0c060', 0.45);
  spr.redfairy = makeTinted(assets.fairy, 52, '#ef4444', 0.45);
  spr.crystal  = makeTinted(assets.mogu, 30, '#b89fff', 0.5);
  spr.bossR  = makeSprite(assets.bossR, 190);
  spr.bossF  = makeSprite(assets.bossF, 190);
}

// ═══════════ 音效 ═══════════
var audioCtx = null;
var bgm = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  initBgm();
}
function initBgm() {
  if (bgm || !CONFIG.BGM) return;
  try {
    bgm = new Audio(CONFIG.BGM);
    bgm.loop = true; bgm.volume = 0.45;
    var pr = bgm.play(); if (pr && pr.catch) pr.catch(function(){});
  } catch(e) { bgm = null; }
}
function playTone(freq, dur, type, vol, sweep) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (sweep) osc.frequency.linearRampToValueAtTime(sweep, t + dur);
  gain.gain.setValueAtTime((vol || 0.08), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}
// 高频音效节流
var sfxLast = {};
function throttled(key, ms) {
  var now = performance.now();
  if (sfxLast[key] && now - sfxLast[key] < ms) return true;
  sfxLast[key] = now; return false;
}
function sfxShoot()  { if (throttled('shoot', 70)) return; playTone(880, 0.05, 'sine', 0.025, 1200); }
function sfxGem()    { if (throttled('gem', 90)) return; playTone(1500, 0.04, 'sine', 0.03); }
function sfxDie()    { if (throttled('die', 80)) return; playTone(300, 0.08, 'triangle', 0.04, 120); }
function sfxHurt()   { playTone(70, 0.2, 'sawtooth', 0.12, 40); }
function sfxLevel()  { playTone(500,0.08,'square',0.07); setTimeout(function(){playTone(660,0.08,'square',0.07)},80); setTimeout(function(){playTone(880,0.12,'square',0.09)},160); }
function sfxCard()   { playTone(700, 0.06, 'sine', 0.07, 1050); }
function sfxSpark()  { playTone(140, 0.28, 'sawtooth', 0.09, 900); }
function sfxBoom()   { playTone(120, 0.3, 'sawtooth', 0.1, 45); playTone(60, 0.35, 'triangle', 0.08); }
function sfxFreeze() { playTone(1800, 0.15, 'sine', 0.05, 600); }
function sfxBomb()   { playTone(90, 0.5, 'sawtooth', 0.14, 30); playTone(45, 0.6, 'triangle', 0.12); }
function sfxPickup() { playTone(600, 0.07, 'sine', 0.08, 900); }
function sfxWarn()   { playTone(220, 0.15, 'square', 0.08); setTimeout(function(){ playTone(220, 0.15, 'square', 0.08); }, 200); }
function sfxDash()   { playTone(180, 0.2, 'sawtooth', 0.07, 800); }
function sfxBossIn() { playTone(70, 0.6, 'sawtooth', 0.14, 35); playTone(180, 0.4, 'square', 0.07, 60); setTimeout(function(){ playTone(220, 0.2, 'square', 0.08); }, 250); setTimeout(function(){ playTone(220, 0.2, 'square', 0.08); }, 500); }

// ═══════════ 数据表 ═══════════
// 武器：cd/伤害等按 Lv1-5 数组；cont=true 表示持续型无冷却
var WPN = {
  star: { icon:'⭐', name:'星弹', jp:'スターダスト', cd:[40,36,33,30,26], dmg:[12,15,18,21,25], n:[1,1,2,3,4], spread:[0,0,0.15,0.25,0.35], bspd:[7,7,7,7,9],
    desc:['自动索敌 · 1发 · 伤12','伤15 · 冷却缩短','2发扇形 · 伤18','3发 · 伤21','4发 · 伤25 · 弹速+'] },
  spark: { icon:'💥', name:'魔炮', jp:'マスタースパーク', cd:[240,240,192,192,132], dmg:[30,40,40,55,70], bw:[40,50,50,64,64], len:[400,400,480,480,480], dual:[0,0,0,0,1],
    desc:['面向方向光柱 · 伤30','伤40 · 更宽','冷却缩短 · 更长','伤55 · 更宽','前后双向 · 伤70'] },
  orbit: { icon:'✨', name:'环绕星', jp:'サテライト', cont:true, n:[2,3,3,4,5], dmg:[8,8,12,12,18], or:[60,60,72,72,84], rot:[0.044,0.044,0.044,0.057,0.057],
    desc:['2颗绕体星 · 伤8','3颗','伤12 · 半径+','4颗 · 转速+','5颗 · 伤18 · 大半径'] },
  bomb: { icon:'🍄', name:'蘑菇炸弹', jp:'きのこボム', cd:[180,180,144,144,96], dmg:[15,22,22,28,35], ar:[60,70,70,80,90], slow:[0,0,0,0,1],
    desc:['砸向敌群 · AOE伤15','伤22 · 范围+','冷却缩短','伤28 · 范围+','冷却大减 · 附带减速'] },
  frost: { icon:'❄️', name:'冰环', jp:'パーフェクトフリーズ', cd:[300,300,240,240,180], dmg:[10,14,14,20,28], ar:[120,150,150,180,220], frz:[60,60,60,75,90],
    desc:['冰环扩散 · 冻结1秒','范围+ · 伤14','冷却缩短','范围+ · 伤20','大范围 · 冻结1.5秒'] },
  spiral: { icon:'🌀', name:'星屑幻想', jp:'スターダストレヴァリエ', cont:true, rate:[6,6,5,5,4], dmg:[6,8,8,10,12], streams:[1,1,2,2,3],
    desc:['螺旋弹幕 · 伤6','伤8','双股螺旋','射速+ · 伤10','三股螺旋 · 伤12'] },
  comet: { icon:'☄️', name:'彗星', jp:'ブレイジングスター', chr:'marisa', cd:[360,360,300,300,240], dmg:[50,70,70,90,120], ar:[100,110,110,130,150],
    desc:['彗星坠落 · AOE伤50','伤70','冷却缩短','伤90 · 范围+','冷却大减 · 伤120'] },
  yinyang: { icon:'🔮', name:'阴阳玉', jp:'陰陽玉', chr:'reimu', cont:true, n:[2,2,3,3,4], dmg:[12,16,16,20,26], spd:[3.2,3.2,3.2,4,4],
    desc:['2颗弹跳玉 · 伤12','伤16','3颗','加速 · 伤20','4颗 · 伤26'] }
};
var PAS = {
  atk:    { icon:'🔥', name:'火力强化', jp:'火力アップ',   desc:'全武器伤害 +15%' },
  haste:  { icon:'⚡', name:'高速吟唱', jp:'高速詠唱',     desc:'全武器冷却 -12%' },
  move:   { icon:'👟', name:'疾风扫帚', jp:'疾風の箒',     desc:'移速 +10%' },
  magnet: { icon:'🧲', name:'收集魔法', jp:'回収魔法',     desc:'P点磁吸范围 +40%' },
  hpup:   { icon:'❤️', name:'体力强化', jp:'体力アップ',   desc:'生命上限 +25 并回血' },
  exp:    { icon:'📚', name:'知识就是力量', jp:'知識は力', desc:'经验获取 +15%' },
  luck:   { icon:'🍀', name:'强运', jp:'強運',             desc:'道具掉率 +30%' },
  leech:  { icon:'🩸', name:'顺手牵羊', jp:'拝借',         desc:'击杀 3% 概率回 2 HP' }
};
var MAX_WPN_SLOT = 4;
var ETYPE = {
  fairy:  { hp:16,  spd:1.05, r:20, dmg:8,  xp:1, spr:'fairy' },
  mogu:   { hp:10,  spd:1.7,  r:16, dmg:6,  xp:1, spr:'mogu' },
  elite:  { hp:150, spd:0.9,  r:44, dmg:16, xp:5, spr:'elite' },
  split:  { hp:24,  spd:1.25, r:18, dmg:8,  xp:2, spr:'split' },   // 分裂菇：死亡裂成3只小菇
  mini:   { hp:6,   spd:2.2,  r:10, dmg:4,  xp:1, spr:'mini' },
  boom:   { hp:14,  spd:1.5,  r:16, dmg:6,  xp:2, spr:'boom' },    // 自爆菇：近身引信，AOE误伤敌群
  shieldf:{ hp:30,  spd:1.0,  r:20, dmg:8,  xp:2, spr:'shield' },  // 护盾妖精：子弹减伤75%
  redfairy:{ hp:20, spd:1.7,  r:20, dmg:9,  xp:1, spr:'redfairy' }, // 红魔使魔（蕾米莉亚召唤）
  crystal: { hp:8,  spd:1.9,  r:12, dmg:6,  xp:1, spr:'crystal' }   // 水晶小怪（芙兰朵露召唤）
};
// Boss 轮换定义（斯卡雷特姐妹）
var BOSS_DEFS = [
  { name:'蕾米莉亚·斯卡雷特', spr:'bossR', aura:'#c02040' },
  { name:'芙兰朵露·斯卡雷特', spr:'bossF', aura:'#f0c060' }
];
var CHAR = {
  marisa: { r:16, spd:3.3,  frames:function(){ return marisaFrames; } },
  reimu:  { r:12, spd:3.75, frames:function(){ return reimuFrames; } }
};

// ═══════════ 游戏状态 ═══════════
var gameState = 'loading'; // loading/start/select/playing/levelup/over
var playerChar = 'marisa';
var frameCount = 0, lastTs = 0, dt = 1;
var gameTime = 0; // 秒
var kills = 0, score = 0, scoreBonus = 0;
var bestScore = 0, bestTime = 0;
var deathFlash = 0, shakeT = 0, hurtFlash = 0;
var pendingLevels = 0;
var freezeAll = 0; // 时停怀表
var eliteWave = 0, eliteTimer = 0;
var boss = null, bossCount = 0, bossBannerT = 0;
var mist = null; // 蕾米莉亚红雾领域

var player = {};
var enemies = [], bullets = [], gems = [], drops = [];
var ebullets = []; // 敌方弹幕（Boss）
var particles = [], floatingTexts = [];
var dmgPops = []; // 伤害飘字
var beams = [], rings = [], warnings = [];
var yyBalls = [];
var enemyPool = [], bulletPool = [], gemPool = [], ebulletPool = [], dmgPopPool = [];

function resetPlayer() {
  var c = CHAR[playerChar];
  player = {
    x:0, y:0, r:c.r, spd:c.spd, hp:120, maxHp:120,
    fx:1, fy:0, flip:false, inv:0,
    level:1, xp:0, xpNeed:xpNeedFor(1),
    weapons:[{ id:'star', lv:1, t:30, ang:0 }],
    passives:{ atk:0, haste:0, move:0, magnet:0, hpup:0, exp:0, luck:0, leech:0 }
  };
}
function xpNeedFor(l) { return 4 + l*3 + Math.floor(Math.pow(l, 1.5)); }
// 派生属性
function dmgMul()  { return 1 + 0.15 * player.passives.atk; }
function cdMul()   { return Math.max(0.4, Math.pow(0.88, player.passives.haste)); }
function moveMul() { return 1 + 0.10 * player.passives.move; }
function magnetR() { return 90 * (1 + 0.40 * player.passives.magnet); }
function xpMul()   { return 1 + 0.15 * player.passives.exp; }
function luckMul() { return 1 + 0.30 * player.passives.luck; }
function hasWeapon(id) { for (var i=0;i<player.weapons.length;i++) if (player.weapons[i].id===id) return player.weapons[i]; return null; }

// ═══════════ 存储 ═══════════
function loadBest() {
  bestScore = parseInt(localStorage.getItem('ms_best') || '0');
  bestTime  = parseInt(localStorage.getItem('ms_besttime') || '0');
}
function saveBest() {
  if (score > bestScore) { bestScore = score; localStorage.setItem('ms_best', bestScore); }
  var t = Math.floor(gameTime);
  if (t > bestTime) { bestTime = t; localStorage.setItem('ms_besttime', bestTime); }
}

// ═══════════ 输入 ═══════════
var keys = {};
document.addEventListener('keydown', function(e) {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key) >= 0) e.preventDefault();
  keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
  initAudio();
  // 升级界面快捷键
  if (gameState === 'levelup' && ['1','2','3'].indexOf(e.key) >= 0) pickCard(parseInt(e.key) - 1);
});
document.addEventListener('keyup', function(e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });

// 固定虚拟摇杆（左下角常驻，触屏设备）
var JOY = { x: 105, y: H - 105, r: 62 };
var joy = { active:false, id:null, sx:0, sy:0, dx:0, dy:0 };
var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
function toCanvas(cx2, cy2) {
  var rect = cv.getBoundingClientRect();
  return { x: (cx2 - rect.left) / rect.width * W, y: (cy2 - rect.top) / rect.height * H };
}
var wrap = document.querySelector('.canvas-wrap');
wrap.addEventListener('touchstart', function(e) {
  if (gameState !== 'playing' || joy.active) return;
  var t = e.changedTouches[0];
  var pt = toCanvas(t.clientX, t.clientY);
  var jdx = pt.x - JOY.x, jdy = pt.y - JOY.y;
  if (jdx*jdx + jdy*jdy > (JOY.r + 55) * (JOY.r + 55)) return; // 只响应摇杆区
  joy.active = true; joy.id = t.identifier;
  joy.sx = t.clientX; joy.sy = t.clientY; joy.dx = 0; joy.dy = 0;
  initAudio();
  e.preventDefault();
}, { passive:false });
wrap.addEventListener('touchmove', function(e) {
  if (!joy.active) return;
  for (var i=0; i<e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === joy.id) {
      var sdx = t.clientX - joy.sx, sdy = t.clientY - joy.sy;
      var d = Math.sqrt(sdx*sdx + sdy*sdy);
      var m = Math.min(d, 60) / 60;
      joy.dx = d > 1 ? sdx / d * m : 0;
      joy.dy = d > 1 ? sdy / d * m : 0;
      e.preventDefault();
    }
  }
}, { passive:false });
function joyEnd(e) {
  if (!joy.active) return;
  for (var i=0; i<e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joy.id) { joy.active = false; joy.dx = 0; joy.dy = 0; }
  }
}
wrap.addEventListener('touchend', joyEnd);
wrap.addEventListener('touchcancel', joyEnd);

// 竖屏横屏引导遮罩（触屏设备）：竖屏弹遮罩并暂停游戏
var roPaused = false;
var roSkipped = false;
try { roSkipped = sessionStorage.getItem('ms_ro_skip') === '1'; } catch(e) {}
function updateRotateOverlay() {
  if (!isTouch) return;
  var portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
  var show = !!portrait && !roSkipped;
  document.getElementById('rotateOverlay').classList.toggle('show', show);
  if (show) { roPaused = true; }
  else if (roPaused) { roPaused = false; lastTs = performance.now(); acc = 0; }
}
window.addEventListener('resize', updateRotateOverlay);
window.addEventListener('orientationchange', updateRotateOverlay);
document.getElementById('roSkip').addEventListener('click', function() {
  roSkipped = true;
  try { sessionStorage.setItem('ms_ro_skip', '1'); } catch(e) {}
  updateRotateOverlay();
});
updateRotateOverlay();

function inputVector() {
  var vx = 0, vy = 0;
  if (keys['a'] || keys['ArrowLeft']) vx -= 1;
  if (keys['d'] || keys['ArrowRight']) vx += 1;
  if (keys['w'] || keys['ArrowUp']) vy -= 1;
  if (keys['s'] || keys['ArrowDown']) vy += 1;
  if (vx === 0 && vy === 0 && joy.active) { vx = joy.dx; vy = joy.dy; }
  var d = Math.sqrt(vx*vx + vy*vy);
  if (d > 1) { vx /= d; vy /= d; }
  return { x:vx, y:vy };
}

// ═══════════ 空间网格 ═══════════
var grid = {}, gridPool = [];
function gridKey(cx, cy) { return (cx + 4096) * 8192 + (cy + 4096); }
function buildGrid() {
  for (var k in grid) { var a = grid[k]; a.length = 0; gridPool.push(a); }
  grid = {};
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var key = gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    if (!grid[key]) grid[key] = gridPool.pop() || [];
    grid[key].push(e);
  }
}
// 以 (x,y) 为中心 r 半径覆盖的格子内所有敌人，对每只调用 cb
function queryGrid(x, y, r, cb) {
  var x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  var y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) {
    var a = grid[gridKey(cx, cy)];
    if (a) for (var i = 0; i < a.length; i++) cb(a[i]);
  }
}
function nearestEnemy(maxR) {
  var best = null, bd = maxR * maxR;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var dx = e.x - player.x, dy = e.y - player.y, d = dx*dx + dy*dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function densestEnemy() {
  var best = null, bn = -1;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i], cnt = 0;
    queryGrid(e.x, e.y, 110, function(o) { if (o !== e) { var dx=o.x-e.x, dy=o.y-e.y; if (dx*dx+dy*dy < 12100) cnt++; } });
    if (cnt > bn) { bn = cnt; best = e; }
  }
  return best;
}

// ═══════════ 敌人生成 ═══════════
function hpMul()  { return 1 + gameTime / 75; }
function spdMul() { return 1 + Math.min(gameTime / 600, 0.4); }
function spawnInterval() { return Math.max(13.2, 78 * Math.pow(0.94, gameTime / 15)); } // 降难度：1.3s 起步、增速放缓
function enemyCap() { return Math.min(40 + Math.floor(gameTime / 30) * 8, 220); }

function spawnEnemy(type, x, y) {
  var t = ETYPE[type];
  var e = enemyPool.pop() || {};
  var ang = Math.random() * Math.PI * 2;
  var dist = 640 + Math.random() * 120;
  e.x = (x !== undefined) ? x : player.x + Math.cos(ang) * dist;
  e.y = (y !== undefined) ? y : player.y + Math.sin(ang) * dist;
  e.maxHp = Math.round(t.hp * hpMul());
  e.hp = e.maxHp;
  e.spd = t.spd * (0.85 + Math.random() * 0.3);
  e.r = t.r; e.dmg = t.dmg; e.xpv = t.xp;
  e.type = type; e.wing = Math.random() * Math.PI * 2;
  e.hitFlash = 0; e.slowT = 0; e.frozen = 0; e.fuse = 0;
  e.orbHitT = 0; e.yyHitT = 0; e.dead = false;
  e.elite = (type === 'elite'); e.isBoss = false;
  enemies.push(e);
}
function trySpawn() {
  if (enemies.length >= enemyCap()) return;
  var t = gameTime;
  var type = 'fairy';
  var pm = t > 240 ? 0.4 : (t > 90 ? Math.min(0.35, 0.15 + t / 600) : 0);
  if (Math.random() < pm) {
    // 蘑菇系：普通 / 分裂(2:00+) / 自爆(2:30+)
    var r2 = Math.random();
    if (t > 150 && r2 < 0.3) type = 'boom';
    else if (t > 120 && r2 < 0.65) type = 'split';
    else type = 'mogu';
  } else if (t > 210 && Math.random() < 0.18) {
    type = 'shieldf'; // 护盾妖精 3:30+
  }
  spawnEnemy(type);
}
// ═══════════ Boss ═══════════
function spawnBoss() {
  var def = BOSS_DEFS[bossCount % 2];
  var lvl = Math.floor(bossCount / 2); // 每轮两姐妹后 HP ×1.6
  var ang = Math.random() * Math.PI * 2;
  // 清场：非 Boss 敌人化作粒子消散
  for (var ci = enemies.length - 1; ci >= 0; ci--) {
    var m = enemies[ci];
    spawnParticles(m.x, m.y, '#b89fff', 5, 1, 3);
    enemies.splice(ci, 1); m.dead = false; enemyPool.push(m);
  }
  var e = enemyPool.pop() || {};
  e.x = player.x + Math.cos(ang) * 560; e.y = player.y + Math.sin(ang) * 560;
  e.maxHp = Math.round(1700 * hpMul() * Math.pow(1.6, lvl)); // 血量削弱，不再沙包
  e.hp = e.maxHp;
  e.spd = 2.15; e.r = 60; e.dmg = 18; e.xpv = 0; // 速度略低于玩家：靠突进+橡皮筋压制而非永久贴脸
  e.type = 'boss'; e.bossIdx = bossCount % 2;
  e.wing = 0; e.hitFlash = 0; e.slowT = 0; e.frozen = 0; e.fuse = 0;
  e.orbHitT = 0; e.yyHitT = 0; e.dead = false; e.elite = false; e.isBoss = true;
  e.atkT = 150; e.atkPhase = 0; e.chargeT = 0; e.cdx = 0; e.cdy = 0;
  e.waveN = 0; e.waveT = 0;
  enemies.push(e);
  boss = e; bossCount++;
  // 入场演出：横幅 + 红闪 + 震屏 + 登场爆发
  bossBannerT = 105;
  var banner = document.getElementById('bossBanner');
  banner.textContent = '⚠ ' + def.name + ' 参上！ ⚠';
  banner.classList.add('show');
  hurtFlash = 12; shakeT = 14;
  spawnParticles(e.x, e.y, def.aura, 40, 2, 7);
  sfxBossIn();
  document.getElementById('bossName').textContent = def.name;
  document.getElementById('bossBar').classList.remove('hide');
}
function hideBossBar() { document.getElementById('bossBar').classList.add('hide'); }
function spawnEbullet(x, y, vx, vy, dmg, color, life, spear) {
  if (ebullets.length >= 150) return;
  var b = ebulletPool.pop() || {};
  b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.r = 6;
  b.life = life || 500; b.color = color || '#ff6b9d'; b.spear = !!spear;
  ebullets.push(b);
}
// Boss AI：逼近 + 连发波处理 + 各 Boss 差异化技能循环，半血二阶段
function updateBoss(e) {
  var pdx = player.x - e.x, pdy = player.y - e.y;
  var pd2 = pdx*pdx + pdy*pdy;
  var phase2 = e.hp < e.maxHp * 0.5;
  // 突进中（蕾米莉亚路径留伤害残影）
  if (e.chargeT > 0) {
    e.x += e.cdx * 7.5 * dt; e.y += e.cdy * 7.5 * dt;
    e.chargeT -= dt;
    if (e.bossIdx === 0 && frameCount % 5 === 0) spawnEbullet(e.x, e.y, 0, 0, 10, '#c02040', 80);
    return;
  }
  var d = Math.sqrt(pd2) || 1;
  // 橡皮筋：被甩开太远时瞬移到玩家视野内（防止风筝成屏外炮台）
  if (d > 750) {
    spawnParticles(e.x, e.y, '#c02040', 14, 1, 4);
    var ta = Math.random() * Math.PI * 2;
    e.x = player.x + Math.cos(ta) * 380; e.y = player.y + Math.sin(ta) * 380;
    spawnParticles(e.x, e.y, '#c02040', 14, 1, 4);
    sfxWarn();
  }
  if (d > 160) { e.x += pdx / d * e.spd * (phase2 ? 1.5 : 1) * dt; e.y += pdy / d * e.spd * (phase2 ? 1.5 : 1) * dt; }
  // 芙兰朵露七彩散射连发
  if (e.waveN > 0) {
    e.waveT -= dt;
    if (e.waveT <= 0) {
      e.waveT = 26; e.waveN--;
      var cols = ['#ff5b5b','#ffb84d','#fff36b','#7dff7a','#6bd5ff','#b89fff','#ff8fd8'];
      var wn2 = phase2 ? 12 : 9;
      for (var wi2 = 0; wi2 < wn2; wi2++) {
        var wa = (wi2 / wn2) * Math.PI * 2 + e.waveN * 0.4;
        spawnEbullet(e.x, e.y, Math.cos(wa) * 2.6, Math.sin(wa) * 2.6, phase2 ? 13 : 10, cols[(wi2 + e.waveN) % 7], 300);
      }
    }
  }
  e.atkT -= dt;
  if (e.atkT > 0) return;
  var cd = phase2 ? 0.6 : 1;
  if (e.bossIdx === 0) remiliaAttack(e, phase2, cd, pdx, pdy, d);
  else flandreAttack(e, phase2, cd);
  e.atkPhase++;
}
// ── 蕾米莉亚：神枪冈格尼尔 / 红雾领域 / 蝙蝠突进 / 红魔使魔 ──
function remiliaAttack(e, phase2, cd, pdx, pdy, d) {
  var mode = e.atkPhase % 4;
  if (mode === 0) { // 神枪：细线预警 → 高速穿透红枪
    var ba = Math.atan2(pdy, pdx);
    e.cdx = Math.cos(ba); e.cdy = Math.sin(ba);
    warnings.push({ x: e.x, y: e.y, dx: e.cdx, dy: e.cdy, t: 38, boss: e, spear: true, dmg: phase2 ? 20 : 16 });
    e.atkT = 130 * cd;
    sfxWarn();
  } else if (mode === 1) { // 红雾领域：8 秒持续伤害区
    mist = { x: e.x, y: e.y, r: phase2 ? 190 : 150, t: 480, dmg: 8, tick: 0 };
    rings.push({ x: e.x, y: e.y, r: 10, maxR: mist.r, life: 16, maxLife: 16, color: '#c02040' });
    e.atkT = 320 * cd;
    sfxBoom();
  } else if (mode === 2) { // 蝙蝠突进（路径残影）
    e.cdx = pdx / d; e.cdy = pdy / d;
    warnings.push({ x: e.x, y: e.y, dx: e.cdx, dy: e.cdy, t: 42, boss: e, charge: true });
    e.atkT = 190 * cd;
    sfxWarn();
  } else { // 红魔使魔：快速红色妖精
    for (var k = 0; k < 4; k++) { var a3 = (k / 4) * Math.PI * 2 + e.wing; spawnEnemy('redfairy', e.x + Math.cos(a3) * 110, e.y + Math.sin(a3) * 110); }
    e.wing += 0.5;
    e.atkT = 240 * cd;
  }
}
// ── 芙兰朵露：破坏目光 / 七彩散射 / 瞬移 / 水晶之雨 ──
function flandreAttack(e, phase2, cd) {
  var mode = e.atkPhase % 4;
  if (mode === 0) { // 破坏目光：玩家脚下预警 → 爆炸
    warnings.push({ x: player.x, y: player.y, r: 110, t: 50, playerBoom: true, pdmg: phase2 ? 22 : 18 });
    e.atkT = 150 * cd;
    sfxWarn();
  } else if (mode === 1) { // 七彩散射：3 波旋转彩弹
    e.waveN = 3; e.waveT = 0;
    e.atkT = 180 * cd;
  } else if (mode === 2) { // 瞬移：消失后出现在玩家附近
    spawnParticles(e.x, e.y, '#f0c060', 16, 1, 4);
    var ta2 = Math.random() * Math.PI * 2;
    e.x = player.x + Math.cos(ta2) * 300; e.y = player.y + Math.sin(ta2) * 300;
    spawnParticles(e.x, e.y, '#f0c060', 16, 1, 4);
    rings.push({ x: e.x, y: e.y, r: 10, maxR: 70, life: 12, maxLife: 12, color: '#f0c060' });
    e.atkT = 140 * cd;
    sfxDash();
  } else { // 水晶之雨：玩家周围召唤水晶小怪
    for (var k2 = 0; k2 < 6; k2++) { var a4 = (k2 / 6) * Math.PI * 2; spawnEnemy('crystal', player.x + Math.cos(a4) * 330, player.y + Math.sin(a4) * 330); }
    e.atkT = 230 * cd;
  }
}
function eliteWaveSpawn() {
  eliteWave++;
  var n = 2 + eliteWave;
  for (var i = 0; i < n; i++) {
    var ang = (i / n) * Math.PI * 2;
    spawnEnemy('elite', player.x + Math.cos(ang) * 520, player.y + Math.sin(ang) * 520);
  }
  addLabel(player.x, player.y - 60, '⚠ 强敌出现！', '#ef4444');
  sfxWarn();
}

// ═══════════ 敌人软分离（推开重叠，尸潮摊开不叠罗汉）═══════════
function separateEnemies() {
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.isBoss || e.dead) continue;          // Boss 不被推动
    if (e.frozen > 0 || freezeAll > 0) continue; // 冰雕/时停不动
    var pushX = 0, pushY = 0;
    queryGrid(e.x, e.y, e.r + 60, function(o) {
      if (o === e || o.dead) return;
      var dx = e.x - o.x, dy = e.y - o.y;
      var rr = e.r + o.r;
      var d2 = dx*dx + dy*dy;
      if (d2 < rr*rr && d2 > 0.01) {
        var d = Math.sqrt(d2);
        var overlap = (rr - d) / rr;
        var w = (o.isBoss || o.frozen > 0) ? 2 : 1; // Boss/冰雕不动，自己双倍推
        pushX += (dx / d) * overlap * w;
        pushY += (dy / d) * overlap * w;
      }
    });
    if (pushX !== 0 || pushY !== 0) {
      var pl = Math.sqrt(pushX*pushX + pushY*pushY);
      var cap = 1.2 * dt; // 每帧位移封顶，防止高密度爆炸式弹开
      if (pl > cap) { pushX = pushX / pl * cap; pushY = pushY / pl * cap; }
      e.x += pushX; e.y += pushY;
    }
  }
}

// ═══════════ 武器行为 ═══════════
function spawnBullet(x, y, vx, vy, dmg, r, pierce, life, type) {
  var b = bulletPool.pop() || {};
  b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.r = r;
  b.pierce = pierce; b.life = life; b.type = type; b.dead = false;
  bullets.push(b);
}
// ═══════════ 伤害飘字 ═══════════
function addDmgPop(x, y, val, big, color) {
  if (dmgPops.length >= 80) return;
  var p = dmgPopPool.pop() || {};
  p.x = x + (Math.random()-0.5)*14; p.y = y; p.val = Math.round(val);
  p.big = !!big; p.color = color || (big ? '#ffd700' : '#ffffff');
  p.life = big ? 42 : 30; p.maxLife = p.life; p.vy = -1.6;
  dmgPops.push(p);
}
function damageEnemy(e, dmg, kind) {
  if (e.dead) return;
  if (e.type === 'shieldf' && kind === 'bullet') dmg = Math.max(1, Math.round(dmg * 0.25)); // 护盾妖精抗子弹
  e.hp -= dmg; e.hitFlash = 4;
  addDmgPop(e.x, e.y - e.r - 4, dmg, dmg >= 40, null);
  if (e.hp <= 0) killEnemy(e);
}
// 玩家受伤统一入口
function hurtPlayer(dmg) {
  player.hp -= dmg;
  player.inv = 45; // 0.75s 无敌帧（降难度）
  hurtFlash = 10;
  addDmgPop(player.x, player.y - 30, dmg, false, '#ff5555');
  spawnParticles(player.x, player.y, '#ef4444', 14, 2, 5);
  sfxHurt();
  if (player.hp <= 0) endGame();
}
function killEnemy(e) {
  e.dead = true; kills++;
  spawnParticles(e.x, e.y, (e.elite || e.isBoss) ? '#f0c060' : '#b89fff', e.elite ? 22 : 8, 1, 3);
  sfxDie();
  // P点
  for (var i = 0; i < e.xpv; i++) spawnGem(e.x + (Math.random()-0.5)*20, e.y + (Math.random()-0.5)*20, 1);
  // 顺手牵羊
  if (player.passives.leech > 0 && Math.random() < 0.03 * player.passives.leech) {
    player.hp = Math.min(player.maxHp, player.hp + 2);
  }
  // 分裂菇：裂成 3 只小菇
  if (e.type === 'split') {
    for (var sp = 0; sp < 3; sp++) spawnEnemy('mini', e.x + (Math.random()-0.5)*26, e.y + (Math.random()-0.5)*26);
  }
  // Boss 击破：大奖
  if (e.isBoss) {
    boss = null; hideBossBar(); mist = null;
    scoreBonus += 500;
    for (var bg = 0; bg < 20; bg++) spawnGem(e.x + (Math.random()-0.5)*90, e.y + (Math.random()-0.5)*90, 1);
    eliteDrop(e.x - 24, e.y); eliteDrop(e.x + 24, e.y);
    addLabel(e.x, e.y - 60, '🎉 BOSS 击破！ +500', '#f0c060');
    spawnParticles(e.x, e.y, '#f0c060', 40, 2, 7);
    shakeT = 12;
    sfxBomb();
    return;
  }
  // 掉落
  if (e.elite) eliteDrop(e.x, e.y);
  else if (Math.random() < 0.025 * luckMul()) spawnDrop(e.x, e.y, 'heart'); // 红心掉率提升（降难度）
}
// 自爆菇引爆（也误伤敌群）
function boomExplode(e, idx) {
  rings.push({ x:e.x, y:e.y, r:10, maxR:110, life:14, maxLife:14, color:'#ef4444' });
  spawnParticles(e.x, e.y, '#ef4444', 22, 2, 5);
  sfxBoom();
  queryGrid(e.x, e.y, 160, function(o) {
    if (o === e || o.dead) return;
    var dx = o.x - e.x, dy = o.y - e.y;
    if (dx*dx + dy*dy < (110 + o.r) * (110 + o.r)) damageEnemy(o, 60, 'aoe');
  });
  var pdx = player.x - e.x, pdy = player.y - e.y;
  if (player.inv <= 0 && pdx*pdx + pdy*pdy < (110 + player.r) * (110 + player.r)) hurtPlayer(25);
  e.dead = true;
  enemies.splice(idx, 1); e.dead = false; enemyPool.push(e);
}
function explosion(x, y, r, dmg, applySlow) {
  rings.push({ x:x, y:y, r:10, maxR:r, life:14, maxLife:14, color:'#f0c060' });
  spawnParticles(x, y, '#f0c060', 18, 2, 5);
  sfxBoom();
  queryGrid(x, y, r + 50, function(e) {
    var dx = e.x - x, dy = e.y - y;
    if (dx*dx + dy*dy < (r + e.r) * (r + e.r)) {
      damageEnemy(e, dmg, 'aoe');
      if (applySlow && !e.isBoss) e.slowT = 90;
    }
  });
}
function tickWeapon(w) {
  var cfg = WPN[w.id], lv = w.lv - 1;
  if (cfg.cont) return;
  w.t -= dt;
  if (w.t > 0) return;
  var fired = true;
  if (w.id === 'star') {
    var tgt = nearestEnemy(620);
    var ba = tgt ? Math.atan2(tgt.y - player.y, tgt.x - player.x) : Math.atan2(player.fy, player.fx);
    var n = cfg.n[lv];
    for (var i = 0; i < n; i++) {
      var a = ba + (i - (n-1)/2) * cfg.spread[lv];
      spawnBullet(player.x, player.y, Math.cos(a)*cfg.bspd[lv], Math.sin(a)*cfg.bspd[lv], cfg.dmg[lv]*dmgMul(), 6, 0, 140, 'star');
    }
    sfxShoot();
  } else if (w.id === 'spark') {
    fireBeam(cfg.bw[lv], cfg.len[lv], cfg.dmg[lv]*dmgMul());
    if (cfg.dual[lv]) fireBeam(cfg.bw[lv], cfg.len[lv], cfg.dmg[lv]*dmgMul(), true);
    sfxSpark();
  } else if (w.id === 'bomb') {
    var d = densestEnemy();
    if (d) explosion(d.x, d.y, cfg.ar[lv], cfg.dmg[lv]*dmgMul(), cfg.slow[lv]);
    else fired = false;
  } else if (w.id === 'frost') {
    rings.push({ x:player.x, y:player.y, r:20, maxR:cfg.ar[lv], life:18, maxLife:18, color:'#8fd8ff' });
    queryGrid(player.x, player.y, cfg.ar[lv] + 50, function(e) {
      var dx = e.x - player.x, dy = e.y - player.y;
      if (dx*dx + dy*dy < (cfg.ar[lv] + e.r) * (cfg.ar[lv] + e.r)) {
        damageEnemy(e, cfg.dmg[lv]*dmgMul(), 'aoe');
        if (!e.isBoss) e.frozen = Math.max(e.frozen, cfg.frz[lv]); // Boss 免疫冰冻
      }
    });
    sfxFreeze();
  } else if (w.id === 'comet') {
    var c = densestEnemy();
    if (c) { warnings.push({ x:c.x, y:c.y, r:cfg.ar[lv], t:36, dmg:cfg.dmg[lv]*dmgMul() }); sfxWarn(); }
    else fired = false;
  }
  w.t = fired ? cfg.cd[lv] * cdMul() : 30;
}
function fireBeam(bw, len, dmg, reverse) {
  var dx = reverse ? -player.fx : player.fx, dy = reverse ? -player.fy : player.fy;
  beams.push({ x:player.x, y:player.y, dx:dx, dy:dy, w:bw, len:len, life:12, maxLife:12 });
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var rx = e.x - player.x, ry = e.y - player.y;
    var proj = rx * dx + ry * dy;
    if (proj < -e.r || proj > len + e.r) continue;
    var perp = Math.abs(rx * dy - ry * dx);
    if (perp < bw / 2 + e.r) damageEnemy(e, dmg, 'beam');
  }
}
function updateContinuous(w) {
  var cfg = WPN[w.id], lv = w.lv - 1;
  if (w.id === 'orbit') {
    w.ang += cfg.rot[lv] * dt;
    var n = cfg.n[lv], or = cfg.or[lv];
    for (var i = 0; i < n; i++) {
      var a = w.ang + (i / n) * Math.PI * 2;
      var ox = player.x + Math.cos(a) * or, oy = player.y + Math.sin(a) * or;
      queryGrid(ox, oy, 14 + 50, function(e) {
        var ddx = e.x - ox, ddy = e.y - oy;
        if (ddx*ddx + ddy*ddy < (14 + e.r) * (14 + e.r) && frameCount - e.orbHitT > 18) {
          e.orbHitT = frameCount;
          damageEnemy(e, cfg.dmg[lv] * dmgMul(), 'contact');
        }
      });
    }
  } else if (w.id === 'spiral') {
    w.ang += 0.35 * dt;
    w.t -= dt;
    if (w.t <= 0) {
      w.t = cfg.rate[lv];
      for (var s = 0; s < cfg.streams[lv]; s++) {
        var a = w.ang + (s / cfg.streams[lv]) * Math.PI * 2;
        spawnBullet(player.x, player.y, Math.cos(a)*5.5, Math.sin(a)*5.5, cfg.dmg[lv]*dmgMul(), 5, 0, 85, 'spiral');
      }
    }
  } else if (w.id === 'yinyang') {
    var want = cfg.n[lv];
    while (yyBalls.length < want) yyBalls.push({ x:player.x + (Math.random()-0.5)*200, y:player.y + (Math.random()-0.5)*200, vx:(Math.random()<0.5?-1:1)*cfg.spd[lv], vy:(Math.random()<0.5?-1:1)*cfg.spd[lv], r:14 });
    var spd = cfg.spd[lv];
    for (var b = 0; b < yyBalls.length; b++) {
      var ball = yyBalls[b];
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      var relX = ball.x - player.x, relY = ball.y - player.y;
      if (Math.abs(relX) > 340) { ball.vx = -ball.vx; ball.x = player.x + (relX > 0 ? 340 : -340); }
      if (Math.abs(relY) > 260) { ball.vy = -ball.vy; ball.y = player.y + (relY > 0 ? 260 : -260); }
      queryGrid(ball.x, ball.y, ball.r + 50, function(e) {
        var ddx = e.x - ball.x, ddy = e.y - ball.y;
        if (ddx*ddx + ddy*ddy < (ball.r + e.r) * (ball.r + e.r) && frameCount - e.yyHitT > 24) {
          e.yyHitT = frameCount;
          damageEnemy(e, cfg.dmg[lv] * dmgMul(), 'contact');
        }
      });
    }
    // 玉与玉弹性碰撞，防重叠
    for (var ba2 = 0; ba2 < yyBalls.length; ba2++) for (var bb2 = ba2 + 1; bb2 < yyBalls.length; bb2++) {
      var A = yyBalls[ba2], B = yyBalls[bb2];
      var cdx = B.x - A.x, cdy = B.y - A.y;
      var crr = A.r + B.r, cd2 = cdx*cdx + cdy*cdy;
      if (cd2 < crr*crr && cd2 > 0.01) {
        var cd3 = Math.sqrt(cd2), cnx = cdx / cd3, cny = cdy / cd3;
        var cp = (crr - cd3) / 2;
        A.x -= cnx * cp; A.y -= cny * cp; B.x += cnx * cp; B.y += cny * cp;
        var cva = A.vx * cnx + A.vy * cny, cvb = B.vx * cnx + B.vy * cny;
        A.vx += (cvb - cva) * cnx; A.vy += (cvb - cva) * cny;
        B.vx += (cva - cvb) * cnx; B.vy += (cva - cvb) * cny;
      }
    }
  }
}

// ═══════════ P点 / 掉落道具 ═══════════
function spawnGem(x, y, val) {
  if (gems.length > 500) gems.shift();
  var g = gemPool.pop() || {};
  g.x = x; g.y = y; g.val = val; g.mag = false; g.dead = false;
  gems.push(g);
}
function spawnDrop(x, y, kind) {
  drops.push({ x:x, y:y, kind:kind, life:1800 });
}
function eliteDrop(x, y) {
  var roll = Math.random() / luckMul();
  if (roll < 0.25) spawnDrop(x, y, 'onigiri');
  else if (roll < 0.45) spawnDrop(x, y, 'bomb');
  else if (roll < 0.60) spawnDrop(x, y, 'magnet');
  else if (roll < 0.70) spawnDrop(x, y, 'watch');
  else for (var i = 0; i < 5; i++) spawnGem(x + (Math.random()-0.5)*40, y + (Math.random()-0.5)*40, 1);
}
var DROP_INFO = {
  heart:   { emoji:'❤️', label:'+25 HP', color:'#ff4466' },
  onigiri: { emoji:'🍙', label:'+60 HP', color:'#6fcf97' },
  bomb:    { emoji:'💣', label:'灵击！', color:'#f0c060' },
  magnet:  { emoji:'🧲', label:'全屏收集', color:'#8fd8ff' },
  watch:   { emoji:'🕐', label:'时停！', color:'#b89fff' }
};
function applyDrop(d) {
  var info = DROP_INFO[d.kind];
  addLabel(player.x, player.y - 40, info.emoji + ' ' + info.label, info.color);
  sfxPickup();
  if (d.kind === 'heart') player.hp = Math.min(player.maxHp, player.hp + 25);
  else if (d.kind === 'onigiri') player.hp = Math.min(player.maxHp, player.hp + 60);
  else if (d.kind === 'bomb') {
    deathFlash = Math.max(deathFlash, 10);
    player.inv = Math.max(player.inv, 60);
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = e.x - player.x, dy = e.y - player.y;
      if (dx*dx + dy*dy < 700*700) damageEnemy(e, 200, 'aoe');
    }
    sfxBomb();
  }
  else if (d.kind === 'magnet') for (var m = 0; m < gems.length; m++) gems[m].mag = true;
  else if (d.kind === 'watch') { freezeAll = 180; sfxFreeze(); }
}

// ═══════════ 升级卡池 ═══════════
function buildCardPool() {
  var pool = [];
  for (var i = 0; i < player.weapons.length; i++) {
    if (player.weapons[i].lv < 5) pool.push({ type:'wup', id:player.weapons[i].id });
  }
  if (player.weapons.length < MAX_WPN_SLOT) {
    for (var id in WPN) {
      if (hasWeapon(id)) continue;
      if (WPN[id].chr && WPN[id].chr !== playerChar) continue;
      pool.push({ type:'wnew', id:id });
    }
  }
  for (var p in PAS) {
    if (player.passives[p] < 5) pool.push({ type:'pas', id:p });
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
  while (cards.length < 3) cards.push({ type:'heal' });
  return cards;
}
function cardInfo(c) {
  if (c.type === 'wup') { var w = WPN[c.id], wp = hasWeapon(c.id); return { icon:w.icon, name:w.name, jp:w.jp, lv:wp.lv + 1, desc:w.desc[wp.lv] }; }
  if (c.type === 'wnew') { var n = WPN[c.id]; return { icon:n.icon, name:n.name + ' ✦新', jp:n.jp, lv:1, desc:n.desc[0] }; }
  if (c.type === 'pas') { var q = PAS[c.id]; return { icon:q.icon, name:q.name, jp:q.jp, lv:player.passives[c.id] + 1, desc:q.desc }; }
  return { icon:'🍙', name:'饭团补给', jp:'おにぎり', lv:0, desc:'立即回血 50' };
}
function applyCard(c) {
  if (c.type === 'wup') { hasWeapon(c.id).lv++; }
  else if (c.type === 'wnew') { player.weapons.push({ id:c.id, lv:1, t:20, ang:Math.random()*6 }); }
  else if (c.type === 'pas') {
    player.passives[c.id]++;
    if (c.id === 'hpup') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); }
  }
  else { player.hp = Math.min(player.maxHp, player.hp + 50); }
}
var currentCards = [];
function enterLevelUp() {
  gameState = 'levelup';
  currentCards = rollCards();
  document.getElementById('lvNum').textContent = player.level;
  var box = document.getElementById('lvCards');
  box.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    (function(idx) {
      var info = cardInfo(currentCards[idx]);
      var div = document.createElement('div');
      div.className = 'lv-card';
      var pips = '';
      if (info.lv > 0) for (var p = 1; p <= 5; p++) pips += p <= info.lv ? '●' : '○';
      div.innerHTML = '<div class="lv-icon">' + info.icon + '</div>' +
        '<div class="lv-name">' + info.name + '</div>' +
        '<div class="lv-jp">' + info.jp + '</div>' +
        (pips ? '<div class="lv-pips">' + pips + '</div>' : '') +
        '<div class="lv-desc">' + info.desc + '</div>' +
        '<div class="lv-key">' + (idx + 1) + '</div>';
      div.addEventListener('click', function() { pickCard(idx); });
      box.appendChild(div);
    })(i);
  }
  document.getElementById('levelOverlay').classList.remove('hide');
}
function pickCard(i) {
  if (gameState !== 'levelup' || !currentCards[i]) return;
  applyCard(currentCards[i]);
  sfxCard();
  pendingLevels--;
  if (pendingLevels > 0) { enterLevelUp(); return; }
  document.getElementById('levelOverlay').classList.add('hide');
  gameState = 'playing';
  lastTs = performance.now(); acc = 0;
}
function gainXp(v) {
  player.xp += v * xpMul();
  sfxGem();
  while (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level++;
    player.xpNeed = xpNeedFor(player.level);
    pendingLevels++;
    addLabel(player.x, player.y - 50, '✨ LEVEL UP!', '#f0c060');
    sfxLevel();
  }
}

// ═══════════ 粒子 / 浮动文字 ═══════════
function spawnParticles(x, y, color, count, minR, maxR) {
  if (particles.length > 400) return;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var spd = 1 + Math.random() * 4;
    particles.push({ x:x, y:y, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd, life:15+Math.random()*15, maxLife:28, color:color, r:(minR||1)+Math.random()*((maxR||3)-(minR||1)) });
  }
}
function addLabel(x, y, text, color) {
  floatingTexts.push({ x:x, y:y, text:text, color:color, life:80, maxLife:80, vy:-1.2 });
}

// ═══════════ 主更新（固定 60Hz 步长，全设备同速）═══════════
function stepGame() {
  if (gameState !== 'playing' || roPaused) return;
  dt = 1;
  frameCount++;
  if (!boss) gameTime += 1 / 60; // Boss 战期间时间暂停（下一波 Boss 不撞车）
  score = kills * 50 + Math.floor(gameTime) * 10 + scoreBonus;

  // ── 玩家移动 ──
  var iv = inputVector();
  var spd = player.spd * moveMul() * dt;
  player.x += iv.x * spd; player.y += iv.y * spd;
  if (iv.x !== 0 || iv.y !== 0) {
    var il = Math.sqrt(iv.x*iv.x + iv.y*iv.y);
    player.fx = iv.x / il; player.fy = iv.y / il;
    if (iv.x < -0.1) player.flip = true;
    else if (iv.x > 0.1) player.flip = false;
  }
  if (player.inv > 0) player.inv -= dt;
  if (freezeAll > 0) freezeAll -= dt;

  // ── 武器 ──
  for (var wi = 0; wi < player.weapons.length; wi++) {
    tickWeapon(player.weapons[wi]);
    updateContinuous(player.weapons[wi]);
  }

  // ── 红雾领域（蕾米莉亚）──
  if (mist) {
    mist.t -= dt; mist.tick -= dt;
    if (mist.tick <= 0) {
      mist.tick = 30;
      var mdx = player.x - mist.x, mdy = player.y - mist.y;
      if (player.inv <= 0 && mdx*mdx + mdy*mdy < mist.r * mist.r) hurtPlayer(mist.dmg);
    }
    if (gameState !== 'playing') return;
    if (mist.t <= 0) mist = null;
  }

  // ── 生成（Boss 战期间停刷普通怪，Boss 召唤技除外）──
  spawnTimer += dt;
  if (!boss && spawnTimer >= spawnInterval()) { trySpawn(); spawnTimer = 0; }
  if (gameTime >= 180 && !boss) {
    eliteTimer += dt;
    if (eliteTimer >= 90 * 60) { eliteWaveSpawn(); eliteTimer = 0; }
  }
  // Boss：5:00 首只，之后每 4 分钟一只（姐妹轮换）
  if (!boss && gameTime >= 300 + bossCount * 240) spawnBoss();

  // ── 敌人 ──
  buildGrid();
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); e.dead = false; enemyPool.push(e); continue; }
    // 太远的普通怪回收，保持压力
    var pdx = player.x - e.x, pdy = player.y - e.y;
    var pd2 = pdx*pdx + pdy*pdy;
    if (!e.elite && !e.isBoss && pd2 > 1500*1500) { enemies.splice(i, 1); enemyPool.push(e); continue; }
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.isBoss) {
      if (freezeAll <= 0) updateBoss(e);
    } else if (e.frozen > 0) { e.frozen -= dt; }
    else if (freezeAll <= 0) {
      var d = Math.sqrt(pd2) || 1;
      var es = e.spd * spdMul();
      if (e.slowT > 0) { es *= 0.7; e.slowT -= dt; }
      // 朝向玩家 + 侧向摆动防止完全叠罗汉
      var wob = Math.sin(frameCount * 0.03 + e.wing) * 0.45;
      var nx = pdx / d, ny = pdy / d;
      e.x += (nx - ny * wob) * es * dt;
      e.y += (ny + nx * wob) * es * dt;
      // 自爆菇：近身 90px 点引信，1 秒后爆炸
      if (e.type === 'boom') {
        if (e.fuse > 0) {
          e.fuse -= dt;
          if (e.fuse <= 0) { boomExplode(e, i); continue; }
        } else if (pd2 < 90*90) e.fuse = 60;
      }
    }
    // 撞玩家（接触伤害随时间小幅成长）
    if (player.inv <= 0 && pd2 < (e.r + player.r) * (e.r + player.r)) {
      hurtPlayer(Math.round(e.dmg * (1 + gameTime / 480))); // 接触伤害成长放缓（降难度）
      if (gameState !== 'playing') return;
    }
  }
  // 敌人之间软分离（复用网格，防叠罗汉）
  separateEnemies();

  // ── 子弹 ──
  for (var bi = bullets.length - 1; bi >= 0; bi--) {
    var b = bullets[bi];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { bullets.splice(bi, 1); bulletPool.push(b); continue; }
    var hit = false;
    queryGrid(b.x, b.y, b.r + 50, function(e) {
      if (hit && b.pierce <= 0) return;
      var dx = e.x - b.x, dy = e.y - b.y;
      if (dx*dx + dy*dy < (b.r + e.r) * (b.r + e.r)) {
        damageEnemy(e, b.dmg, 'bullet');
        if (b.pierce > 0) b.pierce--;
        else hit = true;
      }
    });
    if (hit) { bullets.splice(bi, 1); bulletPool.push(b); }
  }

  // ── 敌方弹幕 ──
  for (var ebi = ebullets.length - 1; ebi >= 0; ebi--) {
    var eb = ebullets[ebi];
    if (freezeAll <= 0) { eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt; }
    var edx = eb.x - player.x, edy = eb.y - player.y;
    var ed2 = edx*edx + edy*edy;
    if (eb.life <= 0 || ed2 > 950*950) { ebullets.splice(ebi, 1); ebulletPool.push(eb); continue; }
    if (player.inv <= 0 && ed2 < (eb.r + player.r) * (eb.r + player.r)) {
      hurtPlayer(eb.dmg);
      ebullets.splice(ebi, 1); ebulletPool.push(eb);
      if (gameState !== 'playing') return;
    }
  }

  // ── 彗星预警 / Boss突进预警 ──
  for (var ci = warnings.length - 1; ci >= 0; ci--) {
    var wn = warnings[ci];
    wn.t -= dt;
    if (wn.charge) {
      if (wn.t <= 0) { if (wn.boss && !wn.boss.dead) { wn.boss.chargeT = 40; sfxDash(); } warnings.splice(ci, 1); }
    } else if (wn.spear) {
      if (wn.t <= 0) {
        if (wn.boss && !wn.boss.dead) {
          for (var sp2 = -1; sp2 <= 1; sp2++) {
            var sa = Math.atan2(wn.dy, wn.dx) + sp2 * 0.07;
            spawnEbullet(wn.boss.x, wn.boss.y, Math.cos(sa) * 6.5, Math.sin(sa) * 6.5, wn.dmg, '#ff3b30', 200, true);
          }
          sfxSpark();
        }
        warnings.splice(ci, 1);
      }
    } else if (wn.playerBoom) {
      if (wn.t <= 0) {
        rings.push({ x: wn.x, y: wn.y, r: 10, maxR: wn.r, life: 14, maxLife: 14, color: '#ef4444' });
        spawnParticles(wn.x, wn.y, '#ef4444', 16, 2, 5);
        var pbd = (player.x - wn.x) * (player.x - wn.x) + (player.y - wn.y) * (player.y - wn.y);
        if (player.inv <= 0 && pbd < (wn.r + player.r) * (wn.r + player.r)) hurtPlayer(wn.pdmg);
        sfxBoom();
        warnings.splice(ci, 1);
      }
      if (gameState !== 'playing') return;
    } else if (wn.t <= 0) {
      explosion(wn.x, wn.y, wn.r, wn.dmg, false);
      shakeT = 8;
      warnings.splice(ci, 1);
    }
  }

  // ── P点 ──
  var mr = magnetR();
  for (var gi = gems.length - 1; gi >= 0; gi--) {
    var g = gems[gi];
    var gdx = player.x - g.x, gdy = player.y - g.y;
    var gd2 = gdx*gdx + gdy*gdy;
    if (g.mag || gd2 < mr * mr) {
      var gd = Math.sqrt(gd2) || 1;
      var gs = g.mag ? 9 : 6;
      g.x += gdx / gd * gs * dt; g.y += gdy / gd * gs * dt;
    }
    if (gd2 < 24 * 24) { gainXp(g.val); gems.splice(gi, 1); gemPool.push(g); }
  }

  // ── 掉落道具 ──
  for (var di = drops.length - 1; di >= 0; di--) {
    var dp = drops[di];
    dp.life -= dt;
    if (dp.life <= 0) { drops.splice(di, 1); continue; }
    var ddx = player.x - dp.x, ddy = player.y - dp.y;
    if (ddx*ddx + ddy*ddy < 30 * 30) { applyDrop(dp); drops.splice(di, 1); }
  }

  // ── 升级暂停 ──
  if (pendingLevels > 0) { enterLevelUp(); return; }

  // ── 特效 ──
  updateFx();
  updateHud();
}
var spawnTimer = 0;
function updateFx() {
  for (var i = particles.length - 1; i >= 0; i--) { var p = particles[i]; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
  for (var f = floatingTexts.length - 1; f >= 0; f--) { var ft = floatingTexts[f]; ft.y += ft.vy*dt; ft.life -= dt; if (ft.life <= 0) floatingTexts.splice(f, 1); }
  for (var bm = beams.length - 1; bm >= 0; bm--) { beams[bm].life -= dt; if (beams[bm].life <= 0) beams.splice(bm, 1); }
  for (var rg = rings.length - 1; rg >= 0; rg--) { var r2 = rings[rg]; r2.r += (r2.maxR - 10) / r2.maxLife * dt; r2.life -= dt; if (r2.life <= 0) rings.splice(rg, 1); }
  for (var dp3 = dmgPops.length - 1; dp3 >= 0; dp3--) { var pp = dmgPops[dp3]; pp.y += pp.vy * dt; pp.life -= dt; if (pp.life <= 0) { dmgPops.splice(dp3, 1); dmgPopPool.push(pp); } }
  if (bossBannerT > 0) { bossBannerT -= dt; if (bossBannerT <= 0) document.getElementById('bossBanner').classList.remove('show'); }
  if (shakeT > 0) shakeT -= dt;
}

// ═══════════ 绘制 ═══════════
function hash2(x, y, s) {
  var h = (x * 374761393 + y * 668265263 + s * 1013904223) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function drawStars(camX, camY) {
  var layers = [ {s:110, p:0.25, n:0.5}, {s:170, p:0.5, n:0.75}, {s:260, p:0.8, n:1} ];
  for (var L = 0; L < 3; L++) {
    var lay = layers[L];
    var ox = camX * lay.p, oy = camY * lay.p;
    var x0 = Math.floor(ox / lay.s) - 1, x1 = Math.floor((ox + W) / lay.s) + 1;
    var y0 = Math.floor(oy / lay.s) - 1, y1 = Math.floor((oy + H) / lay.s) + 1;
    for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) {
      var h = hash2(cx, cy, L);
      if (h > 0.35) continue;
      var sx = cx * lay.s + hash2(cx, cy, L+9) * lay.s - ox;
      var sy = cy * lay.s + hash2(cx, cy, L+19) * lay.s - oy;
      var sz = 1 + hash2(cx, cy, L+29) * (L + 1);
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(frameCount * 0.02 + h * 20));
      ctx.globalAlpha = tw * lay.n * 0.7;
      ctx.fillStyle = L === 2 ? '#f0c060' : '#cfc4e8';
      ctx.fillRect(sx, sy, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}
function drawStarShape(cx, cy, r) {
  ctx.beginPath();
  for (var i = 0; i < 5; i++) {
    var outer = (i*4*Math.PI)/5 - Math.PI/2;
    var inner = outer + (2*Math.PI)/10;
    if (i===0) ctx.moveTo(cx+Math.cos(outer)*r, cy+Math.sin(outer)*r);
    else ctx.lineTo(cx+Math.cos(outer)*r, cy+Math.sin(outer)*r);
    ctx.lineTo(cx+Math.cos(inner)*r*0.4, cy+Math.sin(inner)*r*0.4);
  }
  ctx.closePath(); ctx.fill();
}
var drawTs = 0;
function draw() {
  // 闪光类特效按真实时间衰减（与逻辑步长解耦）
  var dnow = performance.now();
  var ddt = Math.min((dnow - drawTs) / 16.67, 3); if (ddt <= 0) ddt = 1;
  drawTs = dnow;
  var camX = player.x - W / 2, camY = player.y - H / 2;
  if (shakeT > 0) { camX += (Math.random()-0.5) * 6; camY += (Math.random()-0.5) * 6; }
  ctx.clearRect(0, 0, W, H);
  if (assets.bgimg) {
    // 自定义背景：世界坐标平铺 + 压暗（夜晚庭院，保证角色可读）
    var ts = 627;
    var bx0 = Math.floor(camX / ts) * ts, by0 = Math.floor(camY / ts) * ts;
    for (var bx = bx0; bx < camX + W + ts; bx += ts)
      for (var by = by0; by < camY + H + ts; by += ts)
        ctx.drawImage(assets.bgimg, bx - camX, by - camY, ts, ts);
    ctx.fillStyle = 'rgba(12,9,20,0.62)'; ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, W, H);
  }
  drawStars(camX, camY);

  function sx(x) { return x - camX; }
  function sy(y) { return y - camY; }
  function onScreen(x, y, m) { return x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m; }

  // P点
  for (var gi = 0; gi < gems.length; gi++) {
    var g = gems[gi];
    if (!onScreen(g.x, g.y, 20)) continue;
    var pulse = 5 + Math.sin(frameCount * 0.1 + gi) * 1.2;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(sx(g.x), sy(g.y), pulse + 4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd700'; drawStarShape(sx(g.x), sy(g.y), pulse);
    ctx.fillStyle = '#fff'; drawStarShape(sx(g.x), sy(g.y), pulse * 0.45);
  }
  // 掉落道具
  for (var di = 0; di < drops.length; di++) {
    var dp = drops[di];
    if (!onScreen(dp.x, dp.y, 30)) continue;
    if (dp.life < 300 && Math.floor(frameCount / 10) % 2 === 0) continue; // 快消失时闪烁
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = DROP_INFO[dp.kind].color;
    ctx.beginPath(); ctx.arc(sx(dp.x), sy(dp.y), 16, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(DROP_INFO[dp.kind].emoji, sx(dp.x), sy(dp.y));
  }
  // 彗星预警 / Boss突进预警线
  for (var wi = 0; wi < warnings.length; wi++) {
    var wn = warnings[wi];
    var px2 = sx(wn.x), py2 = sy(wn.y);
    if (wn.charge) {
      ctx.strokeStyle = 'rgba(239,68,68,' + (Math.floor(wn.t / 6) % 2 === 0 ? 0.45 : 0.18) + ')';
      ctx.lineWidth = 26; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px2 + wn.dx * 560, py2 + wn.dy * 560); ctx.stroke();
      ctx.lineCap = 'butt';
      continue;
    }
    if (wn.spear) { // 冈格尼尔细线预警
      ctx.strokeStyle = 'rgba(255,59,48,' + (Math.floor(wn.t / 5) % 2 === 0 ? 0.6 : 0.25) + ')';
      ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px2 + wn.dx * 620, py2 + wn.dy * 620); ctx.stroke();
      ctx.lineCap = 'butt';
      continue;
    }
    if (wn.playerBoom) { // 破坏目光：玩家脚下红圈
      ctx.strokeStyle = 'rgba(239,68,68,0.8)';
      ctx.setLineDash([6, 5]); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px2, py2, wn.r, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239,68,68,0.3)';
      ctx.beginPath(); ctx.arc(px2, py2, wn.r * (wn.t / 50), 0, Math.PI*2); ctx.fill();
      continue;
    }
    ctx.strokeStyle = 'rgba(239,68,68,0.7)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px2, py2, wn.r, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(239,68,68,0.25)';
    ctx.beginPath(); ctx.arc(px2, py2, wn.r * (wn.t / 36), 0, Math.PI*2); ctx.fill();
  }
  // 敌人
  for (var ei = 0; ei < enemies.length; ei++) {
    var e = enemies[ei];
    if (!onScreen(e.x, e.y, 130)) continue;
    // ── Boss 专属绘制 ──
    if (e.isBoss) {
      var bdef = BOSS_DEFS[e.bossIdx];
      var bimg = spr[bdef.spr];
      var bex = sx(e.x), bey = sy(e.y) + Math.sin(frameCount * 0.05) * 5;
      var ph2 = e.hp < e.maxHp * 0.5;
      ctx.globalAlpha = 0.28 + Math.sin(frameCount * 0.12) * 0.1;
      ctx.fillStyle = ph2 ? '#ff2222' : bdef.aura;
      ctx.beginPath(); ctx.arc(bex, bey, e.r + 30, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(bex, bey);
      if (e.x < player.x) ctx.scale(-1, 1);
      if (bimg) ctx.drawImage(bimg, -95, -95, 190, 190);
      else if (spr.elite) ctx.drawImage(spr.elite, -85, -85, 170, 170);
      else { ctx.fillStyle = bdef.aura; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
      if (e.hitFlash > 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bex, bey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
      continue;
    }
    var img = spr[ETYPE[e.type].spr];
    var bobY = (e.type === 'mogu' || e.type === 'split' || e.type === 'mini' || e.type === 'boom') ? 0 : Math.sin(frameCount * 0.08 + e.wing) * 3;
    var ex = sx(e.x), ey = sy(e.y) + bobY;
    ctx.save();
    ctx.translate(ex, ey);
    if ((e.type === 'fairy' || e.type === 'shieldf') && e.x < player.x) ctx.scale(-1, 1); // 琪露诺原图朝左
    if (e.elite) {
      ctx.globalAlpha = 0.25 + Math.sin(frameCount * 0.1) * 0.08;
      ctx.fillStyle = '#f0c060';
      ctx.beginPath(); ctx.arc(0, 0, e.r + 14, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (img) ctx.drawImage(img, -img.width/2, -img.height/2, img.width, img.height);
    else { ctx.fillStyle = '#8b5cf6'; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
    if (e.hitFlash > 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    // 护盾妖精金环
    if (e.type === 'shieldf') {
      ctx.strokeStyle = 'rgba(240,192,96,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, e.r + 6, 0, Math.PI*2); ctx.stroke();
    }
    // 自爆菇引信闪烁
    if (e.type === 'boom' && e.fuse > 0 && Math.floor(frameCount / 4) % 2 === 0) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, e.r + 4, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.frozen > 0 || freezeAll > 0) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    else if (e.slowT > 0) { ctx.globalAlpha = 0.2; ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.elite) {
      var bw2 = 70;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ex - bw2/2, ey - e.r - 18, bw2, 6);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(ex - bw2/2, ey - e.r - 18, bw2 * Math.max(0, e.hp / e.maxHp), 6);
    }
  }
  // 环绕星
  var ow = hasWeapon('orbit');
  if (ow) {
    var oc = WPN.orbit, ol = ow.lv - 1;
    for (var oi = 0; oi < oc.n[ol]; oi++) {
      var oa = ow.ang + (oi / oc.n[ol]) * Math.PI * 2;
      var ox2 = sx(player.x + Math.cos(oa) * oc.or[ol]), oy2 = sy(player.y + Math.sin(oa) * oc.or[ol]);
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(ox2, oy2, 13, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd700'; drawStarShape(ox2, oy2, 9);
      ctx.fillStyle = '#fff'; drawStarShape(ox2, oy2, 4);
    }
  }
  // 阴阳玉
  for (var yi = 0; yi < yyBalls.length; yi++) {
    var yb = yyBalls[yi];
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#b89fff';
    ctx.beginPath(); ctx.arc(sx(yb.x), sy(yb.y), yb.r + 5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#efe8fa'; ctx.beginPath(); ctx.arc(sx(yb.x), sy(yb.y), yb.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5b4a8a'; ctx.beginPath(); ctx.arc(sx(yb.x), sy(yb.y), yb.r * 0.45, 0, Math.PI*2); ctx.fill();
  }
  // 玩家
  if (gameState !== 'over' && player.weapons) {
    var frames = CHAR[playerChar].frames();
    var fimg = frames[Math.floor(frameCount / 10) % frames.length];
    var pw = 64, ph = playerChar === 'marisa' ? 57 : 62;
    ctx.save();
    ctx.translate(sx(player.x), sy(player.y));
    if (player.flip) ctx.scale(-1, 1);
    if (player.inv > 0 && Math.floor(frameCount / 4) % 2 === 0) ctx.globalAlpha = 0.35;
    if (fimg) ctx.drawImage(fimg, -pw/2, -ph/2, pw, ph);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // 魔炮光束
  for (var bi2 = 0; bi2 < beams.length; bi2++) {
    var bm = beams[bi2];
    var a = bm.life / bm.maxLife;
    ctx.save();
    ctx.translate(sx(bm.x), sy(bm.y));
    ctx.rotate(Math.atan2(bm.dy, bm.dx));
    var grad = ctx.createLinearGradient(0, 0, bm.len, 0);
    grad.addColorStop(0, 'rgba(255,240,180,' + (0.9*a) + ')');
    grad.addColorStop(1, 'rgba(240,192,96,' + (0.15*a) + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, -bm.w/2, bm.len, bm.w);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.85*a) + ')';
    ctx.fillRect(0, -bm.w/6, bm.len, bm.w/3);
    ctx.restore();
  }
  // 冲击环
  for (var ri = 0; ri < rings.length; ri++) {
    var rg2 = rings[ri];
    ctx.globalAlpha = (rg2.life / rg2.maxLife) * 0.6;
    ctx.strokeStyle = rg2.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sx(rg2.x), sy(rg2.y), rg2.r, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 红雾领域（蕾米莉亚）
  if (mist) {
    var ma2 = 0.13 + Math.sin(frameCount * 0.06) * 0.04;
    ctx.fillStyle = 'rgba(192,32,64,' + ma2 + ')';
    ctx.beginPath(); ctx.arc(sx(mist.x), sy(mist.y), mist.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(192,32,64,0.4)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx(mist.x), sy(mist.y), mist.r, 0, Math.PI*2); ctx.stroke();
  }
  // 子弹
  for (var bu = 0; bu < bullets.length; bu++) {
    var bl = bullets[bu];
    var col = bl.type === 'spiral' ? '#b89fff' : '#ffd700';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sx(bl.x), sy(bl.y), bl.r + 4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sx(bl.x), sy(bl.y), bl.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx(bl.x), sy(bl.y), bl.r * 0.45, 0, Math.PI*2); ctx.fill();
  }
  // 敌方弹幕（粉色/彩色/神枪，与玩家金色弹区分）
  for (var ebd = 0; ebd < ebullets.length; ebd++) {
    var eb2 = ebullets[ebd];
    if (!onScreen(eb2.x, eb2.y, 30)) continue;
    if (eb2.spear) { // 冈格尼尔：沿速度方向的光枪
      ctx.save();
      ctx.translate(sx(eb2.x), sy(eb2.y));
      ctx.rotate(Math.atan2(eb2.vy, eb2.vx));
      ctx.globalAlpha = 0.45; ctx.fillStyle = eb2.color;
      ctx.fillRect(-18, -5, 36, 10);
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
      ctx.fillRect(-18, -2, 36, 4);
      ctx.restore();
      continue;
    }
    ctx.globalAlpha = 0.35; ctx.fillStyle = eb2.color;
    ctx.beginPath(); ctx.arc(sx(eb2.x), sy(eb2.y), eb2.r + 4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = eb2.color;
    ctx.beginPath(); ctx.arc(sx(eb2.x), sy(eb2.y), eb2.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx(eb2.x), sy(eb2.y), eb2.r * 0.4, 0, Math.PI*2); ctx.fill();
  }
  // 粒子
  for (var pi = 0; pi < particles.length; pi++) {
    var pt = particles[pi];
    if (!onScreen(pt.x, pt.y, 20)) continue;
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(sx(pt.x), sy(pt.y), pt.r, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 浮动文字
  for (var fi = 0; fi < floatingTexts.length; fi++) {
    var ft2 = floatingTexts[fi];
    ctx.globalAlpha = Math.min(1, ft2.life / (ft2.maxLife * 0.5));
    ctx.fillStyle = ft2.color;
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ft2.text, sx(ft2.x), sy(ft2.y));
  }
  ctx.globalAlpha = 1;
  // 伤害飘字
  for (var dpi = 0; dpi < dmgPops.length; dpi++) {
    var dp2 = dmgPops[dpi];
    ctx.globalAlpha = Math.min(1, dp2.life / (dp2.maxLife * 0.5));
    ctx.font = 'bold ' + (dp2.big ? 16 : 11) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillText(dp2.val, sx(dp2.x) + 1, sy(dp2.y) + 1);
    ctx.fillStyle = dp2.color;
    ctx.fillText(dp2.val, sx(dp2.x), sy(dp2.y));
  }
  ctx.globalAlpha = 1;
  // 固定虚拟摇杆（触屏设备常驻左下）
  if (isTouch) {
    ctx.globalAlpha = joy.active ? 0.32 : 0.16; ctx.fillStyle = '#b89fff';
    ctx.beginPath(); ctx.arc(JOY.x, JOY.y, JOY.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = joy.active ? 0.6 : 0.32;
    ctx.beginPath(); ctx.arc(JOY.x + joy.dx * (JOY.r - 22), JOY.y + joy.dy * (JOY.r - 22), 24, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 受伤红闪
  if (hurtFlash > 0) { ctx.fillStyle = 'rgba(239,68,68,' + (hurtFlash/10*0.16) + ')'; ctx.fillRect(0, 0, W, H); hurtFlash -= ddt; }
  // 死亡白闪
  if (deathFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (deathFlash/18*0.6) + ')'; ctx.fillRect(0, 0, W, H); deathFlash -= ddt; }
}

// ═══════════ HUD ═══════════
function fmtTime(s) {
  var m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}
function updateHud() {
  document.getElementById('hpFill').style.width = Math.max(0, player.hp / player.maxHp * 100) + '%';
  document.getElementById('hpText').textContent = Math.max(0, Math.ceil(player.hp)) + ' / ' + player.maxHp;
  document.getElementById('hpBar').classList.toggle('low', player.hp / player.maxHp < 0.3);
  if (boss && !boss.dead) document.getElementById('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
  document.getElementById('xpFill').style.width = Math.min(100, player.xp / player.xpNeed * 100) + '%';
  document.getElementById('hudLevel').textContent = 'Lv ' + player.level;
  document.getElementById('hudTime').textContent = '⏱ ' + fmtTime(gameTime);
  document.getElementById('hudKills').textContent = '💀 ' + kills;
  document.getElementById('hudScore').textContent = String(score).padStart(6, '0');
  document.getElementById('hudBest').textContent = 'HI ' + String(bestScore).padStart(6, '0');
}

// ═══════════ 游戏流程 ═══════════
function startGame() {
  resetPlayer();
  enemies = []; bullets = []; gems = []; drops = [];
  particles = []; floatingTexts = []; beams = []; rings = []; warnings = [];
  yyBalls = [];
  gameTime = 0; kills = 0; score = 0; spawnTimer = 0;
  scoreBonus = 0; hurtFlash = 0; ebullets = []; dmgPops = [];
  boss = null; bossCount = 0; hideBossBar(); mist = null;
  bossBannerT = 0; document.getElementById('bossBanner').classList.remove('show');
  pendingLevels = 0; freezeAll = 0; eliteWave = 0; eliteTimer = 0;
  deathFlash = 0; shakeT = 0; frameCount = 0;
  joy.active = false;
  gameState = 'playing';
  lastTs = performance.now(); acc = 0;
  document.getElementById('startOverlay').classList.add('hide');
  document.getElementById('lbArea').innerHTML = '';
  document.getElementById('lbArea').classList.add('hide');
  document.getElementById('qqOverlay').classList.add('hide');
  updateHud();
}
function endGame() {
  gameState = 'over';
  deathFlash = 18;
  spawnParticles(player.x, player.y, '#ef4444', 30, 2, 7);
  sfxBomb();
  hideBossBar();
  saveBest();
  var ov = document.getElementById('startOverlay');
  ov.classList.remove('hide');
  ov.querySelector('h1').textContent = '💥 满身疮痍！';
  ov.querySelector('.btn-start').textContent = '🔄 再来一次';
  ov.querySelector('p').innerHTML =
    '存活 <b style="color:#b89fff">' + fmtTime(gameTime) + '</b> · 击杀 <b style="color:#ef4444">' + kills + '</b> · 等级 <b style="color:#8fd8ff">Lv ' + player.level + '</b><br>' +
    '得分 <b style="color:#f0c060">' + score + '</b> 分<br>' +
    '历史最高 <b style="color:#f0c060">' + bestScore + '</b> 分 · 最长存活 <b style="color:#b89fff">' + fmtTime(bestTime) + '</b>';
  loadLB(score);
  document.getElementById('qqOverlay').classList.remove('hide');
}

// ═══════════ 排行榜（独立榜单 game=survivor，graze 字段存击杀数）═══════════
var lastFinalScore = 0;
function loadLB(finalScore) {
  lastFinalScore = finalScore;
  var lbArea = document.getElementById('lbArea');
  lbArea.classList.remove('hide');
  lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:13px;">⏳ 加载排行榜...</p>';
  fetch('api/leaderboard.php?game=survivor')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rank = checkRank(finalScore, data);
      renderLB(lbArea, data, rank, finalScore);
    })
    .catch(function() {
      lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:12px;">排行榜暂不可用（本地最高分已保存）</p>';
    });
}
function checkRank(sc, data) {
  for (var i = 0; i < data.length; i++) if (sc > data[i].score) return i + 1;
  return data.length < 20 ? data.length + 1 : 0;
}
function renderLB(area, data, rank, sc) {
  var html = '<div class="lb-wrap">';
  if (rank > 0) {
    html += '<div class="lb-submit">';
    html += '<input id="lbName" class="lb-input" maxlength="12" placeholder="输入昵称（最多12字）">';
    html += '<button id="lbSubmit" class="lb-btn">提交</button>';
    html += '<button id="lbSkip" class="lb-btn-ghost">跳过</button>';
    html += '</div>';
  } else if (data.length >= 20) {
    html += '<p class="lb-note">你的得分未进入前20</p>';
  }
  html += '<div class="lb-toggle" id="lbToggle">📊 排行榜 ▸</div>';
  html += '<div class="lb-table-wrap" id="lbTableWrap" style="display:none;">';
  html += '<table class="lb-table"><thead><tr><th>#</th><th>名字</th><th>得分</th><th>击杀</th><th>日期</th></tr></thead><tbody>';
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var cls = (rank > 0 && i + 1 === rank && d.score === sc) ? ' class="lb-my"' : '';
    html += '<tr' + cls + '><td>' + (i+1) + '</td><td>' + esc(d.name) + '</td><td>' + d.score + '</td><td>' + (d.graze||0) + '</td><td>' + (d.time||'') + '</td></tr>';
  }
  html += '</tbody></table></div></div>';
  area.innerHTML = html;
  var toggle = document.getElementById('lbToggle');
  var wrap2 = document.getElementById('lbTableWrap');
  toggle.addEventListener('click', function() {
    var open = wrap2.style.display !== 'none';
    wrap2.style.display = open ? 'none' : 'block';
    toggle.textContent = open ? '📊 排行榜 ▸' : '📊 排行榜 ▾';
  });
  if (rank > 0) {
    document.getElementById('lbSubmit').addEventListener('click', function() { submitLB(area); });
    document.getElementById('lbSkip').addEventListener('click', function() { area.innerHTML = ''; area.classList.add('hide'); });
  }
}
function submitLB(area) {
  var nameEl = document.getElementById('lbName');
  var name = (nameEl.value || '').trim();
  if (!name || name.length > 12) name = '魔理沙';
  var btn = document.getElementById('lbSubmit');
  btn.disabled = true; btn.textContent = '提交中...';
  var form = new FormData();
  form.append('name', name);
  form.append('score', String(lastFinalScore));
  form.append('graze', String(kills));
  form.append('game', 'survivor');
  fetch('api/leaderboard.php', { method:'POST', body:form })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.ok) {
        area.innerHTML = '<p class="lb-ok">✅ 提交成功！排名第 <b>' + res.rank + '</b></p>';
        loadLB(lastFinalScore);
        setTimeout(function() {
          var t = document.getElementById('lbToggle');
          var w2 = document.getElementById('lbTableWrap');
          if (t && w2) { w2.style.display = 'block'; t.textContent = '📊 排行榜 ▾'; }
        }, 300);
      } else {
        area.innerHTML = '<p class="lb-err">提交失败: ' + (res.error || '未知错误') + '</p>';
      }
    })
    .catch(function() { area.innerHTML = '<p class="lb-err">网络错误</p>'; });
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════ 主循环（累加器固定步长）═══════════
var acc = 0;
function gameLoop() {
  var now = performance.now();
  if (!lastTs) lastTs = now;
  acc += Math.min(now - lastTs, 100); // 长暂停最多追 100ms，防死亡螺旋
  lastTs = now;
  var steps = 0;
  while (acc >= 16.67 && steps < 4) { acc -= 16.67; steps++; stepGame(); }
  if (steps >= 4) acc = 0;
  draw();
  requestAnimationFrame(gameLoop);
}
document.addEventListener('visibilitychange', function() {
  if (document.hidden) { if (bgm) bgm.pause(); }
  else {
    lastTs = performance.now(); acc = 0;
    if (bgm) { var pr = bgm.play(); if (pr && pr.catch) pr.catch(function(){}); }
  }
});

// ═══════════ 初始化 ═══════════
loadBest();
document.getElementById('loadingOverlay').classList.remove('hide');
document.getElementById('startOverlay').classList.add('hide');
document.getElementById('lbArea').classList.add('hide');

preloadAll().then(function() {
  setupFrames();
  resetPlayer();
  document.getElementById('loadingOverlay').classList.add('hide');
  document.getElementById('startOverlay').classList.remove('hide');
}).catch(function(err) {
  console.error('Sprite load failed:', err);
  setupFrames();
  resetPlayer();
  document.getElementById('loadingOverlay').classList.add('hide');
  document.getElementById('startOverlay').classList.remove('hide');
});
resetPlayer(); // 保证首帧 draw 前 player 完整
updateHud();
gameLoop();

// ═══════════ 选人界面（全局函数）═══════════
// 调试钩子（调平衡用）：__ms.spawnBoss() 立即召唤 Boss；__ms.skip(秒) 快进游戏时间；__ms.overlap() 采样重叠率
window.__ms = {
  spawnBoss: function(idx) { if (!boss && gameState === 'playing') { if (typeof idx === 'number') bossCount = idx; spawnBoss(); } },
  skip: function(sec) { if (gameState === 'playing') gameTime += sec; },
  overlap: function() {
    var n = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      for (var j = i + 1; j < enemies.length; j++) {
        var o = enemies[j];
        var dx = e.x - o.x, dy = e.y - o.y, rr = (e.r + o.r) * 0.5; // 深入半数半径才算"挤"
        if (dx*dx + dy*dy < rr*rr) { n++; break; }
      }
    }
    return { pct: enemies.length ? Math.round(n / enemies.length * 100) : 0, total: enemies.length };
  }
};
var _selTouchX = 0;
window._selChar = function(ch) {
  playerChar = ch;
  var sel = document.getElementById('selectOverlay');
  document.getElementById('selMarisa').classList.toggle('selected', ch === 'marisa');
  document.getElementById('selReimu').classList.toggle('selected', ch === 'reimu');
  document.getElementById('imgMarisa').style.borderColor = ch === 'marisa' ? '#f0c060' : '#3a3045';
  document.getElementById('imgReimu').style.borderColor = ch === 'reimu' ? '#f0c060' : '#3a3045';
  sel.dataset.selected = ch;
};
window.showSelect = function() {
  document.getElementById('startOverlay').classList.add('hide');
  document.getElementById('selectOverlay').classList.remove('hide');
  window._selChar('marisa');
};
window.confirmSelect = function() {
  document.getElementById('selectOverlay').classList.add('hide');
  startGame();
};
document.addEventListener('keydown', function(e) {
  var sel = document.getElementById('selectOverlay');
  if (sel.classList.contains('hide')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    window._selChar((sel.dataset.selected || 'marisa') === 'marisa' ? 'reimu' : 'marisa');
  }
  if (e.key === 'Enter') { e.preventDefault(); window.confirmSelect(); }
});
document.getElementById('selectOverlay').addEventListener('touchstart', function(e) {
  _selTouchX = e.touches[0].clientX;
});
document.getElementById('selectOverlay').addEventListener('touchend', function(e) {
  var dx = e.changedTouches[0].clientX - _selTouchX;
  if (Math.abs(dx) > 40) {
    window._selChar(dx > 0 ? 'marisa' : 'reimu');
  }
});

})();
