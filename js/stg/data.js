// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 配置与常量 (data.js)
//  霧雨魔法店 · 东方风弹幕STG + 肉鸽
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.CONFIG = {
  // ── 画布 ──
  W: 480, H: 640,
  // ── 自机(复刻 Godot 手感) ──
  PLAYER_SPEED: 220,        // 常速 px/s
  PLAYER_SLOW: 110,         // 低速 px/s
  PLAYER_HIT_R: 2.5,        // 判定点实际碰撞半径
  PLAYER_HIT_VIS: 5,        // 低速时判定点视觉半径
  PLAYER_SPRITE_SCALE: 1.5, // 精灵绘制缩放(32x48 -> 48x72)
  SLOW_FACTOR: 0.65,        // 低速时世界节奏(敌弹/敌人/自机弹/道具)
  PLAYER_HP_MAX: 8,         // 星 HP
  PLAYER_START_HP: 5,
  PLAYER_BOMBS: 3,          // 初始符卡数
  SHOT_INTERVAL: 0.10,      // 射击间隔 s(被主炮覆盖)
  SHOT_SPEED: 600,          // 自机弹速度(被主炮覆盖)
  SHOT_DAMAGE: 20,          // 基础伤害(被主炮覆盖)
  CANNON_INTERVAL: 0.5,     // 魔炮(星尘形态)独立节奏 s(旧体系, 新魔炮不用)
  // ── 主炮参数 ──
  CHASE_LOCK_DELAY: 0.25,   // 追踪弹直行时间 s(先直行再柔和入弯)
  CANNON_CHARGE: 1.5,       // 魔炮蓄力 s(长按Z, 期间减速)
  CANNON_BEAM: 10,          // 魔炮激光持续 s(跟随移动横扫, 主输出)
  CANNON_COOL: 0.5,         // 魔炮冷却 s
  CANNON_TICK: 0.12,        // (已改逐帧结算, 保留常量兼容)
  CANNON_DMG: 300,          // 激光基础 DPS(快速递增封顶×2.5, 对小型敌机特攻, Boss杀手)
  CANNON_CHARGE_SLOW: 0.55, // 蓄力期间移速倍率
  SPREAD_ANGLE: 0.7,        // 散射半角(弧度, ±40°)
  // ── Power 火力 ──
  POWER_MAX: 4.00,
  POWER_START: 1.00,
  POWER_PICK: 0.02,         // 单个P点(满P需150个, 约一整关节奏)
  POWER_LOSE: 1.00,         // 中弹损失
  // ── 计分 ──
  SCORE_LIFE: 3000000,      // 奖残分数线
  SCORE_BOMB: 1000000,      // 奖符卡分数线
  // ── 回收线 ──
  RECOVER_Y: 560,
  // ── 上半屏道具自动回收(东方经典) ──
  AUTO_RECOVER_Y: 224,      // 自机上移越过此线 → 全场道具回收
  // ── 无敌帧 ──
  INVULN: 2.0,              // 中弹后无敌 s
  BOMB_INVULN: 2.5,
  // ── 经验曲线 ──
  EXP_BASE: 8, EXP_GROW: 4, // 需求 = base + (lv-1)*grow
  // ── Graze Combo ──
  GRAZE_WINDOW: 1.6,        // 连击窗口 s
  GRAZE_CD: 0.3,            // 擦弹触发冷却 s(防每帧重复计; 窗口内再次擦弹叠 combo)
  // ── 素材 ──
  BGM_STAGE: 'audio/midi/Bad Apple.mid',   // 道中曲
  ASSETS: {
    marisa: 'images/stg/marisa.png',
    enemy:  'images/stg/enemy.png',
    bg:     'images/stg/bg.png',
    star:   'images/stg/star.png',
    item:   'images/stg/item.png',
    splash: 'images/stg/splash.png',
    slowfx: 'images/stg/slowfx.png',
    marisaP: 'images/sprites/mairsa_show.png',
    boss1:  'images/stg/boss1.jpg',
    boss2:  'images/stg/boss2.jpg',
    boss3:  'images/stg/boss3.jpg',
    boss4:  'images/stg/boss4.jpg',
    boss5:  'images/stg/boss5.jpg',
    boss6:  'images/stg/boss6.jpg'
  }
};

// ── 精灵帧位 ──
STG.FRAMES = {
  marisa: { fw:32, fh:48, stand:0, left:48, right:96, rows:8 },
  pshot: { x:0, y:144, fw:32, fh:16, frames:4 },
  spell: { x:160, y:144, fw:16, fh:16 },
  enemy: { fw:32, fh:32, frames:8,
    straight:{ x:0, n:4 }, start_right:{ x:128, n:4 }, right:{ x:256, n:4 },
    // 8 种小妖精 32x32(行 0-3 / 8-11, 各 8 帧) + 大蝴蝶 64x64(行 12-13, 4 帧, 道中王)
    rows: { mook:0, hover:32, circler:64, zigzag:96, snake:256, diver:288, elite:320, midboss:384 } },
  item: { fw:16, fh:16, power:{ x:192, y:0 }, score:{ x:208, y:0 } },
  splash: { fw:64, fh:16, frames:9 },
  slowfx: { x:0, y:0, fw:64, fh:64 }
};

// ── 敌弹配置(程序化绘制, 颜色语义) ──
// shape: circle圆弹 / dia菱形 / star四角星
STG.EBULLET = {
  b1: { r:6.5, color:'#f5e6c8', shape:'circle', glow:0.35 },   // 白: 环形慢弹
  b2: { r:6.5, color:'#ff6b6b', shape:'circle', glow:0.55 },   // 红: 高速直击
  b3: { r:6,   color:'#6bb7ff', shape:'dia',    glow:0.35 },   // 蓝: 低速弹幕(菱形)
  b4: { r:6,   color:'#c48bff', shape:'circle', glow:0.55 },   // 紫: 自机狙
  b5: { r:5.5, color:'#ffd166', shape:'star',   glow:0.6 },  // 金: 符卡(星弹)
  b6: { r:13,  color:'#ff9db8', shape:'big',    glow:0.45 }  // 大玉: 符卡重弹
};

// ── Power 火力形态(被主炮档位替代, 保留函数兼容) ──
STG.POWER_TYPES = [
  { min:1.00, name:'双发',  shots:[ {x:-8,a:0}, {x:8,a:0} ] },
  { min:2.00, name:'三发',  shots:[ {x:0,a:0}, {x:-8,a:-0.12}, {x:8,a:0.12} ] },
  { min:3.00, name:'五发',  shots:[ {x:0,a:0}, {x:-8,a:0}, {x:8,a:0}, {x:-6,a:-0.3}, {x:6,a:0.3} ] },
  { min:4.00, name:'星尘',  shots:[ {x:0,a:0}, {x:-8,a:0}, {x:8,a:0}, {x:-6,a:-0.3}, {x:6,a:0.3} ], cannon:true }
];
STG.dmgMul = function(power) { return 1 + (power - 1) * 0.25; };
// 实际伤害乘数 = Power 曲线 × 强化卡 atk_dmg(main.js syncMods 把 S.mods 挂到 STG.mods)
STG.totalDmgMul = function(power) { return STG.dmgMul(power) * ((STG.mods && STG.mods.dmgMul) || 1); };
STG.powerType = function(p) {
  for (var i = STG.POWER_TYPES.length - 1; i >= 0; i--) {
    if (p >= STG.POWER_TYPES[i].min - 0.001) return STG.POWER_TYPES[i];
  }
  return STG.POWER_TYPES[0];
};

// ═══ 三主炮(开局三选一) ═══
// power 档位: [P1,P2,P3,P4,P5(八卦炉)]
// n: 每次射击弹数; lockBonus/trackDist: 星追; center: 星散中央直弹; w: 魔炮激光宽
STG.GUNS = {
  chase: {
    name: '星追型', sub: '自动索敌 · 上手容易', icon: '🔍',
    interval: 0.09, dmg: 10, speed: 520,
    lockMax: 3, turnRate: 4.5,
    desc: '子弹自动追踪最近敌人,低伤高速,清杂舒适',
    power: [
      { n:1 }, { n:2 }, { n:3, lockBonus:1 }, { n:3, lockBonus:2, trackDist:1.3 }, { n:4, lockBonus:2, trackDist:1.5 }
    ],
    perks: {
      track_up:   { name:'追踪强化',   icon:'🎯', max:2, desc:'转向+40% · 锁敌距离+30%' },
      multi_lock:{ name:'多目标锁定', icon:'👥', max:1, desc:'同时锁定目标 +1' },
      hit_splash:{ name:'命中溅射',   icon:'💥', max:2, desc:'命中爆炸(半径18, 50%伤害)' },
      shot_num:   { name:'弹数 +1',    icon:'🔢', max:2, desc:'每次射击 +1 发' },
      rate_up:    { name:'高速施法',   icon:'⚡', max:3, desc:'射击间隔 -7%' },
      dmg_up:     { name:'星追·增幅', icon:'✨', max:3, desc:'伤害 +12%' }
    }
  },
  spread: {
    name: '星散型', sub: '近距离散射 · 高风险高收益', icon: '🎇',
    interval: 0.12, dmg: 14, speed: 650,
    desc: '扇形散射,越贴脸命中弹数越多,与擦弹联动',
    power: [
      { n:3 }, { n:5 }, { n:7 }, { n:7, center:true }, { n:9 }
    ],
    perks: {
      fan_up:    { name:'扇形扩展',   icon:'📐', max:2, desc:'角度+15% · 弹数+1' },
      close_up:  { name:'贴脸强化',   icon:'🫱', max:3, desc:'150px内伤害 +20%' },
      splash_up: { name:'溅射爆破',   icon:'💥', max:2, desc:'命中爆炸半径 +20' },
      shot_num:  { name:'弹数 +1',    icon:'🔢', max:2, desc:'每次射击 +1 发' },
      rate_up:   { name:'高速施法',   icon:'⚡', max:3, desc:'射击间隔 -7%' },
      dmg_up:    { name:'星散·增幅', icon:'✨', max:3, desc:'伤害 +12%' }
    }
  },
  cannon: {
    name: '魔炮型', sub: '蓄力爆发 · Boss杀手', icon: '🔆',
    interval: 0.1, dmg: 36, speed: 0,
    desc: '蓄力→激光贯穿→冷却循环,蓄力期间减速',
    power: [
      { w:28 }, { w:32 }, { w:36 }, { w:40 }, { w:46 }
    ],
    perks: {
      charge_up: { name:'蓄力加速',   icon:'⏳', max:2, desc:'蓄力时间 -15%' },
      pulse_up:  { name:'脉冲强化',   icon:'〰️', max:2, desc:'激光持续 +20%' },
      cool_up:   { name:'过热解除',   icon:'❄️', max:2, desc:'冷却 -30%' },
      width_up:  { name:'宽度强化',   icon:'📏', max:2, desc:'激光宽 +20%' },
      dmg_up:    { name:'魔炮·增幅', icon:'✨', max:3, desc:'伤害 +15%' },
      star_burst:{ name:'星尘汇聚',   icon:'🌠', max:1, desc:'发射瞬间迸发6颗星尘弹' }
    }
  }
};
// 主炮 Power 档位
STG.gunPower = function(gun, power) {
  var idx = Math.max(0, Math.min(4, Math.floor(power) - 1));
  return STG.GUNS[gun].power[idx];
};

// ── 经验需求 ──
STG.expNeed = function(lv) { return STG.CONFIG.EXP_BASE + (lv - 1) * STG.CONFIG.EXP_GROW; };

// ── 通用升级池(三种主炮共用, 全带叠层上限) ──
// rarity: 1白 2蓝 3金
STG.UPGRADES = {
  atk_dmg:   { name:'魔炮强化',  icon:'⚡', rarity:2, max:3, desc:'伤害 +8%' },
  power_max: { name:'八卦炉',    icon:'🔥', rarity:3, max:1, desc:'Power 上限 +1(开放P5档)' },
  pierce_up: { name:'贯通强化',  icon:'➡️', rarity:2, max:2, desc:'25% 概率穿透 1 个敌人' },
  shield:    { name:'护身结界',  icon:'🛡️', rarity:3, max:1, desc:'抵挡一次中弹(不扣星)' },
  doll:      { name:'替身人偶',  icon:'🎎', rarity:3, max:1, desc:'致死时以 2 星复活(一次性)' },
  hit_small: { name:'凝神',      icon:'🎯', rarity:1, max:2, desc:'判定点缩小 15%' },
  crystal:   { name:'魔力结晶',  icon:'💎', rarity:2, max:2, desc:'星上限 +1' },
  speed:     { name:'疾风步',    icon:'💨', rarity:1, max:3, desc:'移速 +12%' },
  bomb_up:   { name:'符纸',      icon:'📜', rarity:2, max:2, desc:'符卡上限 +1' },
  magnet:    { name:'吸星法阵',  icon:'🧲', rarity:1, max:3, desc:'道具吸附范围 +40' },
  graze_r:   { name:'擦弹范围',  icon:'💠', rarity:1, max:3, desc:'擦弹判定 +8' },
  exp_up:    { name:'悟性',      icon:'📖', rarity:2, max:2, desc:'经验获取 +35%' },
  greed:     { name:'贪婪魔法',  icon:'💰', rarity:2, max:2, desc:'蓝点分数 +100%' }
};

// ── 关卡: 每 Stage 20 波(连续刷) ──
// 小怪波 1-16 / 精英波 5,10,15 / Boss 波 20
STG.WAVE_CFG = {
  perStage: 20,
  eliteWaves: [5, 15],
  miniBossWave: 10,      // 道中简版Boss
  bossWave: 20,
  waveDur: 6,            // 每波间隔 s(连续刷)
  startDelay: 2          // 开局到第 1 波的延迟
};

// ── 难度曲线 ──
// 敌人血量: 随波次+Stage 递增
STG.hpMul = function(stage, wave) {
  return (1 + 0.06 * (wave - 1)) * (1 + 0.35 * (stage - 1));
};
// 敌人弹速: 随 Stage 递增
STG.spMul = function(stage) { return 1 + 0.1 * (stage - 1); };

// ── 小怪波模板池(基础+组合刷新) ──
// 每波随机抽一个, 避免连续重复
STG.WAVE_TEMPLATES = [
  'flank',      // 左右夹击
  'row',        // 横排
  'snake',      // 蛇形交叉
  'center',     // 中央环形
  'flankRow',   // 夹击 + 横排(组合)
  'snakeFlank', // 蛇形 + 夹击(组合)
  'dualSnake',  // 双列蛇形交叉
  'ringCross',  // 双环交错
  'vform',      // V 字阵
  'centerRow'   // 环形 + 横排(组合)
];

// ── 多 Boss 配置(每 Stage 一位) ──
// timeSpell: 时符(最终相位) — Boss 无敌倒计时, 撑过即击破
// spells 含 3 张(五六面)时相位自动扩为 7 段
// n1/n2: 常规弹幕角色配色(主色/副色)
STG.BOSSES = [
  {
    name: '琪露诺', title: '湖之冰精 · ⑨', img: 'boss1', color: '#7cc4ff',
    n1: 'b3', n2: 'b1',
    bgm: 'audio/midi/baka.mid',
    spells: ['冰符·完美冻结', '霜符·冻气蔓延'],
    timeSpell: { name: '九秒的冰狱', dur: 30 },
    segHp: 5100, hpMul: 1
  },
  {
    name: '芙兰朵露', title: '红魔之妹', img: 'boss2', color: '#ff6b6b',
    n1: 'b2', n2: 'b6',
    bgm: 'audio/midi/fulanduolu.mid',
    spells: ['禁忌·红魔法', '秘弹·莱瓦汀'],
    timeSpell: { name: '毁灭之夜', dur: 30 },
    dash: true,
    segHp: 5800, hpMul: 1.25
  },
  {
    name: '风见幽香', title: '四季鲜花之主', img: 'boss3', color: '#6fcf97',
    n1: 'b5', n2: 'b1',
    bgm: 'audio/midi/fengjianyouxiang.mid',
    spells: ['花符·幻想乡的开花', '春花·幻想春花'],
    timeSpell: { name: '花之困境', dur: 45 },
    dash: true,
    segHp: 6700, hpMul: 1.5
  },
  {
    name: '蕾米莉亚', title: '永远的红幼月', img: 'boss4', color: '#d63a5f',
    n1: 'b2', n2: 'b5',
    bgm: 'audio/midi/leimiliya.mid',
    spells: ['神枪·冈格尼尔', '夜符·黑夜狂欢'],
    timeSpell: { name: '永夜红月', dur: 45 },
    night: true,
    segHp: 8000, hpMul: 1.75
  },
  {
    name: '八云紫', title: '境界的妖怪贤者', img: 'boss5', color: '#b06ad4',
    n1: 'b6', n2: 'b5',
    bgm: 'audio/midi/bayunzi.mid',
    spells: ['不思议结界', '境符·梦与现实', '罔两·八云紫的神隐'],
    timeSpell: { name: '境界之牢', dur: 60 },
    segHp: 5600, hpMul: 2
  },
  {
    name: '幽幽子', title: '幽冥的亡者公主', img: 'boss6', color: '#e8b4d8',
    n1: 'b6', n2: 'b1',
    bgm: 'audio/midi/youyouzi.mid',
    spells: ['亡我乡·无道之道', '死符·逆死之蝶', '樱符·樱吹雪'],
    timeSpell: { name: '无常之春', dur: 60 },
    segHp: 6500, hpMul: 2.3
  }
];
STG.bossFor = function(stage) {
  var idx = Math.min(stage - 1, STG.BOSSES.length - 1);
  return STG.BOSSES[idx];
};

// ── 随机工具 ──
STG.rnd = function(a, b) { return a + Math.random() * (b - a); };
STG.rndi = function(a, b) { return Math.floor(STG.rnd(a, b + 1)); };
STG.pick = function(arr) { return arr[Math.floor(Math.random() * arr.length)]; };
STG.dist2 = function(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; };
STG.angleTo = function(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); };
