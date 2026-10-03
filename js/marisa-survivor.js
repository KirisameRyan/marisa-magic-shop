// ═══════════════════════════════════════
//  魔理沙幸存者 · 霧雨魔法店
//  幸存者like：自动攻击 + 走位 + 升级三选一
// ═══════════════════════════════════════
(function(){

var cv = document.getElementById('game');
var ctx = cv.getContext('2d');
var W = 960, H = 540;
var CELL = 64;

// ═══════════ 画面自适应（动态逻辑分辨率：H 恒定 540，W 随宽高比伸缩）═══════════
var stageEl = null, stageUiEl = null, STAGE_S = 1, HUD_SCALE = 1;
var BASE_W = 960, BASE_H = 540, VIEW_W_MAX = 1600;
function calcViewport(aw, ah) {
  var vw = BASE_W, vh = BASE_H;
  if (aw && ah && aw / ah >= 1) { // 横屏/方屏：动态逻辑宽；竖屏降级维持 960×540
    vw = Math.round(BASE_H * (aw / ah));
    if (vw > VIEW_W_MAX) vw = VIEW_W_MAX;
  }
  var s = aw && ah ? Math.min(aw / vw, ah / vh) : 1;
  return { w: vw, h: vh, s: s };
}
function fitStage() {
  if (!stageEl) stageEl = document.getElementById('stage');
  if (!stageUiEl) stageUiEl = document.querySelector('.stage-ui');
  var wrap2 = document.querySelector('.canvas-wrap');
  if (!stageEl || !wrap2) return;
  var aw = wrap2.clientWidth, ah = wrap2.clientHeight;
  if (!aw || !ah) return;
  var vp = calcViewport(aw, ah);
  W = vp.w; H = vp.h; STAGE_S = vp.s;
  HUD_SCALE = Math.min(1.6, Math.max(1, 1.05 / vp.s)); // 小屏放大 HUD，保证物理可读
  JOY_HOME.y = H - 105;
  stageEl.style.width = Math.round(W * STAGE_S) + 'px';
  stageEl.style.height = Math.round(H * STAGE_S) + 'px';
  if (stageUiEl) {
    stageUiEl.style.width = W + 'px';
    stageUiEl.style.height = H + 'px';
    stageUiEl.style.transform = 'scale(' + STAGE_S + ')';
  }
  var k = Math.min(2.5, STAGE_S * (window.devicePixelRatio || 1));
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  ctx.setTransform(k, 0, 0, k, 0, 0); // 设置 .width 会重置状态，必须重设
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', fitStage);
window.addEventListener('load', fitStage);

// ═══════════ 可配置素材（填路径即生效，留空 '' 关闭）═══════════
var CONFIG = {
  BGM: 'audio/bgm_clean.mp3', // 背景音乐（192kbps 干净版；原文件 audio/bgm.mp3 保留作备份）
  BGS: [ // 背景轮换（庭院开局 → 每击破一只 Boss 交替）；scale 为绘制缩放（0.5 = 半尺寸平铺）
    { src: 'images/sprites/yard.png',    scale: 0.5 },
    { src: 'images/sprites/library.png', scale: 1.0 }
  ]
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
  // 扩充怪素材（用户自制；缺失时回退染色精灵）
  ldOpt('ghost', 'ghost.png'); ldOpt('butterfly', 'butterfly.png');
  ldOpt('poison', 'poison_mushroom.png');
  ldOpt('sunflower', 'sunflower.png'); ldOpt('penglai', 'penglai.png');
  ldOpt('monBoar', 'pig.png');
  // 特效 / 阴阳玉贴图
  ldOpt('jianqi', 'jianqi.png'); ldOpt('yunshi', 'yunshi.png');
  ldOpt('yaoshi', 'yaoshi.png'); ldOpt('baguayu', 'baguayu.png');
  ldOpt('chen', 'chen.png'); ldOpt('yufu', 'yufu.png');
  ldOpt('fangxiang', 'fangxiang.png'); ldOpt('liandao', 'liandao.png'); ldOpt('knife', 'knife.png');
  assets.bgs = [];
  for (var bgI = 0; bgI < (CONFIG.BGS ? CONFIG.BGS.length : 0); bgI++) {
    (function (bi) {
      var bc = CONFIG.BGS[bi];
      var bsrc = bc && bc.src ? bc.src : bc;
      var bsc = bc && bc.scale ? bc.scale : 0.5;
      jobs.push(loadImage(bsrc).then(function (i) {
        assets.bgs[bi] = { img: i, tw: Math.max(256, Math.round(i.width * bsc)), th: Math.max(256, Math.round(i.height * bsc)) };
      }, function () { assets.bgs[bi] = null; }));
    })(bgI);
  }
  return Promise.all(jobs);
}
// 背景轮换：庭院 ⇄ 图书馆（每次击破 Boss 切换，交叉淡变）
function rotateBg() {
  if (!assets.bgs || assets.bgs.length < 2) return;
  var n = assets.bgs.length;
  for (var k = 1; k <= n; k++) {
    var idx = (bgIndex + k) % n;
    if (assets.bgs[idx]) { bgPrev = assets.bgs[bgIndex] || null; bgIndex = idx; bgFadeT = 72; return; }
  }
}
function drawBgLayer(layer, camX, camY, alpha) {
  var tw = layer.tw, th = layer.th;
  var bx0 = Math.floor(camX / tw) * tw, by0 = Math.floor(camY / th) * th;
  ctx.globalAlpha = alpha;
  for (var bx = bx0; bx < camX + W + tw; bx += tw)
    for (var by = by0; by < camY + H + th; by += th)
      ctx.drawImage(layer.img, bx - camX, by - camY, tw, th);
  ctx.globalAlpha = 1;
}
// 离屏预缩放：等比 fit（保持宽高比，避免非正方形素材拉伸变形）
function makeSprite(img, size) {
  if (!img) return null;
  var scale = size / Math.max(img.width, img.height);
  var w = Math.max(1, Math.round(img.width * scale));
  var h = Math.max(1, Math.round(img.height * scale));
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}
// 离屏染色（source-atop 兼容全平台，机制小怪/剑气副本专用）
function makeTinted(img, size, color, alpha) {
  if (!img) return null;
  var scale = size / Math.max(img.width, img.height);
  var w = Math.max(1, Math.round(img.width * scale));
  var h = Math.max(1, Math.round(img.height * scale));
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha; g.fillStyle = color;
  g.fillRect(0, 0, w, h);
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
  spr.eliteM = makeTinted(assets.mogu, 108, '#ff6b4a', 0.55);   // 精英·赤蘑菇
  spr.eliteC = makeTinted(assets.fairy, 104, '#4da6ff', 0.5);   // 精英·蓝妖精
  spr.split  = makeTinted(assets.mogu, 52, '#3fae5a', 0.45);
  spr.mini   = makeSprite(assets.mogu, 26);
  spr.shield = makeTinted(assets.fairy, 56, '#f0c060', 0.45);
  spr.redfairy = makeTinted(assets.fairy, 52, '#ef4444', 0.45);
  spr.crystal  = makeTinted(assets.mogu, 30, '#b89fff', 0.5);
  spr.bossR  = makeSprite(assets.bossR, 190);
  spr.bossF  = makeSprite(assets.bossF, 190);
  spr.ghost  = assets.ghost ? makeSprite(assets.ghost, 52) : makeTinted(assets.fairy, 52, '#b89fff', 0.55);
  spr.butterfly = assets.butterfly ? makeSprite(assets.butterfly, 44) : makeTinted(assets.fairy, 44, '#b89fff', 0.6);
  spr.poison = assets.poison ? makeSprite(assets.poison, 46) : makeTinted(assets.mogu, 44, '#7b2fbe', 0.55);
  spr.sunflower = assets.sunflower ? makeSprite(assets.sunflower, 64) : makeTinted(assets.fairy, 64, '#ffd970', 0.5);
  spr.penglai = assets.penglai ? makeSprite(assets.penglai, 110) : null;
  spr.penglaiS = assets.penglai ? makeSprite(assets.penglai, 36) : null;
  spr.boar   = assets.monBoar ? makeSprite(assets.monBoar, 56) : makeTinted(assets.mogu, 56, '#c98a4a', 0.6);
  spr.exec   = makeTinted(assets.mogu, 120, '#6a1020', 0.62);
  // 剑气（三种染色副本）/ 陨石 / 要石 / 阴阳玉
  spr.jianqi      = assets.jianqi ? makeSprite(assets.jianqi, 240) : null;
  spr.jianqiGold  = assets.jianqi ? makeTinted(assets.jianqi, 240, '#ffd970', 0.55) : null;
  spr.jianqiSilver= assets.jianqi ? makeTinted(assets.jianqi, 240, '#ffb2b2', 0.55) : null;
  spr.jianqiViolet= assets.jianqi ? makeTinted(assets.jianqi, 240, '#b89fff', 0.60) : null;
  spr.jianqiTeal  = assets.jianqi ? makeTinted(assets.jianqi, 240, '#8fd8ff', 0.55) : null;
  // P1 新武器素材（缺失时用染色回退）
  spr.chen    = assets.chen ? makeSprite(assets.chen, 72) : makeTinted(assets.mogu, 64, '#ff9a3c', 0.5);
  spr.yufu    = assets.yufu ? makeSprite(assets.yufu, 30) : null;
  spr.soulfly = assets.butterfly ? makeTinted(assets.butterfly, 40, '#ffffff', 0.8) : makeTinted(assets.fairy, 40, '#ffffff', 0.8);
  spr.fangxiang = assets.fangxiang ? makeSprite(assets.fangxiang, 88) : makeTinted(assets.mogu, 80, '#7b8fd4', 0.55);
  spr.liandao = assets.liandao ? makeSprite(assets.liandao, 220) : null;
  spr.knife = assets.knife ? makeSprite(assets.knife, 44) : null;
  spr.yunshi = assets.yunshi ? makeSprite(assets.yunshi, 76) : null;
  spr.yaoshi = assets.yaoshi ? makeSprite(assets.yaoshi, 88) : null;
  spr.baguayu = assets.baguayu ? makeSprite(assets.baguayu, 42) : null;
  spr.baguayuL = assets.baguayu ? makeSprite(assets.baguayu, 66) : null;
  // 星弹 / 螺旋弹 / 人偶弹：预渲染（光晕 + 旋转星体 + 白核）
  function makeBulletSprite(color) {
    var c = document.createElement('canvas');
    c.width = c.height = 48;
    var g = c.getContext('2d');
    g.globalAlpha = 0.26; g.fillStyle = color;
    g.beginPath(); g.arc(24, 24, 23, 0, Math.PI*2); g.fill();
    g.globalAlpha = 0.42; g.beginPath(); g.arc(24, 24, 15, 0, Math.PI*2); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = color; drawStarShape(24, 24, 14, g);
    g.fillStyle = '#fff'; drawStarShape(24, 24, 7.5, g);
    return c;
  }
  spr.bulletStar = makeBulletSprite('#ffd700');
  spr.bulletSpiral = makeBulletSprite('#b89fff');
  spr.bulletDoll = makeBulletSprite('#ffb2df');
}

// ═══════════ 音频（BGM + 音效上下文）═══════════
var audioCtx = null;
var bgm = null;
var bgmVol = 18;          // 0-100：暂停页可调，0 为静音
var bgmLoading = false;   // play() 进行中闸门：防止按键自动重复打断播放
var bgmLastError = '';
try {
  var savedBgmVol = localStorage.getItem('ms_bgmvol');
  if (savedBgmVol !== null) {
    var nv = parseInt(savedBgmVol, 10);
    if (!isNaN(nv)) bgmVol = Math.max(0, Math.min(100, nv));
  }
} catch (e) {}

// 任意用户手势（键盘/鼠标/触摸）调用：恢复音频上下文 + 尝试起播 BGM
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended' && audioCtx.resume) {
    try { audioCtx.resume(); } catch (e) {}
  }
  ensureBgm();
}

// BGM：首次手势创建实例，可反复重试；加载期间不重复 play（防止 AbortError 打断）
function ensureBgm() {
  if (!CONFIG.BGM || bgmVol <= 0) return;
  if (!bgm) {
    try {
      bgm = new Audio(CONFIG.BGM);
      bgm.loop = true;
      bgm.preload = 'auto';
      if (bgm.addEventListener) {
        bgm.addEventListener('error', function () {
          bgmLastError = 'media:' + (bgm && bgm.error ? bgm.error.code : '?');
          console.warn('[BGM] load error', bgmLastError);
          bgm = null; bgmLoading = false; // 下次手势重建
        });
      }
    } catch (e) {
      bgm = null; bgmLastError = 'create';
      console.warn('[BGM] create failed', e);
      return;
    }
  }
  bgm.volume = bgmVol / 100;
  if (!bgm.paused || bgmLoading) return;
  bgmLoading = true;
  var pr = bgm.play();
  if (pr && pr.then) {
    pr.then(function () {
      bgmLoading = false; bgmLastError = '';
      console.log('[BGM] playing');
    }, function (e) {
      bgmLoading = false;
      var name = (e && e.name) ? e.name : String(e);
      if (name === 'AbortError') return; // 被新的加载/暂停打断：静默，下次手势再试
      if (bgmLastError !== name) {
        bgmLastError = name;
        console.warn('[BGM] blocked:', name);
      }
    });
  } else {
    bgmLoading = false;
  }
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
function sfxCut()    { if (throttled('cut', 60)) return; playTone(1200, 0.06, 'triangle', 0.035, 520); }
function sfxGem()    { if (throttled('gem', 90)) return; playTone(1500, 0.04, 'sine', 0.03); }
function sfxDie()    { if (throttled('die', 80)) return; playTone(300, 0.08, 'triangle', 0.04, 120); }
function sfxHurt()   { playTone(70, 0.2, 'sawtooth', 0.12, 40); }
function sfxLevel()  { playTone(500,0.08,'square',0.07); setTimeout(function(){playTone(660,0.08,'square',0.07)},80); setTimeout(function(){playTone(880,0.12,'square',0.09)},160); }
function sfxCard()   { playTone(700, 0.06, 'sine', 0.07, 1050); }
function sfxSpark()  { playTone(140, 0.28, 'sawtooth', 0.09, 900); }
function sfxQuake()  { if (throttled('quake', 110)) return; playTone(85, 0.22, 'triangle', 0.06, 42); playTone(160, 0.12, 'square', 0.03, 60); }
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
  star: { icon:'⭐', name:'星星弹', jp:'スターライト', attr:'rei', type:'bullet', cd:[40,36,33,30,26], dmg:[10,12,14,17,20], n:[1,1,2,3,4], spread:[0,0,0.15,0.25,0.35], bspd:[7,7,7,7,9],
    desc:['追踪星弹 · 1发 · 伤10','伤12 · 冷却缩短','2发扇形 · 伤14','3发 · 伤17','4发 · 伤20 · 弹速+'] },
  spark: { icon:'💥', name:'魔炮', jp:'マスタースパーク', attr:'rei', type:'beam', cd:[220,205,190,175,155], dmg:[42,55,55,72,95], bw:[44,52,52,64,76], charge:36,
    desc:['索敌蓄力 · 脉冲激光 · 伤42','伤55','冷却缩短','伤72 · 更宽','伤95 · 最大宽度'] },
  orbit: { icon:'✨', name:'环绕星', jp:'サテライト', attr:'rei', type:'field', cont:true, n:[2,3,3,4,5], dmg:[8,8,12,12,18], or:[60,60,72,72,84], rot:[0.044,0.044,0.044,0.057,0.057],
    desc:['2颗绕体星 · 伤8','3颗','伤12 · 半径+','4颗 · 转速+','5颗 · 伤18 · 大半径'] },
  frost: { icon:'❄️', name:'冻结光环', jp:'パーフェクトフリーズ', attr:'ma', type:'aoe', cd:[300,300,240,240,180], dmg:[10,14,14,20,28], ar:[120,150,150,180,220], frz:[75,75,75,90,105],
    desc:['冰环扩散 · 冻结1.25秒','范围+ · 伤14','冷却缩短','范围+ · 伤20','大范围 · 冻结1.75秒'] },
  comet: { icon:'☄️', name:'陨星', jp:'ブレイジングスター', attr:'rei', type:'aoe', cd:[360,360,300,300,240], dmg:[50,70,70,90,120], ar:[100,110,110,130,150],
    desc:['陨星坠落 · AOE伤50','伤70','冷却缩短','伤90 · 范围+','冷却大减 · 伤120'] },
  yinyang: { icon:'🔮', name:'阴阳玉', jp:'陰陽玉', attr:'rei', type:'summon', cont:true, n:[2,2,3,3,4], dmg:[12,16,16,20,26], spd:[3.2,3.2,3.2,4,4],
    desc:['2颗弹跳玉 · 伤12','伤16','3颗','加速 · 伤20','4颗 · 伤26'] },
  needle: { icon:'🪡', name:'破魔针', jp:'破魔の針', attr:'ma', type:'bullet', cd:[88,80,72,64,54], dmg:[11,13,13,16,20], n:[3,3,4,4,5], pr:[1,2,2,3,3],
    desc:['穿透针 · 命中叠咒印','针数+1','针数+1','伤16 · 深穿透','5针 · 咒印强化'] },
  // ── 12 格矩阵：召唤 / 领域 / 光束 / 近身 ──
  shanghai: { icon:'🎎', name:'上海&蓬莱', jp:'上海人形と蓬莱人形', attr:'ma', type:'summon', cont:true, doll:[2,2,3,3,4], dmg:[10,12,12,15,18], rate:[78,72,66,60,52],
    desc:['2 人偶环绕 · 追踪弹','人偶强化','3 人偶','伤害提升','4 人偶 · 高速索敌'] },
  netherworld: { icon:'🩸', name:'红色冥界', jp:'紅色の冥界', attr:'ma', type:'field', cont:true, dur:[180,210,240,270,300], cyc:[660,630,600,570,540], ar:[140,155,170,185,200], dmg:[8,10,10,13,16],
    desc:['周期性冥界领域 · 吸血','领域持续+','伤害+','范围+','冥界扩张'] },
  gungnir: { icon:'🔱', name:'冈格尼尔之枪', jp:'グングニル', attr:'ma', type:'beam', cd:[300,282,264,246,228], dmg:[55,70,85,100,120],
    desc:['切线激光 · 贯穿','冷却缩短','伤85','伤100','伤120'] },
  hisou: { icon:'⚔️', name:'绯想剑', jp:'緋想の剣', attr:'rei', type:'melee', cd:[64,58,52,46,40], dmg:[34,42,50,60,72], ar:[110,116,122,130,138],
    desc:['慢速高伤弧斩','伤42 · 范围+','附带地震波','伤60 · 范围+','伤72 · 强震波'] },
  roukan: { icon:'🗡️', name:'楼观&白楼', jp:'楼観剣と白楼剣', attr:'ma', type:'melee', cd:[36,32,28,25,21], dmg:[12,15,18,22,26], ar:[80,86,92,100,108],
    desc:['双剑快速连斩','伤15 · 距离+','三段连斩','伤22 · 距离+','伤26 · 极速'] },
  // ── P1 新武器（灵系 4 把）──
  chen: { icon:'🐱', name:'八云橙', jp:'八雲橙', attr:'rei', type:'summon', cont:true, cyc:[720,660,600,540,480], shd:[15,18,21,25,30],
    desc:['12秒周期：套盾 + 增益轮换','周期缩短 · 盾+','盾+','周期再缩','8秒周期 · 盾+30'] },
  ofuda: { icon:'🧧', name:'灵符', jp:'御符', attr:'rei', type:'bullet', cd:[64,58,52,46,40], dmg:[12,15,18,22,26], n:[3,4,5,5,6], bspd:[6.5,6.5,6.5,7,7],
    desc:['扇形御符 · 无穿透','符数+1','符数+1 · 冷却↓','伤22 · 弹速+','6符 · 伤26'] },
  soulfly: { icon:'🦋', name:'白魂蝶', jp:'反魂蝶', attr:'rei', type:'aoe', cont:true, cyc:[240,240,240,240,240], dmg:[30,38,46,56,68],
    desc:['周期召唤白魂蝶 · 自爆','伤+','伤+','伤+','伤+'] },
  fan: { icon:'🪭', name:'天狗团扇', jp:'天狗の団扇', attr:'rei', type:'melee', cd:[54,50,46,42,38], dmg:[22,28,34,42,50], ar:[120,126,132,140,148],
    desc:['扇形斩+击退 · 伤害随移速','伤28','伤34','伤42','伤50 · 最大范围'] },
  // ── P1 新武器（魔系 4 把）──
  yoshika: { icon:'🧟', name:'宫古芳香', jp:'宮古芳香', attr:'ma', type:'summon', cont:true, dmg:[14,17,20,24,28], rate:[30,28,26,24,22],
    desc:['僵尸召唤 · 撕挠最近敌','撕挠加速','伤害+','撕挠加速','高伤 · 高频'] },
  knife: { icon:'🔪', name:'银色飞刀', jp:'銀のナイフ', attr:'ma', type:'bullet', cd:[150,140,130,120,105], dmg:[16,20,24,29,35], n:[2,3,4,5,6],
    desc:['预备展示 · 依次飞出','刀数+1','刀数+1','刀数+1','6刀 · 冷却↓'] },
  nuke: { icon:'☢️', name:'核反应堆', jp:'原子炉', attr:'ma', type:'aoe', cd:[480,460,440,420,400], dmg:[40,50,60,72,86], zd:[8,10,12,15,18], br:[50,66,82,98,114], zr:[50,70,90,110,130],
    desc:['随机核爆 + 核污染区','范围+','范围+','范围+','最大范围'] },
  reaper: { icon:'⚰️', name:'死神镰刀', jp:'死神の鎌', attr:'ma', type:'melee', cd:[150,150,150,150,150], dmg:[45,56,68,82,98], ar:[130,140,150,160,170],
    desc:['低攻速大弧斩 · 斩杀低血敌','伤56','伤68','伤82','伤98 · 最大范围'] }
};
// ── 超进化表：武器 Lv5 + 本属性强化 Lv5 + 本类型强化 Lv3 → 升级时出现金色超进化卡 ──
var EVO = {
  star:     { need:'atk',    icon:'🌠', name:'天星乱舞', jp:'天星乱舞', desc:'六向流星发射' },
  spark:    { need:'haste',  icon:'💫', name:'Master Spark', jp:'マスタースパーク', desc:'前方锥形巨炮' },
  orbit:    { need:'move',   icon:'🌌', name:'银河星环', jp:'ギャラクシーホール', desc:'八星大环 · 命中减速' },
  frost:    { need:'hpup',   icon:'💎', name:'Perfect Freeze', jp:'パーフェクトフリーズ', desc:'周期性全场冻结 · 伤害降低' },
  comet:    { need:'luck',   icon:'☄️', name:'流星雨', jp:'流星雨', desc:'陨石数量提升至三' },
  yinyang:  { need:'hpup',   icon:'⛩️', name:'梦想妙珠', jp:'夢想妙珠', desc:'巨型追踪封魔玉' },
  needle:   { need:'atk',    icon:'🪶', name:'封魔阵', jp:'封魔陣', desc:'敌人死亡时弹射封魔针' },
  shanghai:   { need:'exp',    icon:'🎎', name:'蓬莱人形', jp:'蓬莱人形', desc:'单个大体型蓬莱人偶 · 双追踪激光' },
  netherworld:{ need:'leech',  icon:'🌑', name:'紅色の冥界', jp:'紅色の冥界', desc:'范围扩大 · 伤害提升 · 领域减速' },
  gungnir:    { need:'haste',  icon:'🔱', name:'不夜城', jp:'不夜城レッド', desc:'切线激光频次拉高' },
  hisou:      { need:'magnet', icon:'🪨', name:'要石天坠', jp:'要石天墜', desc:'定期天降要石 · 范围高伤 · 眩晕1秒' },
  roukan:     { need:'atk',    icon:'🗡️', name:'二百由旬之一闪', jp:'二百由旬の一閃', desc:'闪现连锁斩 · 击杀则换目标' },
  chen:    { need:'exp',  icon:'🐱', name:'八云橙 · 真', jp:'橙', desc:'周期缩短 · 双增益同开 · 盾+25' },
  ofuda:   { need:'atk',  icon:'🧧', name:'霊符『夢想封印』', jp:'夢想封印', desc:'周期释放移动光团' },
  soulfly: { need:'luck', icon:'🦋', name:'反魂蝶 -八分咲-', jp:'反魂蝶', desc:'一次八只魂蝶 · 八角散开' },
  fan:     { need:'move', icon:'🪭', name:'大天狗突进', jp:'天狗の突進', desc:'周期冲刺 · 无敌 · 路径击退' },
  yoshika: { need:'hpup', icon:'🧟', name:'宫古芳香 · 真', jp:'芳香', desc:'体型变大 · 周期冲撞击退' },
  knife:   { need:'haste', icon:'🔪', name:'银刃八重', jp:'銀刃八重', desc:'八刀环绕最近敌 · 穿透' },
  nuke:    { need:'exp',  icon:'☀️', name:'地獄の人工太陽', jp:'人工太陽', desc:'核爆熔化区内小怪（秒杀）' },
  reaper:  { need:'leech', icon:'💀', name:'死者選別の鎌', jp:'死者選別', desc:'斩杀阈值提升 · 每次斩杀增伤' }
};
// ── 属性强化（灵/魔，Lv5）与类型强化（6 类，Lv3）──
var ATTR_ENH = {
  rei: { icon:'✨', name:'灵力强化', jp:'霊力強化',
    desc:['灵系武器 +10%','+20% · 灵系击杀 8% 回 1 HP','+30% · 护盾缓慢回复','+40% · 拾取范围 +20%','+50% · 灵爆：击杀净化附近敌弹'] },
  ma: { icon:'🌑', name:'魔力强化', jp:'魔力強化',
    desc:['魔系武器 +10%','+20% · 异常效果 +15%','+30% · 疯狂咏唱（低血增伤）','+40% · 暴击率 +8% · 暴伤 +30%','+50% · 狂化：击杀叠伤，受伤掉 2 层'] }
};
var TYPE_ENH = {
  bullet: { icon:'🔹', name:'弹道精通', jp:'弾道精通', label:'子弹型',
    levels:['弹速 +15%、追踪转向 +10%','子弹数量 +1（单发武器伤害 +15%）','穿透 +1'] },
  aoe:    { icon:'💥', name:'术式扩张', jp:'術式拡張', label:'范围型',
    levels:['半径 +15%','范围伤害 +12%','追加一段爆炸'] },
  summon: { icon:'👻', name:'式神统御', jp:'式神統御', label:'召唤型',
    levels:['攻击频率 +15%','召唤物伤害 +15%','召唤物数量 +1'] },
  field:  { icon:'🌀', name:'领域掌握', jp:'領域掌握', label:'领域型',
    levels:['领域半径 +15%','领域频率 +12%','领域持续时间 +30%'] },
  beam:   { icon:'📏', name:'光炮校准', jp:'光砲校准', label:'激光型',
    levels:['光束宽度 +15%','光束长度 +15%','发射频率 +20%'] },
  melee:  { icon:'⚔️', name:'斩击精通', jp:'斬撃精通', label:'近身型',
    levels:['攻速 +10%','伤害 +12%','斩击距离 +15%'] }
};
// ── 遗物表（Boss 战利品三选一，可叠 2 层）boss: -1 通用 / 0 蕾米 / 1 芙兰 ──
var RELICS = {
  ignis:      { icon:'🔥', name:'灼烧注入', jp:'火種の魔素', desc:'攻击 20% 概率点燃（持续伤害）', boss:-1 },
  glacie:     { icon:'❄️', name:'冻结注入', jp:'氷結の魔素', desc:'攻击 15% 概率减速，已减速则冻结', boss:-1 },
  cursed:     { icon:'🌀', name:'咒印注入', jp:'呪印の魔素', desc:'攻击 20% 概率叠咒印', boss:-1 },
  anomaly:    { icon:'☣️', name:'异常强化', jp:'異常増幅', desc:'灼烧/冻结/咒印效果 +50%', boss:-1 },
  fangs:      { icon:'🩸', name:'吸血鬼之牙', jp:'吸血の牙', desc:'击杀 6% 概率回 3 HP', boss:-1 },
  destruction:{ icon:'💢', name:'破坏冲动', jp:'破壊衝動', desc:'暴击伤害 +100%', boss:-1 },
  hourglass:  { icon:'⏳', name:'时之沙漏', jp:'時の砂', desc:'全场敌人移速 -10%', boss:-1 },
  broom:      { icon:'🧹', name:'疾风扫帚', jp:'疾風の箒', desc:'移速 +15%', boss:-1 },
  ward:       { icon:'🛡️', name:'结界护符', jp:'結界のお守り', desc:'护盾上限 +15；每 45 秒回 15 盾', boss:-1 },
  luckycoin:  { icon:'🪙', name:'幸运硬币', jp:'幸運の硬貨', desc:'道具掉率 +20%', boss:-1 },
  slayer:     { icon:'⚔️', name:'屠魔者', jp:'魔殺し', desc:'对 Boss/精英伤害 +20%', boss:-1 },
  phoenix:    { icon:'🪽', name:'不死鸟之羽', jp:'不死鳥の羽', desc:'濒死消耗 1 层复活（30% 生命）', boss:-1 },
  sage:       { icon:'📘', name:'贤者之石', jp:'賢者の石', desc:'全武器冷却 -10%', boss:-1 },
  core:       { icon:'🔮', name:'魔力炉心', jp:'魔力炉心', desc:'全武器伤害 +12%', boss:-1 },
  redmoon:    { icon:'🌕', name:'赤月之契', jp:'赤い月の契り', desc:'生命上限 +50；每 90 秒回 15%', boss:0 },
  bloodmist:  { icon:'🌫️', name:'血雾领域', jp:'血の霧', desc:'受击时释放血雾（伤害+减速）', boss:0 },
  quartet:    { icon:'🎻', name:'四重奏', jp:'四重存在', desc:'攻击 12% 概率追加 50% 伤害', boss:1 },
  ruineye:    { icon:'💥', name:'崩坏之瞳', jp:'壊れゆく瞳', desc:'击杀 10% 概率引发小爆炸', boss:1 }
};
var MAX_RELIC_STACK = 2;
function relicLv(id) { return (player.relics && player.relics[id]) || 0; }
var PAS = {  atk:    { icon:'🔥', name:'火力强化', jp:'火力アップ',   desc:'全武器伤害 +15%' },
  haste:  { icon:'⚡', name:'高速吟唱', jp:'高速詠唱',     desc:'全武器冷却 -12%' },
  move:   { icon:'👟', name:'疾风扫帚', jp:'疾風の箒',     desc:'移速 +10%' },
  magnet: { icon:'🧲', name:'收集魔法', jp:'回収魔法',     desc:'P点磁吸范围 +40%' },
  hpup:   { icon:'❤️', name:'体力强化', jp:'体力アップ',   desc:'生命上限 +25 并回血' },
  exp:    { icon:'📚', name:'知识就是力量', jp:'知識は力', desc:'经验获取 +15%' },
  luck:   { icon:'🍀', name:'强运', jp:'強運',             desc:'道具掉率 +30%' },
  leech:  { icon:'🩸', name:'顺手牵羊', jp:'拝借',         desc:'击杀 3% 概率回 2 HP' },
  crit:   { icon:'⚔️', name:'会心一击', jp:'クリティカル', desc:'暴击率 +8%（伤害×2 金字）' },
  armor:   { icon:'🛡️', name:'结界强化', jp:'結界強化',    desc:'受到伤害 -6%' }
};
// ── 精英词缀表：精英怪随机 1~2 条，光环颜色 = 词缀色 ──
var AFFIX = {
  swift:  { n:'迅捷', c:'#7fd97f' },  // 移速×1.6 + 残影
  armor:  { n:'坚甲', c:'#f0c060' },  // 直接攻击减伤 60%
  regen:  { n:'再生', c:'#6fcf97' },  // 持续回血
  blink:  { n:'瞬移', c:'#b89fff' },  // 周期闪现到玩家附近
  burst:  { n:'爆裂', c:'#ff8c50' },  // 死亡自爆
  split:  { n:'分裂', c:'#3fae5a' },  // 死亡分裂两只小精英
  drain:  { n:'嗜血', c:'#ef4444' }   // 撞击玩家时回血
};
var MAX_WPN_SLOT = 6;
var ETYPE = {
  fairy:  { hp:16,  spd:1.05, r:20, dmg:8,  xp:1, spr:'fairy' },
  mogu:   { hp:10,  spd:1.7,  r:16, dmg:6,  xp:1, spr:'mogu' },
  elite:  { hp:150, spd:0.9,  r:44, dmg:16, xp:5, spr:'elite' },   // 精英基础（金妖精）
  eliteM: { hp:170, spd:0.82, r:46, dmg:18, xp:5, spr:'eliteM' },  // 精英·赤蘑菇
  eliteC: { hp:130, spd:1.05, r:42, dmg:15, xp:5, spr:'eliteC' },  // 精英·蓝妖精
  eliteS: { hp:70,  spd:1.15, r:32, dmg:12, xp:3, spr:'elite' },  // 分裂精英残部（小精英）
  split:  { hp:24,  spd:1.25, r:18, dmg:8,  xp:2, spr:'split' },   // 分裂菇：死亡裂成3只小菇
  mini:   { hp:6,   spd:2.2,  r:10, dmg:4,  xp:1, spr:'mini' },
  shieldf:{ hp:30,  spd:1.0,  r:20, dmg:8,  xp:2, spr:'shield' },  // 护盾妖精：子弹减伤75%
  redfairy:{ hp:20, spd:1.7,  r:20, dmg:9,  xp:1, spr:'redfairy' }, // 红魔使魔（蕾米莉亚召唤）
  crystal: { hp:8,  spd:1.9,  r:12, dmg:6,  xp:1, spr:'crystal' },  // 水晶小怪（芙兰朵露召唤）
  ghost:   { hp:26, spd:1.35, r:20, dmg:7,  xp:3, spr:'ghost' },    // 幽灵：穿怪 · 子弹减伤 50%
  boar:    { hp:60, spd:1.1,  r:26, dmg:12, xp:3, spr:'boar' },     // 野猪：周期性冲锋
  butterfly:{ hp:18, spd:1.5, r:16, dmg:8,  xp:2, spr:'butterfly' },// 魂蝶：贴身自爆
  poison:  { hp:14, spd:1.35, r:16, dmg:7,  xp:2, spr:'poison' },   // 毒蘑菇：死亡留下毒坑
  sunflower:{ hp:90, spd:0,   r:32, dmg:10, xp:3, spr:'sunflower' },// 向日葵：固定炮台
  exec:    { hp:420,spd:0.95, r:56, dmg:22, xp:12, spr:'exec' }     // 处刑者（高危专属 · 双词缀）
};
// Boss 轮换定义（斯卡雷特姐妹）· 东方正作式符卡战
// 每个 Boss 3 张符卡：独立弹幕模式 + 符卡名 + 倒计时；击破符卡得奖励，全破击溃 Boss
var BOSS_DEFS = [
  { name:'蕾米莉亚·斯卡雷特', short:'蕾米莉亚', spr:'bossR', aura:'#c02040',
    cards: [
      { name:'神枪「冈格尼尔」', pattern:'spear', hp:0.34, dur:42 },
      { name:'红雾「吸血鬼黄昏」', pattern:'mistwave', hp:0.33, dur:42 },
      { name:'「绯红恶魔」', pattern:'crimson', hp:0.33, dur:50 }
    ] },
  { name:'芙兰朵露·斯卡雷特', short:'芙兰朵露', spr:'bossF', aura:'#f0c060',
    cards: [
      { name:'禁忌「星之弓」', pattern:'starrain', hp:0.30, dur:40 },
      { name:'禁忌「四重存在」', pattern:'quad', hp:0.35, dur:45 },
      { name:'Q.E.D.「495年的波纹」', pattern:'qed', hp:0.35, dur:55 }
    ] }
];
var CHAR = {
  marisa: { r:16, spd:3.3,  hp:140, dmg:1.10, start:'star',   frames:function(){ return marisaFrames; } },
  reimu:  { r:12, spd:3.63, hp:110, dmg:1.00, start:'needle', frames:function(){ return reimuFrames; } }
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
var eliteWave = 0, eliteTimer = 0, waveTimer = 0;
var boss = null, bossCount = 0, bossBannerT = 0, eventBannerT = 0;
var bgIndex = 0, bgPrev = null, bgFadeT = 0;
var mist = null; // 蕾米莉亚红雾领域

var player = {};
var enemies = [], bullets = [], gems = [], drops = [];
var ebullets = []; // 敌方弹幕（Boss）
var particles = [], floatingTexts = [];
var dmgPops = []; // 伤害飘字
var beams = [], rings = [], warnings = [];
var yyBalls = [];
var slashes = [], dolls = [], nether = null;
var orbs = [], pets = []; // P1：夢想封印光团 / 白魂蝶召唤物
var zones = [], knifeOrbs = []; // P1：核污染区 / 银色飞刀环绕
var relicMist = null, wardT = 2700, crimsonT = 5400;
var poisonPits = []; // 毒蘑菇遗留毒坑（不分敌我）
var fallers = []; // 陨石 / 要石 下落演出
var uidSeq = 0; // 敌人唯一 id（对象池复用时更新，用于目标追踪）
var dbgSlashCount = 0, dbgFallerCount = 0; // 调试统计
function addFaller(kind, tx, ty, maxT) {
  if (kind === 'meteor') {
    var side = Math.random() < 0.5 ? -1 : 1; // 随机左/右上 45°
    fallers.push({ kind:kind, tx:tx, ty:ty, x:tx + side*420, y:ty - 420, t:maxT, maxT:maxT, rot:Math.atan2(420, -side*420), spin:0, side:side });
  } else {
    fallers.push({ kind:kind, tx:tx, ty:ty, x:tx, y:ty - 420, t:maxT, maxT:maxT, rot:0, spin:0, side:0 });
  }
  dbgFallerCount++;
}
var enemyPool = [], bulletPool = [], gemPool = [], ebulletPool = [], dmgPopPool = [];
var scBreaks = 0;   // 本局符卡击破数
var spellCardT = 0; // 符卡宣告动画计时

// ═══════════ 精英词缀 ═══════════
function rollAffixes() {
  var keys = Object.keys(AFFIX);
  var n = Math.random() < 0.3 ? 2 : 1;
  var pool = keys.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
function affixHas(e, k) { return e.affixes && e.affixes.indexOf(k) >= 0; }

function resetPlayer() {
  var c = CHAR[playerChar];
  player = {
    x:0, y:0, r:c.r, spd:c.spd, hp:c.hp, maxHp:c.hp,
    fx:1, fy:0, flip:false, inv:0,
    level:1, xp:0, xpNeed:xpNeedFor(1),
    weapons:[{ id:c.start, lv:1, t:30, ang:0 }],
    passives:{ atk:0, haste:0, move:0, magnet:0, hpup:0, exp:0, luck:0, leech:0, crit:0, armor:0 },
    attrs:{ rei:0, ma:0 },
    types:{ bullet:0, aoe:0, summon:0, field:0, beam:0, melee:0 },
    relics:{},
    rage: 0,
    buffDmgT: 0, buffMoveT: 0, buffDmg: 0, buffMove: 0,
    roukanDash: false,
    shield: 0, shieldMax: 30
  };
}
function xpNeedFor(l) { return 4 + l*3 + Math.floor(Math.pow(l, 1.5)); }
// 派生属性
function dmgMul()  { return (1 + 0.15 * player.passives.atk) * (CHAR[playerChar].dmg || 1) * (1 + 0.12 * relicLv('core')) * (player.buffDmgT > 0 ? 1 + player.buffDmg : 1); }
function cdMul()   { var m = Math.max(0.4, Math.pow(0.88, player.passives.haste)); return Math.max(0.3, m * (1 - 0.10 * relicLv('sage'))); }
function moveMul() { return 1 + 0.10 * player.passives.move + 0.15 * relicLv('broom') + (player.buffMoveT > 0 ? player.buffMove : 0); }
function magnetR() { return 90 * (1 + 0.40 * player.passives.magnet) * (attrLv('rei') >= 4 ? 1.2 : 1); }
function xpMul()   { return 1 + 0.15 * player.passives.exp; }
function luckMul() { return 1 + 0.30 * player.passives.luck + 0.20 * relicLv('luckycoin'); }
function critRate() { return 0.08 * player.passives.crit; }
function dmgReduce() { return Math.min(0.5, 0.06 * player.passives.armor); }
function hasWeapon(id) { for (var i=0;i<player.weapons.length;i++) if (player.weapons[i].id===id) return player.weapons[i]; return null; }
function isEvoed(w) { return w && w.evoed; }
// ── 属性 / 类型强化派生 ──
function attrLv(a) { return (player.attrs && player.attrs[a]) || 0; }
function typeLv(t) { return (player.types && player.types[t]) || 0; }
function hasAttrWeapon(a) { for (var i = 0; i < player.weapons.length; i++) { var cfg = WPN[player.weapons[i].id]; if (cfg && cfg.attr === a) return true; } return false; }
function hasTypeWeapon(t) { for (var i = 0; i < player.weapons.length; i++) { var cfg = WPN[player.weapons[i].id]; if (cfg && cfg.type === t) return true; } return false; }
function attrDmgMul(a) { return 1 + 0.10 * attrLv(a); }
function frenzyMul() { // 疯狂咏唱：HP 越低魔系伤害越高（20% 血时 +40%）
  if (attrLv('ma') < 3) return 1;
  var hpPct = Math.max(0, Math.min(1, player.hp / player.maxHp));
  var b = Math.max(0, (0.7 - hpPct) / 0.5);
  return 1 + Math.min(1, b) * 0.4;
}
function rageMul() { return 1 + 0.08 * (player.rage || 0); } // 狂化
function typeDmgMul(t) { return 1 + (t === 'aoe' || t === 'melee' ? 0.12 : (t === 'summon' ? 0.15 : 0)) * typeLv(t); }
function meleeBossMul() { return 1.25 + 0.10 * typeLv('melee'); } // 近战对 Boss：+25% ~ +55%
function typeRateMul(t) {
  var lv = typeLv(t);
  if (t === 'summon') return 1 + 0.15 * lv;
  if (t === 'field') return 1 + 0.12 * lv;
  if (t === 'melee') return 1 + 0.10 * lv;
  if (t === 'beam' && lv >= 3) return 1.20;
  return 1;
}
function typeRangeMul(t) { return 1 + (t === 'aoe' || t === 'field' || t === 'melee' ? 0.15 : 0) * typeLv(t); }
function typeBeamSizeMul() { return 1 + 0.15 * typeLv('beam'); }
function typeBulletSpeedMul() { return 1 + 0.15 * typeLv('bullet'); }
function typePierceBonus(t) { return typeLv(t) >= 3 ? 1 : 0; }
function typeCountBonus(t) { if (t === 'bullet') return typeLv(t) >= 2 ? 1 : 0; if (t === 'summon') return typeLv(t) >= 3 ? 1 : 0; return 0; }
// 武器最终伤害/冷却（含属性、类型、疯狂咏唱、狂化）
function wpnDmg(w) {
  var m = dmgMul() * attrDmgMul(w.attr) * typeDmgMul(w.type);
  if (w.research) m *= 1 + 0.06 * w.research; // 精研：每层 +6%（可无限叠）
  if (w.attr === 'ma') m *= frenzyMul() * rageMul();
  return m;
}
function wpnCd(w) { return cdMul() / typeRateMul(w.type); }
// 敌方抗性（随时间成长：8 分钟线性到上限）
function leechRes()  { return Math.min(0.5, gameTime / 480 * 0.5); } // 吸血抗性：上限 -50%
function freezeRes() { return Math.min(0.4, gameTime / 480 * 0.4); } // 冰冻抗性：上限 -40%
// 吸血类回血统一入口：敌方抗性 + 单次/每秒上限（红心/护符/赤月/升级等固定回复不走这里）
var healWinFrame = 0, healWinAmt = 0;
function healLeech(amount) {
  var n = amount * (1 - leechRes());
  if (n <= 0) return 0;
  if (healWinFrame > frameCount || frameCount - healWinFrame >= 60) { healWinFrame = frameCount; healWinAmt = 0; } // 跨局/超时都重置窗口
  var cap = Math.max(8, player.maxHp * 0.02); // 每秒上限：保底 8，随最大生命 2% 成长
  var room = cap - healWinAmt;
  if (room <= 0) return 0;
  var missing = player.maxHp - player.hp;
  if (missing <= 0) return 0;
  if (n > room) n = room;
  if (n > missing) n = missing;
  healWinAmt += n;
  player.hp += n;
  return n;
}

// ── 武器特性（P1）：tr.n 计数 / tr.last 最后命中帧 ──
function bumpTrait(id, n) {
  var w = hasWeapon(id);
  if (!w) return;
  if (!w.tr) w.tr = { n: 0, last: 0 };
  w.tr.n += (n || 1);
  w.tr.last = frameCount;
}
function trN(w) { return (w && w.tr) ? w.tr.n : 0; }
function traitStarShots(w)   { return Math.min(2, Math.floor(trN(w) / 20)); }     // 星印：命中20 → +1发
function traitSparkCd(w)     { return 1 - 0.10 * Math.min(3, trN(w)); }           // 过载：大命中 → 冷却 -10%/层
function traitOrbitR(w)      { return Math.min(30, trN(w)); }                     // 引力：击杀 +1 半径
function traitFrostDur(w)    { return Math.min(0.40, 0.04 * Math.floor(trN(w) / 5)); } // 霜核：每5次冻结 +4%
function traitCometN(w)      { return Math.min(2, Math.floor(trN(w) / 15)); }     // 陨铁：命中15 → +1颗
function traitYinyangSpd(w)  { return Math.min(0.40, 0.01 * trN(w)); }            // 弹力：命中 +1% 玉速
function traitNeedleDmg(w)   { return Math.min(20, Math.floor(trN(w) / 10) * 2); } // 封魔：每击杀10 → +2攻
function traitDollRate(w)    { return Math.min(0.30, 0.01 * Math.floor(trN(w) / 10)); } // 人偶工房：命中10 → +1%射速
function traitNetherR(w)     { return Math.min(20, Math.floor(trN(w) / 50) * 2); } // 深渊：累计吸血50 → +2半径
function traitGungnirW(w)    { return Math.min(0.20, 0.02 * trN(w)); }            // 贯穿强化：大命中 +2%宽
function traitRoukanChain(w) { return Math.min(5, trN(w)); }                      // 连击：跨目标连锁 +1 段
function traitHisouRate(w) { // 剑势：命中 +1% 攻速，2 秒未命中开始衰减
  if (w.tr && w.tr.n > 0 && frameCount - (w.tr.last || 0) > 120 && frameCount % 30 === 0) w.tr.n--;
  return Math.min(0.20, 0.01 * trN(w));
}
function fanSpeedMul() { // 天狗团扇：伤害随当前移速（封顶 ×1.5）
  return Math.min(1.5, 1 + (player.spd * moveMul() / CHAR[playerChar].spd - 1) * 0.8);
}
function reaperExecPct(w) { return (w && w.evoed) ? 0.40 : 0.25; } // 死神镰刀：斩杀阈值

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
  if (gameState === 'levelup' && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); rerollCards(); }
  if (gameState === 'relic' && ['1','2','3'].indexOf(e.key) >= 0) pickRelic(parseInt(e.key) - 1);
  // ESC 暂停
  if (e.key === 'Escape' && (gameState === 'playing' || gameState === 'paused')) { e.preventDefault(); togglePause(); }
});
document.addEventListener('keyup', function(e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
// 手势兜底：鼠标点击 / 触摸任意位置也尝试起播 BGM
document.addEventListener('pointerdown', function() { initAudio(); }, true);
document.addEventListener('touchstart', function() { initAudio(); }, true);

// 悬浮虚拟摇杆（触屏：任意位置按下即出现，松手回左下淡提示圈）
var JOY_HOME = { x: 105, y: 435, r: 56 };
var joy = { active:false, id:null, bx:0, by:0, dx:0, dy:0 };
var isTouch = !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches)));
function toCanvas(cx2, cy2) {
  var rect = cv.getBoundingClientRect();
  return { x: (cx2 - rect.left) / rect.width * W, y: (cy2 - rect.top) / rect.height * H };
}
var wrap = document.querySelector('.canvas-wrap');
wrap.addEventListener('touchstart', function(e) {
  if (gameState !== 'playing' || joy.active || roPaused) return;
  if (e.target && e.target.closest && e.target.closest('button, .overlay, #rotateOverlay')) return; // 防按钮穿透
  var t = e.changedTouches[0];
  var pt = toCanvas(t.clientX, t.clientY);
  joy.active = true; joy.id = t.identifier;
  joy.bx = Math.max(70, Math.min(W - 70, pt.x)); // 基座限制在屏内
  joy.by = Math.max(70, Math.min(H - 70, pt.y));
  joy.dx = 0; joy.dy = 0;
  initAudio();
  e.preventDefault();
}, { passive:false });
wrap.addEventListener('touchmove', function(e) {
  if (!joy.active) return;
  for (var i=0; i<e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === joy.id) {
      var pt = toCanvas(t.clientX, t.clientY);
      var sdx = pt.x - joy.bx, sdy = pt.y - joy.by;
      var d = Math.sqrt(sdx*sdx + sdy*sdy);
      if (d < 6) { joy.dx = 0; joy.dy = 0; } // 死区
      else { var m = Math.min(d, 56) / 56; joy.dx = sdx / d * m; joy.dy = sdy / d * m; }
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
// 局内锁定页面滑动（滚动链/橡皮筋/下拉刷新兜底）
wrap.addEventListener('touchmove', function(e) { if (gameState === 'playing') e.preventDefault(); }, { passive:false });
wrap.addEventListener('contextmenu', function(e) { e.preventDefault(); });

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
    if (e.dead) continue;
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
function hpMul()  { return 1 + gameTime / 145; }
function spdMul() { return 1 + Math.min(gameTime / 600, 0.4); }
function spawnInterval() {
  var base = Math.max(13.2, 78 * Math.pow(0.94, gameTime / 15));
  var m = (1 - 0.28 * director.power) * (1 - 0.25 * director.pressure);
  return Math.max(9, base * m); // 导演：越强刷越快，受压适当放缓
}
function enemyCap() {
  var base = Math.min(40 + Math.floor(gameTime / 30) * 8, 220);
  return Math.round(Math.min(260, base * (1 + 0.30 * director.power) * (1 - 0.18 * director.pressure)));
}
function viewSpawnDist(m) { return Math.sqrt(W * W + H * H) / 2 + m; }

function spawnEnemy(type, x, y) {
  var t = ETYPE[type];
  var e = enemyPool.pop() || {};
  var ang = Math.random() * Math.PI * 2;
  var dist = viewSpawnDist(70 + Math.random() * 120);
  e.x = (x !== undefined) ? x : player.x + Math.cos(ang) * dist;
  e.y = (y !== undefined) ? y : player.y + Math.sin(ang) * dist;
  e.maxHp = Math.round(t.hp * hpMul());
  e.hp = e.maxHp;
  e.spd = t.spd * (0.85 + Math.random() * 0.3);
  e.r = t.r; e.dmg = t.dmg; e.xpv = t.xp;
  e.type = type; e.wing = Math.random() * Math.PI * 2;
  e.hitFlash = 0; e.slowT = 0; e.frozen = 0; e.stun = 0; e.fuse = 0;
  e.chargeT = 0; e.chargeCd = 0;
  e.atkT2 = 40 + Math.random() * 160;
  e.mark = 0; e.curse = 0; e.curseT = 0; e.chill = 0; e.leechT = -999;
  e.killed = false; e.needleHitT = 0;
  e.uid = ++uidSeq;
  e.orbHitT = 0; e.yyHitT = 0; e.dead = false;
  e.elite = (type === 'elite' || type === 'eliteM' || type === 'eliteC' || type === 'exec');
  e.isBoss = false;
  // 精英词缀 roll（精英残部 eliteS 不带词缀）
  if (e.elite && type !== 'eliteS') {
    e.affixes = rollAffixes();
    if (affixHas(e, 'swift')) e.spd *= 1.6;
  } else e.affixes = null;
  e.burn = 0; e.burnDmg = 0; e.shock = 0;
  e.blinkT = 180 + Math.random() * 120; e.regenT = 0;
  enemies.push(e);
}
function trySpawn() {
  if (enemies.length >= enemyCap()) return;
  var t = gameTime;
  var type = 'fairy';
  var pm = t > 240 ? 0.4 : (t > 90 ? Math.min(0.35, 0.15 + t / 600) : 0);
  if (Math.random() < pm) type = 'mogu';
  // 特殊怪：各类型独立判定，正常刷新占比 ≤10%（事件怪潮不受此限）
  var sr = Math.random();
  if (t > 120 && sr < 0.06) type = 'split';
  else if (t > 150 && sr < 0.12) type = 'butterfly';
  else if (t > 180 && sr < 0.19) type = 'poison';
  else if (t > 200 && sr < 0.26) type = 'ghost';
  else if (t > 210 && sr < 0.33) type = 'shieldf';
  else if (t > 260 && sr < 0.37) type = 'boar';
  else if (t > 180 && sr < 0.43) {
    // 向日葵：固定炮台（场上最多 4）
    var sfCount = 0;
    for (var sfI = 0; sfI < enemies.length; sfI++) if (enemies[sfI].type === 'sunflower') sfCount++;
    if (sfCount < 4) type = 'sunflower';
  }
  spawnEnemy(type);
  // 导演：战力高时成组刷怪（只复制基础怪）
  if ((type === 'fairy' || type === 'mogu') && director.power > 0.4 && Math.random() < director.power * 0.5) spawnEnemy(type);
}
// ═══════════ Boss ═══════════
function spawnBoss() {
  var def = BOSS_DEFS[bossCount % 2];
  // 清场：非 Boss 敌人化作粒子消散
  for (var ci = enemies.length - 1; ci >= 0; ci--) {
    var m = enemies[ci];
    spawnParticles(m.x, m.y, '#b89fff', 5, 1, 3);
    enemies.splice(ci, 1); m.dead = false; enemyPool.push(m);
  }
  var e = enemyPool.pop() || {};
  e.x = player.x; e.y = player.y - (H / 2 + 90); // 从画面上方降落入场
  e.maxHp = Math.round(6000 * Math.pow(1.4, bossCount)); // 符卡战：强度随轮次线性增长（不吃时间倍率）
  e.hp = e.maxHp;
  e.spd = 2.3; e.r = 60; e.dmg = 18; e.xpv = 0; // 速度略低于玩家：靠符卡压制而非永久贴脸
  e.type = 'boss'; e.bossIdx = bossCount % 2;
  e.wing = 0; e.hitFlash = 0; e.slowT = 0; e.frozen = 0; e.fuse = 0;
  e.orbHitT = 0; e.yyHitT = 0; e.dead = false; e.elite = false; e.isBoss = true;
  e.atkT = 150; e.atkPhase = 0; e.chargeT = 0; e.cdx = 0; e.cdy = 0;
  e.burn = 0; e.burnDmg = 0; e.shock = 0; e.affixes = null;
  e.mark = 0; e.curse = 0; e.curseT = 0; e.chill = 0; e.leechT = -999;
  // 符卡阶段初始化：血量阈值 + 首卡倒计时 + 入场演出
  e.cardIdx = 0;
  e.thresholds = [];
  var acc2 = 1;
  for (var k = 0; k < def.cards.length; k++) { acc2 -= def.cards[k].hp; e.thresholds.push(Math.max(0, acc2) * e.maxHp); }
  e.cardT = def.cards[0].dur * 60;
  e.bossIntroT = 150; e.bossInvT = 150; e.introLand = false;
  e.rageStacks = 0; // 符卡超时惩罚：永久狂化层
  e.cardsBroken = 0;
  e.relicGiven = false;
  e.killed = false;
  e.uid = ++uidSeq;
  e.orbA = 0; e.cloneAng = 0; e.spA = 0;
  enemies.push(e);
  boss = e; bossCount++;
  // 入场演出：横幅 + 红闪 + 震屏
  bossBannerT = 105;
  var banner = document.getElementById('bossBanner');
  banner.textContent = '⚠ ' + def.name + ' 参上！ ⚠';
  banner.classList.add('show');
  hurtFlash = 12; shakeT = 14;
  sfxBossIn();
}
function hideBossBar() {} // HUD 入画后无需 DOM 操作（保留函数名兼容调用点）
function spawnEbullet(x, y, vx, vy, dmg, color, life, spear, shape, cuttable) {
  if (ebullets.length >= 150) return;
  var b = ebulletPool.pop() || {};
  var rage = (boss && !boss.dead && boss.rageStacks) ? boss.rageStacks : 0;
  var rmul = 1 + 0.12 * rage;
  b.x = x; b.y = y; b.vx = vx * rmul; b.vy = vy * rmul; b.dmg = dmg; b.r = 6;
  b.life = life || 500; b.color = color || '#ff6b9d'; b.spear = !!spear;
  b.shape = shape || (spear ? 'spear' : 'orb');
  b.cuttable = !!cuttable;
  ebullets.push(b);
}
// 符卡宣告（东方正作式右侧滑入名牌）
function announceSpellCard(e) {
  var def = BOSS_DEFS[e.bossIdx];
  var card = def.cards[e.cardIdx];
  var sc = document.getElementById('spellCard');
  if (sc) {
    sc.querySelector('.sc-no').textContent = 'SPELL CARD ' + (e.cardIdx + 1) + ' / ' + def.cards.length;
    sc.querySelector('.sc-name').textContent = card.name;
    sc.classList.remove('show'); void sc.offsetWidth;
    sc.classList.add('show');
  }
  spellCardT = 160;
  addLabel(e.x, e.y - 80, '『' + card.name + '』', '#ffe8b0');
  sfxBossIn();
}
// 事件横幅（右上角，符卡同款滑入名牌）
function announceEvent(name, color) {
  var el = document.getElementById('eventBanner');
  if (!el) return;
  var nm = el.querySelector('.ev-name');
  if (nm) { nm.textContent = name; nm.style.color = color || '#ffd0d0'; }
  el.style.borderLeftColor = color || '#ef4444';
  el.style.borderRightColor = color || '#ef4444';
  el.classList.remove('show'); void el.offsetWidth;
  el.classList.add('show');
  eventBannerT = 150;
}
// 符卡阶段切换：broken=击破（有奖励）/ 超时（无奖励，进入下一张）
function nextBossCard(e, broken) {
  var def = BOSS_DEFS[e.bossIdx];
  // 清全屏敌方弹幕（化作粒子）
  for (var i = ebullets.length - 1; i >= 0; i--) {
    var eb3 = ebullets[i];
    spawnParticles(eb3.x, eb3.y, '#b89fff', 2, 1, 2);
    ebullets.splice(i, 1); ebulletPool.push(eb3);
  }
  mist = null;
  if (broken) {
    scBreaks++;
    e.cardsBroken = (e.cardsBroken || 0) + 1;
    scoreBonus += 250;
    for (var g2 = 0; g2 < 12; g2++) spawnGem(e.x + (Math.random()-0.5)*80, e.y + (Math.random()-0.5)*80, 1);
    spawnDrop(e.x + (Math.random()-0.5)*80, e.y + (Math.random()-0.5)*80, 'shard'); // 符卡结晶
    addLabel(e.x, e.y - 70, '★ 符卡击破！ +250', '#f0c060');
    spawnParticles(e.x, e.y, '#f0c060', 36, 2, 6);
    shakeT = 10; deathFlash = Math.max(deathFlash, 8);
    sfxBomb();
  } else {
    // 超时惩罚：玩家扣血 + Boss 永久狂化
    e.rageStacks = Math.min(4, (e.rageStacks || 0) + 1);
    var pen = Math.max(10, Math.round(player.maxHp * 0.15));
    player.hp -= pen; // 惩罚伤害：无视护盾与无敌帧
    hurtFlash = 14; shakeT = 12;
    addDmgPop(player.x, player.y - 30, pen, true, '#ef4444');
    spawnParticles(player.x, player.y, '#ef4444', 20, 2, 6);
    addLabel(e.x, e.y - 70, '符卡超时 · 反噬 +' + e.rageStacks, '#ef4444');
    sfxHurt();
    if (player.hp <= 0) { endGame(); return; }
  }
  e.cardIdx++;
  if (e.cardIdx >= def.cards.length) { e.hp = 0; killEnemy(e); return; }
  e.cardT = def.cards[e.cardIdx].dur * 60;
  e.atkT = 70; e.atkPhase = 0; e.chargeT = 0;
  e.bossInvT = 100; // 切卡演出期无敌
  var ta = Math.random() * Math.PI * 2;
  spawnParticles(e.x, e.y, def.aura, 20, 1, 4);
  e.x = player.x + Math.cos(ta) * 300; e.y = player.y + Math.sin(ta) * 300 - 80;
  spawnParticles(e.x, e.y, def.aura, 20, 1, 4);
  announceSpellCard(e);
}
// Boss AI：入场演出 → 符卡倒计时 → 当前符卡弹幕模式
function updateBoss(e) {
  var def = BOSS_DEFS[e.bossIdx];
  // 入场：从上方降落 + 落地冲击波，期间无敌
  if (e.bossIntroT > 0) {
    e.bossIntroT -= dt;
    e.x += (player.x - e.x) * 0.04 * dt;
    e.y += ((player.y - 280) - e.y) * 0.05 * dt;
    if (!e.introLand && e.bossIntroT < 30) {
      e.introLand = true;
      shakeT = 12;
      rings.push({ x: e.x, y: e.y, r: 10, maxR: 240, life: 20, maxLife: 20, color: def.aura });
      spawnParticles(e.x, e.y, def.aura, 30, 2, 6);
      sfxBossIn();
    }
    if (e.bossIntroT <= 0) { e.bossInvT = 30; announceSpellCard(e); }
    return;
  }
  if (e.bossInvT > 0) { e.bossInvT -= dt; return; } // 符卡切替/宣告期无敌闪烁
  // 符卡倒计时（Boss 战期间主计时器已停，只计符卡时间）
  e.cardT -= dt;
  if (e.cardT <= 0) { nextBossCard(e, false); return; }
  // 突进中（路径留伤害残影）
  if (e.chargeT > 0) {
    e.x += e.cdx * 7.5 * dt; e.y += e.cdy * 7.5 * dt;
    e.chargeT -= dt;
    if (frameCount % 5 === 0) spawnEbullet(e.x, e.y, 0, 0, 10, def.aura, 80);
    return;
  }
  var pdx = player.x - e.x, pdy = player.y - e.y;
  var d = Math.sqrt(pdx*pdx + pdy*pdy) || 1;
  // 橡皮筋：被甩开太远时瞬移到玩家视野内（防止风筝成屏外炮台）
  if (d > 750) {
    spawnParticles(e.x, e.y, def.aura, 14, 1, 4);
    var ta = Math.random() * Math.PI * 2;
    e.x = player.x + Math.cos(ta) * 380; e.y = player.y + Math.sin(ta) * 380;
    spawnParticles(e.x, e.y, def.aura, 14, 1, 4);
    sfxWarn();
  }
  PATTERNS[def.cards[e.cardIdx].pattern](e, d, pdx, pdy);
}
// ── 符卡弹幕模式库 ──
var PATTERNS = {
  // 蕾米莉亚 ① 神枪「冈格尼尔」：穿枪预警 + 侧翼红弹环
  spear: function(e, d, pdx, pdy) {
    if (d > 240) { e.x += pdx/d*e.spd*dt; e.y += pdy/d*e.spd*dt; }
    e.atkT -= dt;
    if (e.atkT > 0) return;
    e.atkT = 66;
    if (e.atkPhase % 2 === 0) {
      var ba = Math.atan2(pdy, pdx);
      e.cdx = Math.cos(ba); e.cdy = Math.sin(ba);
      warnings.push({ x: e.x, y: e.y, dx: e.cdx, dy: e.cdy, t: 38, boss: e, spear: true, dmg: 20 });
      sfxWarn();
    } else {
      for (var i = 0; i < 22; i++) { var a = (i/22)*Math.PI*2 + e.atkPhase*0.31; spawnEbullet(e.x, e.y, Math.cos(a)*2.4, Math.sin(a)*2.4, 10, '#ff3b30', 280); }
      sfxBoom();
    }
    e.atkPhase++;
  },
  // 蕾米莉亚 ② 红雾「吸血鬼黄昏」：跟随红雾领域 + 弹环 + 红魔使魔
  mistwave: function(e, d, pdx, pdy) {
    if (!mist) mist = { x: e.x, y: e.y, r: 185, t: 99999, dmg: 8, tick: 0 };
    mist.x = e.x; mist.y = e.y; // 领域跟随 Boss
    if (d > 190) { e.x += pdx/d*e.spd*0.85*dt; e.y += pdy/d*e.spd*0.85*dt; }
    e.atkT -= dt;
    if (e.atkT > 0) return;
    e.atkT = 44;
    for (var i = 0; i < 24; i++) { var a = (i/24)*Math.PI*2 + e.atkPhase*0.2; spawnEbullet(e.x, e.y, Math.cos(a)*2.6, Math.sin(a)*2.6, 10, '#c02040', 300); }
    if (e.atkPhase % 4 === 3) for (var k = 0; k < 5; k++) { var a3 = (k/5)*Math.PI*2 + e.atkPhase; spawnEnemy('redfairy', e.x + Math.cos(a3)*100, e.y + Math.sin(a3)*100); }
    sfxBoom();
    e.atkPhase++;
  },
  // 蕾米莉亚 ③ 「绯红恶魔」：十字激光 + 蝙蝠突进 + 自机狙散射
  crimson: function(e, d, pdx, pdy) {
    if (d > 170) { e.x += pdx/d*e.spd*1.45*dt; e.y += pdy/d*e.spd*1.45*dt; }
    e.atkT -= dt;
    if (e.atkT > 0) return;
    var mode = e.atkPhase % 3;
    if (mode === 0) { // 十字激光（横竖双线预警 → 扫射）
      warnings.push({ laserH: true, y: e.y, t: 48, dmg: 26 });
      warnings.push({ laserV: true, x: e.x, t: 48, dmg: 26 });
      e.atkT = 112; sfxWarn();
    } else if (mode === 1) { // 蝙蝠突进（路径残影）
      e.cdx = pdx/d; e.cdy = pdy/d;
      warnings.push({ x: e.x, y: e.y, dx: e.cdx, dy: e.cdy, t: 40, boss: e, charge: true });
      e.atkT = 88; sfxWarn();
    } else { // 自机狙红弹散射
      var ba2 = Math.atan2(pdy, pdx);
      for (var i2 = 0; i2 < 12; i2++) { var sa2 = ba2 + (i2-5.5)*0.12; spawnEbullet(e.x, e.y, Math.cos(sa2)*3.6, Math.sin(sa2)*3.6, 12, '#ff2222', 240, false, 'knife'); }
      e.atkT = 66; sfxSpark();
    }
    e.atkPhase++;
  },
  // 芙兰朵露 ① 禁忌「星之弓」：星之雨落点爆 + 彩星环
  starrain: function(e, d, pdx, pdy) {
    if (d > 380) { e.x += pdx/d*e.spd*dt; e.y += pdy/d*e.spd*dt; }
    else if (d < 260) { e.x -= pdx/d*e.spd*dt; e.y -= pdy/d*e.spd*dt; }
    e.atkT -= dt;
    if (e.atkT > 0) return;
    if (e.atkPhase % 2 === 0) { // 星之雨：多落点预警依次爆
      for (var i3 = 0; i3 < 9; i3++) {
        var ra = Math.random()*Math.PI*2, rr = 40 + Math.random()*230;
        warnings.push({ x: player.x + Math.cos(ra)*rr, y: player.y + Math.sin(ra)*rr, r: 80, t: 34 + i3*8, playerBoom: true, pdmg: 16, color: '#f0c060' });
      }
      e.atkT = 112; sfxWarn();
    } else { // 彩星环
      var cols = ['#ff5b5b','#ffb84d','#fff36b','#7dff7a','#6bd5ff','#b89fff','#ff8fd8'];
      for (var w2 = 0; w2 < 16; w2++) { var wa2 = (w2/16)*Math.PI*2 + e.atkPhase*0.35; spawnEbullet(e.x, e.y, Math.cos(wa2)*2.4, Math.sin(wa2)*2.4, 9, cols[w2%7], 320, false, 'star'); }
      e.atkT = 38;
    }
    e.atkPhase++;
  },
  // 芙兰朵露 ② 禁忌「四重存在」：绕行 + 四分身弹幕源
  quad: function(e) {
    e.orbA += 0.006 * dt; e.cloneAng += 0.03 * dt;
    var tx = player.x + Math.cos(e.orbA) * 330, ty = player.y + Math.sin(e.orbA) * 330;
    e.x += (tx - e.x) * 0.05 * dt; e.y += (ty - e.y) * 0.05 * dt;
    e.atkT -= dt;
    if (e.atkT > 0) return;
    e.atkT = 52;
    for (var q = 0; q < 4; q++) { // 四个分身各发 10 向弹
      var qa = (q/4)*Math.PI*2 + e.cloneAng;
      var qx = e.x + Math.cos(qa)*130, qy = e.y + Math.sin(qa)*130;
      for (var i4 = 0; i4 < 10; i4++) { var a4 = (i4/10)*Math.PI*2 + e.cloneAng*0.8; spawnEbullet(qx, qy, Math.cos(a4)*2.2, Math.sin(a4)*2.2, 10, '#f0c060', 300); }
    }
    sfxBoom();
  },
  // 芙兰朵露 ③ Q.E.D.「495年的波纹」：正反双螺旋 + 波纹大环，终段加速
  qed: function(e, d, pdx, pdy) {
    if (d > 300) { e.x += pdx/d*e.spd*0.8*dt; e.y += pdy/d*e.spd*0.8*dt; }
    e.spA += 0.115 * dt;
    e.atkT -= dt;
    if (e.atkT > 0) return;
    e.atkT = 4;
    var boost = e.cardT < 480 ? 1.35 : 1; // 符卡终段加速
    spawnEbullet(e.x, e.y, Math.cos(e.spA)*2.8*boost, Math.sin(e.spA)*2.8*boost, 10, '#f0c060', 320);
    spawnEbullet(e.x, e.y, Math.cos(-e.spA)*2.8*boost, Math.sin(-e.spA)*2.8*boost, 10, '#ff8fd8', 320);
    if (e.atkPhase % 28 === 0) { // 波纹大环
      for (var i5 = 0; i5 < 34; i5++) { var a5 = (i5/34)*Math.PI*2; spawnEbullet(e.x, e.y, Math.cos(a5)*1.3, Math.sin(a5)*1.3, 12, '#b89fff', 440); }
      rings.push({ x: e.x, y: e.y, r: 10, maxR: 160, life: 20, maxLife: 20, color: '#b89fff' });
      sfxBoom();
    }
    e.atkPhase++;
  }
};
function eliteWaveSpawn() {
  eliteWave++;
  var n = 2 + eliteWave;
  var shapes = ['elite', 'eliteM', 'eliteC'];
  var rr = viewSpawnDist(10);
  for (var i = 0; i < n; i++) {
    var ang = (i / n) * Math.PI * 2;
    spawnEnemy(shapes[Math.floor(Math.random() * shapes.length)], player.x + Math.cos(ang) * rr, player.y + Math.sin(ang) * rr);
  }
  announceEvent('词缀精英来袭', '#ef4444');
  sfxWarn();
}
// 特殊怪潮（每 150 秒一波主题特殊怪，不计入正常刷新占比）
var SPECIAL_WAVES = [
  { type:'butterfly', n:9, name:'魂蝶之潮',   color:'#b89fff', t:150 },
  { type:'ghost',     n:9, name:'幽灵之潮',   color:'#8fd8ff', t:200 },
  { type:'poison',    n:7, name:'毒蘑菇之潮', color:'#9b5adf', t:180 },
  { type:'shieldf',   n:8, name:'护盾之潮',   color:'#4da6ff', t:210 },
  { type:'boar',      n:6, name:'野猪之潮',   color:'#ff8c50', t:260 }
];
function specialWaveSpawn() {
  var pool = [];
  for (var i = 0; i < SPECIAL_WAVES.length; i++) if (gameTime >= SPECIAL_WAVES[i].t) pool.push(SPECIAL_WAVES[i]);
  if (!pool.length) return;
  var w = pool[Math.floor(Math.random() * pool.length)];
  var rr = viewSpawnDist(10);
  for (var k = 0; k < w.n; k++) {
    var ang = (k / w.n) * Math.PI * 2;
    spawnEnemy(w.type, player.x + Math.cos(ang) * rr, player.y + Math.sin(ang) * rr);
  }
  announceEvent(w.name, w.color);
  sfxWarn();
}

// ═══════════ 动态难度导演 ═══════════
var director = { pressure:0, safeT:0, power:0, hits:[], execCd:600, execOn:false };
function directorReset() { director.pressure = 0; director.safeT = 0; director.power = 0; director.hits = []; director.execCd = 600; director.execOn = false; }
function updateDirector() {
  // 战力评估：等级 / 武器等级 / 超进化 / 遗物
  var power = player.level * 0.05;
  for (var i = 0; i < player.weapons.length; i++) power += player.weapons[i].lv * 0.035 + (player.weapons[i].evoed ? 0.18 : 0);
  for (var r in player.relics) power += 0.05 * player.relics[r];
  director.power = Math.min(1.2, power);
  // 压力衰减：安全 8 秒后回落
  director.safeT += 1 / 60;
  if (director.safeT > 8) director.pressure = Math.max(0, director.pressure - 0.003);
  // 高危判定：连续受击或残血 → 处刑怪（仅高危才刷）
  var recentHits = 0;
  for (var h = 0; h < director.hits.length; h++) if (frameCount - director.hits[h] < 600) recentHits++;
  if (director.hits.length > 40) director.hits = director.hits.slice(-40);
  if (director.execCd > 0) director.execCd -= dt;
  var danger = (recentHits >= 3 || player.hp < player.maxHp * 0.25);
  if (danger && !director.execOn && director.execCd <= 0 && !boss) spawnExecutioner();
}
function spawnExecutioner() {
  director.execOn = true; director.execCd = 5400; // 90 秒冷却
  var ang = Math.random() * Math.PI * 2;
  var rr = viewSpawnDist(70);
  spawnEnemy('exec', player.x + Math.cos(ang) * rr, player.y + Math.sin(ang) * rr);
  announceEvent('处刑者降临', '#ff4444');
  var e = enemies[enemies.length - 1];
  // 固定双词缀
  var pool = Object.keys(AFFIX), extra = [];
  while (e.affixes.length < 2 && pool.length) {
    var pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (e.affixes.indexOf(pick) < 0) e.affixes.push(pick);
  }
  if (affixHas(e, 'swift')) e.spd *= 1.6;
  addLabel(player.x, player.y - 70, '⚔ 处刑者降临！', '#ef4444');
  addLabel(e.x, e.y - 80, '处刑者', '#ef4444');
  spawnParticles(e.x, e.y, '#ef4444', 26, 2, 6);
  hurtFlash = Math.max(hurtFlash, 8);
  shakeT = Math.max(shakeT, 10);
  sfxWarn();
}

// ═══════════ 敌人软分离（推开重叠，尸潮摊开不叠罗汉）═══════════
function separateEnemies() {
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.isBoss || e.dead) continue;          // Boss 不被推动
    if (e.frozen > 0 || freezeAll > 0) continue; // 冰雕/时停不动
    if (e.type === 'ghost' || e.type === 'butterfly') continue; // 飞行单位穿过尸潮
    if (e.type === 'sunflower') continue;      // 固定炮台不被推动
    var pushX = 0, pushY = 0;
    queryGrid(e.x, e.y, e.r + 60, function(o) {
      if (o === e || o.dead) return;
      if (o.type === 'ghost' || o.type === 'butterfly') return; // 从飞行单位身上穿过
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
  b.homing = 0; // 对象池防御性重置
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
// 伤害结算入口（kind: bullet/aoe/beam/contact/dot）
function damageEnemy(e, dmg, kind) {
  if (e.dead || e.killed) return;
  if (e.isBoss && e.bossInvT > 0) return; // Boss 入场/切卡演出期无敌
  if (affixHas(e, 'armor') && kind !== 'aoe' && kind !== 'dot') dmg = Math.max(1, Math.round(dmg * 0.4)); // 坚甲词缀：直击减伤60%
  if (e.type === 'shieldf' && kind === 'bullet') dmg = Math.max(1, Math.round(dmg * 0.25)); // 护盾妖精抗子弹
  if (e.type === 'ghost' && kind === 'bullet') dmg = Math.max(1, Math.round(dmg * 0.5)); // 幽灵抗子弹
  var cursePer = (attrLv('ma') >= 2 ? 0.115 : 0.10) + 0.05 * relicLv('anomaly');
  if (e.curse > 0) dmg = Math.round(dmg * (1 + cursePer * e.curse)); // 咒印：承伤提升
  // 暴击判定（DoT 不暴击）
  var crit = false;
  var cr = critRate() + (attrLv('ma') >= 4 ? 0.08 : 0);
  if (kind !== 'dot' && Math.random() < cr) { dmg = Math.round(dmg * ((attrLv('ma') >= 4 ? 2.3 : 2) + relicLv('destruction'))); crit = true; }
  // 遗物：屠魔者 / 四重奏
  if ((e.isBoss || e.elite) && relicLv('slayer')) dmg = Math.round(dmg * (1 + 0.20 * relicLv('slayer')));
  if (relicLv('quartet') && Math.random() < 0.12 * relicLv('quartet')) dmg = Math.round(dmg * 1.5);
  // 遗物：异常注入（灼烧/冻结/咒印）
  if (!e.isBoss) {
    var anom = 1 + 0.5 * relicLv('anomaly');
    if (relicLv('ignis') && Math.random() < 0.20 * relicLv('ignis')) { e.burn = Math.max(e.burn, 120); e.burnDmg = Math.max(e.burnDmg || 0, Math.round(8 * anom)); }
    if (relicLv('glacie') && Math.random() < 0.15 * relicLv('glacie')) {
      if (e.slowT > 0) e.frozen = Math.max(e.frozen, Math.round(48 * anom * (1 - freezeRes())));
      else e.slowT = Math.max(e.slowT, Math.round(120 * anom));
    }
    if (relicLv('cursed') && Math.random() < 0.20 * relicLv('cursed')) { e.curse = Math.min(3, (e.curse || 0) + 1); e.curseT = 360; }
  }
  // Boss 单次受击上限：每张符卡 12%（防止一炮一卡）
  if (e.isBoss && e.thresholds) {
    var cStart = e.cardIdx === 0 ? e.maxHp : e.thresholds[e.cardIdx - 1];
    var cEnd = e.thresholds[e.cardIdx] || 0;
    var capHit = Math.max(20, Math.round((cStart - cEnd) * 0.06));
    if (dmg > capHit) dmg = capHit;
  }
  e.hp -= dmg; e.hitFlash = 4;
  addDmgPop(e.x, e.y - e.r - 4, dmg, crit || dmg >= 40, crit ? '#ffd700' : null);
  // Boss 符卡阶段切换（阈值检查优先于击杀；血量钳制到当前符卡阈值，单发大伤害不跨阶段）
  if (e.isBoss && e.hp <= e.thresholds[e.cardIdx] && !e.dead) {
    if (e.thresholds[e.cardIdx] > 0) e.hp = Math.max(e.hp, e.thresholds[e.cardIdx]);
    if (e.hp <= 0) killEnemy(e);
    else nextBossCard(e, true);
    return;
  }
  if (e.hp <= 0) killEnemy(e);
}
// 玩家受伤统一入口
function hurtPlayer(dmg) {
  if (godMode) { player.inv = 30; return; } // 调试无敌
  dmg = Math.max(1, Math.round(dmg * (1 - dmgReduce()))); // 结界强化减伤
  // 护盾优先吸收（阴阳玉 / 遗物）
  if (player.shield > 0) {
    var absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed; dmg -= absorbed;
    spawnParticles(player.x, player.y, '#8fd8ff', 8, 1, 3);
    if (dmg <= 0) {
      player.inv = 12; hurtFlash = 6; // 护盾吸收：短无敌
      addLabel(player.x, player.y - 30, '护盾抵消', '#8fd8ff');
      sfxFreeze();
      return;
    }
  }
  player.hp -= dmg;
  player.inv = 28; // 0.47s 无敌帧（缩短围殴保护）
  // 导演：压力上升
  director.pressure = Math.min(1, director.pressure + dmg / Math.max(1, player.maxHp) * 1.5);
  director.safeT = 0;
  director.hits.push(frameCount);
  if (attrLv('ma') >= 5 && player.rage > 0) player.rage = Math.max(0, player.rage - 2); // 狂化：受伤掉 2 层
  // 遗物：血雾领域（受击触发）
  if (relicLv('bloodmist') && !relicMist) relicMist = { x: player.x, y: player.y, r: 130, t: 150, tick: 0, dmg: 10 * relicLv('bloodmist') };
  // 遗物：不死鸟之羽（濒死复活）
  if (player.hp <= 0 && relicLv('phoenix') > 0) {
    player.relics.phoenix--;
    player.hp = Math.round(player.maxHp * 0.3);
    player.inv = 120;
    deathFlash = 10;
    addLabel(player.x, player.y - 40, '🪽 不死鸟之羽！', '#ffd700');
    spawnParticles(player.x, player.y, '#ffd700', 26, 2, 5);
    return;
  }
  hurtFlash = 10;
  addDmgPop(player.x, player.y - 30, dmg, false, '#ff5555');
  spawnParticles(player.x, player.y, '#ef4444', 14, 2, 5);
  sfxHurt();
  if (player.hp <= 0) endGame();
}
function killEnemy(e) {
  if (e.dead || e.killed) return; // 强幂等：尸体回收后 dead 会被重置，靠 killed 拦截二次结算
  e.dead = true; e.killed = true; kills++;
  bumpTrait('needle', 1); // 特性·封魔：每击杀累计（每 10 杀 +2 攻）
  spawnParticles(e.x, e.y, (e.elite || e.isBoss) ? '#f0c060' : '#b89fff', e.elite ? 22 : 8, 1, 3);
  sfxDie();
  // P点
  for (var i = 0; i < e.xpv; i++) spawnGem(e.x + (Math.random()-0.5)*20, e.y + (Math.random()-0.5)*20, 1);
  // 顺手牵羊
  if (player.passives.leech > 0 && Math.random() < 0.03 * player.passives.leech) {
    healLeech(2);
  }
  // 灵力强化 Lv2：灵系击杀概率回血
  if (attrLv('rei') >= 2 && Math.random() < 0.08) healLeech(1);
  // 灵力强化 Lv5：灵爆（清弹 + 回盾）
  if (attrLv('rei') >= 5 && Math.random() < 0.15) {
    rings.push({ x:e.x, y:e.y, r:10, maxR:170, life:14, maxLife:14, color:'#8fd8ff' });
    spawnParticles(e.x, e.y, '#8fd8ff', 14, 1, 4);
    for (var reiI = ebullets.length - 1; reiI >= 0; reiI--) {
      var reiB = ebullets[reiI];
      var rdx = reiB.x - e.x, rdy = reiB.y - e.y;
      if (rdx*rdx + rdy*rdy < 170*170) { spawnParticles(reiB.x, reiB.y, '#b89fff', 2, 1, 2); ebullets.splice(reiI, 1); ebulletPool.push(reiB); }
    }
    player.shield = Math.min(player.shieldMax, player.shield + 5);
  }
  // 魔力强化 Lv5：狂化（击杀叠层）
  if (attrLv('ma') >= 5) player.rage = Math.min(5, (player.rage || 0) + 1);
  // 遗物：吸血鬼之牙 / 崩坏之瞳
  if (relicLv('fangs') && Math.random() < 0.06 * relicLv('fangs')) healLeech(3);
  if (relicLv('ruineye') && Math.random() < 0.10 * relicLv('ruineye')) {
    rings.push({ x:e.x, y:e.y, r:8, maxR:100, life:12, maxLife:12, color:'#f0c060' });
    queryGrid(e.x, e.y, 150, function(o) {
      if (o === e || o.dead) return;
      var rdx = o.x - e.x, rdy = o.y - e.y;
      if (rdx*rdx + rdy*rdy < (100 + o.r) * (100 + o.r)) damageEnemy(o, 40 * relicLv('ruineye'), 'aoe');
    });
  }
  // 环绕星：领域内击杀回 HP
  var owK = hasWeapon('orbit');
  if (owK && player.hp > 0) {
    var orrK = owK.evoed ? 112 : WPN.orbit.or[owK.lv - 1];
    var kdx = e.x - player.x, kdy = e.y - player.y;
    if (kdx*kdx + kdy*kdy < (orrK + 30) * (orrK + 30)) { healLeech(1); bumpTrait('orbit', 1); } // 特性·引力
  }
  // 魔炮标记：额外 P 点
  if (e.mark > 0) spawnGem(e.x + 14, e.y, 1);
  // 破魔针超进化：敌人死亡时弹射封魔针
  var nwK = hasWeapon('needle');
  if (nwK && nwK.evoed && bullets.length < 240) {
    for (var nsK = 0; nsK < 5; nsK++) {
      var nsaK = (nsK / 5) * Math.PI * 2 + (e.wing || 0);
      spawnBullet(e.x, e.y, Math.cos(nsaK) * 7, Math.sin(nsaK) * 7, 18 * wpnDmg(nwK), 4, 1, 60, 'needle');
    }
  }
  // 分裂菇：裂成 3 只小菇
  if (e.type === 'split') {
    for (var sp = 0; sp < 3; sp++) spawnEnemy('mini', e.x + (Math.random()-0.5)*26, e.y + (Math.random()-0.5)*26);
  }
  // 毒蘑菇：死亡留下毒坑
  if (e.type === 'poison') spawnPoisonPit(e.x, e.y);
  // 处刑者击破：解除标记并进入冷却
  if (e.type === 'exec') { director.execOn = false; director.execCd = 5400; }
  // 精英词缀死亡效果
  if (e.affixes) {
    if (affixHas(e, 'burst')) { // 爆裂：死亡自爆（伤玩家）
      rings.push({ x:e.x, y:e.y, r:10, maxR:130, life:14, maxLife:14, color:'#ff8c50' });
      spawnParticles(e.x, e.y, '#ff8c50', 22, 2, 5);
      sfxBoom();
      var bpx = player.x - e.x, bpy = player.y - e.y;
      if (player.inv <= 0 && bpx*bpx + bpy*bpy < (115 + player.r) * (115 + player.r)) hurtPlayer(16);
    }
    if (affixHas(e, 'split')) { // 分裂：裂成 2 只精英残部
      for (var sp2 = 0; sp2 < 2; sp2++) spawnEnemy('eliteS', e.x + (Math.random()-0.5)*60, e.y + (Math.random()-0.5)*60);
    }
  }
  // Boss 击破：大奖 + 战利品三选一（每个 Boss 一次）
  if (e.isBoss) {
    var bossIdxK = e.bossIdx;
    boss = null; hideBossBar(); mist = null;
    scoreBonus += 500;
    for (var bg = 0; bg < 20; bg++) spawnGem(e.x + (Math.random()-0.5)*90, e.y + (Math.random()-0.5)*90, 1);
    eliteDrop(e.x - 24, e.y); eliteDrop(e.x + 24, e.y);
    addLabel(e.x, e.y - 60, '🎉 BOSS 击破！ +500', '#f0c060');
    spawnParticles(e.x, e.y, '#f0c060', 40, 2, 7);
    shakeT = 12;
    sfxBomb();
    rotateBg();
    if (!e.relicGiven) { e.relicGiven = true; showRelicChoice(bossIdxK); }
    return;
  }
  // 掉落
  if (e.elite) eliteDrop(e.x, e.y);
  else if (Math.random() < 0.008 * luckMul()) spawnDrop(e.x, e.y, 'heart'); // 红心更稀有
}
// 敌人自爆（魂蝶）：对敌群误伤 + 对玩家伤害
function enemyExplode(e, idx, radius, dmgE, dmgP) {
  rings.push({ x:e.x, y:e.y, r:10, maxR:radius, life:14, maxLife:14, color:'#b89fff' });
  spawnParticles(e.x, e.y, '#b89fff', 22, 2, 5);
  spawnParticles(e.x, e.y, '#efe8fa', 10, 1, 3);
  sfxBomb();
  queryGrid(e.x, e.y, radius + 60, function(o) {
    if (o === e || o.dead) return;
    var dx = o.x - e.x, dy = o.y - e.y;
    if (dx*dx + dy*dy < (radius + o.r) * (radius + o.r)) damageEnemy(o, dmgE, 'aoe');
  });
  var pdx = player.x - e.x, pdy = player.y - e.y;
  if (player.inv <= 0 && pdx*pdx + pdy*pdy < (radius + player.r) * (radius + player.r)) hurtPlayer(dmgP);
  e.dead = true; e.killed = true;
  enemies.splice(idx, 1); e.dead = false; enemyPool.push(e);
}
// 毒蘑菇：死亡原地留下毒坑
var MAX_POISON_PITS = 10;
function spawnPoisonPit(x, y) {
  if (poisonPits.length >= MAX_POISON_PITS) poisonPits.shift();
  poisonPits.push({ x:x, y:y, r:58, t:480, tick:10 + Math.floor(Math.random() * 20) });
  rings.push({ x:x, y:y, r:8, maxR:70, life:16, maxLife:16, color:'#9b5adf' });
  spawnParticles(x, y, '#9b5adf', 12, 1, 4);
  sfxFreeze();
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
  if (w.evoed) { if (w.id === 'hisou' || w.id === 'spark') return; if (!WPN[w.id].cont) tickEvoWeapon(w); return; } // 超进化：绯想剑/魔炮走 updateContinuous；持续型走 updateContinuous；其余走专属逻辑
  var cfg = WPN[w.id], lv = Math.max(0, Math.min(4, w.lv - 1));
  if (w.id === 'spark') return; // 魔炮由 updateContinuous 状态机处理（索敌→蓄力→发射）
  if (cfg.cont) return;
  w.t -= dt;
  if (w.t > 0) return;
  var fired = true;
  if (w.id === 'star') {
    var tgt = nearestEnemy(620);
    var ba = tgt ? Math.atan2(tgt.y - player.y, tgt.x - player.x) : Math.atan2(player.fy, player.fx);
    var n = cfg.n[lv] + typeCountBonus('bullet');
    var bspd = cfg.bspd[lv] * typeBulletSpeedMul();
    for (var i = 0; i < n; i++) {
      var a = ba + (i - (n-1)/2) * cfg.spread[lv];
      spawnBullet(player.x, player.y, Math.cos(a)*bspd, Math.sin(a)*bspd, cfg.dmg[lv]*wpnDmg(w), 6, 0, 140, 'star');
      bullets[bullets.length-1].homing = 0.06 * (1 + 0.10 * typeLv('bullet')); // 持续追踪
    }
    sfxShoot();
  } else if (w.id === 'frost') {
    var far = cfg.ar[lv] * typeRangeMul('aoe');
    rings.push({ x:player.x, y:player.y, r:20, maxR:far, life:18, maxLife:18, color:'#8fd8ff' });
    queryGrid(player.x, player.y, far + 50, function(e) {
      var dx = e.x - player.x, dy = e.y - player.y;
      if (dx*dx + dy*dy < (far + e.r) * (far + e.r)) {
        damageEnemy(e, cfg.dmg[lv]*wpnDmg(w), 'aoe');
        if (typeLv('aoe') >= 3 && !e.dead) damageEnemy(e, cfg.dmg[lv]*wpnDmg(w)*0.5, 'aoe'); // 术式扩张：追加一段
        if (!e.isBoss && !e.dead) {
          e.slowT = Math.max(e.slowT, 60); // 减速
          e.chill = (e.chill || 0) + 1;
          if (e.chill >= 3) { e.chill = 0; e.frozen = Math.max(e.frozen, Math.round(cfg.frz[lv] * (attrLv('ma') >= 2 ? 1.15 : 1) * (1 - freezeRes()) * (1 + traitFrostDur(w)))); bumpTrait('frost', 1); } // 叠满冻结（+霜核特性）
        }
      }
    });
    sfxFreeze();
  } else if (w.id === 'comet') {
    var cN = 1 + traitCometN(w); // 特性·陨铁：额外陨石
    var picks = nearestEnemies(cN, 760);
    if (!picks.length) fired = false;
    else {
      for (var ciC = 0; ciC < picks.length; ciC++) {
        var cc = picks[ciC];
        warnings.push({ comet:true, x:cc.x, y:cc.y, r:cfg.ar[lv]*typeRangeMul('aoe'), t:36 + ciC*12, dmg:cfg.dmg[lv]*wpnDmg(w) });
        addFaller('meteor', cc.x, cc.y, 36 + ciC*12);
      }
      sfxWarn();
    }
  } else if (w.id === 'needle') {
    // 破魔针：高穿透直线针雨
    var tgt3 = nearestEnemy(620);
    var na = tgt3 ? Math.atan2(tgt3.y-player.y, tgt3.x-player.x) : Math.atan2(player.fy, player.fx);
    var nn = cfg.n[lv] + typeCountBonus('bullet');
    var nspd = 10 * typeBulletSpeedMul();
    for (var ni = 0; ni < nn; ni++) {
      var a4 = na + (ni - (nn-1)/2) * 0.16;
      spawnBullet(player.x, player.y, Math.cos(a4)*nspd, Math.sin(a4)*nspd, (cfg.dmg[lv] + traitNeedleDmg(w))*wpnDmg(w), 4, cfg.pr[lv] + typePierceBonus('bullet'), 90, 'needle');
    }
    sfxShoot();
  } else if (w.id === 'hisou') {
    // 绯想剑：慢速高伤弧斩，强化后附带地震波
    var ht = nearestEnemy(210);
    if (ht) {
      var ha = Math.atan2(ht.y - player.y, ht.x - player.x);
      var hr = cfg.ar[lv] * typeRangeMul('melee');
      meleeSwing(ha, hr, cfg.dmg[lv]*wpnDmg(w), 1.2, '#ffe8b0', 'gold', { wid:'hisou' });
      if (lv >= 2) meleeQuakes(w, cfg.dmg[lv]*wpnDmg(w)); // Lv3+：敌人脚下随机地震
      sfxSpark();
    } else fired = false;
  } else if (w.id === 'roukan') {
    // 楼观&白楼：双剑快速交叉斩（±0.5 rad 各判一次，视觉为一道 X）
    var rt = nearestEnemy(160);
    if (rt) {
      var ra = Math.atan2(rt.y - player.y, rt.x - player.x);
      var rr = cfg.ar[lv] * typeRangeMul('melee');
      meleeSwing(ra, rr, cfg.dmg[lv]*wpnDmg(w)*0.7, 0.5, '#ffb2b2', 'silver', { wid:'roukan', spread:0.5 });
      sfxShoot();
    } else fired = false;
  } else if (w.id === 'gungnir') {
    // 冈格尼尔之枪：隐形圆切线激光（随机角度，不经过玩家）
    var th = Math.random() * Math.PI * 2;
    warnings.push({ gungnir: true, px: player.x, py: player.y, ang: th, R: 210, t: 38, dmg: cfg.dmg[lv]*wpnDmg(w) });
    sfxWarn();
  } else if (w.id === 'ofuda') {
    // 灵符：扇形御符 · 无穿透
    var ot = nearestEnemy(620);
    var oa3 = ot ? Math.atan2(ot.y - player.y, ot.x - player.x) : Math.atan2(player.fy, player.fx);
    var on = cfg.n[lv];
    for (var oi3 = 0; oi3 < on; oi3++) {
      var oa4 = oa3 + (oi3 - (on - 1) / 2) * 0.14;
      var ospd = cfg.bspd[lv] * typeBulletSpeedMul();
      spawnBullet(player.x, player.y, Math.cos(oa4) * ospd, Math.sin(oa4) * ospd, cfg.dmg[lv] * wpnDmg(w), 6, 0, 130, 'ofuda');
    }
    sfxShoot();
  } else if (w.id === 'fan') {
    // 天狗团扇：扇形斩 + 击退 · 伤害随移速
    var ft = nearestEnemy(230);
    if (ft) {
      var fa = Math.atan2(ft.y - player.y, ft.x - player.x);
      var fr2 = cfg.ar[lv] * typeRangeMul('melee');
      meleeSwing(fa, fr2, cfg.dmg[lv] * wpnDmg(w) * fanSpeedMul(), 0.9, '#bff0ff', 'teal', { wid:'fan' });
      sfxShoot();
    } else fired = false;
  } else if (w.id === 'knife') {
    // 银色飞刀：身侧展示 → 依次飞向最近敌（状态机自行管理冷却，跳过函数尾部赋值）
    if (!w.kf) {
      var ktInit = nearestEnemy(700);
      w.kf = { t: 60, left: cfg.n[lv], side: Math.random() < 0.5 ? -1 : 1, ang: ktInit ? Math.atan2(ktInit.y - player.y, ktInit.x - player.x) : Math.atan2(player.fy, player.fx) };
      w.t = 1;
      return;
    }
    if (w.kf.t > 0) { w.kf.t -= dt; w.t = 1; return; }
    var ktk = nearestEnemy(700);
    var kta = ktk ? Math.atan2(ktk.y - player.y, ktk.x - player.x) : Math.atan2(player.fy, player.fx);
    var kox = player.x + Math.cos(kta + Math.PI / 2) * 26 * w.kf.side;
    var koy = player.y + Math.sin(kta + Math.PI / 2) * 26 * w.kf.side;
    var kkx = ktk ? ktk.x : player.x + Math.cos(kta) * 140;
    var kky = ktk ? ktk.y : player.y + Math.sin(kta) * 140;
    var kka = Math.atan2(kky - koy, kkx - kox);
    spawnBullet(kox, koy, Math.cos(kka) * 9, Math.sin(kka) * 9, cfg.dmg[lv] * wpnDmg(w), 6, 0, 150, 'knife');
    w.kf.left--;
    if (w.kf.left <= 0) { w.kf = null; w.t = cfg.cd[lv] * wpnCd(w); } else w.t = 9;
    sfxShoot();
    return;
  } else if (w.id === 'nuke') {
    // 核反应堆：随机落点核爆（预警 1s → 核爆 + 污染区）
    var na2 = Math.random() * Math.PI * 2, nd2 = 120 + Math.random() * 280;
    warnings.push({ nuke:true, x:player.x + Math.cos(na2)*nd2, y:player.y + Math.sin(na2)*nd2, r:cfg.br[lv], t:60, dmg:cfg.dmg[lv]*wpnDmg(w), zd:cfg.zd[lv]*wpnDmg(w), zr:cfg.zr[lv], evo:false });
    sfxWarn();
  } else if (w.id === 'reaper') {
    // 死神镰刀：低攻速大弧斩 · 斩杀
    var rt3 = nearestEnemy(260);
    if (rt3) {
      var ra3 = Math.atan2(rt3.y - player.y, rt3.x - player.x);
      var rr3 = cfg.ar[lv] * typeRangeMul('melee');
      meleeSwing(ra3, rr3, cfg.dmg[lv] * wpnDmg(w) * (1 + (w.rb || 0)), 0.8, '#ff9aa8', 'scythe', { wid:'reaper', exec: reaperExecPct(w), gain: function() { if (w.evoed) w.rb = Math.min(0.5, (w.rb || 0) + 0.05); } });
      sfxSpark();
    } else fired = false;
  }
  w.t = fired ? cfg.cd[lv] * wpnCd(w) * (w.id === 'hisou' ? (1 - traitHisouRate(w)) : 1) : 30;
}
// 无限射程激光判定：点到射线垂直距离（maxDist 默认 2000，等效全屏）
function beamHits(ox, oy, ang, halfW, maxDist, dmg) {
  var dx = Math.cos(ang), dy = Math.sin(ang);
  var L = maxDist || 2000;
  var hits = 0;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var rx = e.x - ox, ry = e.y - oy;
    var along = rx * dx + ry * dy;
    if (along < -e.r || along > L + e.r) continue;
    var perp = Math.abs(rx * dy - ry * dx);
    if (perp < halfW + e.r) {
      damageEnemy(e, dmg, 'beam');
      hits++;
      if (!e.dead) e.mark = 240; // 魔炮标记：死亡多掉 P 点
    }
  }
  return hits;
}
// ═══════════ 近身 / 切线激光 工具函数 ═══════════
// 扇形弧斩：以玩家为中心，朝 ang 方向 120° 内造成伤害并击退
// opts.spread：双刃交叉（±spread 各判一次伤害，视觉画成 X）；opts.wid：同武器印记互斥
function meleeSwing(ang, range, dmg, knock, color, tint, opts) {
  opts = opts || {};
  var wid = opts.wid || null;
  if (wid) {
    for (var sx2 = slashes.length - 1; sx2 >= 0; sx2--) if (slashes[sx2].wid === wid) slashes.splice(sx2, 1);
  }
  slashes.push({ x:player.x, y:player.y, ang:ang, range:range, life:12, maxLife:12, color:color || '#ffe8b0', tint:tint || null, wid:wid, spread:opts.spread || 0 });
  dbgSlashCount++;
  var hits = 0;
  var offsets = opts.spread ? [-opts.spread, opts.spread] : [0];
  for (var oi = 0; oi < offsets.length; oi++) {
    var oa = ang + offsets[oi];
    queryGrid(player.x, player.y, range + 50, function(e) {
      if (e.dead) return;
      var dx = e.x - player.x, dy = e.y - player.y;
      var d2 = dx*dx + dy*dy;
      if (d2 > (range + e.r) * (range + e.r)) return;
      var ea = Math.atan2(dy, dx);
      var diff = Math.abs(((ea - oa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > Math.PI / 3) return; // 120° 扇形
      damageEnemy(e, e.isBoss ? dmg * meleeBossMul() : dmg, 'contact');
      if (opts.exec && !e.dead && !e.isBoss) { // 死神镰刀：斩杀低血敌（精英阈值减半）
        var thr2 = opts.exec * (e.elite ? 0.5 : 1);
        if (e.hp > 0 && e.hp / e.maxHp < thr2) {
          addLabel(e.x, e.y - 26, '斩杀！', '#ff5555');
          killEnemy(e);
          if (opts.gain) opts.gain();
        }
      }
      hits++;
      if (knock && !e.isBoss && !e.dead) { var d3 = Math.sqrt(d2) || 1; e.x += dx / d3 * knock * 12; e.y += dy / d3 * knock * 12; }
    });
  }
  if (hits > 0) { // 命中火花与刃风
    var hx = player.x + Math.cos(ang) * range * 0.7, hy = player.y + Math.sin(ang) * range * 0.7;
    spawnParticles(hx, hy, '#fff2c0', 5, 1, 3);
    spawnParticles(hx, hy, color || '#ffe8b0', 3, 1, 4);
    if (wid === 'hisou') bumpTrait('hisou', 1); // 特性·剑势
  }
  // 削弹：斩击扇形内清除可削弹幕（非 Boss 弹，无上限）
  var cutN = 0;
  for (var cbi = ebullets.length - 1; cbi >= 0; cbi--) {
    var cb = ebullets[cbi];
    if (!cb.cuttable) continue;
    var cdx = cb.x - player.x, cdy = cb.y - player.y;
    var cd2 = cdx*cdx + cdy*cdy;
    if (cd2 > (range + cb.r + 6) * (range + cb.r + 6)) continue;
    var ca = Math.atan2(cdy, cdx), inArc = false;
    for (var coi = 0; coi < offsets.length && !inArc; coi++) {
      var coa = ang + offsets[coi];
      var cdiff = Math.abs(((ca - coa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (cdiff <= Math.PI / 3 + 0.10) inArc = true;
    }
    if (!inArc) continue;
    spawnParticles(cb.x, cb.y, cb.color || '#ffd970', 3, 1, 3);
    ebullets.splice(cbi, 1); ebulletPool.push(cb);
    cutN++;
  }
  if (cutN > 0) sfxCut();
}
// 敌人脚下随机地震：每次挥剑在附近随机敌人脚下炸开小范围裂纹（2 处 / Lv5 起 3 处）
function meleeQuakes(w, slashDmg) {
  var cands = [];
  for (var qi = 0; qi < enemies.length; qi++) {
    var qe = enemies[qi];
    if (qe.dead || qe.killed) continue;
    var qdx = qe.x - player.x, qdy = qe.y - player.y;
    if (qdx*qdx + qdy*qdy > 320*320) continue;
    cands.push(qe);
  }
  if (!cands.length) return;
  var nQ = (w.lv >= 5 ? 3 : 2);
  for (var qi2 = 0; qi2 < nQ && cands.length; qi2++) {
    var pick = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
    var qx = pick.x, qy = pick.y, qR = 85;
    rings.push({ x:qx, y:qy, r:12, maxR:qR, life:16, maxLife:16, color:'#d8b060', crack:true, seed:Math.random()*6 });
    spawnParticles(qx, qy, '#d8c090', 10, 1, 4);
    spawnParticles(qx, qy, '#8a7a5a', 6, 1, 3);
    queryGrid(qx, qy, qR + 50, function(e) {
      var dx = e.x - qx, dy = e.y - qy;
      if (dx*dx + dy*dy < (qR + e.r) * (qR + e.r)) damageEnemy(e, slashDmg * 0.45, 'aoe');
    });
    shakeT = Math.max(shakeT, 4);
    sfxQuake();
  }
}
// 要石天降：范围高伤 + 眩晕（Boss 免疫，精英减半）
function dropKeystone(x, y, r, dmg) {
  rings.push({ x:x, y:y, r:10, maxR:r, life:16, maxLife:16, color:'#d8c090' });
  rings.push({ x:x, y:y, r:20, maxR:r * 1.15, life:20, maxLife:20, color:'#c0a878', crack:true, seed:Math.random()*6 });
  spawnParticles(x, y, '#d8c090', 26, 2, 6);
  spawnParticles(x, y, '#f0e0b0', 14, 1, 4);
  spawnParticles(x, y, '#8a7a5a', 12, 2, 4);
  shakeT = Math.max(shakeT, 10);
  sfxBoom();
  queryGrid(x, y, r + 60, function(e) {
    var dx = e.x - x, dy = e.y - y;
    if (dx*dx + dy*dy < (r + e.r) * (r + e.r)) {
      damageEnemy(e, dmg, 'aoe');
      if (!e.isBoss && !e.dead) e.stun = Math.max(e.stun || 0, e.elite ? 30 : 60);
    }
  });
}
// 切线激光：以 (px,py) 为圆心 R 半径的圆上取切线，贯穿全屏
function fireGungnir(px, py, ang, R, dmg, scale) {
  var sc = scale || 1;
  var tx = px + Math.cos(ang) * R, ty = py + Math.sin(ang) * R;
  var dx = -Math.sin(ang), dy = Math.cos(ang);
  var L = 1400;
  var hits = 0;
  beams.push({ line: true, x1: tx - dx * L, y1: ty - dy * L, x2: tx + dx * L, y2: ty + dy * L, life: 14, maxLife: 14, w: 20 * sc, color: '#ff6b8a' });
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var rx = e.x - tx, ry = e.y - ty;
    var along = rx * dx + ry * dy;
    if (along < -L || along > L) continue;
    var perp = Math.abs(rx * dy - ry * dx);
    if (perp < 16 * sc + e.r) { damageEnemy(e, dmg, 'beam'); hits++; }
  }
  shakeT = Math.max(shakeT, 6);
  sfxSpark();
  return hits;
}
// 最近 k 个敌人（供召唤物多目标锁定）
function nearestEnemies(k, maxR) {
  var arr = [];
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var dx = e.x - player.x, dy = e.y - player.y, d2 = dx*dx + dy*dy;
    if (d2 > maxR * maxR) continue;
    arr.push({ e: e, d: d2 });
  }
  arr.sort(function(a, b) { return a.d - b.d; });
  var out = [];
  for (var j = 0; j < arr.length && j < k; j++) out.push(arr[j].e);
  return out;
}
// ═══════════ 超进化武器行为（Lv5+搭档被动 Lv5 觉醒后替换原逻辑）═══════════
function tickEvoWeapon(w) {
  w.t -= dt;
  if (w.t > 0) return; // 冷却闸门（修复原版超进化每帧连发）
  var base = WPN[w.id];
  if (w.id === 'star') { // → 天星乱舞：六向流星
    for (var i = 0; i < 6; i++) {
      var a = w.ang + (i / 6) * Math.PI * 2;
      spawnBullet(player.x, player.y, Math.cos(a)*6.5, Math.sin(a)*6.5, 45*wpnDmg(w), 10, 3, 170, 'star');
      bullets[bullets.length-1].homing = 0.05; // 超进化保留追踪
    }
    w.ang += 0.23;
    sfxShoot();
  } else if (w.id === 'frost') { // → Perfect Freeze：周期性全场冻结 · 伤害降低
    for (var fi2 = 0; fi2 < enemies.length; fi2++) {
      var fe2 = enemies[fi2];
      if (!fe2.dead && !fe2.isBoss) fe2.frozen = Math.max(fe2.frozen, Math.round(90 * (1 - freezeRes())));
    }
    rings.push({ x:player.x, y:player.y, r:20, maxR:900, life:26, maxLife:26, color:'#8fd8ff' });
    queryGrid(player.x, player.y, 900, function(e) { damageEnemy(e, 18*wpnDmg(w), 'aoe'); });
    sfxFreeze();
  } else if (w.id === 'comet') { // → 彗星带：三连锁彗星雨
    var fired3 = 0;
    for (var ci2 = 0; ci2 < 3; ci2++) {
      var c3 = ci2 === 0 ? densestEnemy() : nearestEnemy(700);
      if (c3) {
        var wx3 = c3.x + (Math.random()-0.5)*120, wy3 = c3.y + (Math.random()-0.5)*120;
        warnings.push({ comet:true, x:wx3, y:wy3, r:130*typeRangeMul('aoe'), t:30 + ci2*14, dmg:150*wpnDmg(w) });
        addFaller('meteor', wx3, wy3, 30 + ci2*14);
        fired3++;
      }
    }
    if (!fired3) return (w.t = 30);
    sfxWarn();
  } else if (w.id === 'needle') { // → 万针阵：全向穿透针雨
    for (var ni2 = 0; ni2 < 12; ni2++) {
      var a6 = (ni2 / 12) * Math.PI * 2 + w.ang;
      spawnBullet(player.x, player.y, Math.cos(a6)*9, Math.sin(a6)*9, (34 + traitNeedleDmg(w))*wpnDmg(w), 4, 6, 120, 'needle');
    }
    w.ang += 0.13;
    sfxShoot();
  } else if (w.id === 'gungnir') { // → 不夜城：双切线激光 · 频次拉高
    for (var gi = 0; gi < 2; gi++) {
      var th2 = Math.random() * Math.PI * 2;
      warnings.push({ gungnir: true, px: player.x, py: player.y, ang: th2, R: 200, t: 30, dmg: 120*wpnDmg(w) });
    }
    sfxWarn();
  } else if (w.id === 'roukan') { // → 二百由旬之一闪：闪现连锁斩（状态机在 updateContinuous）
    if (!w.dash) { w.dash = { hits: 0, t: 12, target: null, targets: 0, mode: 'idle', tx: 0, ty: 0, ang: 0, dashCount: 0 }; w.t = 99999; }
    return;
  } else if (w.id === 'ofuda') { // → 霊符『夢想封印』：周期释放移动光团
    var ot2 = nearestEnemy(900);
    var oaF = ot2 ? Math.atan2(ot2.y - player.y, ot2.x - player.x) : Math.atan2(player.fy, player.fx);
    orbs.push({ x: player.x, y: player.y, vx: Math.cos(oaF) * 5.5, vy: Math.sin(oaF) * 5.5, r: 64, life: 160, tick: 0, dmg: WPN.ofuda.dmg[4] * wpnDmg(w) * 1.2 });
    sfxSpark();
  } else if (w.id === 'fan') { // → 大天狗突进：周期冲刺（无敌 + 路径击退）
    var ft2 = nearestEnemy(700);
    var faF = ft2 ? Math.atan2(ft2.y - player.y, ft2.x - player.x) : Math.atan2(player.fy, player.fx);
    w.fanDash = { t: 36, ang: faF, hit: {} };
    sfxDash();
  } else if (w.id === 'knife') { // → 银刃八重：环敌生成 → 同时朝内穿刺
    var ke3 = nearestEnemy(900);
    if (ke3) {
      for (var ki2 = 0; ki2 < 8; ki2++) {
        var kAn2 = (ki2 / 8) * Math.PI * 2;
        knifeOrbs.push({
          uid: ke3.uid, tx: ke3.x, ty: ke3.y, ang: kAn2,
          phase: 'ready', t: 18, tick: 0, hit: {},
          x: ke3.x + Math.cos(kAn2) * 110, y: ke3.y + Math.sin(kAn2) * 110,
          vx: 0, vy: 0,
          dmg: WPN.knife.dmg[4] * 0.33 * wpnDmg(w)
        });
      }
      sfxDash();
    }
  } else if (w.id === 'nuke') { // → 地獄の人工太陽：核爆熔化小怪
    var na3 = Math.random() * Math.PI * 2, nd3 = 120 + Math.random() * 280;
    warnings.push({ nuke:true, x:player.x + Math.cos(na3)*nd3, y:player.y + Math.sin(na3)*nd3, r:WPN.nuke.br[4], t:60, dmg:WPN.nuke.dmg[4]*wpnDmg(w), zd:WPN.nuke.zd[4]*wpnDmg(w), zr:WPN.nuke.zr[4], evo:true });
    sfxWarn();
  } else if (w.id === 'reaper') { // → 死者選別の鎌：阈值提升 + 斩杀增伤
    var rt4 = nearestEnemy(280);
    if (rt4) {
      var ra4 = Math.atan2(rt4.y - player.y, rt4.x - player.x);
      var rr4 = WPN.reaper.ar[4] * typeRangeMul('melee');
      meleeSwing(ra4, rr4, WPN.reaper.dmg[4] * wpnDmg(w) * (1 + (w.rb || 0)), 0.8, '#ff9aa8', 'scythe', { wid:'reaper', exec: 0.40, gain: function() { w.rb = Math.min(0.5, (w.rb || 0) + 0.05); } });
      sfxSpark();
    } else return (w.t = 30);
  }
  // 各超进化独立冷却（不再受等级数组约束）
  var evoCd = { star:100, frost:420, comet:200, needle:110, gungnir:130, ofuda:270, fan:360, knife:200, nuke:420, reaper:150 };
  w.t = (evoCd[w.id] || 100) * wpnCd(w);
}
function updateContinuous(w) {
  var cfg = WPN[w.id], lv = Math.max(0, Math.min(4, w.lv - 1));
  if (w.id === 'orbit') {
    // 银河星环（超进化）：八星大环 + 命中减速
    var n, or, rot, odmg, orbR;
    if (w.evoed) { n = 8; or = 112; rot = 0.07; odmg = 34 * wpnDmg(w); orbR = 18; }
    else { n = cfg.n[lv]; or = cfg.or[lv]; rot = cfg.rot[lv]; odmg = cfg.dmg[lv] * wpnDmg(w); orbR = 14; }
    or = or * typeRangeMul('field') + traitOrbitR(w); // 特性·引力
    w.ang += rot * dt;
    for (var i = 0; i < n; i++) {
      var a = w.ang + (i / n) * Math.PI * 2;
      var ox = player.x + Math.cos(a) * or, oy = player.y + Math.sin(a) * or;
      queryGrid(ox, oy, orbR + 50, function(e) {
        var ddx = e.x - ox, ddy = e.y - oy;
        if (ddx*ddx + ddy*ddy < (orbR + e.r) * (orbR + e.r) && frameCount - e.orbHitT > 18) {
          e.orbHitT = frameCount;
          damageEnemy(e, odmg, 'contact');
          if (w.evoed && !e.isBoss) e.slowT = Math.max(e.slowT, 50);
        }
      });
    }
  } else if (w.id === 'shanghai') {
    // 上海&蓬莱：人偶环绕 + 追踪弹；超进化 → 单个大体型蓬莱人偶 + 双追踪激光
    var wantN = w.evoed ? 1 : (cfg.doll[lv] + typeCountBonus('summon'));
    while (dolls.length < wantN) dolls.push({ ang: Math.random() * 6.28, t: 20, x: player.x, y: player.y, lock: null });
    while (dolls.length > wantN) dolls.pop();
    w.ang += 0.02 * dt;
    for (var dI = 0; dI < dolls.length; dI++) {
      var dl = dolls[dI];
      dl.ang = w.ang + (dI / dolls.length) * Math.PI * 2;
      var orR = w.evoed ? 80 : 92;
      dl.x = player.x + Math.cos(dl.ang) * orR;
      dl.y = player.y + Math.sin(dl.ang) * orR;
      if (w.evoed) {
        if (!dl.lock) dl.lock = { t: 0, list: [] };
        dl.lock.t -= dt;
        if (dl.lock.t <= 0) { dl.lock.t = 12; dl.lock.list = nearestEnemies(2, 620).map(function(en) { return { e: en, uid: en.uid }; }); }
        for (var lk = 0; lk < dl.lock.list.length; lk++) {
          var lpair = dl.lock.list[lk];
          var lt = lpair.e;
          if (!lt || lt.dead || lt.killed || lt.uid !== lpair.uid || enemies.indexOf(lt) < 0) continue;
          beams.push({ line: true, x1: dl.x, y1: dl.y, x2: lt.x, y2: lt.y, life: 2, maxLife: 2, w: 9, color: '#ffb2df' });
          if (frameCount - (lt.dollLaserT || 0) > 10) { lt.dollLaserT = frameCount; damageEnemy(lt, 20 * wpnDmg(w), 'beam'); }
        }
      } else {
        dl.t -= dt;
        if (dl.t <= 0) {
          var dne = nearestEnemy(560);
          if (dne) {
            dl.t = cfg.rate[lv] / (typeRateMul('summon') * (1 + traitDollRate(w))); // 特性·人偶工房
            var dba = Math.atan2(dne.y - dl.y, dne.x - dl.x);
            spawnBullet(dl.x, dl.y, Math.cos(dba)*4.2, Math.sin(dba)*4.2, cfg.dmg[lv]*wpnDmg(w), 6, 0, 150, 'doll');
            bullets[bullets.length-1].homing = 0.075;
            sfxShoot();
          } else dl.t = 20;
        }
      }
    }
  } else if (w.id === 'netherworld') {
    // 红色冥界：周期性展开领域，持续伤害 + 吸血；超进化扩大并减速（显式数值，避免 lv 越界）
    if (!w.nf) w.nf = { next: 60, on: 0 };
    if (w.nf.on > 0) {
      w.nf.on -= dt;
      if (nether) { nether.x = player.x; nether.y = player.y; nether.born += dt; }
      if (w.nf.on <= 0) nether = null;
    } else {
      w.nf.next -= dt;
      if (w.nf.next <= 0) {
        var nEvo = !!w.evoed;
        w.nf.next = nEvo ? 480 : cfg.cyc[lv];
        w.nf.on = (nEvo ? 330 : cfg.dur[lv]) * (typeLv('field') >= 3 ? 1.3 : 1); // 领域掌握 Lv3：持续 +30%
        var nR2 = (nEvo ? 300 : cfg.ar[lv]) * typeRangeMul('field') + traitNetherR(w); // 特性·深渊
        var nD2 = (nEvo ? 26 : cfg.dmg[lv]) * wpnDmg(w);
        nether = { x: player.x, y: player.y, r: nR2, dmg: nD2, slow: nEvo, tick: 0, born: 0 };
        rings.push({ x: player.x, y: player.y, r: 10, maxR: nR2, life: 18, maxLife: 18, color: '#c02040' });
        sfxBoom();
      }
    }
  } else if (w.id === 'chen') {
    // 八云橙：辅助召唤物（套盾 + 增益轮换；超进化双增益同开）
    var cEvo = !!w.evoed;
    if (w.chT === undefined) w.chT = 120;
    w.chT -= dt;
    if (w.chT <= 0) {
      w.chT = cEvo ? 480 : cfg.cyc[lv];
      player.shield = Math.min(player.shieldMax, player.shield + (cEvo ? 25 : cfg.shd[lv]));
      if (cEvo) { player.buffDmgT = 180; player.buffDmg = 0.25; player.buffMoveT = 180; player.buffMove = 0.15; }
      else {
        w.chFlip = !w.chFlip;
        if (w.chFlip) { player.buffDmgT = 180; player.buffDmg = 0.15; }
        else { player.buffMoveT = 180; player.buffMove = 0.10; }
      }
      rings.push({ x:player.x, y:player.y, r:10, maxR:95, life:14, maxLife:14, color:'#ffd970' });
      spawnParticles(player.x, player.y, '#ffd970', 10, 1, 3);
      sfxCard();
    }
  } else if (w.id === 'soulfly') {
    // 白魂蝶：周期召唤（超进化·八分咲：一次八只）
    if (w.sfT === undefined) w.sfT = 120;
    w.sfT -= dt;
    if (w.sfT <= 0) {
      w.sfT = w.evoed ? 360 : 240;
      var sfN = w.evoed ? 8 : 1;
      for (var sfi = 0; sfi < sfN; sfi++) {
        var sfa = (sfi / sfN) * Math.PI * 2;
        pets.push({
          x: player.x + Math.cos(sfa) * 30, y: player.y + Math.sin(sfa) * 30,
          vx: Math.cos(sfa) * 2, vy: Math.sin(sfa) * 2,
          t: 180, r: 70, dmg: (w.evoed ? cfg.dmg[lv] * 0.35 : cfg.dmg[lv]) * wpnDmg(w)
        });
      }
      sfxWarn();
    }
  } else if (w.id === 'fan') {
    // 大天狗突进：冲刺状态（无敌 + 路径击退）
    if (w.fanDash) {
      var FD2 = w.fanDash;
      FD2.t -= dt;
      player.inv = Math.max(player.inv, 6);
      player.x += Math.cos(FD2.ang) * 9 * dt;
      player.y += Math.sin(FD2.ang) * 9 * dt;
      queryGrid(player.x, player.y, 100, function(e) {
        if (FD2.hit[e.uid]) return;
        var fdx2 = e.x - player.x, fdy2 = e.y - player.y;
        if (fdx2*fdx2 + fdy2*fdy2 < (90 + e.r) * (90 + e.r)) {
          FD2.hit[e.uid] = 1;
          damageEnemy(e, 60 * wpnDmg(w) * fanSpeedMul(), 'contact');
          if (!e.isBoss && !e.dead) { var fd3 = Math.sqrt(fdx2*fdx2 + fdy2*fdy2) || 1; e.x += fdx2 / fd3 * 16; e.y += fdy2 / fd3 * 16; }
        }
      });
      if (frameCount % 3 === 0) spawnParticles(player.x, player.y, '#bff0ff', 2, 1, 3);
      if (FD2.t <= 0) w.fanDash = null;
    }
  } else if (w.id === 'yoshika') {
    // 宫古芳香：僵尸召唤 · 撕挠最近敌（超进化：体型变大 + 周期冲撞击退）
    var yEvo = !!w.evoed;
    if (!w.yo) w.yo = { x: player.x, y: player.y, t: 0, chT: 240 };
    var YO = w.yo;
    var yne = nearestEnemy(260);
    var ytx = yne ? yne.x : player.x - 40, yty = yne ? yne.y : player.y;
    var ydx = ytx - YO.x, ydy = yty - YO.y, yd = Math.sqrt(ydx*ydx + ydy*ydy) || 1;
    if (yd > (yne ? yne.r + 24 : 8)) { var ymv = yEvo ? 4.6 : 3.6; YO.x += ydx / yd * ymv * dt; YO.y += ydy / yd * ymv * dt; }
    YO.t -= dt;
    if (yne && yd < yne.r + 42 && YO.t <= 0) {
      YO.t = cfg.rate[lv];
      damageEnemy(yne, cfg.dmg[lv] * wpnDmg(w), 'contact');
      spawnParticles(yne.x, yne.y, '#c9a0ff', 6, 1, 3);
      sfxCut();
    }
    if (yEvo) {
      YO.chT -= dt;
      if (YO.chT <= 0) {
        YO.chT = 300;
        var yc2 = nearestEnemy(430);
        if (yc2) {
          var yca2 = Math.atan2(yc2.y - YO.y, yc2.x - YO.x);
          YO.x = yc2.x - Math.cos(yca2) * 50; YO.y = yc2.y - Math.sin(yca2) * 50;
          damageEnemy(yc2, cfg.dmg[lv] * 2 * wpnDmg(w), 'contact');
          if (!yc2.isBoss && !yc2.dead) { yc2.x += Math.cos(yca2) * 26; yc2.y += Math.sin(yca2) * 26; }
          spawnParticles(YO.x, YO.y, '#c9a0ff', 14, 1, 4);
          sfxDash();
        }
      }
    }
  } else if (w.id === 'spark') {
    // 魔炮：索敌 → 蓄力 → 定向脉冲（基础）/ 6 秒持续扫射（超进化）
    var SP = w.sp;
    if (!SP) { SP = w.sp = { phase:'idle', t:0, ang:0, target:null, tuid:0, tick:0, beam:null }; }
    var isEvoS = !!w.evoed;
    var halfW = ((isEvoS ? cfg.bw[4] * 1.5 : cfg.bw[lv]) * typeBeamSizeMul()) / 2;
    var spDmg = (isEvoS ? 16 : cfg.dmg[lv]) * wpnDmg(w);
    if (SP.phase === 'idle') {
      w.t -= dt;
      if (w.t <= 0) {
        var stg = nearestEnemy(620);
        if (!stg) w.t = 30;
        else {
          SP.phase = 'charge';
          SP.t = isEvoS ? 48 : (cfg.charge || 36);
          SP.ang = Math.atan2(stg.y - player.y, stg.x - player.x);
          SP.target = stg; SP.tuid = stg.uid;
          sfxWarn();
        }
      }
    } else if (SP.phase === 'charge') {
      SP.t -= dt;
      // 蓄力期间瞄准缓慢跟随目标
      var tAliveS = SP.target && !SP.target.dead && !SP.target.killed && SP.tuid === SP.target.uid && enemies.indexOf(SP.target) >= 0;
      if (tAliveS) {
        var daS = Math.atan2(SP.target.y - player.y, SP.target.x - player.x);
        var dS = daS - SP.ang;
        while (dS > Math.PI) dS -= Math.PI * 2;
        while (dS < -Math.PI) dS += Math.PI * 2;
        SP.ang += Math.max(-0.04, Math.min(0.04, dS)) * dt;
      }
      if (frameCount % 3 === 0 && particles.length < 380) { // 汇聚粒子
        var caC = Math.random() * Math.PI * 2, crC = 110 + Math.random() * 120;
        particles.push({ x:player.x + Math.cos(caC) * crC, y:player.y + Math.sin(caC) * crC, vx:-Math.cos(caC) * 3.2, vy:-Math.sin(caC) * 3.2, life:22, maxLife:22, color:'#ffe8b0', r:2 });
      }
      if (SP.t <= 0) { // 发射
        var fAng = SP.ang;
        SP.phase = 'beam';
        if (isEvoS) {
          SP.t = 360;
          SP.tick = 0;
          var vbm = { sparkBeam: true, x:player.x, y:player.y, ang:fAng, w:halfW * 2, life:360, maxLife:360, tx:player.x, ty:player.y };
          beams.push(vbm); SP.beam = vbm;
          beamHits(player.x, player.y, fAng, halfW, 2000, 22 * wpnDmg(w));
        } else {
          SP.t = 16;
          beams.push({ sparkPulse: true, x:player.x, y:player.y, ang:fAng, w:halfW * 2, life:16, maxLife:16 });
          var hnS = beamHits(player.x, player.y, fAng, halfW, 2000, spDmg);
          if (hnS >= 3) bumpTrait('spark', 1); // 特性·过载
        }
        shakeT = Math.max(shakeT, 8);
        deathFlash = Math.max(deathFlash, 4);
        sfxSpark();
      }
    } else if (SP.phase === 'beam') {
      SP.t -= dt;
      if (isEvoS && SP.beam) {
        // 目标追踪：死亡后缓慢扫向下一名；无目标自动扫场
        var aliveS = SP.target && !SP.target.dead && !SP.target.killed && SP.tuid === SP.target.uid && enemies.indexOf(SP.target) >= 0;
        if (!aliveS) {
          var ntS = nearestEnemy(2000);
          if (ntS) { SP.target = ntS; SP.tuid = ntS.uid; }
          else SP.target = null;
        }
        var desiredS = SP.target ? Math.atan2(SP.target.y - player.y, SP.target.x - player.x) : SP.ang + 0.01;
        var dS2 = desiredS - SP.ang;
        while (dS2 > Math.PI) dS2 -= Math.PI * 2;
        while (dS2 < -Math.PI) dS2 += Math.PI * 2;
        var turnS = SP.target ? 0.015 : 0.010; // 缓慢扫射 / 自动扫场
        SP.ang += Math.max(-turnS, Math.min(turnS, dS2)) * dt;
        SP.beam.x = player.x; SP.beam.y = player.y; SP.beam.ang = SP.ang; SP.beam.w = halfW * 2;
        if (SP.target) { SP.beam.tx = SP.target.x; SP.beam.ty = SP.target.y; }
        SP.tick -= dt;
        if (SP.tick <= 0) { SP.tick = 12; beamHits(player.x, player.y, SP.ang, halfW, 2000, spDmg); }
        if (frameCount % 2 === 0 && particles.length < 380) { // 光束流动粒子
          var pdS = 60 + Math.random() * 700;
          particles.push({ x:player.x + Math.cos(SP.ang) * pdS, y:player.y + Math.sin(SP.ang) * pdS, vx:Math.cos(SP.ang) * 4 + (Math.random()-0.5), vy:Math.sin(SP.ang) * 4 + (Math.random()-0.5), life:14, maxLife:14, color:'#bfe8ff', r:2 });
        }
      }
      if (SP.t <= 0) {
        SP.phase = 'idle';
        SP.target = null; SP.beam = null;
        w.t = (isEvoS ? 240 : cfg.cd[lv]) * traitSparkCd(w); // 特性·过载：冷却递减
      }
    }
  } else if (w.id === 'hisou' && w.evoed) {
    // 地符「要石天坠」：弧斩（含脚下地震）+ 独立计时落要石
    if (w.kt === undefined) w.kt = 240;
    w.t -= dt;
    if (w.t <= 0) {
      var htE = nearestEnemy(210);
      if (htE) {
        var haE = Math.atan2(htE.y - player.y, htE.x - player.x);
        var hrE = cfg.ar[4] * typeRangeMul('melee');
        meleeSwing(haE, hrE, cfg.dmg[4] * wpnDmg(w), 1.2, '#ffe8b0', 'gold', { wid:'hisou' });
        meleeQuakes(w, cfg.dmg[4] * wpnDmg(w)); // 随机敌人脚下地震
        sfxSpark();
        w.t = 40 * wpnCd(w) * (1 - traitHisouRate(w)); // 特性·剑势：攻速加成
      } else w.t = 30;
    }
    w.kt -= dt;
    if (w.kt <= 0) {
      var kdE = densestEnemy() || nearestEnemy(700);
      if (kdE) {
        warnings.push({ keystone: true, x: kdE.x, y: kdE.y, r: 130 * typeRangeMul('melee'), t: 50, dmg: 150 * wpnDmg(w) });
        addFaller('keystone', kdE.x, kdE.y, 50);
        sfxWarn();
        w.kt = 300 * Math.max(0.6, wpnCd(w));
      } else w.kt = 60;
    }
  } else if (w.id === 'roukan' && w.evoed && w.dash) {
    // 二百由旬之一闪：冲刺斩（非瞬移）· 同一目标最多 3 刀（+连击特性）· 换目标冲刺最多 10 次
    var D = w.dash;
    if (D.mode === 'dash') {
      // 冲刺阶段：34px/帧 冲向落点，无敌 + 紫影
      var rdx = D.tx - player.x, rdy = D.ty - player.y;
      var rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      player.inv = Math.max(player.inv, 8);
      player.roukanDash = true;
      var step = 34 * dt;
      if (rd <= step) {
        player.x = D.tx; player.y = D.ty;
        meleeSwing(D.ang, 130 * typeRangeMul('melee'), 90 * wpnDmg(w), 0.8, '#d8b4ff', 'violet', { wid:'roukan' });
        spawnParticles(player.x, player.y, '#b89fff', 8, 1, 3);
        sfxShoot();
        player.roukanDash = false;
        D.mode = 'idle'; D.t = 12;
      } else {
        player.x += rdx / rd * step; player.y += rdy / rd * step;
        if (frameCount % 2 === 0) spawnParticles(player.x, player.y, '#b89fff', 2, 1, 3);
      }
    } else {
      D.t -= dt;
      if (D.t <= 0) {
        var dtgt = null, isSwitch = false;
        var tAlive = D.target && !D.target.dead && !D.target.killed && D.tuid === D.target.uid && enemies.indexOf(D.target) >= 0;
        if (tAlive) {
          if (D.hits < 3 + traitRoukanChain(w)) dtgt = D.target; // 同一目标继续补刀（不计冲刺次数）
        } else if ((D.dashCount || 0) < 10) { // 换目标（达 10 次上限则不再换）
          dtgt = nearestEnemy(1500);
          D.hits = 0;
          isSwitch = true;
        }
        if (dtgt) {
          var da4 = Math.atan2(dtgt.y - player.y, dtgt.x - player.x);
          D.tx = dtgt.x - Math.cos(da4) * 46;
          D.ty = dtgt.y - Math.sin(da4) * 46;
          D.ang = da4;
          D.mode = 'dash';
          player.inv = Math.max(player.inv, 20);
          if (isSwitch) {
            D.dashCount = (D.dashCount || 0) + 1;
            D.target = dtgt; D.tuid = dtgt.uid; D.hits = 1;
            D.targets = (D.targets || 0) + 1; w.chainTotal = (w.chainTotal || 0) + 1;
            bumpTrait('roukan', 1); // 特性·连击
          } else D.hits++;
        } else if (w.dash) { // 三刀未死 / 冲刺次数达上限 / 无目标 → 结束连锁
          w.lastChain = D.targets || 0; w.dash = null; w.t = 420 * wpnCd(w);
          player.roukanDash = false;
        }
      }
    }
  } else if (w.id === 'yinyang') {
    // 封魔玉（超进化）：巨型追踪封魔玉
    var want = (w.evoed ? 4 : cfg.n[lv]) + typeCountBonus('summon');
    var ballR = w.evoed ? 22 : 14;
    var ydmg = (w.evoed ? 42 : cfg.dmg[lv]) * wpnDmg(w);
    var yspd = (w.evoed ? 4.6 : cfg.spd[lv]) * (w.evoed ? 1 : (1 + traitYinyangSpd(w))); // 特性·弹力：玉速
    while (yyBalls.length < want) yyBalls.push({ x:player.x + (Math.random()-0.5)*200, y:player.y + (Math.random()-0.5)*200, vx:(Math.random()<0.5?-1:1)*yspd, vy:(Math.random()<0.5?-1:1)*yspd, r:ballR });
    while (yyBalls.length > want) yyBalls.pop();
    for (var b = 0; b < yyBalls.length; b++) {
      var ball = yyBalls[b];
      ball.r = ballR;
      if (!w.evoed) { var spB = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) || 1; ball.vx = ball.vx / spB * yspd; ball.vy = ball.vy / spB * yspd; }
      if (w.evoed) {
        // 巨玉追踪：每帧小幅转向最近敌人
        var ne2 = nearestEnemy(560);
        if (ne2) {
          var des = Math.atan2(ne2.y - ball.y, ne2.x - ball.x);
          var cur = Math.atan2(ball.vy, ball.vx);
          var diff = des - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          var turn = Math.max(-0.05, Math.min(0.05, diff)) * dt;
          var sp4 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) || yspd;
          ball.vx = Math.cos(cur + turn) * sp4; ball.vy = Math.sin(cur + turn) * sp4;
        }
      }
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      var relX = ball.x - player.x, relY = ball.y - player.y;
      if (Math.abs(relX) > 340) { ball.vx = -ball.vx; ball.x = player.x + (relX > 0 ? 340 : -340); }
      if (Math.abs(relY) > 260) { ball.vy = -ball.vy; ball.y = player.y + (relY > 0 ? 260 : -260); }
      queryGrid(ball.x, ball.y, ball.r + 50, function(e) {
        var ddx = e.x - ball.x, ddy = e.y - ball.y;
        if (ddx*ddx + ddy*ddy < (ball.r + e.r) * (ball.r + e.r) && frameCount - e.yyHitT > 24) {
          e.yyHitT = frameCount;
          damageEnemy(e, ydmg, 'contact');
          bumpTrait('yinyang', 1); // 特性·弹力
        }
      });
    }
    // 灵玉护体：玉存在期间为玩家回盾
    player.shield = Math.min(player.shieldMax, player.shield + 0.06 * dt);
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
  if (roll < 0.30) spawnDrop(x, y, 'heart');
  else if (roll < 0.50) spawnDrop(x, y, 'bomb');
  else if (roll < 0.65) spawnDrop(x, y, 'magnet');
  else if (roll < 0.77) spawnDrop(x, y, 'watch');
  else for (var i = 0; i < 5; i++) spawnGem(x + (Math.random()-0.5)*40, y + (Math.random()-0.5)*40, 1);
}
var DROP_INFO = {
  heart:   { emoji:'❤️', label:'+25 HP', color:'#ff4466' },
  bomb:    { emoji:'💣', label:'灵击！', color:'#f0c060' },
  magnet:  { emoji:'🧲', label:'全屏收集', color:'#8fd8ff' },
  shard:   { emoji:'💠', label:'+15 HP', color:'#ffb2df' },
  watch:   { emoji:'🕐', label:'时停！', color:'#b89fff' }
};
function applyDrop(d) {
  var info = DROP_INFO[d.kind];
  addLabel(player.x, player.y - 40, info.emoji + ' ' + info.label, info.color);
  sfxPickup();
  if (d.kind === 'heart') player.hp = Math.min(player.maxHp, player.hp + 25);
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
  else if (d.kind === 'shard') { player.hp = Math.min(player.maxHp, player.hp + 15); scoreBonus += 30; }
  else if (d.kind === 'watch') { freezeAll = 180; sfxFreeze(); }
}

// ═══════════ 升级卡池 ═══════════
function buildCardPool() {
  var pool = [];
  for (var i = 0; i < player.weapons.length; i++) {
    var w = player.weapons[i];
    if (w.evoed) { pool.push({ type:'res', id:w.id }); continue; } // 已进化：只出精研卡
    if (w.lv < 5) pool.push({ type:'wup', id:w.id });
    else {
      if (EVO[w.id] && attrLv(WPN[w.id].attr) >= 5 && typeLv(WPN[w.id].type) >= 3) pool.push({ type:'evo', id:w.id }); // 超进化金卡
      pool.push({ type:'res', id:w.id }); // 精研（无限 +6%）
    }
  }
  if (player.weapons.length < MAX_WPN_SLOT) {
    for (var id in WPN) {
      if (hasWeapon(id)) continue;
      pool.push({ type:'wnew', id:id });
    }
  }
  for (var p in PAS) {
    if (player.passives[p] < 5) pool.push({ type:'pas', id:p });
  }
  // 属性强化：持有所属属性武器才出现
  for (var a in ATTR_ENH) {
    if (attrLv(a) < 5 && hasAttrWeapon(a)) pool.push({ type:'attr', id:a });
  }
  // 类型强化：持有该类型武器才出现
  for (var t in TYPE_ENH) {
    if (typeLv(t) < 3 && hasTypeWeapon(t)) pool.push({ type:'type', id:t });
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
  if (c.type === 'wup') { var w = WPN[c.id], wp = hasWeapon(c.id); return { icon:w.icon, name:w.name, jp:w.jp, lv:wp.lv + 1, desc:w.desc[wp.lv], attr:w.attr, wtype:w.type }; }
  if (c.type === 'wnew') { var n = WPN[c.id]; return { icon:n.icon, name:n.name + ' ✦新', jp:n.jp, lv:1, desc:n.desc[0], attr:n.attr, wtype:n.type }; }
  if (c.type === 'evo') { var v = EVO[c.id], o = WPN[c.id]; return { icon:v.icon, name:v.name, jp:v.jp, lv:0, evo:true, desc:o.name + ' → ' + v.desc, attr:o.attr, wtype:o.type }; }
  if (c.type === 'res') { var wR = hasWeapon(c.id), cfgR = WPN[c.id], rN = (wR && wR.research) || 0; return { icon:cfgR.icon, name:'精研 · ' + cfgR.name, jp:'研鑽', lv:rN + 1, desc:'该武器伤害 +6%（+' + Math.round(rN * 6) + '% → +' + Math.round((rN + 1) * 6) + '%）' }; }
  if (c.type === 'pas') { var q = PAS[c.id]; return { icon:q.icon, name:q.name, jp:q.jp, lv:player.passives[c.id] + 1, desc:q.desc }; }
  if (c.type === 'attr') { var ae = ATTR_ENH[c.id]; return { icon:ae.icon, name:ae.name, jp:ae.jp, lv:attrLv(c.id) + 1, desc:ae.desc[attrLv(c.id)] }; }
  if (c.type === 'type') { var te = TYPE_ENH[c.id]; return { icon:te.icon, name:te.name, jp:te.jp, lv:typeLv(c.id) + 1, desc:'强化「' + te.label + '」武器 · ' + te.levels[typeLv(c.id)] }; }
  return { icon:'❤️', name:'红心补给', jp:'ハート', lv:0, desc:'立即回血 50' };
}
function applyCard(c) {
  if (c.type === 'wup') { hasWeapon(c.id).lv++; }
  else if (c.type === 'wnew') { player.weapons.push({ id:c.id, lv:1, t:20, ang:Math.random()*6 }); }
  else if (c.type === 'evo') { // 超进化觉醒
    var w2 = hasWeapon(c.id);
    if (!w2 || w2.evoed) return;
    w2.evoed = true; w2.lv = 6;
    addLabel(player.x, player.y - 70, '✦ ' + EVO[c.id].name + ' 觉醒！', '#ffd700');
    spawnParticles(player.x, player.y, '#ffd700', 26, 2, 4);
    deathFlash = Math.max(deathFlash, 6);
    if (c.id === 'yinyang') { yyBalls = []; } // 旧玉回收，换封魔玉
  }
  else if (c.type === 'res') { var wR2 = hasWeapon(c.id); if (wR2) wR2.research = (wR2.research || 0) + 1; }
  else if (c.type === 'pas') {
    player.passives[c.id]++;
    if (c.id === 'hpup') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); }
  }
  else if (c.type === 'attr') { player.attrs[c.id] = attrLv(c.id) + 1; if (c.id === 'rei' && attrLv('rei') >= 3) player.shieldMax = Math.max(player.shieldMax, 45); }
  else if (c.type === 'type') { player.types[c.id] = typeLv(c.id) + 1; }
  else { player.hp = Math.min(player.maxHp, player.hp + 50); }
}
var currentCards = [];
var rerollUsed = false;
function enterLevelUp() {
  gameState = 'levelup';
  rerollUsed = false;
  currentCards = rollCards();
  renderLvCards();
  document.getElementById('levelOverlay').classList.remove('hide');
}
function renderLvCards() {
  document.getElementById('lvNum').textContent = player.level;
  var box = document.getElementById('lvCards');
  box.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    (function(idx) {
      var info = cardInfo(currentCards[idx]);
      var div = document.createElement('div');
      var ctype = currentCards[idx].type;
      div.className = 'lv-card' + (info.evo ? ' evo' : (ctype === 'wup' || ctype === 'wnew' || ctype === 'res') ? ' wpn' : ctype === 'pas' ? ' pas' : (ctype === 'attr' || ctype === 'type') ? ' enh' : '');
      div.style.animationDelay = (idx * 0.08) + 's';
      var pips = '';
      var maxP = currentCards[idx].type === 'type' ? 3 : 5;
      if (info.evo) pips = '★ 超进化';
      else if (info.lv > 0) for (var p = 1; p <= maxP; p++) pips += p <= info.lv ? '●' : '○';
      div.innerHTML = '<div class="lv-icon">' + info.icon + '</div>' +
        '<div class="lv-name">' + info.name + '</div>' +
        '<div class="lv-jp">' + info.jp + '</div>' +
        (info.attr ? '<div class="lv-tags">' + (info.attr === 'rei' ? '✨灵' : '🌑魔') + ' · ' + TYPE_ENH[info.wtype].label + '</div>' : '') +
        (pips ? '<div class="lv-pips">' + pips + '</div>' : '') +
        '<div class="lv-desc">' + info.desc + '</div>' +
        '<div class="lv-key">' + (idx + 1) + '</div>';
      div.addEventListener('click', function() { pickCard(idx); });
      box.appendChild(div);
    })(i);
  }
  var rb = document.getElementById('lvReroll');
  if (rb) { rb.disabled = rerollUsed; rb.textContent = rerollUsed ? '🎲 已重抽' : '🎲 重抽（每次升级 1 次）'; }
}
function rerollCards() {
  if (gameState !== 'levelup' || rerollUsed) return;
  rerollUsed = true;
  currentCards = rollCards();
  renderLvCards();
  sfxCard();
}
window._rerollCards = rerollCards;
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

// ═══════════ 暂停 ═══════════
var gamePaused = false;
var godMode = false; // 调试：无敌
function togglePause() {
  if (gameState !== 'playing' && gameState !== 'paused') return;
  gamePaused = !gamePaused;
  if (gamePaused) {
    gameState = 'paused';
    renderPauseStats();
    document.getElementById('pauseOverlay').classList.remove('hide');
    if (bgm) bgm.pause();
  } else {
    gameState = 'playing';
    document.getElementById('pauseOverlay').classList.add('hide');
    lastTs = performance.now(); acc = 0;
    ensureBgm();
  }
}
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('btnResume').addEventListener('click', togglePause);
var pauseBtnEl = document.getElementById('pauseBtn');
pauseBtnEl.style.display = 'none'; // 开局前隐藏，由主循环按 gameState 同步
// 重新开始（两次点击确认）
var btnRestartEl = document.getElementById('btnRestart');
var restartArmed = false;
if (btnRestartEl) btnRestartEl.addEventListener('click', function () {
  if (!restartArmed) {
    restartArmed = true; btnRestartEl.textContent = '再点一次确认';
    setTimeout(function () { restartArmed = false; btnRestartEl.textContent = '↻ 重新开始'; }, 2000);
    return;
  }
  restartArmed = false; btnRestartEl.textContent = '↻ 重新开始';
  startGame();
});
// 结束本局（两次点击确认：走结算，可提交排行榜）
var btnEndRunEl = document.getElementById('btnEndRun');
var endRunArmed = false;
if (btnEndRunEl) btnEndRunEl.addEventListener('click', function () {
  if (!endRunArmed) {
    endRunArmed = true; btnEndRunEl.textContent = '再点一次确认';
    setTimeout(function () { endRunArmed = false; btnEndRunEl.textContent = '🏳 结束本局'; }, 2000);
    return;
  }
  endRunArmed = false; btnEndRunEl.textContent = '🏳 结束本局';
  endGame(true);
});
// Tab 切换
var pauseTabsEl = document.getElementById('pauseTabs');
if (pauseTabsEl) pauseTabsEl.addEventListener('click', function (e) {
  var t = e.target;
  while (t && t !== pauseTabsEl && !(t.className && String(t.className).indexOf('pz-tab') >= 0)) t = t.parentElement;
  if (!t || t === pauseTabsEl) return;
  renderPauseStats(t.getAttribute('data-t'));
  sfxCard();
});
// 暂停页 BGM 音量条
var bgmVolEl = document.getElementById('bgmVol');
var bgmVolValEl = document.getElementById('bgmVolVal');
function applyBgmVolUI() {
  if (bgmVolEl) bgmVolEl.value = String(bgmVol);
  if (bgmVolValEl) bgmVolValEl.textContent = bgmVol + '%';
}
if (bgmVolEl) {
  applyBgmVolUI();
  bgmVolEl.addEventListener('input', function () {
    bgmVol = Math.max(0, Math.min(100, parseInt(bgmVolEl.value, 10) || 0));
    try { localStorage.setItem('ms_bgmvol', String(bgmVol)); } catch (e) {}
    if (bgmVolValEl) bgmVolValEl.textContent = bgmVol + '%';
    if (bgmVol <= 0) { if (bgm) bgm.pause(); }
    else ensureBgm();
    sfxCard();
  });
}

// ═══════════ 暂停数据面板（Tab：面板 / 武器 / 强化 / 遗物·进化）═══════════
var pauseTab = 'panel';
var PAUSE_TYPES = ['bullet','aoe','summon','field','beam','melee'];
var PAUSE_TYPE_NAME = { bullet:'子弹', aoe:'范围', summon:'召唤', field:'领域', beam:'光束', melee:'近身' };
function pauseSumHTML() {
  return '<span>⏱ ' + fmtTime(gameTime) + '</span><span>Lv ' + player.level + '</span><span>💀 ' + kills + '</span><span>分数 ' + score + '</span>' + (scBreaks ? '<span>符卡击破 ' + scBreaks + '</span>' : '');
}
function panelTabHTML() {
  function cell(label, val) { return '<div class="ps-cell"><b>' + val + '</b><span>' + label + '</span></div>'; }
  var reiM = dmgMul() * attrDmgMul('rei');
  var maM = dmgMul() * attrDmgMul('ma') * frenzyMul() * rageMul();
  var html = '<div class="ps-sec"><h3>当前面板</h3><div class="ps-grid">';
  html += cell('生命', Math.ceil(player.hp) + '/' + player.maxHp);
  html += cell('护盾', Math.round(player.shield) + '/' + player.shieldMax);
  html += cell('移速', (player.spd * moveMul()).toFixed(2));
  html += cell('灵系伤害', '×' + reiM.toFixed(2));
  html += cell('魔系伤害', '×' + maM.toFixed(2));
  html += cell('冷却', '×' + cdMul().toFixed(2) + (player.rage ? ' · 狂化×' + player.rage : ''));
  html += cell('暴击', Math.round((critRate() + (attrLv('ma') >= 4 ? 0.08 : 0)) * 100) + '% / ×' + (attrLv('ma') >= 4 ? 2.3 : 2));
  html += cell('减伤', Math.round(dmgReduce() * 100) + '%');
  html += cell('吸血', (player.passives.leech * 3) + '%');
  html += cell('拾取', Math.round(magnetR()));
  html += cell('经验', '+' + Math.round((xpMul() - 1) * 100) + '%');
  html += cell('掉率', '+' + Math.round((luckMul() - 1) * 100) + '%');
  html += cell('吸血抗性', '-' + Math.round(leechRes() * 100) + '%');
  html += cell('冰冻抗性', '-' + Math.round(freezeRes() * 100) + '%');
  html += '</div></div>';
  return html;
}
// ── 武器页：只显示已激活，含数值 / 效果 / 特性 / 进化进度 ──
function cdSec(w, frames) { return (frames * wpnCd(w) / 60).toFixed(2) + 's'; }
var WPN_STAT = {
  star: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 45 : WPN.star.dmg[lv]) * wpnDmg(w)) + ' · 弹数 ' + ((w.evoed ? 6 : WPN.star.n[lv] + typeCountBonus('bullet')) + traitStarShots(w)) + ' · 冷却 ' + cdSec(w, w.evoed ? 100 : WPN.star.cd[lv]); },
  spark: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 16 : WPN.spark.dmg[lv]) * wpnDmg(w)) + '/脉冲 · 冷却 ' + cdSec(w, w.evoed ? 240 : WPN.spark.cd[lv]); },
  orbit: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 34 : WPN.orbit.dmg[lv]) * wpnDmg(w)) + ' · 星数 ' + (w.evoed ? 8 : WPN.orbit.n[lv]) + ' · 半径 ' + Math.round((w.evoed ? 112 : WPN.orbit.or[lv]) * typeRangeMul('field') + traitOrbitR(w)); },
  frost: function(w, lv) { return w.evoed ? ('伤 ' + Math.round(18 * wpnDmg(w)) + ' · 全场冻结 · 周期 ' + cdSec(w, 420)) : ('伤 ' + Math.round(WPN.frost.dmg[lv] * wpnDmg(w)) + ' · 半径 ' + Math.round(WPN.frost.ar[lv] * typeRangeMul('aoe')) + ' · 冻结 ' + ((WPN.frost.frz[lv] * (attrLv('ma') >= 2 ? 1.15 : 1) * (1 + traitFrostDur(w)) / 60).toFixed(2)) + 's'); },
  comet: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 150 : WPN.comet.dmg[lv]) * wpnDmg(w)) + ' · 半径 ' + Math.round((w.evoed ? 130 : WPN.comet.ar[lv]) * typeRangeMul('aoe')) + ' · 落点 ' + (w.evoed ? 3 : 1 + traitCometN(w)); },
  yinyang: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 42 : WPN.yinyang.dmg[lv]) * wpnDmg(w)) + ' · 玉数 ' + ((w.evoed ? 4 : WPN.yinyang.n[lv]) + typeCountBonus('summon')) + ' · 速度 ' + ((w.evoed ? 4.6 : WPN.yinyang.spd[lv] * (1 + traitYinyangSpd(w))).toFixed(2)); },
  needle: function(w, lv) { return '伤 ' + Math.round(((w.evoed ? 34 : WPN.needle.dmg[lv]) + traitNeedleDmg(w)) * wpnDmg(w)) + ' · 针数 ' + (w.evoed ? 12 : WPN.needle.n[lv] + typeCountBonus('bullet')) + ' · 穿透 ' + (w.evoed ? 6 : WPN.needle.pr[lv] + typePierceBonus('bullet')); },
  shanghai: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 20 : WPN.shanghai.dmg[lv]) * wpnDmg(w)) + ' · 人偶 ' + (w.evoed ? 1 : WPN.shanghai.doll[lv] + typeCountBonus('summon')) + ' · 频率 ' + (w.evoed ? '双激光' : (WPN.shanghai.rate[lv] / (60 * typeRateMul('summon') * (1 + traitDollRate(w)))).toFixed(2) + 's'); },
  netherworld: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 26 : WPN.netherworld.dmg[lv]) * wpnDmg(w)) + ' · 半径 ' + Math.round((w.evoed ? 300 : WPN.netherworld.ar[lv]) * typeRangeMul('field') + traitNetherR(w)) + ' · 周期 ' + ((w.evoed ? 480 : WPN.netherworld.cyc[lv]) / 60).toFixed(1) + 's'; },
  gungnir: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 120 : WPN.gungnir.dmg[lv]) * wpnDmg(w)) + ' · 宽 ' + Math.round(20 * (1 + traitGungnirW(w))) + ' · 冷却 ' + cdSec(w, w.evoed ? 130 : WPN.gungnir.cd[lv]); },
  hisou: function(w, lv) { return '伤 ' + Math.round((w.evoed ? WPN.hisou.dmg[4] : WPN.hisou.dmg[lv]) * wpnDmg(w)) + ' · 范围 ' + Math.round((w.evoed ? WPN.hisou.ar[4] : WPN.hisou.ar[lv]) * typeRangeMul('melee')) + ' · 冷却 ' + cdSec(w, w.evoed ? 40 : WPN.hisou.cd[lv]); },
  roukan: function(w, lv) { return '伤 ' + Math.round((w.evoed ? 90 : WPN.roukan.dmg[lv] * 0.7) * wpnDmg(w)) + ' · 范围 ' + Math.round((w.evoed ? 130 : WPN.roukan.ar[lv]) * typeRangeMul('melee')) + ' · ' + (w.evoed ? '冲刺连锁斩 · 换目标≤10次' : '冷却 ' + cdSec(w, WPN.roukan.cd[lv])); },
  yoshika: function(w, lv) { return '撕挠 ' + Math.round(WPN.yoshika.dmg[lv] * wpnDmg(w)) + ' · 间隔 ' + (WPN.yoshika.rate[lv] / 60).toFixed(2) + 's' + (w.evoed ? ' · 冲撞 ×2' : ''); },
  knife: function(w, lv) { return w.evoed ? ('八刀环敌 · 单刀 ' + Math.round(WPN.knife.dmg[4] * 0.33 * wpnDmg(w)) + ' · 穿刺 · 周期 ' + cdSec(w, 200)) : ('伤 ' + Math.round(WPN.knife.dmg[lv] * wpnDmg(w)) + ' · 刀数 ' + WPN.knife.n[lv] + ' · 冷却 ' + cdSec(w, WPN.knife.cd[lv])); },
  nuke: function(w, lv) { return w.evoed ? ('核爆伤 ' + Math.round(WPN.nuke.dmg[4] * wpnDmg(w)) + ' · r' + WPN.nuke.br[4] + ' · 熔化小怪 · 周期 ' + cdSec(w, 420)) : ('核爆伤 ' + Math.round(WPN.nuke.dmg[lv] * wpnDmg(w)) + ' · 核爆 r' + WPN.nuke.br[lv] + ' · 污染 r' + WPN.nuke.zr[lv] + ' · 冷却 ' + cdSec(w, WPN.nuke.cd[lv])); },
  reaper: function(w, lv) { return '伤 ' + Math.round(WPN.reaper.dmg[lv] * wpnDmg(w) * (1 + (w.rb || 0))) + ' · 范围 ' + Math.round(WPN.reaper.ar[lv] * typeRangeMul('melee')) + ' · 斩杀 ' + Math.round(reaperExecPct(w) * 100) + '%' + (w.rb ? ' · 增伤+' + Math.round(w.rb * 100) + '%' : ''); },
  chen: function(w, lv) { return '周期 ' + ((w.evoed ? 480 : WPN.chen.cyc[lv]) / 60).toFixed(0) + 's · 盾 +' + (w.evoed ? 25 : WPN.chen.shd[lv]) + ' · ' + (w.evoed ? '双增益 +25%/+15%' : '增益轮换'); },
  ofuda: function(w, lv) { return w.evoed ? ('光团伤 ' + Math.round(WPN.ofuda.dmg[4] * 1.2 * wpnDmg(w)) + ' · 周期 ' + cdSec(w, 270)) : ('伤 ' + Math.round(WPN.ofuda.dmg[lv] * wpnDmg(w)) + ' · 符数 ' + WPN.ofuda.n[lv] + ' · 冷却 ' + cdSec(w, WPN.ofuda.cd[lv])); },
  soulfly: function(w, lv) { return '周期 ' + ((w.evoed ? 360 : 240) / 60).toFixed(0) + 's · ' + (w.evoed ? ('8只×' + Math.round(WPN.soulfly.dmg[lv] * 0.35 * wpnDmg(w))) : ('伤 ' + Math.round(WPN.soulfly.dmg[lv] * wpnDmg(w)))) + ' · 自爆 r70'; },
  fan: function(w, lv) { return '伤 ' + Math.round(WPN.fan.dmg[lv] * wpnDmg(w) * fanSpeedMul()) + '（随移速 ×' + fanSpeedMul().toFixed(2) + '） · 冷却 ' + cdSec(w, WPN.fan.cd[lv]); }
};
var TRAIT_INFO = {
  star: { name:'星印', f: function(w){ return Math.floor(trN(w) % 20) + '/20 · +' + traitStarShots(w) + ' 发'; } },
  spark: { name:'过载', f: function(w){ return trN(w) + '/3 层 · 冷却 −' + Math.round((1 - traitSparkCd(w)) * 100) + '%'; } },
  orbit: { name:'引力', f: function(w){ return '+' + traitOrbitR(w) + '/30 半径'; } },
  frost: { name:'霜核', f: function(w){ return Math.floor(trN(w) % 5) + '/5 · +' + Math.round(traitFrostDur(w) * 100) + '% 冻结时长'; } },
  comet: { name:'陨铁', f: function(w){ return Math.floor(trN(w) % 15) + '/15 · +' + traitCometN(w) + ' 颗'; } },
  yinyang: { name:'弹力', f: function(w){ return '+' + Math.round(traitYinyangSpd(w) * 100) + '%/40% 玉速'; } },
  needle: { name:'封魔', f: function(w){ return Math.floor(trN(w) % 10) + '/10 · +' + traitNeedleDmg(w) + ' 攻'; } },
  shanghai: { name:'人偶工房', f: function(w){ return '+' + Math.round(traitDollRate(w) * 100) + '%/30% 射速'; } },
  netherworld: { name:'深渊', f: function(w){ return Math.floor(trN(w) % 50) + '/50 · +' + traitNetherR(w) + ' 半径'; } },
  gungnir: { name:'贯穿强化', f: function(w){ return '+' + Math.round(traitGungnirW(w) * 100) + '%/20% 光束宽'; } },
  hisou: { name:'剑势', f: function(w){ return '+' + Math.round(traitHisouRate(w) * 100) + '%/20% 攻速'; } },
  roukan: { name:'连击', f: function(w){ return '+' + traitRoukanChain(w) + '/5 连击段数'; } }
};
function wpnTabHTML() {
  var html = '<div class="ps-sec"><h3>我的武器（' + player.weapons.length + '/' + MAX_WPN_SLOT + '）</h3>';
  if (!player.weapons.length) html += '<div class="ps-row"><span>尚未获得武器</span></div>';
  for (var i = 0; i < player.weapons.length; i++) {
    var wp = player.weapons[i], wc = WPN[wp.id], lv = Math.max(0, Math.min(4, wp.lv - 1));
    var title = wc.icon + ' ' + wc.name + ' Lv' + Math.min(5, wp.lv) + (wp.evoed ? ' ★' : '') + (wp.research ? ' · 精研×' + wp.research : '');
    html += '<div class="ps-row"><b>' + title + '</b><span style="color:#8fd8ff">' + (WPN_STAT[wp.id] ? WPN_STAT[wp.id](wp, lv) : '') + '</span></div>';
    html += '<div class="ps-row"><b style="font-weight:400;color:#c9bfd8">效果</b><span>' + (wp.evoed ? EVO[wp.id].desc : wc.desc[lv]) + '</span></div>';
    var ti = TRAIT_INFO[wp.id];
    if (ti) html += '<div class="ps-row"><b style="color:#ffd700">特性·' + ti.name + '</b><span>' + ti.f(wp) + '</span></div>';
    if (EVO[wp.id]) {
      var okW = wp.lv >= 5, okA = attrLv(wc.attr) >= 5, okT = typeLv(wc.type) >= 3;
      var etxt = wp.evoed ? '已觉醒 ★' : ('武器' + wp.lv + '/5 · ' + (wc.attr === 'rei' ? '灵' : '魔') + attrLv(wc.attr) + '/5 · ' + PAUSE_TYPE_NAME[wc.type] + typeLv(wc.type) + '/3');
      html += '<div class="ps-row"><b style="color:#ffd700">超进化</b><span' + ((okW && okA && okT && !wp.evoed) ? ' class="ok"' : '') + '>' + etxt + '</span></div>';
    }
  }
  html += '</div>';
  return html;
}
function enhTabHTML() {
  var html = '<div class="ps-sec"><h3>强化</h3>';
  html += '<div class="ps-row"><b>✨ 灵力强化</b><span>' + attrLv('rei') + ' / 5</span></div>';
  html += '<div class="ps-row"><b>🌑 魔力强化</b><span>' + attrLv('ma') + ' / 5</span></div>';
  for (var ti2 = 0; ti2 < PAUSE_TYPES.length; ti2++) {
    html += '<div class="ps-row"><b>' + TYPE_ENH[PAUSE_TYPES[ti2]].icon + ' ' + TYPE_ENH[PAUSE_TYPES[ti2]].name + '</b><span>' + typeLv(PAUSE_TYPES[ti2]) + ' / 3</span></div>';
  }
  html += '</div>';
  return html;
}
function relicTabHTML() {
  var html = '<div class="ps-sec"><h3>遗物</h3>';
  var anyRelic = false;
  for (var rid in player.relics) {
    if (player.relics[rid] > 0 && RELICS[rid]) {
      anyRelic = true;
      html += '<div class="ps-row"><b>' + RELICS[rid].icon + ' ' + RELICS[rid].name + '</b><span>×' + player.relics[rid] + '</span></div>';
    }
  }
  if (!anyRelic) html += '<div class="ps-row"><span>击破 Boss 可获得遗物</span></div>';
  html += '</div>';
  return html;
}
function renderPauseStats(tab) {
  if (tab) pauseTab = tab;
  var el = document.getElementById('pauseStats');
  if (!el) return;
  var sum = document.getElementById('pauseSum');
  if (sum) sum.innerHTML = pauseSumHTML();
  el.innerHTML = (pauseTab === 'wpn') ? wpnTabHTML() : (pauseTab === 'enh') ? enhTabHTML() : (pauseTab === 'relic') ? relicTabHTML() : panelTabHTML();
  var tabs = document.getElementById('pauseTabs');
  if (tabs) {
    var btns = tabs.querySelectorAll('.pz-tab');
    for (var i = 0; i < btns.length; i++) btns[i].className = 'pz-tab' + (btns[i].getAttribute('data-t') === pauseTab ? ' on' : '');
  }
}

// ═══════════ 遗物：Boss 战利品三选一 ═══════════
var currentRelics = [];
function applyRelic(id) {
  player.relics[id] = Math.min(MAX_RELIC_STACK, relicLv(id) + 1);
  if (id === 'redmoon') { player.maxHp += 50; player.hp = Math.min(player.maxHp, player.hp + 50); }
  if (id === 'ward') player.shieldMax += 15;
  addLabel(player.x, player.y - 60, '🏆 ' + RELICS[id].name, '#ffd700');
  spawnParticles(player.x, player.y, '#ffd700', 20, 2, 4);
  deathFlash = Math.max(deathFlash, 5);
  sfxBomb();
}
function rollRelics(bossIdx) {
  var pool = [];
  for (var id in RELICS) {
    var r = RELICS[id];
    if (r.boss >= 0 && r.boss !== bossIdx) continue;
    if (relicLv(id) >= MAX_RELIC_STACK) continue;
    pool.push(id);
  }
  var out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  while (out.length < 3) out.push('core');
  return out;
}
function showRelicChoice(bossIdx) {
  if (gameState === 'relic') return; // 防重复触发
  gameState = 'relic';
  currentRelics = rollRelics(bossIdx);
  renderRelicCards();
  var ov = document.getElementById('relicOverlay');
  if (ov) ov.classList.remove('hide');
}
function renderRelicCards() {
  var box = document.getElementById('relicCards');
  if (!box) return;
  box.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    (function(idx) {
      var id = currentRelics[idx], r = RELICS[id];
      var div = document.createElement('div');
      div.className = 'lv-card evo';
      div.style.animationDelay = (idx * 0.08) + 's';
      div.innerHTML = '<div class="lv-icon">' + r.icon + '</div>' +
        '<div class="lv-name">' + r.name + '</div>' +
        '<div class="lv-jp">' + r.jp + '</div>' +
        '<div class="lv-pips">' + (relicLv(id) > 0 ? '已有 ×' + relicLv(id) + ' → ×' + Math.min(MAX_RELIC_STACK, relicLv(id) + 1) : '★ 新遗物') + '</div>' +
        '<div class="lv-desc">' + r.desc + '</div>' +
        '<div class="lv-key">' + (idx + 1) + '</div>';
      div.addEventListener('click', function() { pickRelic(idx); });
      box.appendChild(div);
    })(i);
  }
}
function pickRelic(i) {
  if (gameState !== 'relic' || !currentRelics[i]) return;
  applyRelic(currentRelics[i]);
  document.getElementById('relicOverlay').classList.add('hide');
  gameState = 'playing';
  lastTs = performance.now(); acc = 0;
}

// ═══════════ 主更新（固定 60Hz 步长，全设备同速）═══════════
function stepGame() {
  if (gameState !== 'playing' || roPaused || gamePaused) return;
  dt = 1;
  frameCount++;
  if (!boss) gameTime += 1 / 60; // Boss 战期间时间暂停（下一波 Boss 不撞车）
  score = kills * 50 + Math.floor(gameTime) * 10 + scoreBonus;

  // ── 玩家移动（楼观冲刺期间接管移动）──
  var iv = inputVector();
  var spd = player.spd * moveMul() * dt;
  if (!player.roukanDash) {
    player.x += iv.x * spd; player.y += iv.y * spd;
    if (iv.x !== 0 || iv.y !== 0) {
      var il = Math.sqrt(iv.x*iv.x + iv.y*iv.y);
      player.fx = iv.x / il; player.fy = iv.y / il;
      if (iv.x < -0.1) player.flip = true;
      else if (iv.x > 0.1) player.flip = false;
    }
  }
  if (player.inv > 0) player.inv -= dt;
  if (player.buffDmgT > 0) player.buffDmgT -= dt;   // 八云橙增益
  if (player.buffMoveT > 0) player.buffMoveT -= dt;
  if (freezeAll > 0) freezeAll -= dt;
  // 灵力强化 Lv3：护盾缓慢回复
  if (attrLv('rei') >= 3) player.shield = Math.min(player.shieldMax, player.shield + 0.03 * dt);

  // ── 武器 ──
  for (var wi = 0; wi < player.weapons.length; wi++) {
    tickWeapon(player.weapons[wi]);
    updateContinuous(player.weapons[wi]);
  }

  // ── 红色冥界：领域伤害 + 吸血 ──
  if (nether) {
    nether.tick = (nether.tick || 0) - dt;
    if (nether.tick <= 0) {
      nether.tick = 30 / typeRateMul('field');
      var nHit = 0;
      queryGrid(nether.x, nether.y, nether.r + 50, function(e) {
        var ndx = e.x - nether.x, ndy = e.y - nether.y;
        if (ndx*ndx + ndy*ndy < (nether.r + e.r) * (nether.r + e.r)) {
          damageEnemy(e, nether.dmg, 'dot');
          if (!e.dead && frameCount - (e.leechT === undefined ? -999 : e.leechT) >= 60) { e.leechT = frameCount; nHit++; } // 每敌每秒最多贡献 1 次回血
          if (nether.slow && !e.isBoss && !e.dead) e.slowT = Math.max(e.slowT, 40);
          // 吸血反馈：飞向玩家的光点
          if (!e.dead && particles.length < 380) {
            var lvx = player.x - e.x, lvy = player.y - e.y, lvd = Math.sqrt(lvx*lvx + lvy*lvy) || 1;
            particles.push({ x:e.x, y:e.y, vx:lvx/lvd*6, vy:lvy/lvd*6, life:12, maxLife:12, color:'#ff6b8a', r:3 });
          }
        }
      });
      if (nHit > 0 && player.hp > 0) {
        var nHeal = nHit * nether.dmg * 0.10;
        var tickCap = Math.max(6, player.maxHp * 0.01); // 单 tick 上限：保底 6，随最大生命 1% 成长
        if (nHeal > tickCap) nHeal = tickCap;
        var healedN = healLeech(nHeal);
        if (healedN > 0) bumpTrait('netherworld', healedN); // 特性·深渊：累计吸血
      }
    }
  }

  // ── 遗物计时（结界护符 / 赤月之契 / 血雾领域）──
  if (relicLv('ward') > 0) {
    wardT -= dt;
    if (wardT <= 0) {
      wardT = 2700;
      player.shield = Math.min(player.shieldMax, player.shield + 15 * relicLv('ward'));
      addLabel(player.x, player.y - 40, '🛡️ 结界护符 +盾', '#8fd8ff');
    }
  }
  if (relicLv('redmoon') > 0) {
    crimsonT -= dt;
    if (crimsonT <= 0) {
      crimsonT = 5400;
      var healR = Math.round(player.maxHp * 0.15 * relicLv('redmoon'));
      player.hp = Math.min(player.maxHp, player.hp + healR);
      addLabel(player.x, player.y - 40, '🌕 赤月回复 +' + healR, '#ff9db8');
    }
  }
  if (relicMist) {
    relicMist.t -= dt; relicMist.tick -= dt;
    if (relicMist.tick <= 0) {
      relicMist.tick = 30;
      queryGrid(relicMist.x, relicMist.y, relicMist.r + 50, function(e) {
        var rdx = e.x - relicMist.x, rdy = e.y - relicMist.y;
        if (rdx*rdx + rdy*rdy < (relicMist.r + e.r) * (relicMist.r + e.r)) {
          damageEnemy(e, relicMist.dmg, 'aoe');
          if (!e.isBoss && !e.dead) e.slowT = Math.max(e.slowT, 40);
        }
      });
    }
    if (relicMist.t <= 0) relicMist = null;
    if (gameState !== 'playing') return;
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

  // ── 毒坑（毒蘑菇遗留：不分敌我）──
  for (var pp3 = poisonPits.length - 1; pp3 >= 0; pp3--) {
    var pit = poisonPits[pp3];
    pit.t -= dt; pit.tick -= dt;
    if (frameCount % 12 === 0) spawnParticles(pit.x + (Math.random()-0.5)*pit.r*1.1, pit.y + (Math.random()-0.5)*pit.r*1.1, '#b58ae8', 1, 1, 3);
    if (pit.tick <= 0) {
      pit.tick = 30;
      var pdxp = player.x - pit.x, pdyp = player.y - pit.y;
      if (player.inv <= 0 && pdxp*pdxp + pdyp*pdyp < (pit.r + player.r) * (pit.r + player.r)) hurtPlayer(4);
      if (gameState !== 'playing') return;
      for (var pe = enemies.length - 1; pe >= 0; pe--) {
        var ee = enemies[pe];
        if (ee.dead) continue;
        var edx = ee.x - pit.x, edy = ee.y - pit.y;
        if (edx*edx + edy*edy < (pit.r + ee.r) * (pit.r + ee.r)) damageEnemy(ee, 8, 'dot');
      }
    }
    if (pit.t <= 0) poisonPits.splice(pp3, 1);
  }

  // ── 生成（Boss 战期间停刷普通怪，Boss 召唤技除外）──
  updateDirector();
  spawnTimer += dt;
  if (!boss && spawnTimer >= spawnInterval()) { trySpawn(); spawnTimer = 0; }
  if (gameTime >= 180 && !boss) {
    eliteTimer += dt;
    if (eliteTimer >= 90 * 60) { eliteWaveSpawn(); eliteTimer = 0; }
  }
  if (gameTime >= 120 && !boss) {
    waveTimer += dt;
    if (waveTimer >= 150 * 60) { specialWaveSpawn(); waveTimer = 0; }
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
    if (e.curseT > 0) { e.curseT -= dt; if (e.curseT <= 0) e.curse = 0; }
    // 灼烧 DoT（Boss 也生效）
    if (e.burn > 0) {
      e.burn -= dt;
      e.burnTick = (e.burnTick || 0) - dt;
      if (e.burnTick <= 0) {
        e.burnTick = 30;
        spawnParticles(e.x, e.y - e.r*0.4, '#ff8c50', 1, 1, 2);
        damageEnemy(e, e.burnDmg || 2, 'dot');
        if (e.dead) { enemies.splice(i, 1); e.dead = false; enemyPool.push(e); continue; }
      }
    }
    if (e.isBoss) {
      if (freezeAll <= 0) {
        updateBoss(e);
        if (e.rageStacks > 0 && !e.dead) e.atkT -= dt * e.rageStacks * 0.08; // 狂化：攻击频率提升
      }
    } else if (e.stun > 0) { // 眩晕：要石天降
      e.stun -= dt;
      if (frameCount % 4 === 0) spawnParticles(e.x, e.y - e.r, '#ffe8b0', 1, 1, 2);
    } else if (e.frozen > 0) { e.frozen -= dt; }
    else if (e.shock > 0) { // 麻痹：原地电火花
      e.shock -= dt;
      if (frameCount % 5 === 0) spawnParticles(e.x, e.y, '#aee8ff', 1, 1, 2);
    }
    else if (freezeAll <= 0) {
      var d = Math.sqrt(pd2) || 1;
      var es = e.spd * spdMul() * (1 - 0.10 * relicLv('hourglass'));
      if (e.slowT > 0) { es *= 0.7; e.slowT -= dt; }
      if (e.type === 'sunflower') {
        // 向日葵：固定炮台，定期 3 向瞄准散射
        e.atkT2 -= dt;
        if (e.atkT2 <= 0) {
          e.atkT2 = 210;
          var pa = Math.atan2(pdy, pdx);
          for (var sw = -1; sw <= 1; sw++) spawnEbullet(e.x, e.y, Math.cos(pa + sw * 0.22) * 2.6, Math.sin(pa + sw * 0.22) * 2.6, 8, '#ffd970', 260, false, 'orb', true);
          sfxShoot();
        }
      } else {
      // 野猪：周期性冲锋
      var boarOk = true;
      if (e.type === 'boar') {
        if (e.chargeT > 0) {
          e.chargeT -= dt;
          e.x += e.cdx * 5.2 * dt; e.y += e.cdy * 5.2 * dt;
          boarOk = false;
        } else {
          e.chargeCd -= dt;
          if (e.chargeCd <= 0 && pd2 < 460 * 460) { e.cdx = pdx / d; e.cdy = pdy / d; e.chargeT = 28; e.chargeCd = 260; boarOk = false; sfxDash(); }
        }
      }
      if (boarOk) {
        // 朝向玩家 + 侧向摆动（幽灵/魂蝶摆动更大，走位更飘）
        var wobAmp = e.type === 'ghost' ? 0.85 : (e.type === 'butterfly' ? 0.55 : 0.45);
        var wob = Math.sin(frameCount * 0.03 + e.wing) * wobAmp;
        var nx = pdx / d, ny = pdy / d;
        e.x += (nx - ny * wob) * es * dt;
        e.y += (ny + nx * wob) * es * dt;
      }
      }
      // 精英词缀行为
      if (e.affixes) {
        if (affixHas(e, 'regen')) { // 再生：持续回血
          e.regenT -= dt;
          if (e.regenT <= 0 && e.hp < e.maxHp) { e.regenT = 55; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015); spawnParticles(e.x, e.y, '#6fcf97', 2, 1, 2); }
        }
        if (affixHas(e, 'blink')) { // 瞬移：周期闪现玩家附近
          e.blinkT -= dt;
          if (e.blinkT <= 0) {
            e.blinkT = 210;
            spawnParticles(e.x, e.y, '#b89fff', 10, 1, 3);
            var ta5 = Math.random() * Math.PI * 2;
            e.x = player.x + Math.cos(ta5) * 300; e.y = player.y + Math.sin(ta5) * 300;
            spawnParticles(e.x, e.y, '#b89fff', 10, 1, 3);
            sfxDash();
          }
        }
        if (affixHas(e, 'swift') && frameCount % 8 === 0) spawnParticles(e.x, e.y, '#7fd97f', 1, 1, 2); // 迅捷残影
      }
      // 魂蝶：近身 100px 点引信，0.7 秒后自爆
      if (e.type === 'butterfly') {
        if (e.fuse > 0) {
          e.fuse -= dt;
          if (e.fuse <= 0) { enemyExplode(e, i, 130, 70, 30); continue; }
        } else if (pd2 < 100*100) e.fuse = 42;
      }
    }
    // 撞玩家（接触伤害随时间小幅成长）
    if (player.inv <= 0 && pd2 < (e.r + player.r) * (e.r + player.r)) {
      hurtPlayer(Math.round(e.dmg * (1 + gameTime / 480))); // 接触伤害成长放缓（降难度）
      if (e.affixes && affixHas(e, 'drain')) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05); spawnParticles(e.x, e.y, '#ef4444', 6, 1, 3); } // 嗜血：撞人回血
      if (gameState !== 'playing') return;
    }
  }
  // 敌人之间软分离（复用网格，防叠罗汉）
  separateEnemies();

  // ── 子弹 ──
  for (var bi = bullets.length - 1; bi >= 0; bi--) {
    var b = bullets[bi];
    // 追踪弹（星星弹 / 人偶弹）
    if (b.homing) {
      var hne = nearestEnemy(620);
      if (hne) {
        var hcur = Math.atan2(b.vy, b.vx);
        var hdes = Math.atan2(hne.y - b.y, hne.x - b.x);
        var hdf = hdes - hcur;
        while (hdf > Math.PI) hdf -= Math.PI * 2;
        while (hdf < -Math.PI) hdf += Math.PI * 2;
        var hturn = Math.max(-b.homing, Math.min(b.homing, hdf));
        var hsp = Math.sqrt(b.vx*b.vx + b.vy*b.vy) || 1;
        b.vx = Math.cos(hcur + hturn) * hsp; b.vy = Math.sin(hcur + hturn) * hsp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.type === 'knife' && frameCount % 3 === 0 && particles.length < 380) spawnParticles(b.x - b.vx * 1.5, b.y - b.vy * 1.5, '#bfe8ff', 1, 1, 2);
    if (b.life <= 0) { bullets.splice(bi, 1); bulletPool.push(b); continue; }
    var hit = false;
    queryGrid(b.x, b.y, b.r + 50, function(e) {
      if (hit && b.pierce <= 0) return;
      var dx = e.x - b.x, dy = e.y - b.y;
      if (dx*dx + dy*dy < (b.r + e.r) * (b.r + e.r)) {
        if (b.type === 'needle' && frameCount - (e.needleHitT || 0) < 14) return; // 破魔针：每敌命中冷却，防贴脸重复结算
        damageEnemy(e, b.dmg, 'bullet');
        if (b.type === 'needle' && !e.dead) { e.needleHitT = frameCount; e.curse = Math.min(3, (e.curse || 0) + 1); e.curseT = 360; } // 破魔针咒印
        if (b.type === 'star') bumpTrait('star', 1); // 特性·星印
        else if (b.type === 'doll') bumpTrait('shanghai', 1); // 特性·人偶工房
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

  // ── 夢想封印光团（P1 灵符超进化）──
  for (var orbi = orbs.length - 1; orbi >= 0; orbi--) {
    var ob = orbs[orbi];
    ob.x += ob.vx * dt; ob.y += ob.vy * dt; ob.life -= dt;
    ob.tick -= dt;
    if (ob.tick <= 0) {
      ob.tick = 18;
      queryGrid(ob.x, ob.y, ob.r + 60, function(e) {
        var odx = e.x - ob.x, ody = e.y - ob.y;
        if (odx*odx + ody*ody < (ob.r + e.r) * (ob.r + e.r)) damageEnemy(e, ob.dmg, 'beam');
      });
    }
    if (particles.length < 380) spawnParticles(ob.x, ob.y, '#bfe8ff', 1, 1, 3);
    if (frameCount % 6 === 0 && particles.length < 380) spawnParticles(ob.x, ob.y, '#ffffff', 1, 1, 2);
    if (ob.life <= 0) orbs.splice(orbi, 1);
  }
  // ── 白魂蝶（P1）：飞向最近敌自爆（对玩家无伤）──
  for (var peti = pets.length - 1; peti >= 0; peti--) {
    var pet = pets[peti];
    var pne = nearestEnemy(900);
    if (pne) {
      var pda = Math.atan2(pne.y - pet.y, pne.x - pet.x);
      pet.vx += Math.cos(pda) * 0.25 * dt; pet.vy += Math.sin(pda) * 0.25 * dt;
      var psp = Math.sqrt(pet.vx*pet.vx + pet.vy*pet.vy) || 1;
      if (psp > 4.2) { pet.vx = pet.vx / psp * 4.2; pet.vy = pet.vy / psp * 4.2; }
    }
    pet.x += pet.vx * dt; pet.y += pet.vy * dt; pet.t -= dt;
    var pnd = pne ? Math.sqrt((pne.x - pet.x) * (pne.x - pet.x) + (pne.y - pet.y) * (pne.y - pet.y)) : 999;
    if ((pne && pnd < pne.r + 18) || pet.t <= 0) {
      rings.push({ x:pet.x, y:pet.y, r:12, maxR:70, life:14, maxLife:14, color:'#e8f4ff' });
      spawnParticles(pet.x, pet.y, '#ffffff', 14, 1, 4);
      queryGrid(pet.x, pet.y, 130, function(e) {
        var sdx = e.x - pet.x, sdy = e.y - pet.y;
        if (sdx*sdx + sdy*sdy < (70 + e.r) * (70 + e.r)) damageEnemy(e, pet.dmg, 'aoe');
      });
      sfxBomb();
      pets.splice(peti, 1);
    }
  }
  // ── 核污染区（P1 核反应堆）：持续伤害随停留时间成长 ──
  for (var zi = zones.length - 1; zi >= 0; zi--) {
    var zn = zones[zi];
    zn.t -= dt; zn.tick -= dt;
    if (zn.tick <= 0) {
      zn.tick = 30;
      queryGrid(zn.x, zn.y, zn.r + 60, function(e) {
        var zdx = e.x - zn.x, zdy = e.y - zn.y;
        if (zdx*zdx + zdy*zdy < (zn.r + e.r) * (zn.r + e.r)) {
          e.nkDwell = (e.nkDwell || 0) + 1;
          damageEnemy(e, zn.dmg * (1 + Math.min(1, e.nkDwell * 0.2)), 'dot');
        }
      });
      for (var ei2 = 0; ei2 < enemies.length; ei2++) { // 离开污染区清空停留计数
        var en2 = enemies[ei2];
        if (en2.dead) continue;
        var edx2 = en2.x - zn.x, edy2 = en2.y - zn.y;
        if (edx2*edx2 + edy2*edy2 > (zn.r + en2.r) * (zn.r + en2.r)) en2.nkDwell = 0;
      }
    }
    if (zn.t <= 0) zones.splice(zi, 1);
  }
  // ── 银刃八重（P1 银色飞刀超进化）：环敌生成 → 同时朝内穿刺 ──
  for (var kb = knifeOrbs.length - 1; kb >= 0; kb--) {
    var KB = knifeOrbs[kb];
    if (KB.phase === 'ready') {
      for (var kei = 0; kei < enemies.length; kei++) { var ke2 = enemies[kei]; if (!ke2.dead && ke2.uid === KB.uid) { KB.tx = ke2.x; KB.ty = ke2.y; break; } }
      KB.t -= dt;
      var kProg = 1 - Math.max(0, KB.t) / 18;
      var kRad = 110 - 14 * kProg;
      KB.x = KB.tx + Math.cos(KB.ang) * kRad;
      KB.y = KB.ty + Math.sin(KB.ang) * kRad;
      if (KB.t <= 0) {
        KB.phase = 'stab';
        KB.t = 20;
        KB.vx = Math.cos(KB.ang + Math.PI) * 16;
        KB.vy = Math.sin(KB.ang + Math.PI) * 16;
      }
    } else {
      KB.x += KB.vx * dt; KB.y += KB.vy * dt; KB.t -= dt;
      queryGrid(KB.x, KB.y, 70, function(e) {
        if (e.dead) return;
        var kdx2 = e.x - KB.x, kdy2 = e.y - KB.y;
        if (kdx2*kdx2 + kdy2*kdy2 < (16 + e.r) * (16 + e.r) && !KB.hit[e.uid]) {
          KB.hit[e.uid] = 1;
          damageEnemy(e, KB.dmg, 'bullet');
        }
      });
      if (KB.t <= 0) knifeOrbs.splice(kb, 1);
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
    } else if (wn.laserH) { // 十字激光·横线：预警 → 全宽扫射
      if (wn.t <= 0) {
        beams.push({ laserH: true, y: wn.y, life: 10, maxLife: 10 });
        if (player.inv <= 0 && Math.abs(player.y - wn.y) < 30) hurtPlayer(wn.dmg);
        warnings.splice(ci, 1);
        shakeT = Math.max(shakeT, 5); sfxSpark();
      }
      if (gameState !== 'playing') return;
    } else if (wn.laserV) { // 十字激光·竖线
      if (wn.t <= 0) {
        beams.push({ laserV: true, x: wn.x, life: 10, maxLife: 10 });
        if (player.inv <= 0 && Math.abs(player.x - wn.x) < 30) hurtPlayer(wn.dmg);
        warnings.splice(ci, 1);
        shakeT = Math.max(shakeT, 5); sfxSpark();
      }
      if (gameState !== 'playing') return;
    } else if (wn.gungnir) { // 冈格尼尔：切线激光发射
      if (wn.t <= 0) {
        var gwT = hasWeapon('gungnir');
        var ghN = fireGungnir(wn.px, wn.py, wn.ang, wn.R, wn.dmg, gwT ? 1 + traitGungnirW(gwT) : 1);
        if (ghN >= 3) bumpTrait('gungnir', 1); // 特性·贯穿强化
        warnings.splice(ci, 1);
      }
    } else if (wn.nuke) { // 核反应堆（P1）：核爆 + 污染区
      if (wn.t <= 0) {
        rings.push({ x:wn.x, y:wn.y, r:16, maxR:200, life:20, maxLife:20, color:'#a0ff8f' });
        rings.push({ x:wn.x, y:wn.y, r:30, maxR:250, life:26, maxLife:26, color:'#fff2c0' });
        spawnParticles(wn.x, wn.y, '#a0ff8f', 26, 2, 6);
        shakeT = Math.max(shakeT, 10);
        sfxBomb();
        queryGrid(wn.x, wn.y, wn.r + 60, function(e) {
          var nkdx = e.x - wn.x, nkdy = e.y - wn.y;
          if (nkdx*nkdx + nkdy*nkdy < (wn.r + e.r) * (wn.r + e.r)) damageEnemy(e, wn.dmg, 'aoe');
        });
        if (wn.evo) { // 地獄の人工太陽：熔化非精英小怪（上限 12）
          var meltN = 0;
          for (var mi2 = enemies.length - 1; mi2 >= 0 && meltN < 12; mi2--) {
            var me3 = enemies[mi2];
            if (me3.dead || me3.isBoss || me3.elite) continue;
            var mdx3 = me3.x - wn.x, mdy3 = me3.y - wn.y;
            if (mdx3*mdx3 + mdy3*mdy3 < (wn.r + me3.r) * (wn.r + me3.r)) { spawnParticles(me3.x, me3.y, '#a0ff8f', 10, 2, 5); killEnemy(me3); meltN++; }
          }
        }
        zones.push({ x:wn.x, y:wn.y, r:wn.zr || 50, t:300, tick:0, dmg:wn.zd });
        warnings.splice(ci, 1);
      }
    } else if (wn.keystone) { // 要石天降
      if (wn.t <= 0) {
        dropKeystone(wn.x, wn.y, wn.r, wn.dmg);
        warnings.splice(ci, 1);
      }
    } else if (wn.t <= 0) {
      if (wn.comet) { // 特性·陨铁：命中的落点计数
        var chit = false;
        for (var qc = 0; qc < enemies.length; qc++) {
          var qee = enemies[qc];
          if (qee.dead) continue;
          var qdx = qee.x - wn.x, qdy = qee.y - wn.y;
          if (qdx*qdx + qdy*qdy < (wn.r + qee.r) * (wn.r + qee.r)) { chit = true; break; }
        }
        if (chit) bumpTrait('comet', 1);
      }
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
  if (pendingLevels > 0 && gameState === 'playing') { enterLevelUp(); return; }

  // ── 特效 ──
  updateFx();
}
var spawnTimer = 0;
function updateFx() {
  for (var i = particles.length - 1; i >= 0; i--) { var p = particles[i]; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
  for (var f = floatingTexts.length - 1; f >= 0; f--) { var ft = floatingTexts[f]; ft.y += ft.vy*dt; ft.life -= dt; if (ft.life <= 0) floatingTexts.splice(f, 1); }
  for (var bm = beams.length - 1; bm >= 0; bm--) { beams[bm].life -= dt; if (beams[bm].life <= 0) beams.splice(bm, 1); }
  for (var rg = rings.length - 1; rg >= 0; rg--) { var r2 = rings[rg]; r2.r += (r2.maxR - 10) / r2.maxLife * dt; r2.life -= dt; if (r2.life <= 0) rings.splice(rg, 1); }
  for (var sl3 = slashes.length - 1; sl3 >= 0; sl3--) { slashes[sl3].life -= dt; if (slashes[sl3].life <= 0) slashes.splice(sl3, 1); }
  // 陨石 / 要石下落演出
  for (var fli = fallers.length - 1; fli >= 0; fli--) {
    var fl = fallers[fli];
    fl.t -= dt;
    if (fl.t <= 0) { fallers.splice(fli, 1); continue; }
    var prF = 1 - fl.t / fl.maxT;
    var back = 420 * (1 - prF * prF);
    if (fl.kind === 'meteor') {
      fl.x = fl.tx + (fl.side || 1) * back; // 45° 直线加速砸向落点
      fl.y = fl.ty - back;
      spawnParticles(fl.x, fl.y, '#ff8c50', 1, 2, 4);
      if (frameCount % 2 === 0) spawnParticles(fl.x + (fl.side || 1) * 12, fl.y - 12, '#ffd970', 1, 1, 3);
      if (frameCount % 2 === 0) spawnParticles(fl.x + (fl.side || 1) * 24, fl.y - 24, '#8a5a3a', 1, 2, 3);
    } else {
      fl.y = fl.ty - back;
      if (frameCount % 4 === 0) spawnParticles(fl.x + (Math.random()-0.5)*12, fl.y - 10, '#d8c090', 1, 1, 3);
    }
  }
  for (var dp3 = dmgPops.length - 1; dp3 >= 0; dp3--) { var pp = dmgPops[dp3]; pp.y += pp.vy * dt; pp.life -= dt; if (pp.life <= 0) { dmgPops.splice(dp3, 1); dmgPopPool.push(pp); } }
  if (bossBannerT > 0) { bossBannerT -= dt; if (bossBannerT <= 0) document.getElementById('bossBanner').classList.remove('show'); }
  if (spellCardT > 0) { spellCardT -= dt; if (spellCardT <= 0) { var sc3 = document.getElementById('spellCard'); if (sc3) sc3.classList.remove('show'); } }
  if (eventBannerT > 0) { eventBannerT -= dt; if (eventBannerT <= 0) { var eb8 = document.getElementById('eventBanner'); if (eb8) eb8.classList.remove('show'); } }
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
// 程序化魔法阵（Boss 入场 / 标题背景装饰）：双环 + 刻度 + 六芒星
function drawMagicCircle(x, y, r, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.save();
  ctx.rotate(frameCount * 0.02);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI*2); ctx.stroke();
  for (var i = 0; i < 12; i++) { // 符文刻度
    var a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
    ctx.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.rotate(-frameCount * 0.013);
  ctx.beginPath(); // 六芒星
  for (var i2 = 0; i2 < 6; i2++) {
    var a2 = (i2 / 6) * Math.PI * 2 - Math.PI / 2;
    var px = Math.cos(a2) * r * 0.6, py = Math.sin(a2) * r * 0.6;
    if (i2 === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}
function drawStarShape(cx, cy, r, g) {
  g = g || ctx;
  g.beginPath();
  for (var i = 0; i < 5; i++) {
    var outer = (i*4*Math.PI)/5 - Math.PI/2;
    var inner = outer + (2*Math.PI)/10;
    if (i===0) g.moveTo(cx+Math.cos(outer)*r, cy+Math.sin(outer)*r);
    else g.lineTo(cx+Math.cos(outer)*r, cy+Math.sin(outer)*r);
    g.lineTo(cx+Math.cos(inner)*r*0.4, cy+Math.sin(inner)*r*0.4);
  }
  g.closePath(); g.fill();
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
  var bgNow = assets.bgs ? assets.bgs[bgIndex] : null;
  if (bgNow || bgPrev) {
    if (bgPrev) drawBgLayer(bgPrev, camX, camY, 1);
    if (bgNow) drawBgLayer(bgNow, camX, camY, bgPrev ? Math.min(1, 1 - bgFadeT / 72) : 1);
    ctx.fillStyle = 'rgba(12,9,20,0.62)'; ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, W, H);
  }
  drawStars(camX, camY);
  // Boss 符卡战氛围色罩（只罩背景，不遮单位）
  if (boss && !boss.dead && gameState === 'playing') {
    ctx.globalAlpha = 0.06 + Math.min(3, boss.cardIdx) * 0.02;
    ctx.fillStyle = BOSS_DEFS[boss.bossIdx].aura;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

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
    if (wn.laserH || wn.laserV) { // 十字激光预警（全屏线）
      ctx.strokeStyle = 'rgba(255,60,60,' + (Math.floor(wn.t / 5) % 2 === 0 ? 0.5 : 0.2) + ')';
      ctx.lineWidth = 22;
      ctx.beginPath();
      if (wn.laserH) { var hy3 = sy(wn.y); ctx.moveTo(0, hy3); ctx.lineTo(W, hy3); }
      else { var vx4 = sx(wn.x); ctx.moveTo(vx4, 0); ctx.lineTo(vx4, H); }
      ctx.stroke();
      continue;
    }
    if (wn.gungnir) { // 冈格尼尔：切线激光预警
      var wtx = wn.px + Math.cos(wn.ang) * wn.R, wty = wn.py + Math.sin(wn.ang) * wn.R;
      var wdx = -Math.sin(wn.ang), wdy = Math.cos(wn.ang);
      var wL = 1400;
      ctx.strokeStyle = 'rgba(255,107,138,' + (Math.floor(wn.t / 5) % 2 === 0 ? 0.55 : 0.18) + ')';
      ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx(wtx - wdx * wL), sy(wty - wdy * wL)); ctx.lineTo(sx(wtx + wdx * wL), sy(wty + wdy * wL)); ctx.stroke();
      ctx.lineCap = 'butt';
      continue;
    }
    if (wn.keystone) { // 要石天降预警
      ctx.strokeStyle = 'rgba(216,192,144,' + (Math.floor(wn.t / 5) % 2 === 0 ? 0.85 : 0.35) + ')';
      ctx.setLineDash([10, 8]); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(px2, py2, wn.r, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(216,192,144,0.95)';
      ctx.beginPath(); ctx.arc(px2, py2 - 240 * (wn.t / 50), 18, 0, Math.PI*2); ctx.fill();
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
  // 陨石 / 要石 下落
  for (var fI = 0; fI < fallers.length; fI++) {
    var fl2 = fallers[fI];
    var fimg = fl2.kind === 'meteor' ? spr.yunshi : spr.yaoshi;
    var fx2 = sx(fl2.x), fy2 = sy(fl2.y);
    if (fl2.kind === 'meteor') { // 45° 尾迹
      var tdx = (fl2.side || 1) * 0.7071, tdy = -0.7071;
      var txe = fx2 + tdx * 96, tye = fy2 + tdy * 96;
      var tg = ctx.createLinearGradient(fx2, fy2, txe, tye);
      tg.addColorStop(0, 'rgba(255,200,90,0.75)');
      tg.addColorStop(0.5, 'rgba(255,120,50,0.32)');
      tg.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.strokeStyle = tg; ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx2, fy2); ctx.lineTo(txe, tye); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (fimg) {
      ctx.save();
      ctx.translate(fx2, fy2);
      ctx.rotate(fl2.rot);
      ctx.drawImage(fimg, -fimg.width/2, -fimg.height/2);
      ctx.restore();
    } else {
      ctx.fillStyle = fl2.kind === 'meteor' ? '#8a5a3a' : '#b8a888';
      ctx.beginPath(); ctx.arc(fx2, fy2, 16, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,140,60,0.45)';
      ctx.beginPath(); ctx.arc(fx2, fy2 - 12, 22, 0, Math.PI*2); ctx.fill();
    }
  }
  // 魔炮蓄力演出（瞄准虚线 + 枪口光球）
  for (var wcI = 0; wcI < player.weapons.length; wcI++) {
    var wcS = player.weapons[wcI];
    if (wcS.id !== 'spark' || !wcS.sp || wcS.sp.phase !== 'charge') continue;
    var cAng = wcS.sp.ang;
    var cX = sx(player.x), cY = sy(player.y);
    var cMax = wcS.evoed ? 48 : (WPN.spark.charge || 36);
    var cProg = 1 - wcS.sp.t / cMax;
    ctx.save();
    ctx.globalAlpha = 0.35 + cProg * 0.5;
    ctx.strokeStyle = '#ffe8b0'; ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(cX, cY); ctx.lineTo(cX + Math.cos(cAng) * 620, cY + Math.sin(cAng) * 620); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.6 + cProg * 0.35;
    ctx.fillStyle = '#fff2c0';
    ctx.beginPath(); ctx.arc(cX, cY, 8 + cProg * 16, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // 毒坑
  for (var ppD = 0; ppD < poisonPits.length; ppD++) {
    var pitD = poisonPits[ppD];
    if (!onScreen(pitD.x, pitD.y, 160)) continue;
    var pitX = sx(pitD.x), pitY = sy(pitD.y);
    var pitFade = Math.min(1, pitD.t / 60);
    ctx.globalAlpha = 0.32 * pitFade;
    ctx.fillStyle = '#4a1a72';
    ctx.beginPath(); ctx.arc(pitX, pitY, pitD.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.6 * pitFade;
    ctx.strokeStyle = '#9b5adf';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pitX, pitY, pitD.r * (0.88 + Math.sin(frameCount*0.07 + ppD) * 0.05), 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 核污染区（P1 核反应堆）
  for (var znD = 0; znD < zones.length; znD++) {
    var zn2 = zones[znD];
    var zx2 = sx(zn2.x), zy2 = sy(zn2.y);
    var zFade = Math.min(1, zn2.t / 40);
    ctx.globalAlpha = 0.20 * zFade; ctx.fillStyle = '#7bd94a';
    ctx.beginPath(); ctx.arc(zx2, zy2, zn2.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.5 * zFade; ctx.strokeStyle = '#a0ff8f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(zx2, zy2, zn2.r * (0.92 + Math.sin(frameCount*0.1 + znD)*0.03), 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.6 * zFade; ctx.fillStyle = '#d8ffc0';
    ctx.font = 'bold ' + Math.max(16, Math.round(zn2.r * 0.35)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☢', zx2, zy2);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // 敌人
  for (var ei = 0; ei < enemies.length; ei++) {
    var e = enemies[ei];
    if (!onScreen(e.x, e.y, 130)) continue;
    // ── Boss 专属绘制 ──
    if (e.isBoss) {
      var bdef = BOSS_DEFS[e.bossIdx];
      var bimg = spr[bdef.spr];
      var bex = sx(e.x), bey = sy(e.y) + Math.sin(frameCount * 0.05) * 5;
      var lastCard = e.cardIdx >= bdef.cards.length - 1;
      // 入场：旋转魔法阵 + 暗幕
      if (e.bossIntroT > 0) {
        var prog = 1 - e.bossIntroT / 150;
        drawMagicCircle(bex, bey, e.r + 70 + (150 - e.bossIntroT) * 0.8, bdef.aura, 0.35 + prog * 0.3);
      }
      // 切卡/入场无敌期闪烁
      if (e.bossInvT > 0 && Math.floor(frameCount / 5) % 2 === 0) ctx.globalAlpha = 0.45;
      ctx.globalAlpha = (e.bossInvT > 0 && Math.floor(frameCount / 5) % 2 === 0 ? 0.35 : 1) * (0.28 + Math.sin(frameCount * 0.12) * 0.1);
      ctx.fillStyle = lastCard ? '#ff2222' : bdef.aura;
      ctx.beginPath(); ctx.arc(bex, bey, e.r + 30, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = e.bossInvT > 0 && Math.floor(frameCount / 5) % 2 === 0 ? 0.45 : 1;
      ctx.save();
      ctx.translate(bex, bey);
      if (e.x < player.x) ctx.scale(-1, 1);
      if (bimg) ctx.drawImage(bimg, -95, -95, 190, 190);
      else if (spr.elite) ctx.drawImage(spr.elite, -85, -85, 170, 170);
      else { ctx.fillStyle = bdef.aura; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
      ctx.globalAlpha = 1;
      // 四重存在：四个旋转分身（纯视觉弹幕源）
      if (bdef.cards[e.cardIdx] && bdef.cards[e.cardIdx].pattern === 'quad' && bimg) {
        for (var q3 = 0; q3 < 4; q3++) {
          var qa3 = (q3 / 4) * Math.PI * 2 + (e.cloneAng || 0);
          var qx3 = sx(e.x + Math.cos(qa3) * 130), qy3 = sy(e.y + Math.sin(qa3) * 130);
          ctx.globalAlpha = 0.45 + Math.sin(frameCount * 0.15 + q3) * 0.15;
          ctx.save(); ctx.translate(qx3, qy3);
          if (qx3 < sx(player.x)) ctx.scale(-1, 1);
          ctx.drawImage(bimg, -55, -55, 110, 110);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      if (e.hitFlash > 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bex, bey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
      continue;
    }
    var img = spr[ETYPE[e.type].spr];
    var bobY = (e.type === 'mogu' || e.type === 'split' || e.type === 'mini' || e.type === 'poison') ? 0 : Math.sin(frameCount * 0.08 + e.wing) * 3;
    var ex = sx(e.x), ey = sy(e.y) + bobY;
    ctx.save();
    ctx.translate(ex, ey);
    if ((e.type === 'fairy' || e.type === 'shieldf' || e.type === 'boar') && e.x < player.x) ctx.scale(-1, 1); // 琪露诺原图朝左
    if (e.elite) {
      // 词缀光环：颜色 = 词缀色（多词缀叠加环）
      if (e.affixes) {
        for (var af = 0; af < e.affixes.length; af++) {
          ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.1 + af * 2) * 0.1;
          ctx.fillStyle = AFFIX[e.affixes[af]].c;
          ctx.beginPath(); ctx.arc(0, 0, e.r + 10 + af * 7, 0, Math.PI*2); ctx.fill();
        }
      } else {
        ctx.globalAlpha = 0.25 + Math.sin(frameCount * 0.1) * 0.08;
        ctx.fillStyle = '#f0c060';
        ctx.beginPath(); ctx.arc(0, 0, e.r + 14, 0, Math.PI*2); ctx.fill();
      }
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
    // 魂蝶引信闪烁
    if (e.type === 'butterfly' && e.fuse > 0 && Math.floor(frameCount / 4) % 2 === 0) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, e.r + 4, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.frozen > 0 || freezeAll > 0) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    else if (e.slowT > 0) { ctx.globalAlpha = 0.2; ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.stun > 0) { // 眩晕标记
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffe8b0'; ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✦', ex, ey - e.r - 14);
      ctx.globalAlpha = 1;
    }
    if (e.mark > 0) { // 魔炮标记：死亡多掉 P 点
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ex, ey - e.r - 16, 6, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(ex, ey - e.r - 16, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.curse > 0) { // 破魔针咒印
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#c08fff'; ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('咒', ex - e.r - 12, ey - 8);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif';
      ctx.fillText(String(e.curse), ex - e.r - 12, ey + 3);
      ctx.globalAlpha = 1;
    }
    if (e.chill > 0) { // 冻结光环叠层
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#8fd8ff'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('❄' + e.chill, ex + e.r + 13, ey - 8);
      ctx.globalAlpha = 1;
    }
    if (e.elite) {
      var bw2 = 70;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ex - bw2/2, ey - e.r - 18, bw2, 6);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(ex - bw2/2, ey - e.r - 18, bw2 * Math.max(0, e.hp / e.maxHp), 6);
      // 词缀名标签
      if (e.affixes && e.affixes.length) {
        var names = [];
        for (var af2 = 0; af2 < e.affixes.length; af2++) names.push(AFFIX[e.affixes[af2]].n);
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = AFFIX[e.affixes[0]].c;
        ctx.fillText('『' + names.join('·') + '』', ex, ey - e.r - 24);
      }
    }
    // 灼烧/麻痹状态视觉
    if (e.burn > 0) { ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.3) * 0.15; ctx.fillStyle = '#ff8c50'; ctx.beginPath(); ctx.arc(ex, ey - e.r * 0.3, e.r * 0.7, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.shock > 0 && Math.floor(frameCount / 3) % 2 === 0) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#aee8ff'; ctx.beginPath(); ctx.arc(ex, ey, e.r + 3, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
  }
  // 环绕星 / 银河星环（超进化）
  var ow = hasWeapon('orbit');
  if (ow) {
    var oc = WPN.orbit, ol = ow.lv - 1;
    var on2 = ow.evoed ? 8 : oc.n[ol], orr2 = ow.evoed ? 112 : oc.or[ol], orad = ow.evoed ? 13 : 9;
    for (var oi = 0; oi < on2; oi++) {
      var oa = ow.ang + (oi / on2) * Math.PI * 2;
      var ox2 = sx(player.x + Math.cos(oa) * orr2), oy2 = sy(player.y + Math.sin(oa) * orr2);
      ctx.globalAlpha = 0.3; ctx.fillStyle = ow.evoed ? '#8fd8ff' : '#ffd700';
      ctx.beginPath(); ctx.arc(ox2, oy2, orad + 4, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = ow.evoed ? '#8fd8ff' : '#ffd700'; drawStarShape(ox2, oy2, orad);
      ctx.fillStyle = '#fff'; drawStarShape(ox2, oy2, orad * 0.45);
    }
  }
  // 阴阳玉 / 封魔玉（八卦玉贴图）
  var yyW = hasWeapon('yinyang');
  var yimg = (yyW && yyW.evoed) ? spr.baguayuL : spr.baguayu;
  for (var yi = 0; yi < yyBalls.length; yi++) {
    var yb = yyBalls[yi];
    var yx = sx(yb.x), yy = sy(yb.y);
    ctx.globalAlpha = 0.32; ctx.fillStyle = (yyW && yyW.evoed) ? '#8fd8ff' : '#b89fff';
    ctx.beginPath(); ctx.arc(yx, yy, yb.r + 6, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    if (yimg) {
      var ysz = yb.r * 2.9;
      ctx.save();
      ctx.translate(yx, yy);
      ctx.rotate(frameCount * 0.04 + yi * 1.7);
      var yw = yimg.width * (ysz / Math.max(yimg.width, yimg.height));
      var yh = yimg.height * (ysz / Math.max(yimg.width, yimg.height));
      ctx.drawImage(yimg, -yw/2, -yh/2, yw, yh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#efe8fa'; ctx.beginPath(); ctx.arc(yx, yy, yb.r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5b4a8a'; ctx.beginPath(); ctx.arc(yx, yy, yb.r * 0.45, 0, Math.PI*2); ctx.fill();
    }
  }
  // 召唤人偶（上海&蓬莱）：普通小蓬莱 / 超进化大蓬莱
  for (var dI2 = 0; dI2 < dolls.length; dI2++) {
    var dl2 = dolls[dI2];
    var shW = hasWeapon('shanghai');
    var isEvoDoll = !!(shW && shW.evoed);
    var dollR = isEvoDoll ? 30 : 14;
    var dx2 = sx(dl2.x), dy2 = sy(dl2.y);
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffb2df';
    ctx.beginPath(); ctx.arc(dx2, dy2, dollR + 8, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    var dimg = isEvoDoll ? spr.penglai : spr.penglaiS;
    if (dimg) {
      var bobD = Math.sin(frameCount * 0.08 + 1) * (isEvoDoll ? 4 : 2);
      ctx.save();
      ctx.translate(dx2, dy2 + bobD);
      if (dl2.x < player.x) ctx.scale(-1, 1);
      ctx.drawImage(dimg, -dimg.width/2, -dimg.height/2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#f6e8ff';
      ctx.beginPath(); ctx.arc(dx2, dy2, dollR, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#b89fff';
      ctx.beginPath(); ctx.arc(dx2, dy2, dollR * 0.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(dx2 - dollR * 0.3, dy2 - dollR * 0.2, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx2 + dollR * 0.3, dy2 - dollR * 0.2, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  // 八云橙（辅助召唤物）：环绕跟随
  var cwD = hasWeapon('chen');
  if (cwD && spr.chen) {
    var cAng = frameCount * 0.02;
    var cpx2 = sx(player.x + Math.cos(cAng) * 46), cpy2 = sy(player.y + Math.sin(cAng) * 46 - 16 + Math.sin(frameCount * 0.1) * 3);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffd970';
    ctx.beginPath(); ctx.arc(cpx2, cpy2, 26, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(cpx2, cpy2);
    if (Math.cos(cAng) < 0) ctx.scale(-1, 1);
    ctx.drawImage(spr.chen, -spr.chen.width/2, -spr.chen.height/2);
    ctx.restore();
  }
  // 夢想封印光团（与魔炮同系配色：加法发光三层 + 枪口弧光 + 流动光块）
  for (var obD = 0; obD < orbs.length; obD++) {
    var ob2 = orbs[obD];
    var ox2 = sx(ob2.x), oy2 = sy(ob2.y);
    var oPulse = 1 + Math.sin(frameCount * 0.22) * 0.10;
    var oR = ob2.r * oPulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var og1 = ctx.createRadialGradient(ox2, oy2, oR * 0.2, ox2, oy2, oR + 34);
    og1.addColorStop(0, 'rgba(255,190,120,0.30)');
    og1.addColorStop(0.35, 'rgba(160,140,255,0.28)');
    og1.addColorStop(0.7, 'rgba(140,200,255,0.18)');
    og1.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = og1;
    ctx.beginPath(); ctx.arc(ox2, oy2, oR + 34, 0, Math.PI*2); ctx.fill();
    var og2 = ctx.createRadialGradient(ox2, oy2, 0, ox2, oy2, oR * 0.72);
    og2.addColorStop(0, 'rgba(255,255,255,0.95)');
    og2.addColorStop(0.55, 'rgba(200,240,255,0.6)');
    og2.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.fillStyle = og2;
    ctx.beginPath(); ctx.arc(ox2, oy2, oR * 0.72, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(ox2, oy2, oR * 0.30, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(220,240,255,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ox2, oy2, oR * 0.78, frameCount * 0.08, frameCount * 0.08 + 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox2, oy2, oR * 1.02, -frameCount * 0.06, -frameCount * 0.06 + 1.1); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (var obi2 = 0; obi2 < 3; obi2++) {
      var oba2 = frameCount * 0.07 + obi2 * 2.09;
      ctx.fillRect(ox2 + Math.cos(oba2) * oR * 0.52 - 5, oy2 + Math.sin(oba2) * oR * 0.52 - 5, 10, 10);
    }
    ctx.restore();
  }
  // 白魂蝶
  for (var petD = 0; petD < pets.length; petD++) {
    var pet2 = pets[petD];
    var px2 = sx(pet2.x), py2 = sy(pet2.y) + Math.sin(frameCount * 0.2 + petD) * 3;
    if (spr.soulfly) {
      ctx.save();
      ctx.translate(px2, py2);
      if (pet2.vx < 0) ctx.scale(-1, 1);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(spr.soulfly, -spr.soulfly.width/2, -spr.soulfly.height/2);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px2, py2, 10, 0, Math.PI*2); ctx.fill();
    }
  }
  // 宫古芳香（僵尸召唤）
  var ywD = hasWeapon('yoshika');
  if (ywD && ywD.yo && spr.fangxiang) {
    var YD = ywD.yo;
    var ysz = ywD.evoed ? 1.4 : 1;
    var ypx = sx(YD.x), ypy = sy(YD.y) + Math.sin(frameCount * 0.09) * 2;
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#c9a0ff';
    ctx.beginPath(); ctx.arc(ypx, ypy, 20 * ysz + 8, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(ypx, ypy);
    if (YD.x > player.x) ctx.scale(-1, 1);
    ctx.drawImage(spr.fangxiang, -spr.fangxiang.width / 2 * ysz, -spr.fangxiang.height / 2 * ysz, spr.fangxiang.width * ysz, spr.fangxiang.height * ysz);
    ctx.restore();
  }
  // 银色飞刀：展示阶段悬浮刀
  var kwD = hasWeapon('knife');
  if (kwD && !kwD.evoed && kwD.kf && kwD.kf.t > 0) {
    var KS2 = kwD.kf;
    var kPerp = KS2.ang + Math.PI / 2;
    for (var ksi = 0; ksi < KS2.left; ksi++) {
      var kOff = (ksi - (KS2.left - 1) / 2) * 13 * KS2.side;
      var kbx = player.x + Math.cos(kPerp) * (30 * KS2.side + kOff) - Math.cos(KS2.ang) * 14;
      var kby = player.y + Math.sin(kPerp) * (30 * KS2.side + kOff) - Math.sin(KS2.ang) * 14;
      var ksx = sx(kbx), ksy = sy(kby + Math.sin(frameCount * 0.15 + ksi) * 2);
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#bfe8ff';
      ctx.beginPath(); ctx.arc(ksx, ksy, 10, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      drawKnifeSprite(ksx, ksy, KS2.ang, 34);
    }
  }
  // 银刃八重（环敌生成 → 朝内穿刺）
  for (var kbD = 0; kbD < knifeOrbs.length; kbD++) {
    var KB2 = knifeOrbs[kbD];
    var kRot2 = (KB2.phase === 'ready') ? (KB2.ang + Math.PI) : Math.atan2(KB2.vy, KB2.vx);
    ctx.globalAlpha = KB2.phase === 'ready' ? 0.85 : 0.95;
    drawKnifeSprite(sx(KB2.x), sy(KB2.y), kRot2, 38);
    ctx.globalAlpha = 1;
  }
  // 血雾领域（遗物）
  if (relicMist) {
    ctx.globalAlpha = 0.16 + Math.sin(frameCount * 0.08) * 0.05;
    ctx.fillStyle = '#c02040';
    ctx.beginPath(); ctx.arc(sx(relicMist.x), sy(relicMist.y), relicMist.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 红色冥界：裂隙漩涡
  if (nether) {
    var nX = sx(nether.x), nY = sy(nether.y);
    var nGrow = Math.min(1, (nether.born || 0) / 20);
    var nR = nether.r * (0.35 + 0.65 * nGrow);
    var nPulse = 0.10 + Math.sin(frameCount * 0.06) * 0.03;
    var nExo = !!nether.slow;
    var ng = ctx.createRadialGradient(nX, nY, nR * 0.15, nX, nY, nR);
    ng.addColorStop(0, 'rgba(80,6,30,0.02)');
    ng.addColorStop(0.65, 'rgba(140,14,48,' + nPulse + ')');
    ng.addColorStop(1, (nExo ? 'rgba(150,40,140,' : 'rgba(180,20,60,') + (nPulse + 0.22) + ')');
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(nX, nY, nR, 0, Math.PI*2); ctx.fill();
    // 波浪边缘
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = nExo ? '#c060d0' : '#d03060';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    var nPts = 36;
    for (var wi2 = 0; wi2 <= nPts; wi2++) {
      var wa = (wi2 / nPts) * Math.PI * 2;
      var wr = nR * (1 + Math.sin(wa * 6 + frameCount * 0.05) * 0.035);
      var wx2 = nX + Math.cos(wa) * wr, wy2 = nY + Math.sin(wa) * wr;
      if (wi2 === 0) ctx.moveTo(wx2, wy2); else ctx.lineTo(wx2, wy2);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    // 旋转断弧
    for (var arI = 0; arI < 3; arI++) {
      ctx.save();
      ctx.globalAlpha = 0.32 - arI * 0.07;
      ctx.strokeStyle = arI === 1 ? '#ff8fa8' : (nExo ? '#e0a0ff' : '#ff6b8a');
      ctx.lineWidth = 5 - arI * 1.2;
      ctx.translate(nX, nY);
      ctx.rotate(frameCount * (0.012 + arI * 0.008) * (arI % 2 ? -1 : 1));
      for (var sgm = 0; sgm < 3; sgm++) {
        var sa = (sgm / 3) * Math.PI * 2 + arI * 1.1;
        ctx.beginPath();
        ctx.arc(0, 0, nR * (0.78 - arI * 0.16), sa, sa + 1.05);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 上升火星
    if (frameCount % 6 === 0 && particles.length < 380) {
      var ea = Math.random() * Math.PI * 2, er = Math.random() * nR;
      particles.push({ x:nether.x + Math.cos(ea)*er, y:nether.y + Math.sin(ea)*er, vx:(Math.random()-0.5)*0.4, vy:-1.2 - Math.random(), life:26, maxLife:26, color:'#ff5b7a', r:2 });
    }
    ctx.globalAlpha = 1;
  }
  // 近身斩击：剑气贴图（单弧 / X 交叉），无额外辉光层
  for (var sI = 0; sI < slashes.length; sI++) {
    var sl2 = slashes[sI];
    var slA = sl2.life / sl2.maxLife;
    var spreads = sl2.spread ? [-sl2.spread, sl2.spread] : [0];
    if (sl2.tint === 'scythe' && spr.liandao) { // 死神镰刀：镰刀贴图扫过
      var scS = (sl2.range * 1.7) / Math.max(spr.liandao.width, spr.liandao.height);
      var sw2 = spr.liandao.width * scS, sh2 = spr.liandao.height * scS;
      for (var sj2 = 0; sj2 < spreads.length; sj2++) {
        ctx.save();
        ctx.translate(sx(sl2.x), sy(sl2.y));
        ctx.rotate(sl2.ang + spreads[sj2] - 0.6 + (1 - slA) * 0.6);
        ctx.globalAlpha = slA * 0.95;
        ctx.translate(sw2 * 0.18, 0);
        ctx.drawImage(spr.liandao, -sw2 / 2, -sh2 / 2, sw2, sh2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    var dimg = sl2.tint === 'gold' ? spr.jianqiGold : sl2.tint === 'silver' ? spr.jianqiSilver : sl2.tint === 'violet' ? spr.jianqiViolet : sl2.tint === 'teal' ? spr.jianqiTeal : null;
    if (dimg) {
      var scJ = (sl2.range * 1.5) / dimg.width;
      var dw = dimg.width * scJ, dh = dimg.height * scJ;
      for (var sj = 0; sj < spreads.length; sj++) {
        ctx.save();
        ctx.translate(sx(sl2.x), sy(sl2.y));
        ctx.rotate(sl2.ang + spreads[sj]);
        ctx.globalAlpha = slA * 0.95;
        ctx.translate(dw * 0.26, 0);
        ctx.scale(-1, 1); // 修正贴图朝向（原图方向相反）
        ctx.drawImage(dimg, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }
    } else {
      // 无贴图回退：单弧
      ctx.save();
      ctx.translate(sx(sl2.x), sy(sl2.y));
      ctx.rotate(sl2.ang);
      ctx.globalAlpha = slA * 0.8;
      ctx.strokeStyle = sl2.color; ctx.lineWidth = 4 + 8 * slA; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, sl2.range * 0.82, -0.95, 0.95); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
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
    if (player.shield > 0) { // 护盾光环
      ctx.globalAlpha = 0.22 + 0.35 * (player.shield / player.shieldMax);
      ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(player.x), sy(player.y), player.r + 12, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // 魔炮光束 / 激光扫射
  for (var bi2 = 0; bi2 < beams.length; bi2++) {
    var bm = beams[bi2];
    var a = bm.life / bm.maxLife;
    if (bm.line) { // 切线激光 / 追踪激光（线段）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.95;
      ctx.strokeStyle = bm.color || '#ff9db8';
      ctx.lineWidth = bm.w || 16;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx(bm.x1), sy(bm.y1)); ctx.lineTo(sx(bm.x2), sy(bm.y2)); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = (bm.w || 16) * 0.32;
      ctx.beginPath(); ctx.moveTo(sx(bm.x1), sy(bm.y1)); ctx.lineTo(sx(bm.x2), sy(bm.y2)); ctx.stroke();
      ctx.restore();
      continue;
    }
    if (bm.sparkPulse || bm.sparkBeam) { // 魔炮：多层柔边光束 + 流动光块 + 枪口弧光
      var isSus = !!bm.sparkBeam;
      var aP = isSus ? Math.min(1, bm.life / 30) : (bm.life / bm.maxLife);
      var wP = (bm.w || 60) * (isSus ? (1 + Math.sin(frameCount * 0.15) * 0.06) : (1 + (1 - bm.life / bm.maxLife) * 0.6));
      var Lz = 1500;
      ctx.save();
      ctx.translate(sx(bm.x), sy(bm.y));
      ctx.rotate(bm.ang);
      ctx.globalCompositeOperation = 'lighter';
      var g1 = ctx.createLinearGradient(0, -wP * 0.95, 0, wP * 0.95);
      g1.addColorStop(0, 'rgba(140,200,255,0)');
      g1.addColorStop(0.35, 'rgba(160,140,255,' + (0.26 * aP) + ')');
      g1.addColorStop(0.5, 'rgba(255,190,120,' + (0.32 * aP) + ')');
      g1.addColorStop(0.65, 'rgba(160,140,255,' + (0.26 * aP) + ')');
      g1.addColorStop(1, 'rgba(140,200,255,0)');
      ctx.fillStyle = g1; ctx.fillRect(0, -wP * 0.95, Lz, wP * 1.9);
      var g2 = ctx.createLinearGradient(0, -wP * 0.55, 0, wP * 0.55);
      g2.addColorStop(0, 'rgba(120,180,255,0)');
      g2.addColorStop(0.5, 'rgba(200,240,255,' + (0.55 * aP) + ')');
      g2.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = g2; ctx.fillRect(0, -wP * 0.55, Lz, wP * 1.1);
      var g3 = ctx.createLinearGradient(0, -wP * 0.22, 0, wP * 0.22);
      g3.addColorStop(0, 'rgba(255,255,255,0)');
      g3.addColorStop(0.5, 'rgba(255,255,255,' + (0.95 * aP) + ')');
      g3.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g3; ctx.fillRect(0, -wP * 0.22, Lz, wP * 0.44);
      for (var bl = 0; bl < 4; bl++) { // 流动光块
        var bx = ((frameCount * (isSus ? 7 : 14) + bl * 340) % (Lz + 200)) - 120;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * aP) + ')';
        ctx.fillRect(bx, -wP * 0.16, 70, wP * 0.32);
      }
      ctx.globalAlpha = aP * 0.85; // 枪口半月弧光
      ctx.strokeStyle = 'rgba(220,240,255,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, wP * 0.75, -1.25, 1.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, wP * 1.05, -0.9, 0.9); ctx.stroke();
      ctx.globalAlpha = 1;
      if (isSus) { // 锁定目标爆闪（局部坐标）
        var tdx2 = bm.tx - bm.x, tdy2 = bm.ty - bm.y;
        var tca = Math.cos(-bm.ang), tsa = Math.sin(-bm.ang);
        var tX = tdx2 * tca - tdy2 * tsa, tY = tdx2 * tsa + tdy2 * tca;
        if (Math.abs(tX) + Math.abs(tY) > 1) {
          ctx.globalAlpha = 0.55 + Math.sin(frameCount * 0.5) * 0.25;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(tX, tY, 14, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      continue;
    }
    if (bm.laserH || bm.laserV) { // 激光扫射（全屏线）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = '#ff5050';
      if (bm.laserH) { var lhy = sy(bm.y); ctx.fillRect(0, lhy - 14, W, 28); ctx.fillStyle = '#ffe0e0'; ctx.fillRect(0, lhy - 5, W, 10); }
      else { var lvx = sx(bm.x); ctx.fillRect(lvx - 14, 0, 28, H); ctx.fillStyle = '#ffe0e0'; ctx.fillRect(lvx - 5, 0, 10, H); }
      ctx.restore();
      continue;
    }
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
  // 冲击环 / 地面裂纹
  for (var ri = 0; ri < rings.length; ri++) {
    var rg2 = rings[ri];
    if (rg2.crack) {
      var cA = rg2.life / rg2.maxLife;
      var cX = sx(rg2.x), cY = sy(rg2.y);
      ctx.globalAlpha = cA * 0.8;
      ctx.strokeStyle = rg2.color; ctx.lineWidth = 2.5;
      for (var ck = 0; ck < 7; ck++) {
        var cka = (ck / 7) * Math.PI * 2 + (rg2.seed || 0);
        ctx.beginPath();
        ctx.moveTo(cX + Math.cos(cka) * rg2.r * 0.35, cY + Math.sin(cka) * rg2.r * 0.35);
        ctx.lineTo(cX + Math.cos(cka + 0.13) * rg2.r * 0.68, cY + Math.sin(cka + 0.13) * rg2.r * 0.68);
        ctx.lineTo(cX + Math.cos(cka - 0.05) * rg2.r, cY + Math.sin(cka - 0.05) * rg2.r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      continue;
    }
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
    if (bl.type === 'needle') { // 破魔针：细长针形
      ctx.save();
      ctx.translate(sx(bl.x), sy(bl.y));
      ctx.rotate(Math.atan2(bl.vy, bl.vx));
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#d8e8ff';
      ctx.fillRect(-10, -3, 20, 6);
      ctx.globalAlpha = 1; ctx.fillStyle = '#f0f6ff';
      ctx.fillRect(-10, -1.5, 20, 3);
      ctx.restore();
      continue;
    }
    // 星弹 / 螺旋弹 / 人偶弹：旋转星体 + 光晕 + 拖尾
    if (bl.type === 'knife') { // 银色飞刀（knife.png）
      var kbx2 = sx(bl.x), kby2 = sy(bl.y);
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#bfe8ff';
      ctx.beginPath(); ctx.arc(kbx2, kby2, 12, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      drawKnifeSprite(kbx2, kby2, Math.atan2(bl.vy, bl.vx), 40);
      continue;
    }
    if (bl.type === 'ofuda' && spr.yufu) { // 灵符：御符贴图
      ctx.save();
      ctx.translate(sx(bl.x), sy(bl.y));
      ctx.rotate(Math.atan2(bl.vy, bl.vx) + YUFU_ROT);
      ctx.globalAlpha = 0.25;
      ctx.drawImage(spr.yufu, -22, -22, 44, 44);
      ctx.globalAlpha = 1;
      ctx.drawImage(spr.yufu, -15, -15, 30, 30);
      ctx.restore();
      continue;
    }
    var bimg = bl.type === 'spiral' ? spr.bulletSpiral : (bl.type === 'doll' ? spr.bulletDoll : spr.bulletStar);
    var bx = sx(bl.x), by = sy(bl.y);
    if (bimg) {
      var bAng = Math.atan2(bl.vy, bl.vx);
      var bSz = (bl.r + 7) * 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var bt = 2; bt >= 1; bt--) { // 拖尾两层
        ctx.globalAlpha = 0.20 / bt;
        var ttz = bSz * (1 - bt * 0.2);
        ctx.drawImage(bimg, bx - Math.cos(bAng) * (7 * bt) - ttz / 2, by - Math.sin(bAng) * (7 * bt) - ttz / 2, ttz, ttz);
      }
      ctx.restore();
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(frameCount * 0.12 + (bl.life || 0) * 0.12);
      ctx.globalAlpha = 0.96;
      ctx.drawImage(bimg, -bSz / 2, -bSz / 2, bSz, bSz);
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }
    var col = bl.type === 'doll' ? '#ffb2df' : '#ffd700';
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
    if (eb2.shape === 'knife') { // 飞刀形弹幕
      ctx.save();
      ctx.translate(sx(eb2.x), sy(eb2.y));
      ctx.rotate(Math.atan2(eb2.vy, eb2.vx));
      ctx.globalAlpha = 0.4; ctx.fillStyle = eb2.color;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -4.5); ctx.lineTo(-4, 0); ctx.lineTo(-6, 4.5); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -1.6); ctx.lineTo(-4, 1.6); ctx.closePath(); ctx.fill();
      ctx.restore();
      continue;
    }
    if (eb2.shape === 'star') { // 星形弹幕
      ctx.save();
      ctx.translate(sx(eb2.x), sy(eb2.y));
      ctx.rotate(frameCount * 0.1 + (eb2.life || 0) * 0.02);
      ctx.globalAlpha = 0.4; ctx.fillStyle = eb2.color;
      ctx.beginPath(); ctx.arc(0, 0, eb2.r + 5, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = eb2.color;
      drawStarShape(0, 0, eb2.r + 2);
      ctx.fillStyle = '#fff'; drawStarShape(0, 0, (eb2.r + 2) * 0.45);
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
  // 虚拟摇杆（触屏）：激活时跟随手指，闲置时左下淡提示圈
  if (isTouch) {
    var jx = joy.active ? joy.bx : JOY_HOME.x;
    var jy = joy.active ? joy.by : JOY_HOME.y;
    ctx.globalAlpha = joy.active ? 0.32 : 0.14; ctx.fillStyle = '#b89fff';
    ctx.beginPath(); ctx.arc(jx, jy, JOY_HOME.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = joy.active ? 0.6 : 0.26;
    ctx.beginPath(); ctx.arc(jx + joy.dx * (JOY_HOME.r - 20), jy + joy.dy * (JOY_HOME.r - 20), 22, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 受伤红闪
  drawHUD();
  if (hurtFlash > 0) { ctx.fillStyle = 'rgba(239,68,68,' + (hurtFlash/10*0.16) + ')'; ctx.fillRect(0, 0, W, H); hurtFlash -= ddt; }
  // 死亡白闪
  if (deathFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (deathFlash/18*0.6) + ')'; ctx.fillRect(0, 0, W, H); deathFlash -= ddt; }
  // 低血脉冲：心跳红晕（35% 血以下）
  if (gameState === 'playing' && player.hp > 0 && player.hp < player.maxHp * 0.35) {
    var pulseA = 0.1 + Math.max(0, Math.sin(frameCount * 0.09)) * 0.14;
    var vg = ctx.createRadialGradient(W/2, H/2, H * 0.3, W/2, H/2, H * 0.75);
    vg.addColorStop(0, 'rgba(239,68,68,0)');
    vg.addColorStop(1, 'rgba(239,68,68,' + pulseA + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
  // 标题/选角/结算界面：中央大魔法阵装饰（overlay 透出）
  if (gameState === 'start' || gameState === 'select' || gameState === 'loading' || gameState === 'over') {
    drawMagicCircle(W / 2, H / 2, 170 + Math.sin(frameCount * 0.01) * 14, '#f0c060', 0.16);
    drawMagicCircle(W / 2, H / 2, 90 + Math.sin(frameCount * 0.015 + 2) * 8, '#b89fff', 0.12);
  }
}

// ═══════════ HUD ═══════════
function fmtTime(s) {
  var m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}
// ═══════════ HUD（绘制在 canvas 内，随画面等比缩放）═══════════
// P1 素材朝向（像素主轴实测）：knife.png 刀尖朝左下 140.97°；yufu.png 头端朝右上 −66.59°
var KNIFE_TIP_ANG = 2.4605;
var YUFU_ROT = 1.1623; // 御符朝前补偿角：rotate(θ + 1.1623)
function drawKnifeSprite(cx, cy, ang, size) {
  if (spr.knife) {
    var kw = size, kh = size * 0.75; // 原图 1448×1086
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang - KNIFE_TIP_ANG);
    ctx.drawImage(spr.knife, -kw / 2, -kh / 2, kw, kh);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-size * 0.5, -size * 0.06, size, size * 0.12);
    ctx.fillStyle = '#9db8d8';
    ctx.fillRect(-size * 0.5, -size * 0.14, size * 0.17, size * 0.28);
    ctx.restore();
  }
}
function hudRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  hudRoundRectPath(x, y, w, h, r);
}
function hudRoundRectPath(x, y, w, h, r) { // 只加路径（供 evenodd 环带裁剪）
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hudStrokeText(text, x, y, color, font, align) {
  ctx.font = font;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function drawHUD() {
  var inGame = (gameState === 'playing' || gameState === 'paused' || gameState === 'levelup' || gameState === 'relic');
  if (!inGame || !player || !player.weapons) return;
  var HS = HUD_SCALE;
  // HP 条
  var hx = 16, hy = 14, hw = Math.min(200 * HS, W * 0.3), hh = 13 * HS;
  hudRoundRect(hx, hy, hw, hh, 6 * HS);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  var hpPct = Math.max(0, Math.min(1, player.hp / player.maxHp));
  if (hpPct > 0) {
    ctx.save();
    hudRoundRect(hx, hy, hw, hh, 6 * HS); ctx.clip();
    var hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    hg.addColorStop(0, '#ef4444'); hg.addColorStop(1, '#f0c060');
    ctx.fillStyle = hg; ctx.fillRect(hx, hy, hw * hpPct, hh);
    // 渐变呼吸：亮度脉动 + 流动高光（低血加速）
    var hpLow = hpPct < 0.3;
    var hpBreath = 0.10 + Math.abs(Math.sin(frameCount * (hpLow ? 0.12 : 0.05))) * 0.12;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,235,180,' + hpBreath.toFixed(3) + ')';
    ctx.fillRect(hx, hy, hw * hpPct, hh);
    var shX0 = hx + ((frameCount * (hpLow ? 2.4 : 1.6)) % (hw * hpPct + 160)) - 80;
    var shG = ctx.createLinearGradient(shX0, 0, shX0 + 160, 0);
    shG.addColorStop(0, 'rgba(255,255,255,0)');
    shG.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    shG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shG; ctx.fillRect(shX0, hy, 160, hh);
    ctx.restore();
  }
  // 护盾外环（套在血条外：底环 + 按 shield/shieldMax 从左往右包裹）
  var fr = 4 * HS;
  var ox = hx - fr, oy = hy - fr, ow = hw + fr * 2, oh = hh + fr * 2, orr2 = 6 * HS + fr;
  hudRoundRect(ox, oy, ow, oh, orr2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  var spSh = Math.max(0, Math.min(1, player.shield / Math.max(1, player.shieldMax)));
  if (spSh > 0) {
    ctx.save();
    ctx.beginPath();
    hudRoundRectPath(ox, oy, ow, oh, orr2);
    hudRoundRectPath(hx, hy, hw, hh, 6 * HS);
    ctx.clip('evenodd');
    ctx.beginPath(); ctx.rect(ox, oy, ow * spSh, oh); ctx.clip();
    var shBreathe = 0.72 + Math.abs(Math.sin(frameCount * 0.06)) * 0.28; // 渐变呼吸
    var sg = ctx.createLinearGradient(ox, 0, ox + ow, 0);
    sg.addColorStop(0, 'rgba(77,166,255,' + (0.85 * shBreathe).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(143,216,255,' + (0.9 * shBreathe).toFixed(3) + ')');
    ctx.fillStyle = sg; ctx.fillRect(ox, oy, ow, oh);
    ctx.globalCompositeOperation = 'lighter'; // 流动光带（限制在环带∩进度内）
    var swX = ox + ((frameCount * 1.2) % (ow + 120)) - 60;
    var swG = ctx.createLinearGradient(swX, 0, swX + 120, 0);
    swG.addColorStop(0, 'rgba(180,230,255,0)');
    swG.addColorStop(0.5, 'rgba(230,250,255,' + (0.5 * shBreathe).toFixed(3) + ')');
    swG.addColorStop(1, 'rgba(180,230,255,0)');
    ctx.fillStyle = swG; ctx.fillRect(swX, oy, 120, oh);
    ctx.restore();
  }
  if (player.shield > 0) { // 呼吸辉光
    ctx.save();
    ctx.globalAlpha = 0.2 + Math.abs(Math.sin(frameCount * 0.06)) * 0.22;
    ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 1.5 * HS;
    hudRoundRect(ox, oy, ow, oh, orr2); ctx.stroke();
    ctx.restore();
  }
  if (hpPct < 0.3) { // 低血脉冲（外环外侧）
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.abs(Math.sin(frameCount * 0.09)) * 0.5;
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
    hudRoundRect(ox - 1.5, oy - 1.5, ow + 3, oh + 3, orr2 + 1.5); ctx.stroke();
    ctx.restore();
  }
  hudStrokeText(Math.max(0, Math.ceil(player.hp)) + ' / ' + player.maxHp, hx + hw / 2, hy + hh / 2, '#ffffff', 'bold ' + Math.round(9 * HS) + 'px sans-serif', 'center');
  // XP 条（下移给护盾环让位）
  var xy = hy + hh + 4 + fr, xh = 5 * HS;
  hudRoundRect(hx, xy, hw, xh, 2.5 * HS);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  var xpPct = Math.max(0, Math.min(1, player.xp / player.xpNeed));
  if (xpPct > 0) {
    ctx.save();
    hudRoundRect(hx, xy, hw, xh, 2.5 * HS); ctx.clip();
    var xg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    xg.addColorStop(0, '#8fd8ff'); xg.addColorStop(1, '#b89fff');
    ctx.fillStyle = xg; ctx.fillRect(hx, xy, hw * xpPct, xh);
    ctx.restore();
  }
  // 护盾数值 + 等级（等级动态右移避开护盾数字）
  var shTxt = '盾 ' + Math.round(player.shield) + '/' + Math.round(player.shieldMax);
  var shFont = 'bold ' + Math.round(9 * HS) + 'px sans-serif';
  var shLvX = ox + ow + 10;
  ctx.font = shFont;
  var mtS = ctx.measureText ? ctx.measureText(shTxt) : null;
  var shW = (mtS && mtS.width) ? mtS.width : 42 * HS;
  hudStrokeText(shTxt, shLvX, hy + hh / 2, '#8fd8ff', shFont);
  hudStrokeText('Lv ' + player.level, shLvX + shW + 8, hy + hh / 2, '#8fd8ff', 'bold ' + Math.round(11 * HS) + 'px sans-serif');
  // 右上计分区（右侧预留暂停键空间）
  var rx = W - 60 * HS;
  var tStr = (boss && !boss.dead ? '⚔ ' : '⏱ ') + fmtTime(gameTime) + '  💀 ' + kills;
  hudStrokeText(tStr, rx, 20 * HS, '#e0d8ec', 'bold ' + Math.round(13 * HS) + 'px sans-serif', 'right');
  hudStrokeText(String(score).padStart(6, '0') + '  HI ' + String(bestScore).padStart(6, '0'), rx, 37 * HS, '#8a7e9a', Math.round(10 * HS) + 'px sans-serif', 'right');
  // Boss 符卡条（窄逻辑宽时整组下移，避免与 HP/等级区重叠）
  if (boss && !boss.dead) {
    var def = BOSS_DEFS[boss.bossIdx], card = def.cards[boss.cardIdx];
    var start = boss.cardIdx === 0 ? boss.maxHp : boss.thresholds[boss.cardIdx - 1];
    var end2 = boss.thresholds[boss.cardIdx];
    var narrow = W < 1000;
    var yName = narrow ? 46 : 18, ySub = narrow ? 63 : 35, yBar = narrow ? 76 : 48;
    var bw = Math.min(520, W - 500 * HS);
    if (bw < 180) bw = Math.min(180, W - 40);
    var bx = (W - bw) / 2;
    hudStrokeText(def.name, W / 2, yName, '#ef4444', 'bold ' + Math.round(12 * HS) + 'px sans-serif', 'center');
    var dots = '';
    for (var d3 = 0; d3 < def.cards.length; d3++) dots += d3 < boss.cardIdx ? '✕' : (d3 === boss.cardIdx ? '●' : '○');
    hudStrokeText(card.name + '  ' + dots + '  ⏳' + Math.max(0, Math.ceil(boss.cardT / 60)) + 's' + (boss.rageStacks ? '  ⚡狂化×' + boss.rageStacks : ''), W / 2, ySub, '#ffb2b2', Math.round(11 * HS) + 'px sans-serif', 'center');
    hudRoundRect(bx, yBar, bw, 10 * HS, 5 * HS);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(239,68,68,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    var fillW = Math.max(0, (boss.hp - end2) / Math.max(1, start - end2)) * bw;
    if (fillW > 0) {
      ctx.save();
      hudRoundRect(bx + 1, yBar + 1, bw - 2, 8 * HS, 4 * HS); ctx.clip();
      var bg2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      bg2.addColorStop(0, '#7f1d1d'); bg2.addColorStop(1, '#ef4444');
      ctx.fillStyle = bg2; ctx.fillRect(bx + 1, yBar + 1, fillW - 2, 8 * HS);
      ctx.restore();
    }
  }
  ctx.textBaseline = 'alphabetic';
}

// ═══════════ 游戏流程 ═══════════
// 伪全屏（藏站点导航）+ Fullscreen API 增强（失败静默）
function tryEnterFS() {
  var el = document.documentElement;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) { try { var p = fn.call(el); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
    try { var q = screen.orientation.lock('landscape'); if (q && q.catch) q.catch(function () {}); } catch (e) {}
  }
}
function tryExitFS() {
  var fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) { try { fn.call(document); } catch (e) {} }
}
function enterIngame() {
  try { document.body.classList.add('ingame'); } catch (e) {}
  fitStage();
  tryEnterFS();
}
function exitIngame() {
  try { document.body.classList.remove('ingame'); } catch (e) {}
  tryExitFS();
  fitStage();
}
function startGame() {
  initAudio(); // 点击「确认/开始」链路里直接起播（对齐空城计的可播路径）
  resetPlayer();
  enemies = []; bullets = []; gems = []; drops = [];
  particles = []; floatingTexts = []; beams = []; rings = []; warnings = [];
  yyBalls = [];
  slashes = []; dolls = []; nether = null; fallers = [];
  orbs = []; pets = [];
  zones = []; knifeOrbs = [];
  relicMist = null; wardT = 2700; crimsonT = 5400;
  directorReset();
  gameTime = 0; kills = 0; score = 0; spawnTimer = 0;
  scoreBonus = 0; hurtFlash = 0; ebullets = []; dmgPops = [];
  boss = null; bossCount = 0; hideBossBar(); mist = null;
  bossBannerT = 0; document.getElementById('bossBanner').classList.remove('show');
  gamePaused = false; document.getElementById('pauseOverlay').classList.add('hide');
  pendingLevels = 0; freezeAll = 0; eliteWave = 0; eliteTimer = 0;
  deathFlash = 0; shakeT = 0; frameCount = 0;
  healWinFrame = 0; healWinAmt = 0; // 回血窗口随新局重置
  scBreaks = 0; spellCardT = 0; eventBannerT = 0; waveTimer = 0;
  poisonPits.length = 0;
  bgIndex = 0; bgPrev = null; bgFadeT = 0;
  var scEl = document.getElementById('spellCard');
  if (scEl) scEl.classList.remove('show');
  var evEl = document.getElementById('eventBanner');
  if (evEl) evEl.classList.remove('show');
  var rlEl = document.getElementById('relicOverlay');
  if (rlEl) rlEl.classList.add('hide');
  var tuEl = document.getElementById('tutOverlay');
  if (tuEl) tuEl.classList.add('hide');
  joy.active = false;
  gameState = 'playing';
  lastTs = performance.now(); acc = 0;
  document.getElementById('startOverlay').classList.add('hide');
  document.getElementById('lbArea').innerHTML = '';
  document.getElementById('lbArea').classList.add('hide');
  // 重置开始页文案（来自死亡结算）
  var logoReset = document.getElementById('startLogo');
  if (logoReset) logoReset.textContent = '魔理沙幸存者';
  var resReset = document.getElementById('startResult');
  if (resReset) resReset.classList.add('hide');
  enterIngame();
}
function endGame(quit) {
  gameState = 'over';
  gamePaused = false;
  var pauseOv = document.getElementById('pauseOverlay');
  if (pauseOv) pauseOv.classList.add('hide');
  if (!quit) {
    deathFlash = 18;
    spawnParticles(player.x, player.y, '#ef4444', 30, 2, 7);
    sfxBomb();
  }
  hideBossBar();
  var scEl2 = document.getElementById('spellCard');
  if (scEl2) scEl2.classList.remove('show');
  var evEl2 = document.getElementById('eventBanner');
  if (evEl2) evEl2.classList.remove('show');
  saveBest();
  var ov = document.getElementById('startOverlay');
  ov.classList.remove('hide');
  var logoEl = document.getElementById('startLogo');
  if (logoEl) logoEl.textContent = quit ? '🏳 本局已结束' : '💥 满身疮痍！';
  var bsEl = ov.querySelector('.btn-start');
  if (bsEl) bsEl.textContent = '🔄 再来一次';
  var resEl = document.getElementById('startResult');
  if (resEl) {
    resEl.innerHTML =
      '存活 <b style="color:#b89fff">' + fmtTime(gameTime) + '</b> · 击杀 <b style="color:#ef4444">' + kills + '</b> · 等级 <b style="color:#8fd8ff">Lv ' + player.level + '</b><br>' +
      '符卡击破 <b style="color:#ffd700">' + scBreaks + '</b> 张 · 得分 <b style="color:#f0c060">' + score + '</b> 分<br>' +
      '历史最高 <b style="color:#f0c060">' + bestScore + '</b> 分 · 最长存活 <b style="color:#b89fff">' + fmtTime(bestTime) + '</b>';
    resEl.classList.remove('hide');
  }
  lastFinalTime = gameTime;
  lastFinalChar = playerChar;
  try { localStorage.setItem('ms_last_char', playerChar); } catch (e) {}
  loadLB(score);
  exitIngame();
}

// ═══════════ 排行榜（独立榜单 game=survivor，graze 字段存击杀数）═══════════
var lastFinalScore = 0, lastFinalTime = 0, lastFinalChar = '';
function loadLB(finalScore) {
  lastFinalScore = finalScore;
  var lbArea = document.getElementById('lbArea');
  lbArea.classList.remove('hide');

  // ── Toy 平台：官方排行榜 SDK（游客可读榜，登录后可上报）──
  if (window.toy) { loadLBToy(lbArea, finalScore); return; }

  // ── 站点：自家排行榜（需登录）──
  if (typeof Auth === 'undefined') {
    lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:12px;">排行榜不可用（本地最高分已保存）</p>';
    return;
  }
  // 登录墙
  if (!Auth.isLoggedIn()) {
    Auth.loginPrompt(lbArea, function() { loadLB(lastFinalScore); });
    return;
  }
  lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:13px;">⏳ 加载排行榜...</p>';
  fetch(API_BASE + 'api/leaderboard.php?game=survivor', { headers: { 'Authorization': 'Bearer ' + Auth.token() } })
    .then(function(r) {
      if (r.status === 401) {
        Auth.loginPrompt(lbArea, function() { loadLB(lastFinalScore); });
        return null;
      }
      return r.json();
    })
    .then(function(data) {
      if (!data) return;
      var rank = checkRank(finalScore, data);
      renderLB(lbArea, data, rank, finalScore);
    })
    .catch(function() {
      lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:12px;">排行榜暂不可用（本地最高分已保存）</p>';
    });
}
// ── Toy 排行榜：双榜（board1 得分 / board2 存活秒数）──
function charLabel(c) {
  var id = c || '';
  if (!id) { try { id = localStorage.getItem('ms_last_char') || ''; } catch (e) {} }
  return id === 'reimu' ? '灵梦' : '魔理沙';
}
function toyRankRows(list, kind, mine) {
  var html = '';
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var isMe = mine && mine.ranked && mine.rank === it.rank;
    var av = it.avatar ? '<img class="lb-av" src="' + esc(String(it.avatar)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '';
    var val = kind === 'time' ? fmtTime(it.score || 0) : (it.score || 0);
    html += '<tr' + (isMe ? ' class="lb-my"' : '') + '><td>' + (it.rank || i + 1) + '</td><td class="lb-user">' + av + esc(it.nickname || '匿名') + '</td><td>' + val + '</td></tr>';
  }
  if (!list.length) html += '<tr><td colspan="3" style="color:#8a7e9a;">暂无记录</td></tr>';
  return html;
}
function loadLBToy(area, sc) {
  area.innerHTML = '<p style="color:#8a7e9a;font-size:13px;">⏳ 加载 B站排行...</p>';
  Promise.all([
    toy.getRankList({ board: 1, period: 'all', limit: 20 }).catch(function() { return null; }),
    toy.getMyRank({ board: 1, period: 'all' }).catch(function() { return null; }),
    toy.getRankList({ board: 2, period: 'all', limit: 20 }).catch(function() { return null; }),
    toy.getMyRank({ board: 2, period: 'all' }).catch(function() { return null; })
  ]).then(function(rs) {
    var list1 = rs[0], mine1 = rs[1], list2 = rs[2], mine2 = rs[3];
    if (list1 === null && list2 === null) {
      area.innerHTML = '<p style="color:#8a7e9a;font-size:12px;">B站排行暂不可用（本地最高分已保存）</p>';
      return;
    }
    list1 = list1 || []; list2 = list2 || [];
    var hasT2 = rs[2] !== null;
    var html = '<div class="lb-wrap">';
    if (sc > 0) html += '<div class="lb-submit"><button id="lbSubmit" class="lb-btn">提交成绩</button><button id="lbSkip" class="lb-btn-ghost">跳过</button></div>';
    html += '<p class="lb-note" style="color:#b89fff">本局：' + charLabel(lastFinalChar) + ' · 存活 ' + fmtTime(lastFinalTime) + '</p>';
    if (hasT2) {
      html += '<div class="lb-tabs"><button class="lb-tab on" data-b="1">得分榜</button><button class="lb-tab" data-b="2">存活榜</button></div>';
    } else {
      html += '<p class="lb-note" style="font-size:11px;">存活榜暂不可用，仅显示得分榜</p>';
    }
    html += '<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>#</th><th>玩家</th><th>成绩</th></tr></thead>' +
      '<tbody id="lbBody1">' + toyRankRows(list1, 'score', mine1) + '</tbody>' +
      '<tbody id="lbBody2" style="display:none;">' + toyRankRows(list2, 'time', mine2) + '</tbody></table></div>';
    var note = '';
    if (mine1 && mine1.ranked) note += '得分 第 ' + mine1.rank + ' 名 · ' + mine1.score + ' 分';
    else if (mine1) note += '得分未上榜';
    if (hasT2) {
      if (mine2 && mine2.ranked) note += (note ? ' ｜ ' : '') + '存活 第 ' + mine2.rank + ' 名 · ' + fmtTime(mine2.score);
      else if (mine2) note += (note ? ' ｜ ' : '') + '存活未上榜';
    }
    if (note) html += '<p class="lb-note" style="color:#f0c060">' + note + '</p>';
    html += '</div>';
    area.innerHTML = html;
    if (hasT2) {
      var tabs = area.querySelectorAll('.lb-tab');
      var bindTab = function(btn) {
        btn.addEventListener('click', function() {
          var b = btn.getAttribute('data-b');
          for (var k = 0; k < tabs.length; k++) tabs[k].className = 'lb-tab' + (tabs[k] === btn ? ' on' : '');
          document.getElementById('lbBody1').style.display = b === '1' ? '' : 'none';
          document.getElementById('lbBody2').style.display = b === '2' ? '' : 'none';
        });
      };
      for (var t2 = 0; t2 < tabs.length; t2++) bindTab(tabs[t2]);
    }
    var sb = document.getElementById('lbSubmit');
    if (sb) sb.addEventListener('click', function() { submitLBToy(area); });
    var sk = document.getElementById('lbSkip');
    if (sk) sk.addEventListener('click', function() { area.innerHTML = ''; area.classList.add('hide'); });
  });
}
function submitLBToy(area) {
  var btn = document.getElementById('lbSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
  var r1 = null, r2 = null;
  function done() {
    if (r1 === null || r2 === null) return;
    if (r1 === true) {
      area.innerHTML = '<p class="lb-ok">✅ ' + (r2 === true ? '已提交 B站排行（得分 + 存活）' : '得分已提交（存活榜暂不可用）') + '</p>';
      setTimeout(function() { loadLB(lastFinalScore); }, 700);
    } else {
      area.innerHTML = '<p class="lb-err">⚠️ ' + esc(String(r1 && r1.message ? r1.message : '提交失败（需登录 B站）')) + '</p>';
    }
  }
  toy.submitScore({ board: 1, score: lastFinalScore }).then(function() { r1 = true; done(); }, function(e) { r1 = e || false; done(); });
  toy.submitScore({ board: 2, score: Math.floor(lastFinalTime) }).then(function() { r2 = true; done(); }, function(e) { r2 = e || false; done(); });
}
function checkRank(sc, data) {
  for (var i = 0; i < data.length; i++) if (sc > data[i].score) return i + 1;
  return data.length < 20 ? data.length + 1 : 0;
}
function renderLB(area, data, rank, sc) {
  var html = '<div class="lb-wrap">';
  if (rank > 0 && sc > 0) {
    html += '<div class="lb-submit">';
    html += '<button id="lbSubmit" class="lb-btn">提交成绩</button>';
    html += '<button id="lbSkip" class="lb-btn-ghost">跳过</button>';
    html += '</div>';
  } else if (data.length >= 20 && sc > 0) {
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
  if (!Auth.isLoggedIn()) {
    area.innerHTML = '<p class="lb-err">需要登录后提交成绩</p>';
    Auth.openModal('login', function() { loadLB(lastFinalScore); });
    return;
  }
  var btn = document.getElementById('lbSubmit');
  btn.disabled = true; btn.textContent = '提交中...';
  var form = new FormData();
  form.append('score', String(lastFinalScore));
  form.append('graze', String(kills));
  form.append('game', 'survivor');
  fetch(API_BASE + 'api/leaderboard.php', {
    method:'POST', body:form,
    headers: { 'Authorization': 'Bearer ' + Auth.token() }
  })
    .then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j }; }); })
    .then(function(res) {
      if (res.status === 401) {
        area.innerHTML = '<p class="lb-err">需要登录后提交成绩</p>';
        Auth.openModal('login', function() { loadLB(lastFinalScore); });
        return;
      }
      if (res.body.ok) {
        area.innerHTML = '<p class="lb-ok">✅ 提交成功！排名第 <b>' + res.body.rank + '</b></p>';
        loadLB(lastFinalScore);
        setTimeout(function() {
          var t = document.getElementById('lbToggle');
          var w2 = document.getElementById('lbTableWrap');
          if (t && w2) { w2.style.display = 'block'; t.textContent = '📊 排行榜 ▾'; }
        }, 300);
      } else {
        area.innerHTML = '<p class="lb-err">提交失败: ' + (res.body.error || '未知错误') + '</p>';
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
  if (bgFadeT > 0) { bgFadeT -= 1; if (bgFadeT <= 0) bgPrev = null; } // 淡变走真实帧，选遗物/暂停期间也继续
  var hudOn = (gameState === 'playing' || gameState === 'paused' || gameState === 'levelup' || gameState === 'relic');
  if (pauseBtnEl) { var pd = hudOn ? '' : 'none'; if (pauseBtnEl.style.display !== pd) pauseBtnEl.style.display = pd; }
  draw();
  requestAnimationFrame(gameLoop);
}
document.addEventListener('visibilitychange', function() {
  if (document.hidden) { if (bgm) bgm.pause(); }
  else {
    lastTs = performance.now(); acc = 0;
    ensureBgm();
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
fitStage();
gameLoop();

// ═══════════ 选人界面（全局函数）═══════════
// 调试钩子（调平衡用）：__ms.spawnBoss() 立即召唤 Boss；__ms.skip(秒) 快进游戏时间；__ms.overlap() 采样重叠率
window.__ms = {
  spawnBoss: function(idx) { if (!boss && gameState === 'playing') { if (typeof idx === 'number') bossCount = idx; spawnBoss(); } },
  skip: function(sec) { if (gameState === 'playing') gameTime += sec; },
  // 内省/测试钩子（调平衡 & 自动化冒烟测试用）
  state: function() { return { gameState: gameState, level: player.level, enemies: enemies.length, gameTime: gameTime, scBreaks: scBreaks }; },
  p: function() { return player; },
  b: function() { return boss; },
  sc: function() { return boss ? { idx: boss.cardIdx, hp: Math.round(boss.hp), max: boss.maxHp, cardT: Math.round(boss.cardT), name: BOSS_DEFS[boss.bossIdx].cards[boss.cardIdx].name } : null; },
  spawn: spawnEnemy,
  pool: buildCardPool,
  apply: applyCard,
  pick: pickCard,
  enterLv: enterLevelUp,
  reroll: rerollCards,
  pauseToggle: togglePause,
  renderPause: renderPauseStats,
  pickRelic: pickRelic,
  relics: function() { return player.relics; },
  // ── 调试控制台钩子（js/survivor-debug.js 调用）──
  wpnList: function() { var o = []; for (var id in WPN) o.push({ id:id, icon:WPN[id].icon, name:WPN[id].name, attr:WPN[id].attr, type:WPN[id].type }); return o; },
  pasList: function() { var o = []; for (var id in PAS) o.push({ id:id, icon:PAS[id].icon, name:PAS[id].name }); return o; },
  relicList: function() { var o = []; for (var id in RELICS) o.push({ id:id, icon:RELICS[id].icon, name:RELICS[id].name, boss:RELICS[id].boss }); return o; },
  typeList: function() { var o = []; for (var id in TYPE_ENH) o.push({ id:id, icon:TYPE_ENH[id].icon, name:TYPE_ENH[id].name, label:TYPE_ENH[id].label }); return o; },
  addWeapon: function(id, lv) { if (WPN[id] && !hasWeapon(id) && player.weapons.length < MAX_WPN_SLOT) player.weapons.push({ id:id, lv:Math.max(1, Math.min(5, lv || 1)), t:1, ang:Math.random()*6 }); },
  levelWeapon: function(id, n) { var w = hasWeapon(id); if (w && w.lv < 5) w.lv = Math.min(5, w.lv + (n || 1)); },
  maxWeapon: function(id) { var w = hasWeapon(id); if (w) w.lv = 5; },
  evoWeapon: function(id) { var w = hasWeapon(id); if (w && EVO[id] && !w.evoed) { w.lv = 6; w.evoed = true; if (id === 'yinyang') yyBalls = []; } },
  removeWeapon: function(id) { for (var i = 0; i < player.weapons.length; i++) if (player.weapons[i].id === id) { player.weapons.splice(i, 1); return; } },
  addPassive: function(id, n) { if (!PAS[id]) return; var k = n || 1; player.passives[id] = Math.min(5, (player.passives[id] || 0) + k); if (id === 'hpup') { player.maxHp += 25*k; player.hp = Math.min(player.maxHp, player.hp + 25*k); } },
  maxPassives: function() { for (var p in PAS) { var need = 5 - (player.passives[p] || 0); if (need > 0) { player.passives[p] = 5; if (p === 'hpup') { player.maxHp += 25*need; player.hp = Math.min(player.maxHp, player.hp + 25*need); } } } },
  setAttr: function(id, lv) { if (player.attrs && id in player.attrs) player.attrs[id] = Math.max(0, Math.min(5, lv)); },
  setType: function(id, lv) { if (player.types && id in player.types) player.types[id] = Math.max(0, Math.min(3, lv)); },
  maxPanel: function() { for (var a in ATTR_ENH) player.attrs[a] = 5; for (var t in TYPE_ENH) player.types[t] = 3; },
  addRelic: function(id) { if (RELICS[id] && gameState === 'playing') applyRelic(id); },
  giveAllRelics: function() { for (var r in RELICS) if (gameState === 'playing') applyRelic(r); },
  god: function(on) { godMode = !!on; return godMode; },
  godState: function() { return godMode; },
  heal: function() { player.hp = player.maxHp; player.shield = player.shieldMax; },
  skipTime: function(sec) { gameTime += sec; },
  gainLevels: function(n) { for (var i = 0; i < (n || 1); i++) { player.level++; player.xpNeed = xpNeedFor(player.level); pendingLevels++; } },
  nextCard: function() { if (boss && !boss.dead) nextBossCard(boss, false); },
  killBoss: function() { var guard = 0; while (boss && !boss.dead && guard < 40) { damageEnemy(boss, 1e9, 'aoe'); guard++; } },
  clearEnemies: function() { for (var i = enemies.length - 1; i >= 0; i--) if (!enemies[i].isBoss) { var e2 = enemies[i]; enemies.splice(i, 1); e2.dead = false; enemyPool.push(e2); } },
  magnetAll: function() { for (var m = 0; m < gems.length; m++) gems[m].mag = true; },
  weapons: function() { return player.weapons; },
  enemiesList: function() { return enemies; },
  pits: function() { return poisonPits; },
  etype: function(n) { return ETYPE[n]; },
  wave: function() { if (gameState === 'playing' && !boss) specialWaveSpawn(); },
  bannerT: function() { return eventBannerT; },
  swing: function(ang, dmg, range) { if (gameState === 'playing') meleeSwing(typeof ang === 'number' ? ang : 0, range || 130, dmg || 10, 0.5, '#ffe8b0', 'gold', { wid: 'dbg' }); },
  bg: function() { var b = assets.bgs && assets.bgs[bgIndex]; var c = CONFIG.BGS && CONFIG.BGS[bgIndex]; return { index: bgIndex, fade: Math.round(bgFadeT), prev: !!bgPrev, tw: b ? b.tw : 0, th: b ? b.th : 0, scale: c && c.scale ? c.scale : 0 }; },
  ebullets: function() { return ebullets; },
  dmgRef: function(e, n) { if (e) damageEnemy(e, n || 1, 'aoe'); },
  vp: function(aw, ah) { return calcViewport(aw, ah); },
  lbToy: function(sc) { if (window.toy) loadLB(typeof sc === 'number' ? sc : lastFinalScore); },
  lbToySubmit: function() { if (window.toy) submitLBToy(document.getElementById('lbArea')); },
  lastRun: function() { return { char: lastFinalChar, time: lastFinalTime, score: lastFinalScore }; },
  resNow: function() { return { leech: leechRes(), freeze: freezeRes(), t: gameTime }; },
  healLeech: function(n) { return healLeech(n || 1); },
  healWin: function() { return { age: frameCount - healWinFrame, amt: healWinAmt, fc: frameCount, res: leechRes() }; },
  wpnDmg: function(id) { var w = hasWeapon(id); return w ? wpnDmg(w) : 0; },
  bumpTrait: function(id, n) { bumpTrait(id, n || 1); var w = hasWeapon(id); return w ? trN(w) : -1; },
  trN: function(id) { var w = hasWeapon(id); return w ? trN(w) : -1; },
  traitText: function(id) { var w = hasWeapon(id), ti = TRAIT_INFO[id]; return (w && ti) ? ti.f(w) : ''; },
  endRun: function() { if (gameState === 'playing' || gameState === 'paused') endGame(true); },
  attrs: function() { return player.attrs; },
  types: function() { return player.types; },
  fxState: function() {
    var sb = 0, sp = 0;
    for (var bi = 0; bi < beams.length; bi++) { if (beams[bi].sparkBeam) sb++; if (beams[bi].sparkPulse) sp++; }
    var ks = 0;
    for (var kbi = 0; kbi < knifeOrbs.length; kbi++) if (knifeOrbs[kbi].phase === 'stab') ks++;
    var kbN = 0;
    for (var bbi = 0; bbi < bullets.length; bbi++) if (bullets[bbi].type === 'knife') kbN++;
    return { nether: nether ? { r: nether.r, dmg: nether.dmg } : null, slashes: slashes.length, fallers: fallers.length, sparkBeams: sb, sparkPulses: sp, orbs: orbs.length, pets: pets.length, zones: zones.length, zoneR: zones.length ? Math.round(zones[0].r) : 0, knifeOrbs: knifeOrbs.length, knifeStabs: ks, knifeBullets: kbN };
  },
  slashCount: function() { return dbgSlashCount; },
  fallerCount: function() { return dbgFallerCount; },
  wpnCfg: function(id) { return WPN[id]; },
  roukanChain: function() { var w = hasWeapon('roukan'); return w ? (w.chainTotal || 0) : 0; },
  audio: function() {
    return {
      hasBgm: !!bgm,
      paused: bgm ? bgm.paused : null,
      currentTime: bgm ? bgm.currentTime : null,
      volume: bgm ? bgm.volume : null,
      readyState: bgm ? bgm.readyState : null,
      error: bgm && bgm.error ? bgm.error.code : null,
      ctxState: audioCtx ? audioCtx.state : null,
      vol: bgmVol
    };
  },
  roukanState: function() {
    var w = hasWeapon('roukan'); if (!w) return null;
    var D = w.dash;
    return { dash: D ? { hits: D.hits, t: D.t, targets: D.targets || 0, hasTarget: !!D.target, inArr: D.target ? enemies.indexOf(D.target) : -1, mode: D.mode || 'idle', dashCount: D.dashCount || 0 } : null, chain: w.chainTotal || 0, t: Math.round(w.t) };
  },
  dmgBoss: function(n) {
    if (!boss || boss.dead) return;
    var startCard = boss.cardIdx, guard = 0;
    while (boss && !boss.dead && boss.cardIdx === startCard && guard < 60) { damageEnemy(boss, n, 'aoe'); guard++; }
  },
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
// ═══════════ 开始界面：公告 + 翻页新手教程 ═══════════
var TUT_PAGES = [
  { icon:'🕹️', title:'移动与自动攻击', lines:['WASD / 方向键移动，手机按住屏幕拖动虚拟摇杆','武器全自动开火，你只需要专注走位与收集'] },
  { icon:'⭐', title:'P点与升级', lines:['击杀敌人掉 P 点，靠近自动吸取','攒满经验升级三选一；每次升级可点「重抽」或按 R 换一组'] },
  { icon:'🔹', title:'灵与魔 · 六类武器', lines:['✨灵：稳定强化 / 回盾 / 收集；🌑魔：爆发与异常','六类：子弹 / 范围 / 召唤 / 领域 / 激光 / 近身','最多携带 6 把武器，卡面会标注属性与类型'] },
  { icon:'🧭', title:'强化与超进化', lines:['普通强化：数值与生存','面板强化：灵力/魔力强化（Lv5）与六类武器强化（Lv3）','武器 Lv5 + 本属性 Lv5 + 本类型 Lv3 → 金色超进化卡'] },
  { icon:'🌸', title:'Boss 符卡战', lines:['5:00 首位 Boss，每张符卡有独立弹幕与倒计时','击破符卡有奖励；超时会被反噬，Boss 还会永久强化','击破 Boss 获得遗物三选一（每个 Boss 一次）'] },
  { icon:'🏆', title:'遗物与暂停面板', lines:['遗物最多叠 2 层，效果当局有效','ESC 暂停可查看面板数值 / 武器矩阵 / 强化与进化进度'] },
  { icon:'⚠️', title:'危险与节奏', lines:['长时间无伤会提升刷怪压力；残血连击会引来处刑者','红心很稀有，注意血线与护盾','魂蝶贴身自爆、向日葵远程弹幕、幽灵穿怪，优先处理'] }
];
var tutPageIdx = 0, tutPendingStart = false;
function renderTutPage() {
  var p = TUT_PAGES[tutPageIdx];
  var el = document.getElementById('tutPage');
  if (!el) return;
  var html = '<div class="tut-icon">' + p.icon + '</div><div class="tut-name">' + p.title + '</div><div class="tut-lines">';
  for (var i = 0; i < p.lines.length; i++) html += '<p>' + p.lines[i] + '</p>';
  html += '</div>';
  el.innerHTML = html;
  var dots = '';
  for (var d = 0; d < TUT_PAGES.length; d++) dots += '<span class="tut-dot' + (d === tutPageIdx ? ' on' : '') + '"></span>';
  var dotsEl = document.getElementById('tutDots');
  if (dotsEl) dotsEl.innerHTML = dots;
  var prev = document.getElementById('tutPrev');
  if (prev) prev.disabled = tutPageIdx === 0;
  var next = document.getElementById('tutNext');
  if (next) next.textContent = tutPageIdx === TUT_PAGES.length - 1 ? '✦ 开始游戏' : '下一页 →';
}
function openTutorial(reopen) {
  tutPageIdx = 0;
  tutPendingStart = !reopen;
  renderTutPage();
  var to = document.getElementById('tutOverlay');
  if (to) to.classList.remove('hide');
  if (!reopen) document.getElementById('startOverlay').classList.add('hide');
}
function closeTutorial(startNow) {
  var to = document.getElementById('tutOverlay');
  if (to) to.classList.add('hide');
  try { localStorage.setItem('ms_tut_done', '1'); } catch (e) {}
  if (startNow && tutPendingStart) startGame();
  else document.getElementById('startOverlay').classList.remove('hide');
}
function tutNav(d) {
  var ni = tutPageIdx + d;
  if (ni < 0) return;
  if (ni >= TUT_PAGES.length) { closeTutorial(tutPendingStart); return; }
  tutPageIdx = ni;
  renderTutPage();
}
function tutSkip() { closeTutorial(tutPendingStart); }
window._toggleAnnounce = function() {
  var b = document.getElementById('announceBody');
  var a = document.getElementById('announceArrow');
  if (!b) return;
  var open = b.classList.toggle('open');
  if (a) a.textContent = open ? '▾' : '▸';
};
window._openTutorial = openTutorial;
window._tutNav = tutNav;
window._tutSkip = tutSkip;

// 开始页：排行榜 / QQ 群入口
var lbToggle2El = document.getElementById('lbToggle2');
if (lbToggle2El) lbToggle2El.addEventListener('click', function () {
  var area = document.getElementById('lbArea');
  if (!area) return;
  if (area.classList.contains('hide')) { area.classList.remove('hide'); loadLB(lastFinalScore || 0); }
  else area.classList.add('hide');
});

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
  var done = false;
  try { done = localStorage.getItem('ms_tut_done') === '1'; } catch (e) {}
  if (!done) { openTutorial(false); return; }
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
