// =============================================
//  抽象角色大乱斗 · 角色注册表
//  新增角色: 在这里加一条即可, 立绘放 images/polo/ 或复用站点素材
//  立绘加载失败会自动回退到下一张, 再失败用程序化占位球
//  bgm 可选: 角色专属主题曲, 缺省用 audio/bgm.mp3
// =============================================
window.POLO_CHARS = [
  {
    id: 'reimu',
    name: '灵梦',
    title: '博丽神社的巫女',
    emoji: '⛩️',
    img: 'images/touhou_ninnin/reimu.jpg',
    imgFallback: 'images/touhou_ninnin/reimu.webp',
    color1: '#ef4444',
    color2: '#ffffff',
    radius: 26,
    maxHp: 1000,
    skill: {
      type: 'orbit_orb',
      name: '阴阳玉护体',
      desc: '每 3.5s 生成一颗阴阳玉绕身旋转, 永续叠加',
      interval: 3.5,        // 生成间隔(秒), 狂暴时减半
      orbRadius: 36,        // 玉的轨道半径
      orbSize: 10,          // 玉的碰撞/绘制半径
      orbitSpeed: 150,      // 转速(度/秒)
      orbDamage: 38,        // 单颗玉碰撞伤害, 狂暴时 ×1.5
      orbCd: 0.65,          // 每颗玉碰撞伤害冷却
      knockback: 30         // 玉命中击退力度
    }
  },
  {
    id: 'marisa',
    name: '魔理沙',
    title: '普通的魔法使',
    emoji: '🧙',
    img: 'images/touhou_ninnin/marisa.jpg',
    color1: '#f0c060',
    color2: '#1a1520',
    radius: 26,
    maxHp: 1000,
    skill: {
      type: 'laser',
      name: 'Master Spark',
      desc: '每 3.9s 蓄力锁定敌人 0.8s 后的走位, 光束持续横扫追敌, 单发 280',
      interval: 3.9,        // 发射间隔(秒), 狂暴时减半
      chargeTime: 1.0,      // 蓄力时长(与 charge_up.wav 1s 对齐)
      beamTime: 0.35,       // 光柱持续时间
      beamWidth: 56,        // 光柱宽度(判定)
      damage: 250,          // 命中伤害, 狂暴时 ×1.5
      knockback: 300,       // 命中强击退
      leadTime: 0.8,        // 蓄力瞄准: 预测敌人 0.8s 后的位置
      beamTurn: 1.2,        // 光束扫射转速(rad/s, 追敌偏转上限)
      chargeSpeedMul: 0.5   // 蓄力期间移速倍率
    }
  },
  {
    id: 'chuying',
    name: '褚嬴',
    title: '千年棋魂',
    emoji: '⚫',
    img: 'images/polo/chuying.JPG',
    color1: '#3a3a4a',
    color2: '#c9c9d6',
    radius: 26,
    maxHp: 1000,
    skill: {
      type: 'go_stone',
      name: '落子无悔',
      desc: '每 2.6s 随机落黑/白子(0.7s 预警): 黑子重创(中心 120/边缘 75); 白子轻砸并放 2 颗追踪小棋(28 伤); 棋子残留 5s 挡路; 每落 6 子提速(千年底蕴)',
      interval: 2.6,        // 基础间隔
      intervalMin: 1.7,     // 成长后间隔下限
      growEvery: 6,         // 每落子数成长一次
      growStep: 0.35,       // 每次缩短量
      warnTime: 0.7,        // 落子预警时长
      aoe: 74,              // 砸落范围半径
      damage: 75,           // 黑子砸落伤害(边缘)
      innerDamage: 120,     // 黑子砸落伤害(中心)
      whiteDamage: 50,      // 白子砸落伤害(中心)
      whiteEdge: 35,        // 白子砸落伤害(边缘)
      trackN: 2,            // 白子放出的追踪小棋数量
      trackDamage: 28,      // 追踪小棋伤害
      trackSpeed: 240,      // 追踪小棋速度
      stoneRadius: 30,      // 残留棋子碰撞半径
      stoneLife: 5,         // 残留时长
      maxStones: 6,         // 同场残留上限
      knockback: 200
    },
    bgm: 'audio/wangchuanbian.mp3'
  },
  {
    id: 'walkingpig',
    name: '寸头猪',
    title: '没事沙漠溜达',
    emoji: '🐷',
    img: 'images/polo/walkingpig.PNG',
    color1: '#e8a14b',
    color2: '#7a4a1f',
    radius: 26,
    maxHp: 1000,
    speedMul: 1.2,          // 被动移速倍率(爱溜达)
    skill: {
      type: 'desert_dash',
      name: '没事走走',
      desc: '移速 +20%; 每 2.2s 朝敌人冲刺(期间免擦伤, 撞碎一次性奶盾), 撞到敌人 130 伤; 每 6s 补水回 32 血',
      interval: 2.2,        // 冲刺间隔
      dashTime: 0.5,        // 冲刺时长
      dashMult: 3.4,        // 冲刺速度倍率
      dashDamage: 130,      // 冲刺撞击伤害
      dashKnock: 150,       // 冲刺撞击击退
      waterInterval: 6,     // 补水间隔
      waterHeal: 32         // 补水回血量
    }
  },
  {
    id: 'dogmilk',
    name: '野生狗奶',
    title: '保质期：永久',
    emoji: '🥛',
    img: 'images/polo/dogmilk.JPG',
    color1: '#f7f3e8',
    color2: '#c4b08a',
    radius: 26,
    maxHp: 1000,
    bgm: 'audio/gounai.mp3',
    skill: {
      type: 'milk_guard',
      name: '保质期：永久',
      desc: '每 10.5s 刷新一面一次性奶盾: 挡下任意一次攻击(含激光)后碎盾反伤 60; 每 1.8s 吐奶弹 36 伤; 每 5.5s 自回 16 血',
      shieldInterval: 10.5, // 护盾刷新间隔
      shield: 1,            // 一次性盾(任意一击全额挡)
      reflect: 60,          // 破盾反伤
      milkInterval: 1.8,    // 奶弹间隔
      milkDamage: 36,       // 奶弹伤害
      milkSpeed: 260,       // 奶弹速度
      milkLife: 2.2,        // 奶弹存活(秒)
      regenInterval: 5.5,   // 自回间隔
      regen: 16             // 自回量
    }
  },
  {
    id: 'xujiayin',
    name: '许家印',
    title: '空城计·卷款跑路',
    emoji: '🏗️',
    img: 'images/polo/xujiayin.JPG',
    color1: '#c98a3a',
    color2: '#5a3a1a',
    radius: 26,
    maxHp: 1000,
    bgm: 'audio/friends-wine.mp3',
    skill: {
      type: 'gate_revive',
      name: '空城计',
      desc: '每 3.8s 天降一座巨型横门: 0.5s 预判预警后砸落(落地冲击 90 伤, 半径 60), 门墙横卧残留 8s 挡路(方形碰撞, 撞门 90 伤, 上限 3 座); 死亡时卷款跑路: 20% 血复活 + 瞬移 + 0.4s 无敌',
      interval: 3.8,        // 盖门间隔
      gateLife: 8,          // 门存在时长
      gateDamage: 90,       // 撞门/落地伤害
      gateKnock: 200,       // 撞门击退
      gateFall: 0.3,        // 大门下落动画时长
      gateShockR: 60,       // 落地冲击半径
      maxGates: 3,          // 同场上限
      reviveHp: 0.2,        // 复活血量比例
      reviveInvuln: 0.4     // 复活无敌时长
    }
  },
  {
    id: 'meituan',
    name: '美团',
    title: '准时宝 · 先送到家',
    emoji: '🦘',
    img: 'images/polo/meituan.JPG',
    color1: '#ffb400',
    color2: '#2a2620',
    radius: 26,
    maxHp: 1000,
    speedMul: 1.1,          // 袋鼠被动: 溜得快
    skill: {
      type: 'deliver',
      name: '准时宝投递',
      desc: '移速 +10%; 每 2.6s 向敌人投一袋外卖: 命中 65 伤 + 好评返现回血 18; 外卖袋命中或撞墙落地成箱 4s 挡路(撞箱 20 伤, 上限 4 箱)',
      interval: 2.6,        // 投递间隔
      throwSpeed: 290,      // 外卖袋飞行速度
      throwDamage: 65,      // 命中伤害
      heal: 18,             // 好评返现回血
      boxLife: 4,           // 外卖箱残留时长
      boxRadius: 24,        // 外卖箱碰撞半径
      boxDmg: 20,           // 撞箱伤害
      maxBoxes: 4           // 同场外卖箱上限
    }
  }
];