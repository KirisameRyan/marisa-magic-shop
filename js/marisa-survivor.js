// ═══════════════════════════════════════
//  魔理沙幸存者 · 霧雨魔法店
//  幸存者like：自动攻击 + 走位 + 升级三选一
// ═══════════════════════════════════════
(function(){

var cv = document.getElementById('game');
var ctx = cv.getContext('2d');
var W = 960, H = 540;
var CELL = 64;

// ═══════════ 画面自适应（stage 尺寸 + canvas backing 1:1 + 浮层缩放）═══════════
var stageEl = null, stageUiEl = null, STAGE_S = 1;
function fitStage() {
  if (!stageEl) stageEl = document.getElementById('stage');
  if (!stageUiEl) stageUiEl = document.querySelector('.stage-ui');
  var wrap2 = document.querySelector('.canvas-wrap');
  if (!stageEl || !wrap2) return;
  var aw = wrap2.clientWidth, ah = wrap2.clientHeight;
  if (!aw || !ah) return;
  var s = Math.min(aw / W, ah / H);
  if (s > 2) s = 2; // 桌面封顶 2 倍
  STAGE_S = s;
  stageEl.style.width = Math.round(W * s) + 'px';
  stageEl.style.height = Math.round(H * s) + 'px';
  if (stageUiEl) stageUiEl.style.transform = 'scale(' + s + ')';
  var k = Math.min(2.5, s * (window.devicePixelRatio || 1));
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
  BGM: 'audio/bgm.mp3',      // 背景音乐（首次点击/按键后自动起播，循环）
  BG: 'images/game_bg.jpg',   // 背景图（自动压暗 + 世界坐标视差平铺），留空用程序星空
  BGM_VOL: 0.18               // 背景音乐音量（0~1）
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
  ldOpt('sunflower', 'sunflower.png'); ldOpt('penglai', 'penglai.png');
  ldOpt('monBoar', 'mon_boar.png');
  // 特效 / 阴阳玉贴图
  ldOpt('jianqi', 'jianqi.png'); ldOpt('yunshi', 'yunshi.png');
  ldOpt('yaoshi', 'yaoshi.png'); ldOpt('baguayu', 'baguayu.png');
  if (CONFIG.BG) jobs.push(loadImage(CONFIG.BG).then(function(i) { assets.bgimg = i; }, function() { assets.bgimg = null; }));
  return Promise.all(jobs);
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
    bgm.loop = true; bgm.volume = CONFIG.BGM_VOL || 0.18;
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
  frost: { icon:'❄️', name:'冻结光环', jp:'パーフェクトフリーズ', attr:'ma', type:'aoe', cd:[300,300,240,240,180], dmg:[10,14,14,20,28], ar:[120,150,150,180,220], frz:[60,60,60,75,90],
    desc:['冰环扩散 · 冻结1秒','范围+ · 伤14','冷却缩短','范围+ · 伤20','大范围 · 冻结1.5秒'] },
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
    desc:['双剑快速连斩','伤15 · 距离+','三段连斩','伤22 · 距离+','伤26 · 极速'] }
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
  roukan:     { need:'atk',    icon:'🗡️', name:'二百由旬之一闪', jp:'二百由旬の一閃', desc:'闪现连锁斩 · 击杀则换目标' }
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
  butterfly:{ hp:18, spd:1.9, r:16, dmg:8,  xp:2, spr:'butterfly' },// 魂蝶：贴身自爆
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
var slashes = [], dolls = [], nether = null;
var relicMist = null, wardT = 2700, crimsonT = 5400;
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
    shield: 0, shieldMax: 30
  };
}
function xpNeedFor(l) { return 4 + l*3 + Math.floor(Math.pow(l, 1.5)); }
// 派生属性
function dmgMul()  { return (1 + 0.15 * player.passives.atk) * (CHAR[playerChar].dmg || 1) * (1 + 0.12 * relicLv('core')); }
function cdMul()   { var m = Math.max(0.4, Math.pow(0.88, player.passives.haste)); return Math.max(0.3, m * (1 - 0.10 * relicLv('sage'))); }
function moveMul() { return 1 + 0.10 * player.passives.move + 0.15 * relicLv('broom'); }
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
  if (w.attr === 'ma') m *= frenzyMul() * rageMul();
  return m;
}
function wpnCd(w) { return cdMul() / typeRateMul(w.type); }

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

// 固定虚拟摇杆（左下角常驻，触屏设备）
var JOY = { x: 105, y: H - 105, r: 62 };
var joy = { active:false, id:null, sx:0, sy:0, dx:0, dy:0 };
var isTouch = !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches)));
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
function hpMul()  { return 1 + gameTime / 75; }
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
  e.hitFlash = 0; e.slowT = 0; e.frozen = 0; e.stun = 0; e.fuse = 0;
  e.chargeT = 0; e.chargeCd = 0;
  e.atkT2 = 40 + Math.random() * 160;
  e.mark = 0; e.curse = 0; e.curseT = 0; e.chill = 0;
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
  pm = Math.min(0.6, pm + director.power * 0.15); // 导演：战力越高杂兵构成越高级
  if (Math.random() < pm) {
    // 蘑菇系：普通 / 分裂(2:00+) / 魂蝶(2:30+) / 野猪(4:20+)
    var r2 = Math.random();
    if (t > 150 && r2 < 0.30) type = 'butterfly';
    else if (t > 120 && r2 < 0.65) type = 'split';
    else if (t > 260 && r2 > 0.85) type = 'boar';
    else type = 'mogu';
  } else if (t > 210 && Math.random() < 0.18 + director.power * 0.10) {
    type = 'shieldf'; // 护盾妖精 3:30+
  }
  if (type === 'fairy' && t > 200 && Math.random() < 0.10 + director.power * 0.10) type = 'ghost';
  // 向日葵：固定炮台（3:00+，场上最多 4）
  if (t > 180 && Math.random() < 0.06) {
    var sfCount = 0;
    for (var sfI = 0; sfI < enemies.length; sfI++) if (enemies[sfI].type === 'sunflower') sfCount++;
    if (sfCount < 4) type = 'sunflower';
  }
  spawnEnemy(type);
  // 导演：战力高时成组刷怪
  if (director.power > 0.4 && Math.random() < director.power * 0.5) spawnEnemy(type);
}
// ═══════════ Boss ═══════════
function spawnBoss() {
  var def = BOSS_DEFS[bossCount % 2];
  var lvl = Math.floor(bossCount / 2); // 每轮两姐妹后 HP ×1.6
  // 清场：非 Boss 敌人化作粒子消散
  for (var ci = enemies.length - 1; ci >= 0; ci--) {
    var m = enemies[ci];
    spawnParticles(m.x, m.y, '#b89fff', 5, 1, 3);
    enemies.splice(ci, 1); m.dead = false; enemyPool.push(m);
  }
  var e = enemyPool.pop() || {};
  e.x = player.x; e.y = player.y - 620; // 从画面上方降落入场
  e.maxHp = Math.round(4000 * hpMul() * Math.pow(1.65, lvl)); // 符卡战：高强度血条
  e.hp = e.maxHp;
  e.spd = 2.3; e.r = 60; e.dmg = 18; e.xpv = 0; // 速度略低于玩家：靠符卡压制而非永久贴脸
  e.type = 'boss'; e.bossIdx = bossCount % 2;
  e.wing = 0; e.hitFlash = 0; e.slowT = 0; e.frozen = 0; e.fuse = 0;
  e.orbHitT = 0; e.yyHitT = 0; e.dead = false; e.elite = false; e.isBoss = true;
  e.atkT = 150; e.atkPhase = 0; e.chargeT = 0; e.cdx = 0; e.cdy = 0;
  e.burn = 0; e.burnDmg = 0; e.shock = 0; e.affixes = null;
  e.mark = 0; e.curse = 0; e.curseT = 0; e.chill = 0;
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
function spawnEbullet(x, y, vx, vy, dmg, color, life, spear, shape) {
  if (ebullets.length >= 150) return;
  var b = ebulletPool.pop() || {};
  var rage = (boss && !boss.dead && boss.rageStacks) ? boss.rageStacks : 0;
  var rmul = 1 + 0.12 * rage;
  b.x = x; b.y = y; b.vx = vx * rmul; b.vy = vy * rmul; b.dmg = dmg; b.r = 6;
  b.life = life || 500; b.color = color || '#ff6b9d'; b.spear = !!spear;
  b.shape = shape || (spear ? 'spear' : 'orb');
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
  for (var i = 0; i < n; i++) {
    var ang = (i / n) * Math.PI * 2;
    spawnEnemy(shapes[Math.floor(Math.random() * shapes.length)], player.x + Math.cos(ang) * 520, player.y + Math.sin(ang) * 520);
  }
  addLabel(player.x, player.y - 60, '⚠ 词缀精英来袭！', '#ef4444');
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
  spawnEnemy('exec', player.x + Math.cos(ang) * 620, player.y + Math.sin(ang) * 620);
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
  if (e.dead) return;
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
      if (e.slowT > 0) e.frozen = Math.max(e.frozen, Math.round(48 * anom));
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
  if (e.dead) return; // 幂等：防止同一帧多来源重复结算
  e.dead = true; e.killed = true; kills++;
  spawnParticles(e.x, e.y, (e.elite || e.isBoss) ? '#f0c060' : '#b89fff', e.elite ? 22 : 8, 1, 3);
  sfxDie();
  // P点
  for (var i = 0; i < e.xpv; i++) spawnGem(e.x + (Math.random()-0.5)*20, e.y + (Math.random()-0.5)*20, 1);
  // 顺手牵羊
  if (player.passives.leech > 0 && Math.random() < 0.03 * player.passives.leech) {
    player.hp = Math.min(player.maxHp, player.hp + 2);
  }
  // 灵力强化 Lv2：灵系击杀概率回血
  if (attrLv('rei') >= 2 && Math.random() < 0.08) player.hp = Math.min(player.maxHp, player.hp + 1);
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
  if (relicLv('fangs') && Math.random() < 0.06 * relicLv('fangs')) player.hp = Math.min(player.maxHp, player.hp + 3);
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
    if (kdx*kdx + kdy*kdy < (orrK + 30) * (orrK + 30)) player.hp = Math.min(player.maxHp, player.hp + 1);
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
          if (e.chill >= 3) { e.chill = 0; e.frozen = Math.max(e.frozen, cfg.frz[lv] * (attrLv('ma') >= 2 ? 1.15 : 1)); } // 叠满冻结（魔力强化 Lv2 延长）
        }
      }
    });
    sfxFreeze();
  } else if (w.id === 'comet') {
    var c = densestEnemy();
    if (c) { warnings.push({ x:c.x, y:c.y, r:cfg.ar[lv]*typeRangeMul('aoe'), t:36, dmg:cfg.dmg[lv]*wpnDmg(w) }); addFaller('meteor', c.x, c.y, 36); sfxWarn(); }
    else fired = false;
  } else if (w.id === 'needle') {
    // 破魔针：高穿透直线针雨
    var tgt3 = nearestEnemy(620);
    var na = tgt3 ? Math.atan2(tgt3.y-player.y, tgt3.x-player.x) : Math.atan2(player.fy, player.fx);
    var nn = cfg.n[lv] + typeCountBonus('bullet');
    var nspd = 10 * typeBulletSpeedMul();
    for (var ni = 0; ni < nn; ni++) {
      var a4 = na + (ni - (nn-1)/2) * 0.16;
      spawnBullet(player.x, player.y, Math.cos(a4)*nspd, Math.sin(a4)*nspd, cfg.dmg[lv]*wpnDmg(w), 4, cfg.pr[lv] + typePierceBonus('bullet'), 90, 'needle');
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
  }
  w.t = fired ? cfg.cd[lv] * wpnCd(w) : 30;
}
// 无限射程激光判定：点到射线垂直距离（maxDist 默认 2000，等效全屏）
function beamHits(ox, oy, ang, halfW, maxDist, dmg) {
  var dx = Math.cos(ang), dy = Math.sin(ang);
  var L = maxDist || 2000;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var rx = e.x - ox, ry = e.y - oy;
    var along = rx * dx + ry * dy;
    if (along < -e.r || along > L + e.r) continue;
    var perp = Math.abs(rx * dy - ry * dx);
    if (perp < halfW + e.r) {
      damageEnemy(e, dmg, 'beam');
      if (!e.dead) e.mark = 240; // 魔炮标记：死亡多掉 P 点
    }
  }
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
      damageEnemy(e, dmg, 'contact');
      hits++;
      if (knock && !e.isBoss && !e.dead) { var d3 = Math.sqrt(d2) || 1; e.x += dx / d3 * knock * 12; e.y += dy / d3 * knock * 12; }
    });
  }
  if (hits > 0) { // 命中火花与刃风
    var hx = player.x + Math.cos(ang) * range * 0.7, hy = player.y + Math.sin(ang) * range * 0.7;
    spawnParticles(hx, hy, '#fff2c0', 5, 1, 3);
    spawnParticles(hx, hy, color || '#ffe8b0', 3, 1, 4);
  }
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
function fireGungnir(px, py, ang, R, dmg) {
  var tx = px + Math.cos(ang) * R, ty = py + Math.sin(ang) * R;
  var dx = -Math.sin(ang), dy = Math.cos(ang);
  var L = 1400;
  beams.push({ line: true, x1: tx - dx * L, y1: ty - dy * L, x2: tx + dx * L, y2: ty + dy * L, life: 14, maxLife: 14, w: 20, color: '#ff6b8a' });
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var rx = e.x - tx, ry = e.y - ty;
    var along = rx * dx + ry * dy;
    if (along < -L || along > L) continue;
    var perp = Math.abs(rx * dy - ry * dx);
    if (perp < 16 + e.r) damageEnemy(e, dmg, 'beam');
  }
  shakeT = Math.max(shakeT, 6);
  sfxSpark();
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
      if (!fe2.dead && !fe2.isBoss) fe2.frozen = Math.max(fe2.frozen, 90);
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
        warnings.push({ x:wx3, y:wy3, r:130*typeRangeMul('aoe'), t:30 + ci2*14, dmg:150*wpnDmg(w) });
        addFaller('meteor', wx3, wy3, 30 + ci2*14);
        fired3++;
      }
    }
    if (!fired3) return (w.t = 30);
    sfxWarn();
  } else if (w.id === 'needle') { // → 万针阵：全向穿透针雨
    for (var ni2 = 0; ni2 < 12; ni2++) {
      var a6 = (ni2 / 12) * Math.PI * 2 + w.ang;
      spawnBullet(player.x, player.y, Math.cos(a6)*9, Math.sin(a6)*9, 34*wpnDmg(w), 4, 6, 120, 'needle');
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
    if (!w.dash) { w.dash = { hits: 0, t: 12, target: null, targets: 0 }; w.t = 99999; }
    return;
  }
  // 各超进化独立冷却（不再受等级数组约束）
  var evoCd = { star:100, frost:360, comet:200, needle:110, gungnir:130 };
  w.t = (evoCd[w.id] || 100) * wpnCd(w);
}
function updateContinuous(w) {
  var cfg = WPN[w.id], lv = Math.max(0, Math.min(4, w.lv - 1));
  if (w.id === 'orbit') {
    // 银河星环（超进化）：八星大环 + 命中减速
    var n, or, rot, odmg, orbR;
    if (w.evoed) { n = 8; or = 112; rot = 0.07; odmg = 34 * wpnDmg(w); orbR = 18; }
    else { n = cfg.n[lv]; or = cfg.or[lv]; rot = cfg.rot[lv]; odmg = cfg.dmg[lv] * wpnDmg(w); orbR = 14; }
    or *= typeRangeMul('field');
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
            dl.t = cfg.rate[lv] / typeRateMul('summon');
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
        var nR2 = (nEvo ? 300 : cfg.ar[lv]) * typeRangeMul('field');
        var nD2 = (nEvo ? 26 : cfg.dmg[lv]) * wpnDmg(w);
        nether = { x: player.x, y: player.y, r: nR2, dmg: nD2, slow: nEvo, tick: 0, born: 0 };
        rings.push({ x: player.x, y: player.y, r: 10, maxR: nR2, life: 18, maxLife: 18, color: '#c02040' });
        sfxBoom();
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
          beamHits(player.x, player.y, fAng, halfW, 2000, spDmg);
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
        w.t = isEvoS ? 240 : cfg.cd[lv];
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
        w.t = 40 * wpnCd(w);
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
    // 二百由旬之一闪：对目标最多斩 3 刀；3 刀内击杀 → 瞬移下一目标重置；直到某敌吃满 3 刀未死
    var D = w.dash;
    D.t -= dt;
    if (D.t <= 0) {
      var dtgt = null;
      var tAlive = D.target && !D.target.dead && !D.target.killed && D.tuid === D.target.uid && enemies.indexOf(D.target) >= 0;
      if (tAlive) {
        if (D.hits < 3) dtgt = D.target; // 同一目标继续补刀
      } else {
        dtgt = nearestEnemy(1500); // 目标已死 / 无目标：换下一目标并重置计数
        D.hits = 0;
      }
      if (!dtgt) { w.lastChain = D.targets || 0; w.dash = null; w.t = 420 * wpnCd(w); } // 三刀未死 / 无目标 → 结束
      else {
        var da4 = Math.atan2(dtgt.y - player.y, dtgt.x - player.x);
        player.x = dtgt.x - Math.cos(da4) * 46;
        player.y = dtgt.y - Math.sin(da4) * 46;
        player.inv = Math.max(player.inv, 20);
        spawnParticles(player.x, player.y, '#b89fff', 10, 1, 3);
        meleeSwing(da4, 130 * typeRangeMul('melee'), 90 * wpnDmg(w), 0.8, '#d8b4ff', 'violet', { wid:'roukan' });
        if (D.target === dtgt) D.hits++;
        else { D.hits = 1; D.target = dtgt; D.tuid = dtgt.uid; D.targets = (D.targets || 0) + 1; w.chainTotal = (w.chainTotal || 0) + 1; }
        D.t = 14;
      }
    }
  } else if (w.id === 'yinyang') {
    // 封魔玉（超进化）：巨型追踪封魔玉
    var want = (w.evoed ? 4 : cfg.n[lv]) + typeCountBonus('summon');
    var ballR = w.evoed ? 22 : 14;
    var ydmg = (w.evoed ? 42 : cfg.dmg[lv]) * wpnDmg(w);
    var yspd = w.evoed ? 4.6 : cfg.spd[lv];
    while (yyBalls.length < want) yyBalls.push({ x:player.x + (Math.random()-0.5)*200, y:player.y + (Math.random()-0.5)*200, vx:(Math.random()<0.5?-1:1)*yspd, vy:(Math.random()<0.5?-1:1)*yspd, r:ballR });
    while (yyBalls.length > want) yyBalls.pop();
    for (var b = 0; b < yyBalls.length; b++) {
      var ball = yyBalls[b];
      ball.r = ballR;
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
    if (w.evoed) continue; // 已进化：不再出现升级卡
    if (w.lv < 5) pool.push({ type:'wup', id:w.id });
    else if (EVO[w.id] && attrLv(WPN[w.id].attr) >= 5 && typeLv(WPN[w.id].type) >= 3) pool.push({ type:'evo', id:w.id }); // 超进化金卡
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
      div.className = 'lv-card' + (info.evo ? ' evo' : (ctype === 'wup' || ctype === 'wnew') ? ' wpn' : ctype === 'pas' ? ' pas' : (ctype === 'attr' || ctype === 'type') ? ' enh' : '');
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
    if (bgm) { var pr = bgm.play(); if (pr && pr.catch) pr.catch(function(){}); }
  }
}
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('btnResume').addEventListener('click', togglePause);
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
// Tab 切换
var pauseTabsEl = document.getElementById('pauseTabs');
if (pauseTabsEl) pauseTabsEl.addEventListener('click', function (e) {
  var t = e.target;
  while (t && t !== pauseTabsEl && !(t.className && String(t.className).indexOf('pz-tab') >= 0)) t = t.parentElement;
  if (!t || t === pauseTabsEl) return;
  renderPauseStats(t.getAttribute('data-t'));
  sfxCard();
});

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
  html += '</div></div>';
  return html;
}
function wpnTabHTML() {
  var attrs = ['rei', 'ma'];
  var map = {};
  for (var id in WPN) { map[WPN[id].attr + '|' + WPN[id].type] = id; }
  var html = '<div class="ps-sec"><h3>武器矩阵</h3><div class="ps-matrix">';
  for (var ai = 0; ai < 2; ai++) for (var ti = 0; ti < 6; ti++) {
    var wid = map[attrs[ai] + '|' + PAUSE_TYPES[ti]];
    var ww = wid ? hasWeapon(wid) : null;
    var cfgW = wid ? WPN[wid] : null;
    html += '<div class="ps-mx' + (ww ? ' on' : '') + '"><i>' + (cfgW ? cfgW.icon : '？') + '</i>' + (cfgW ? cfgW.name : '未获得') + (ww ? '<em>Lv' + ww.lv + (ww.evoed ? ' ★' : '') + '</em>' : '') + '</div>';
  }
  html += '</div></div>';
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
  html += '<div class="ps-sec"><h3>超进化进度</h3>';
  var any = false;
  for (var wi = 0; wi < player.weapons.length; wi++) {
    var wp = player.weapons[wi], wc = WPN[wp.id];
    if (!EVO[wp.id]) continue;
    any = true;
    var okW = wp.lv >= 5, okA = attrLv(wc.attr) >= 5, okT = typeLv(wc.type) >= 3;
    var txt = wp.evoed ? '已觉醒 ★' : ('武器' + wp.lv + '/5 · ' + (wc.attr === 'rei' ? '灵' : '魔') + attrLv(wc.attr) + '/5 · ' + PAUSE_TYPE_NAME[wc.type] + typeLv(wc.type) + '/3');
    html += '<div class="ps-row"><b>' + wc.icon + ' ' + wc.name + '</b><span' + ((okW && okA && okT && !wp.evoed) ? ' class="ok"' : '') + '>' + txt + '</span></div>';
  }
  if (!any) html += '<div class="ps-row"><span>尚未持有可进化的武器</span></div>';
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
          nHit++;
          if (nether.slow && !e.isBoss && !e.dead) e.slowT = Math.max(e.slowT, 40);
          // 吸血反馈：飞向玩家的光点
          if (!e.dead && particles.length < 380) {
            var lvx = player.x - e.x, lvy = player.y - e.y, lvd = Math.sqrt(lvx*lvx + lvy*lvy) || 1;
            particles.push({ x:e.x, y:e.y, vx:lvx/lvd*6, vy:lvy/lvd*6, life:12, maxLife:12, color:'#ff6b8a', r:3 });
          }
        }
      });
      if (nHit > 0 && player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + nHit * nether.dmg * 0.10);
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

  // ── 生成（Boss 战期间停刷普通怪，Boss 召唤技除外）──
  updateDirector();
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
          for (var sw = -1; sw <= 1; sw++) spawnEbullet(e.x, e.y, Math.cos(pa + sw * 0.22) * 2.6, Math.sin(pa + sw * 0.22) * 2.6, 8, '#ffd970', 260);
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
        var wobAmp = (e.type === 'ghost' || e.type === 'butterfly') ? 0.85 : 0.45;
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
    if (b.life <= 0) { bullets.splice(bi, 1); bulletPool.push(b); continue; }
    var hit = false;
    queryGrid(b.x, b.y, b.r + 50, function(e) {
      if (hit && b.pierce <= 0) return;
      var dx = e.x - b.x, dy = e.y - b.y;
      if (dx*dx + dy*dy < (b.r + e.r) * (b.r + e.r)) {
        if (b.type === 'needle' && frameCount - (e.needleHitT || 0) < 14) return; // 破魔针：每敌命中冷却，防贴脸重复结算
        damageEnemy(e, b.dmg, 'bullet');
        if (b.type === 'needle' && !e.dead) { e.needleHitT = frameCount; e.curse = Math.min(3, (e.curse || 0) + 1); e.curseT = 360; } // 破魔针咒印
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
        fireGungnir(wn.px, wn.py, wn.ang, wn.R, wn.dmg);
        warnings.splice(ci, 1);
      }
    } else if (wn.keystone) { // 要石天降
      if (wn.t <= 0) {
        dropKeystone(wn.x, wn.y, wn.r, wn.dmg);
        warnings.splice(ci, 1);
      }
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
    var bobY = (e.type === 'mogu' || e.type === 'split' || e.type === 'mini') ? 0 : Math.sin(frameCount * 0.08 + e.wing) * 3;
    var ex = sx(e.x), ey = sy(e.y) + bobY;
    ctx.save();
    ctx.translate(ex, ey);
    if ((e.type === 'fairy' || e.type === 'shieldf') && e.x < player.x) ctx.scale(-1, 1); // 琪露诺原图朝左
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
    var dimg = sl2.tint === 'gold' ? spr.jianqiGold : sl2.tint === 'silver' ? spr.jianqiSilver : sl2.tint === 'violet' ? spr.jianqiViolet : null;
    var spreads = sl2.spread ? [-sl2.spread, sl2.spread] : [0];
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
  // 固定虚拟摇杆（触屏设备常驻左下）
  if (isTouch) {
    ctx.globalAlpha = joy.active ? 0.32 : 0.16; ctx.fillStyle = '#b89fff';
    ctx.beginPath(); ctx.arc(JOY.x, JOY.y, JOY.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = joy.active ? 0.6 : 0.32;
    ctx.beginPath(); ctx.arc(JOY.x + joy.dx * (JOY.r - 22), JOY.y + joy.dy * (JOY.r - 22), 24, 0, Math.PI*2); ctx.fill();
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
function hudRoundRect(x, y, w, h, r) {
  ctx.beginPath();
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
  // HP 条
  var hx = 16, hy = 14, hw = 200, hh = 13;
  hudRoundRect(hx, hy, hw, hh, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  var hpPct = Math.max(0, Math.min(1, player.hp / player.maxHp));
  if (hpPct > 0) {
    ctx.save();
    hudRoundRect(hx, hy, hw, hh, 6); ctx.clip();
    var hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    hg.addColorStop(0, '#ef4444'); hg.addColorStop(1, '#f0c060');
    ctx.fillStyle = hg; ctx.fillRect(hx, hy, hw * hpPct, hh);
    ctx.restore();
  }
  if (hpPct < 0.3) { // 低血脉冲
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.abs(Math.sin(frameCount * 0.09)) * 0.5;
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
    hudRoundRect(hx - 1.5, hy - 1.5, hw + 3, hh + 3, 7.5); ctx.stroke();
    ctx.restore();
  }
  hudStrokeText(Math.max(0, Math.ceil(player.hp)) + ' / ' + player.maxHp, hx + hw / 2, hy + hh / 2, '#ffffff', 'bold 9px sans-serif', 'center');
  // XP 条
  var xy = 32, xh = 5;
  hudRoundRect(hx, xy, hw, xh, 2.5);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  var xpPct = Math.max(0, Math.min(1, player.xp / player.xpNeed));
  if (xpPct > 0) {
    ctx.save();
    hudRoundRect(hx, xy, hw, xh, 2.5); ctx.clip();
    var xg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    xg.addColorStop(0, '#8fd8ff'); xg.addColorStop(1, '#b89fff');
    ctx.fillStyle = xg; ctx.fillRect(hx, xy, hw * xpPct, xh);
    ctx.restore();
  }
  // 等级
  hudStrokeText('Lv ' + player.level, 226, 21, '#8fd8ff', 'bold 11px sans-serif');
  // 右上计分区（右侧预留暂停键空间）
  var rx = W - 60;
  var tStr = (boss && !boss.dead ? '⚔ ' : '⏱ ') + fmtTime(gameTime) + '  💀 ' + kills;
  hudStrokeText(tStr, rx, 20, '#e0d8ec', 'bold 13px sans-serif', 'right');
  hudStrokeText(String(score).padStart(6, '0') + '  HI ' + String(bestScore).padStart(6, '0'), rx, 37, '#8a7e9a', '10px sans-serif', 'right');
  // Boss 符卡条
  if (boss && !boss.dead) {
    var def = BOSS_DEFS[boss.bossIdx], card = def.cards[boss.cardIdx];
    var start = boss.cardIdx === 0 ? boss.maxHp : boss.thresholds[boss.cardIdx - 1];
    var end2 = boss.thresholds[boss.cardIdx];
    var bw = Math.min(560, W - 360), bx = (W - bw) / 2;
    hudStrokeText(def.name, W / 2, 18, '#ef4444', 'bold 12px sans-serif', 'center');
    var dots = '';
    for (var d3 = 0; d3 < def.cards.length; d3++) dots += d3 < boss.cardIdx ? '✕' : (d3 === boss.cardIdx ? '●' : '○');
    hudStrokeText(card.name + '  ' + dots + '  ⏳' + Math.max(0, Math.ceil(boss.cardT / 60)) + 's' + (boss.rageStacks ? '  ⚡狂化×' + boss.rageStacks : ''), W / 2, 35, '#ffb2b2', '11px sans-serif', 'center');
    hudRoundRect(bx, 48, bw, 10, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(239,68,68,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    var fillW = Math.max(0, (boss.hp - end2) / Math.max(1, start - end2)) * bw;
    if (fillW > 0) {
      ctx.save();
      hudRoundRect(bx + 1, 49, bw - 2, 8, 4); ctx.clip();
      var bg2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      bg2.addColorStop(0, '#7f1d1d'); bg2.addColorStop(1, '#ef4444');
      ctx.fillStyle = bg2; ctx.fillRect(bx + 1, 49, fillW - 2, 8);
      ctx.restore();
    }
  }
  ctx.textBaseline = 'alphabetic';
}

// ═══════════ 游戏流程 ═══════════
function startGame() {
  resetPlayer();
  enemies = []; bullets = []; gems = []; drops = [];
  particles = []; floatingTexts = []; beams = []; rings = []; warnings = [];
  yyBalls = [];
  slashes = []; dolls = []; nether = null; fallers = [];
  relicMist = null; wardT = 2700; crimsonT = 5400;
  directorReset();
  gameTime = 0; kills = 0; score = 0; spawnTimer = 0;
  scoreBonus = 0; hurtFlash = 0; ebullets = []; dmgPops = [];
  boss = null; bossCount = 0; hideBossBar(); mist = null;
  bossBannerT = 0; document.getElementById('bossBanner').classList.remove('show');
  gamePaused = false; document.getElementById('pauseOverlay').classList.add('hide');
  pendingLevels = 0; freezeAll = 0; eliteWave = 0; eliteTimer = 0;
  deathFlash = 0; shakeT = 0; frameCount = 0;
  scBreaks = 0; spellCardT = 0;
  var scEl = document.getElementById('spellCard');
  if (scEl) scEl.classList.remove('show');
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
}
function endGame() {
  gameState = 'over';
  deathFlash = 18;
  spawnParticles(player.x, player.y, '#ef4444', 30, 2, 7);
  sfxBomb();
  hideBossBar();
  var scEl2 = document.getElementById('spellCard');
  if (scEl2) scEl2.classList.remove('show');
  saveBest();
  var ov = document.getElementById('startOverlay');
  ov.classList.remove('hide');
  var logoEl = document.getElementById('startLogo');
  if (logoEl) logoEl.textContent = '💥 满身疮痍！';
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
  loadLB(score);
}

// ═══════════ 排行榜（独立榜单 game=survivor，graze 字段存击杀数）═══════════
var lastFinalScore = 0;
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
// ── Toy 排行榜渲染 ──
function loadLBToy(area, sc) {
  area.innerHTML = '<p style="color:#8a7e9a;font-size:13px;">⏳ 加载 B站排行...</p>';
  Promise.all([
    toy.getRankList({ board: 1, period: 'all', limit: 20 }),
    toy.getMyRank({ board: 1, period: 'all' }).catch(function() { return null; })
  ]).then(function(rs) {
    var list = rs[0] || [], mine = rs[1];
    var html = '<div class="lb-wrap">';
    if (sc > 0) html += '<div class="lb-submit"><button id="lbSubmit" class="lb-btn">提交成绩</button><button id="lbSkip" class="lb-btn-ghost">跳过</button></div>';
    html += '<div class="lb-toggle" id="lbToggle">📊 B站排行 ▸</div>';
    html += '<div class="lb-table-wrap" id="lbTableWrap" style="display:none;">';
    html += '<table class="lb-table"><thead><tr><th>#</th><th>玩家</th><th>得分</th></tr></thead><tbody>';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var isMe = mine && mine.ranked && mine.rank === it.rank;
      html += '<tr' + (isMe ? ' class="lb-my"' : '') + '><td>' + it.rank + '</td><td>' + esc(it.nickname || '匿名') + '</td><td>' + it.score + '</td></tr>';
    }
    html += '</tbody></table></div>';
    if (mine && mine.ranked) html += '<p class="lb-note" style="color:#f0c060">我的排名：第 ' + mine.rank + ' 名 · ' + mine.score + ' 分</p>';
    html += '</div>';
    area.innerHTML = html;
    var toggle = document.getElementById('lbToggle'), wrap2 = document.getElementById('lbTableWrap');
    toggle.addEventListener('click', function() {
      var open = wrap2.style.display !== 'none';
      wrap2.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '📊 B站排行 ▸' : '📊 B站排行 ▾';
    });
    document.getElementById('lbSubmit').addEventListener('click', function() { submitLBToy(area); });
    document.getElementById('lbSkip').addEventListener('click', function() { area.innerHTML = ''; area.classList.add('hide'); });
  }).catch(function() {
    area.innerHTML = '<p style="color:#8a7e9a;font-size:12px;">B站排行暂不可用（本地最高分已保存）</p>';
  });
}
function submitLBToy(area) {
  var btn = document.getElementById('lbSubmit');
  btn.disabled = true; btn.textContent = '提交中...';
  toy.submitScore({ board: 1, score: lastFinalScore }).then(function() {
    area.innerHTML = '<p class="lb-ok">✅ 已提交 B站排行！</p>';
    loadLB(lastFinalScore);
  }).catch(function(e) {
    area.innerHTML = '<p class="lb-err">⚠️ ' + esc(String(e && e.message ? e.message : '提交失败（需登录 B站）')) + '</p>';
  });
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
  attrs: function() { return player.attrs; },
  types: function() { return player.types; },
  fxState: function() {
    var sb = 0, sp = 0;
    for (var bi = 0; bi < beams.length; bi++) { if (beams[bi].sparkBeam) sb++; if (beams[bi].sparkPulse) sp++; }
    return { nether: nether ? { r: nether.r, dmg: nether.dmg } : null, slashes: slashes.length, fallers: fallers.length, sparkBeams: sb, sparkPulses: sp };
  },
  slashCount: function() { return dbgSlashCount; },
  fallerCount: function() { return dbgFallerCount; },
  wpnCfg: function(id) { return WPN[id]; },
  roukanChain: function() { var w = hasWeapon('roukan'); return w ? (w.chainTotal || 0) : 0; },
  roukanState: function() {
    var w = hasWeapon('roukan'); if (!w) return null;
    var D = w.dash;
    return { dash: D ? { hits: D.hits, t: D.t, targets: D.targets || 0, hasTarget: !!D.target, inArr: D.target ? enemies.indexOf(D.target) : -1 } : null, chain: w.chainTotal || 0, t: Math.round(w.t) };
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
