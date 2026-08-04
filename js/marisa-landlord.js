// =============================================
//  魔理沙的赛钱危机 · 幸运房东like Roguelike
//  纯逻辑(符号/道具/结算)与 DOM 分离,可在 node 中
//  require 做数值模拟(浏览器端自动启动 UI)
//
//  角色图片命名约定: images/landlord/<id>.png
//  (缺图自动回退 emoji;非角色符号无需图片)
//  角色 id 一览:
//    cirno rumia mystia chen ran alice koakuma meiling
//    nitori momiji reisen tewi rin kasa aya marisa reimu
//    sakuya remilia patchouli youmu yuyuko sanae suwako
//    suika yuugi eirin mokou yuuka yukari flandre kanako
//    kaguya utsuho satori koishi komachi keine lily nightbug
//    tenshi
// =============================================
(function(root) {
'use strict';

/* ═══════════ 1. 常量配置 ═══════════ */
var CONFIG = {
  COLS: 5, ROWS: 4, CELLS: 20,
  START_COINS: 10, MIN_DECK: 5,
  RENTS: [30, 70, 130, 200, 300, 420, 560, 720, 900, 1150, 1400, 1700],
  SPINS: [5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10],
  ENDLESS_MULT: 1.4, ENDLESS_SPINS: 10,
  WIN_DAY: 12,
  SKIP_COINS: 3, ITEM_SKIP_COINS: 5,
  START_DECK: ['coin', 'mushroom', 'onigiri', 'tea', 'frog'],
  RARE_W: [[65, 25, 8, 2], [58, 28, 11, 3], [50, 31, 14, 5], [42, 33, 18, 7]],   // 符号稀有度权重,按天数 1-3/4-6/7-9/10+ 爬升
  ITEM_W: [50, 32, 15, 3],                       // 道具稀有度权重
  BGM: 'audio/sfx/上海爱莉丝幻乐团 - 冷吟閑酔.mp3',
  SAVE_KEY: 'ml_save_v1', BEST_KEY: 'ml_best_v1', MUTE_KEY: 'ml_muted',
  LB_GAME: 'landlord'
};

function rentFor(day) {
  if (day <= CONFIG.RENTS.length) return CONFIG.RENTS[day - 1];
  return Math.round(CONFIG.RENTS[CONFIG.RENTS.length - 1] * Math.pow(CONFIG.ENDLESS_MULT, day - CONFIG.RENTS.length));
}
function spinsFor(day) {
  return day <= CONFIG.SPINS.length ? CONFIG.SPINS[day - 1] : CONFIG.ENDLESS_SPINS;
}

/* ═══════════ 2. 棋盘辅助(纯函数) ═══════════ */
function adjPos(pos) {
  var c = pos % CONFIG.COLS, r = (pos - c) / CONFIG.COLS, out = [];
  if (c > 0) out.push(pos - 1);
  if (c < CONFIG.COLS - 1) out.push(pos + 1);
  if (r > 0) out.push(pos - CONFIG.COLS);
  if (r < CONFIG.ROWS - 1) out.push(pos + CONFIG.COLS);
  return out;
}
function isEdge(pos) {
  var c = pos % CONFIG.COLS, r = (pos - c) / CONFIG.COLS;
  return r === 0 || r === CONFIG.ROWS - 1 || c === 0 || c === CONFIG.COLS - 1;
}
function alive(cell) { return !!cell && !cell.dead && cell.id !== 'empty'; }
function hasTag(id, t) { return (SYMBOLS[id].tags || []).indexOf(t) >= 0; }
function B_countTag(B, t) { var n = 0, i; for (i = 0; i < B.length; i++) if (alive(B[i]) && hasTag(B[i].id, t)) n++; return n; }
function B_countId(B, id) { var n = 0, i; for (i = 0; i < B.length; i++) if (alive(B[i]) && B[i].id === id) n++; return n; }
function B_countEmpty(B) { var n = 0, i; for (i = 0; i < B.length; i++) if (B[i].id === 'empty' && !B[i].dead) n++; return n; }
function B_hasId(B, id) { return B_countId(B, id) > 0; }
function adjAlive(B, pos) { var n = 0, a = adjPos(pos), i; for (i = 0; i < a.length; i++) if (alive(B[a[i]])) n++; return n; }
function adjCountTag(B, pos, t) { var n = 0, a = adjPos(pos), i; for (i = 0; i < a.length; i++) if (alive(B[a[i]]) && hasTag(B[a[i]].id, t)) n++; return n; }
function adjCountId(B, pos, id) { var n = 0, a = adjPos(pos), i; for (i = 0; i < a.length; i++) if (alive(B[a[i]]) && B[a[i]].id === id) n++; return n; }
function adjCountEmpty(B, pos) { var n = 0, a = adjPos(pos), i; for (i = 0; i < a.length; i++) if (B[a[i]].id === 'empty' && !B[a[i]].dead) n++; return n; }
function adjHasId(B, pos, id) { return adjCountId(B, pos, id) > 0; }
function uniqTagCount(B, t) { var seen = {}, n = 0, i; for (i = 0; i < B.length; i++) if (alive(B[i]) && hasTag(B[i].id, t) && !seen[B[i].id]) { seen[B[i].id] = 1; n++; } return n; }

// 消灭某格(触发遗言/复活);返回 1=成功消灭
function destroyCell(B, tpos, X, ev) {
  var c = B[tpos];
  if (!alive(c)) return 0;
  var d = SYMBOLS[c.id];
  if (d.undying) return 0;
  if (d.onDestroyed && d.onDestroyed(B, tpos, X, ev)) return 0;   // 存活
  c.dead = true;
  ev.push({ pos: tpos, kind: 'die', id: c.id });
  return 1;
}
// 消灭相邻满足条件的符号,返回消灭数
function destroyAdj(B, pos, X, ev, filter) {
  var a = adjPos(pos), n = 0, i;
  for (i = 0; i < a.length; i++) {
    var c = B[a[i]];
    if (!alive(c)) continue;
    if (filter.tag && !hasTag(c.id, filter.tag)) continue;
    if (filter.id && c.id !== filter.id) continue;
    if (filter.tags) {
      var ok = false;
      for (var t = 0; t < filter.tags.length; t++) if (hasTag(c.id, filter.tags[t])) ok = true;
      if (!ok) continue;
    }
    if (destroyCell(B, a[i], X, ev)) n++;
  }
  return n;
}
// 消耗(永久):吃掉的收藏符号会从牌库永久烧掉;生成的免费燃料正常消耗
// 保底护栏: 收藏 ≤ MIN_DECK 时拒绝消耗收藏符号
function consumeAdj(B, pos, X, ev, filter) {
  var a = adjPos(pos), n = 0, i;
  for (i = 0; i < a.length; i++) {
    var c = B[a[i]];
    if (!alive(c)) continue;
    if (filter.tag && !hasTag(c.id, filter.tag)) continue;
    if (filter.id && c.id !== filter.id) continue;
    if (filter.tags) {
      var ok2 = false;
      for (var t = 0; t < filter.tags.length; t++) if (hasTag(c.id, filter.tags[t])) ok2 = true;
      if (!ok2) continue;
    }
    if (c.u && X.S.collection.length <= CONFIG.MIN_DECK) continue;
    if (destroyCell(B, a[i], X, ev)) { if (c.u) X.removeU(c.u); n++; }
  }
  return n;
}
// 在随机空格生成燃料(仅当转,不进收藏)
function spawnFuel(B, id, p, ev, rnd) {
  var empt = [], i;
  for (i = 0; i < B.length; i++) if (B[i].id === 'empty' && !B[i].dead) empt.push(i);
  if (!empt.length) return false;
  var t = empt[Math.floor(rnd() * empt.length)];
  B[t] = { id: id, p: p || 0 };
  ev.push({ pos: t, kind: 'born', id: id });
  return true;
}

/* ═══════════ 3. 符号数据(58 种) ═══════════ */
// 字段: name 名称, e emoji, img 图片路径, r 稀有度0-3, v 基础值, tags 标签
// fx(B,pos,X,ev,rnd) → {add, msg}   pre 结算前钩子   onDestroyed 遗言(返回true=存活)
var SYMBOLS = {
  /* ── 普通 r0:燃料 ── */
  coin:     { name: '硬币',   e: '🪙', r: 0, v: 1, tags: [], d: '一枚普通的赛钱。' },
  mushroom: { name: '蘑菇',   e: '🍄', r: 0, v: 1, tags: ['食材', '自然'], d: '魔法之森的特产,魔理沙的最爱。' },
  onigiri:  { name: '饭团',   e: '🍙', r: 0, v: 1, tags: ['食材'], d: '馅料未知。' },
  dango:    { name: '麻薯',   e: '🍡', r: 0, v: 1, tags: ['食材'], d: '软软糯糯。' },
  cucumber: { name: '黄瓜',   e: '🥒', r: 0, v: 1, tags: ['食材'], d: '河童最爱。' },
  herb:     { name: '药草',   e: '🌿', r: 0, v: 1, tags: ['食材', '自然'], d: '永琳的药材,闻起来很苦。' },
  sake:     { name: '清酒',   e: '🍶', r: 0, v: 1, tags: ['饮品'], d: '鬼的最爱。' },
  tea:      { name: '红茶',   e: '☕', r: 0, v: 1, tags: ['饮品'], d: '红魔馆的下午茶。' },
  book:     { name: '魔导书', e: '📖', r: 0, v: 1, tags: ['道具'], d: '帕秋莉的藏书(疑似盗版)。' },
  ofuda:    { name: '符札',   e: '🎴', r: 0, v: 1, tags: ['道具'], d: '灵梦的退治符,只是张纸而已。' },
  doll:     { name: '人偶',   e: '🪆', r: 0, v: 1, tags: ['道具'], d: '相邻每个爱丽丝 +2。',
    fx: function(B, pos, X) { return { add: adjCountId(B, pos, 'alice') * 2 }; } },
  frog:     { name: '青蛙',   e: '🐸', r: 0, v: 1, tags: ['动物'], d: '呱呱。各方势力都对它虎视眈眈。',
    onDestroyed: function(B, pos, X, ev) {
      if (B_hasId(B, 'suwako')) ev.push({ pos: pos, kind: 'eat', gain: 1, msg: '蛙神护佑 +1' });
      return false;
    } },
  bug:      { name: '萤火虫', e: '🐛', r: 0, v: 1, tags: ['动物'], d: '夏夜的小光点。' },
  fairy:    { name: '妖精',   e: '🧚', r: 0, v: 1, tags: ['妖怪'], d: '随处可见的捣蛋鬼。' },
  kedama:   { name: '毛玉',   e: '⚪', r: 0, v: 0, tags: ['妖怪'], d: '本身一文不值,被消灭时 +3。',
    onDestroyed: function(B, pos, X, ev) { ev.push({ pos: pos, kind: 'eat', gain: 3, msg: '爆毛球 +3' }); return false; } },
  sakura:   { name: '樱花',   e: '🌸', r: 0, v: 1, tags: ['自然'], d: '白玉楼飘来的花瓣。' },
  star:     { name: '星星',   e: '⭐', r: 0, v: 1, tags: ['自然'], d: '早苗唤来的奇迹。' },
  ice:      { name: '冰晶',   e: '❄️', r: 0, v: 1, tags: ['自然'], d: '琪露诺的杰作。' },
  hanrei:   { name: '半灵',   e: '👻', r: 0, v: 1, tags: ['妖怪'], d: '妖梦的半身,白白胖胖。' },
  peach:    { name: '桃子',   e: '🍑', r: 0, v: 1, tags: ['食材'], d: '天人的仙桃,汁水饱满。' },
  /* ── 白卡生产者:每转在场时 +1 燃料进收藏 ── */
  komachi:  { name: '小町',   e: '🚣', img: 'images/landlord/komachi.png', r: 0, v: 1, tags: ['角色'], d: '摆渡:每转在场时,+1 硬币进收藏。',
    fx: function(B, pos, X, ev) { X.addToCollection('coin'); ev.push({ pos: pos, kind: 'grow', msg: '+1 硬币进收藏' }); return { add: 0 }; } },
  keine:    { name: '慧音',   e: '🎓', img: 'images/landlord/keine.png', r: 0, v: 1, tags: ['角色'], d: '寺子屋:每转在场时,+1 书进收藏。',
    fx: function(B, pos, X, ev) { X.addToCollection('book'); ev.push({ pos: pos, kind: 'grow', msg: '+1 书进收藏' }); return { add: 0 }; } },
  lily:     { name: '莉莉白', e: '🌷', img: 'images/landlord/lily.png', r: 0, v: 1, tags: ['角色'], d: '报春:每转在场时,+1 樱花进收藏。',
    fx: function(B, pos, X, ev) { X.addToCollection('sakura'); ev.push({ pos: pos, kind: 'grow', msg: '+1 樱花进收藏' }); return { add: 0 }; } },
  nightbug: { name: '莉格露', e: '🪲', img: 'images/landlord/nightbug.png', r: 0, v: 1, tags: ['角色'], d: '虫群:每转在场时,+1 萤火虫进收藏。',
    fx: function(B, pos, X, ev) { X.addToCollection('bug'); ev.push({ pos: pos, kind: 'grow', msg: '+1 萤火虫进收藏' }); return { add: 0 }; } },
  tenshi:   { name: '天子',   e: '🗿', img: 'images/landlord/tenshi.png', r: 0, v: 1, tags: ['角色'], d: '大丰收:每 2 转在场时,+5 个桃子进收藏。启动快,但会稀释牌库。',
    fx: function(B, pos, X, ev) {
      var c = B[pos];
      c.c = (c.c || 0) + 1;
      if (c.c >= 2) {
        c.c = 0;
        for (var i = 0; i < 5; i++) X.addToCollection('peach');
        ev.push({ pos: pos, kind: 'grow', msg: '+5 桃子进收藏!' });
      }
      return { add: 0 };
    } },

  /* ── 优秀 r1:小引擎/辅助 ── */
  cirno:    { name: '琪露诺', e: '⑨', img: 'images/landlord/cirno.png', r: 1, v: 2, tags: ['角色'], d: '冻青蛙:消耗相邻青蛙(永久),每个 +6。',
    fx: function(B, pos, X, ev) { var n = consumeAdj(B, pos, X, ev, { id: 'frog' }); return { add: n * X.eatVal(6), msg: n ? '冻青蛙 ×' + n : null }; } },
  rumia:    { name: '露米娅', e: '🌑', img: 'images/landlord/rumia.png', r: 1, v: 2, tags: ['角色'], d: '消耗相邻动物(永久),每个 +4。',
    fx: function(B, pos, X, ev) { var n = consumeAdj(B, pos, X, ev, { tag: '动物' }); return { add: n * X.eatVal(4), msg: n ? '吃掉了 ×' + n : null }; } },
  mystia:   { name: '米斯蒂亚', e: '🐦', img: 'images/landlord/mystia.png', r: 1, v: 2, tags: ['角色'], d: '相邻每个食材 +1;场上有露米娅时 +3。',
    fx: function(B, pos, X) { return { add: adjCountTag(B, pos, '食材') + (B_hasId(B, 'rumia') ? 3 : 0) }; } },
  chen:     { name: '橙',     e: '🐱', img: 'images/landlord/chen.png', r: 1, v: 2, tags: ['角色'], d: '相邻有蓝时 +4。',
    fx: function(B, pos) { return { add: adjHasId(B, pos, 'ran') ? 4 : 0 }; } },
  ran:      { name: '蓝',     e: '🦊', img: 'images/landlord/ran.png', r: 1, v: 2, tags: ['角色'], d: '场上每只橙 +2;相邻有紫时 +4。',
    fx: function(B, pos) { return { add: B_countId(B, 'chen') * 2 + (adjHasId(B, pos, 'yukari') ? 4 : 0) }; } },
  alice:    { name: '爱丽丝', e: '🎀', img: 'images/landlord/alice.png', r: 1, v: 2, tags: ['角色'], d: '每转在空格放 1 个人偶;相邻每个人偶 +2。',
    pre: function(B, pos, X, ev, rnd) {
      var empt = [], i;
      for (i = 0; i < B.length; i++) if (B[i].id === 'empty' && !B[i].dead) empt.push(i);
      if (!empt.length) return;
      var t = empt[Math.floor(rnd() * empt.length)];
      B[t] = { id: 'doll', p: 0 };
      ev.push({ pos: t, kind: 'born', id: 'doll' });
    },
    fx: function(B, pos) { return { add: adjCountId(B, pos, 'doll') * 2 }; } },
  koakuma:  { name: '小恶魔', e: '😈', img: 'images/landlord/koakuma.png', r: 1, v: 2, tags: ['角色'], d: '每本书 +1;场上有帕秋莉时再 +2。',
    fx: function(B) { return { add: B_countId(B, 'book') + (B_hasId(B, 'patchouli') ? 2 : 0) }; } },
  meiling:  { name: '红美铃', e: '🐲', img: 'images/landlord/meiling.png', r: 1, v: 2, tags: ['角色'], d: '门番摸鱼:相邻每个空格 +2。',
    fx: function(B, pos) { return { add: adjCountEmpty(B, pos) * 2 }; } },
  nitori:   { name: '荷取',   e: '🔧', img: 'images/landlord/nitori.png', r: 1, v: 2, tags: ['角色'], d: '每个黄瓜 +2,每个道具 +1。',
    fx: function(B) { return { add: B_countId(B, 'cucumber') * 2 + B_countTag(B, '道具') }; } },
  momiji:   { name: '椛',     e: '🍁', img: 'images/landlord/momiji.png', r: 1, v: 2, tags: ['角色'], d: '每个空格 +1;在棋盘边缘时再 +3。',
    fx: function(B, pos) { return { add: B_countEmpty(B) + (isEdge(pos) ? 3 : 0) }; } },
  reisen:   { name: '铃仙',   e: '🐰', img: 'images/landlord/reisen.png', r: 1, v: 2, tags: ['角色'], d: '每株药草 +1;场上有永琳时再 +3。',
    fx: function(B) { return { add: B_countId(B, 'herb') + (B_hasId(B, 'eirin') ? 3 : 0) }; } },
  tewi:     { name: '帝',     e: '🐇', img: 'images/landlord/tewi.png', r: 1, v: 2, tags: ['角色'], d: '幸运兔:每转随机 +1~4。',
    fx: function(B, pos, X, ev, rnd) { return { add: 1 + Math.floor(rnd() * 4) }; } },
  rin:      { name: '阿燐',   e: '🐈‍⬛', img: 'images/landlord/rin.png', r: 1, v: 2, tags: ['角色'], d: '尸体搬运:消耗相邻妖怪(永久),每个 +3;每消耗 1 个永久 +1。',
    fx: function(B, pos, X, ev) { var n = consumeAdj(B, pos, X, ev, { tag: '妖怪' }); if (n) X.grow('rin', n); return { add: n * X.eatVal(3), msg: n ? '搬运尸体 ×' + n : null }; } },
  kasa:     { name: '小伞',   e: '☂️', img: 'images/landlord/kasa.png', r: 1, v: 2, tags: ['角色'], d: '吓不到人:每个空格 +1。',
    fx: function(B) { return { add: B_countEmpty(B) }; } },
  sunflower:{ name: '向日葵', e: '🌻', r: 1, v: 2, tags: ['自然'], d: '相邻每个自然 +1。',
    fx: function(B, pos) { return { add: adjCountTag(B, pos, '自然') }; } },
  aya:      { name: '文',     e: '📷', img: 'images/landlord/aya.png', r: 1, v: 2, tags: ['角色'], d: '独家新闻:场上每种不同角色 +1。',
    fx: function(B) { var n = uniqTagCount(B, '角色'); return { add: n, msg: '新闻素材 ×' + n }; } },
  /* ── 绿卡生产者:每转在空格生成燃料(仅当转,不进收藏) ── */
  petri:    { name: '孢子培养皿', e: '🧫', r: 1, v: 2, tags: [], d: '每转在空格培育 1 个蘑菇(仅当转)。',
    pre: function(B, pos, X, ev, rnd) { spawnFuel(B, 'mushroom', 0, ev, rnd); } },
  frogpound:{ name: '蛙鸣池塘', e: '🪷', r: 1, v: 2, tags: [], d: '每转在空格生成 1 只青蛙(仅当转)。',
    pre: function(B, pos, X, ev, rnd) { spawnFuel(B, 'frog', 0, ev, rnd); } },
  kedamanest:{ name: '毛玉窝', e: '🧶', r: 1, v: 2, tags: [], d: '每转在空格生成 1 只毛玉(仅当转)。',
    pre: function(B, pos, X, ev, rnd) { spawnFuel(B, 'kedama', 0, ev, rnd); } },
  takeout:  { name: '外出便当', e: '🥡', r: 1, v: 2, tags: [], d: '每转在空格生成 1 份随机食材(仅当转)。',
    pre: function(B, pos, X, ev, rnd) { var f = ['onigiri', 'dango', 'cucumber']; spawnFuel(B, f[Math.floor(rnd() * 3)], 0, ev, rnd); } },

  /* ── 稀有 r2:主引擎 ── */
  marisa:   { name: '魔理沙', e: '🧹', img: 'images/landlord/marisa.png', r: 2, v: 3, tags: ['角色'], d: '采蘑菇:场上每个蘑菇 +2。',
    fx: function(B) { return { add: B_countId(B, 'mushroom') * 2 }; } },
  reimu:    { name: '灵梦',   e: '⛩️', img: 'images/landlord/reimu.png', r: 2, v: 3, tags: ['角色'], d: '结界:相邻每个符号 +1。',
    fx: function(B, pos) { return { add: adjAlive(B, pos) }; } },
  sakuya:   { name: '咲夜',   e: '🔪', img: 'images/landlord/sakuya.png', r: 2, v: 3, tags: ['角色'], d: '每个饮品 +2;场上有蕾米莉亚时再 +3。',
    fx: function(B) { return { add: B_countTag(B, '饮品') * 2 + (B_hasId(B, 'remilia') ? 3 : 0) }; } },
  remilia:  { name: '蕾米莉亚', e: '🦇', img: 'images/landlord/remilia.png', r: 2, v: 3, tags: ['角色'], d: '每杯红茶 +3。',
    fx: function(B) { return { add: B_countId(B, 'tea') * 3 }; } },
  patchouli:{ name: '帕秋莉', e: '📚', img: 'images/landlord/patchouli.png', r: 2, v: 3, tags: ['角色'], d: '每本书 +2。',
    fx: function(B) { return { add: B_countId(B, 'book') * 2 }; } },
  youmu:    { name: '妖梦',   e: '⚔️', img: 'images/landlord/youmu.png', r: 2, v: 3, tags: ['角色'], d: '料理番长:相邻食材加工成料理🍱(3 价值),每份 +2;每个半灵 +2。',
    fx: function(B, pos, X, ev) {
      var a = adjPos(pos), i, n = 0;
      for (i = 0; i < a.length; i++) {
        var c = B[a[i]];
        if (alive(c) && hasTag(c.id, '食材')) { c.id = 'ryori'; n++; ev.push({ pos: a[i], kind: 'born', id: 'ryori' }); }
      }
      return { add: n * 2 + B_countId(B, 'hanrei') * 2, msg: n ? '加工料理 ×' + n : null };
    } },
  yuyuko:   { name: '幽幽子', e: '👘', img: 'images/landlord/yuyuko.png', r: 2, v: 3, tags: ['角色'], d: '吃掉相邻食材(+3)/料理(+5),收藏中的被永久消耗;每吃 1 个永久 +1。',
    fx: function(B, pos, X, ev) {
      var a = adjPos(pos), i, gain = 0, eaten = 0;
      for (i = 0; i < a.length; i++) {
        var c = B[a[i]];
        if (!alive(c)) continue;
        if (!hasTag(c.id, '食材') && !hasTag(c.id, '食物')) continue;
        if (c.u && X.S.collection.length <= CONFIG.MIN_DECK) continue;
        var per = hasTag(c.id, '食物') ? 5 : 3;
        if (destroyCell(B, a[i], X, ev)) { if (c.u) X.removeU(c.u); gain += X.eatVal(per); eaten++; }
      }
      if (eaten) { X.grow('yuyuko', eaten); ev.push({ pos: pos, kind: 'grow', msg: '幽幽子永久 +' + eaten }); }
      return { add: gain, msg: eaten ? '吃掉了 ×' + eaten : null };
    } },
  sanae:    { name: '早苗',   e: '🐍', img: 'images/landlord/sanae.png', r: 2, v: 3, tags: ['角色'], d: '奇迹:每个星星 +3。',
    fx: function(B) { return { add: B_countId(B, 'star') * 3 }; } },
  suwako:   { name: '诹访子', e: '🎩', img: 'images/landlord/suwako.png', r: 2, v: 3, tags: ['角色'], d: '每只存活青蛙 +2;青蛙被消灭时 +1。',
    fx: function(B) { return { add: B_countId(B, 'frog') * 2 }; } },
  suika:    { name: '萃香',   e: '🍉', img: 'images/landlord/suika.png', r: 2, v: 3, tags: ['角色'], d: '消耗相邻清酒(永久),每个 +6,每消耗 1 个永久 +1;场上有勇仪时再 +2。',
    fx: function(B, pos, X, ev) { var n = consumeAdj(B, pos, X, ev, { id: 'sake' }); if (n) X.grow('suika', n); return { add: n * X.eatVal(6) + (B_hasId(B, 'yuugi') ? 2 : 0), msg: n ? '一饮而尽 ×' + n : null }; } },
  yuugi:    { name: '勇仪',   e: '👹', img: 'images/landlord/yuugi.png', r: 2, v: 3, tags: ['角色'], d: '酒豪:每个饮品 +2。',
    fx: function(B) { return { add: B_countTag(B, '饮品') * 2 }; } },
  eirin:    { name: '永琳',   e: '💊', img: 'images/landlord/eirin.png', r: 2, v: 3, tags: ['角色'], d: '调药:消耗相邻药草(永久),每个 +6。',
    fx: function(B, pos, X, ev) { var n = consumeAdj(B, pos, X, ev, { id: 'herb' }); return { add: n * X.eatVal(6), msg: n ? '调配合剂 ×' + n : null }; } },
  mokou:    { name: '妹红',   e: '🔥', img: 'images/landlord/mokou.png', r: 2, v: 3, tags: ['角色'], d: '不死鸟:被破坏时不消失,改为 +8 并永久 +2(每转限 1 次)。',
    onDestroyed: function(B, pos, X, ev) {
      var c = B[pos];
      if (!c.revived) { c.revived = true; X.grow('mokou', 2); ev.push({ pos: pos, kind: 'grow', gain: 8, msg: '不死鸟复活 +8' }); return true; }
      return false;
    } },
  yuuka:    { name: '幽香',   e: '🌼', img: 'images/landlord/yuuka.png', r: 2, v: 3, tags: ['角色'], d: '每朵花(樱花/向日葵)+3。',
    fx: function(B) { return { add: (B_countId(B, 'sakura') + B_countId(B, 'sunflower')) * 3 }; } },
  /* ── 蓝卡生产者:不进收藏,带花样 ── */
  sakecellar:{ name: '鬼之酒窖', e: '🏺', r: 2, v: 3, tags: [], d: '每转在空格生成 1 个清酒(仅当转);场上有萃香或勇仪时生成 2 个。',
    pre: function(B, pos, X, ev, rnd) {
      var n = (B_hasId(B, 'suika') || B_hasId(B, 'yuugi')) ? 2 : 1, i;
      for (i = 0; i < n; i++) spawnFuel(B, 'sake', 0, ev, rnd);
    } },
  herbgarden:{ name: '永远亭药圃', e: '🪴', r: 2, v: 3, tags: [], d: '每转在空格生成 1 株药草(仅当转),这株药草当转 +2。',
    pre: function(B, pos, X, ev, rnd) { spawnFuel(B, 'herb', 2, ev, rnd); } },
  teafield: { name: '红魔茶园', e: '🍵', r: 2, v: 3, tags: [], d: '每转在空格生成 1 杯红茶(仅当转);场上有蕾米莉亚时这杯红茶当转 +1。',
    pre: function(B, pos, X, ev, rnd) { spawnFuel(B, 'tea', B_hasId(B, 'remilia') ? 1 : 0, ev, rnd); } },

  /* ── 传说 r3:放大器/梦想 ── */
  yukari:   { name: '紫',     e: '🟪', img: 'images/landlord/yukari.png', r: 3, v: 4, tags: ['角色'], d: '隙间:复制相邻最高产出符号的本转产出。',
    fx: function(B, pos, X) {
      var a = adjPos(pos), i, mx = 0;
      for (i = 0; i < a.length; i++) {
        var c = B[a[i]];
        if (!alive(c)) continue;
        var v = (c.payout !== undefined) ? c.payout : (SYMBOLS[c.id].v + (c.p || 0) + X.baseBonus(c));
        if (v > mx) mx = v;
      }
      return { add: mx, msg: mx ? '隙间复制 +' + mx : null };
    } },
  flandre:  { name: '芙兰朵露', e: '💥', img: 'images/landlord/flandre.png', r: 3, v: 4, tags: ['角色'], d: '495 年的波纹:每转随机破坏 1 个符号(仅本转),+10;每破坏 1 个永久 +1。',
    fx: function(B, pos, X, ev, rnd) {
      var cands = [], i;
      for (i = 0; i < B.length; i++) if (i !== pos && alive(B[i]) && !SYMBOLS[B[i].id].undying) cands.push(i);
      if (!cands.length) return { add: 0 };
      var t = cands[Math.floor(rnd() * cands.length)];
      if (destroyCell(B, t, X, ev)) { X.grow('flandre', 1); return { add: X.eatVal(10), msg: '破坏了 ' + SYMBOLS[B[t].id].name }; }
      return { add: 0 };
    } },
  kanako:   { name: '神奈子', e: '⛰️', img: 'images/landlord/kanako.png', r: 3, v: 4, tags: ['角色'], d: '御柱信仰:每个自然符号 +2。',
    fx: function(B) { return { add: B_countTag(B, '自然') * 2 }; } },
  kaguya:   { name: '辉夜',   e: '🎋', img: 'images/landlord/kaguya.png', r: 3, v: 4, tags: ['角色'], d: '宝物收集癖:场上每种不同道具 +3。',
    fx: function(B) { var n = uniqTagCount(B, '道具'); return { add: n * 3, msg: '蓬莱宝物 ×' + n }; } },
  utsuho:   { name: '阿空',   e: '☢️', img: 'images/landlord/utsuho.png', r: 3, v: 4, tags: ['角色'], d: '核爆:消灭周围 8 格(仅本转),每个 +5,之后自己从收藏中消失。',
    fx: function(B, pos, X, ev) {
      var a = adjPos(pos), n = 0, i;
      for (i = 0; i < a.length; i++) if (destroyCell(B, a[i], X, ev)) n++;
      X.removeU(B[pos].u);
      ev.push({ pos: pos, kind: 'grow', msg: '☢️ 核爆!阿空力量耗尽' });
      return { add: n * X.eatVal(5), msg: '核爆 ×' + n };
    } },
  satori:   { name: '觉',     e: '💜', img: 'images/landlord/satori.png', r: 3, v: 4, tags: ['角色'], d: '读心:全场每个角色 +1,相邻每个角色再 +2。',
    fx: function(B, pos) { return { add: B_countTag(B, '角色') + adjCountTag(B, pos, '角色') * 2 }; } },
  koishi:   { name: '恋',     e: '💚', img: 'images/landlord/koishi.png', r: 3, v: 4, tags: ['角色'], d: '无意识:每转随机 +1~8,无法被消灭。',
    undying: true,
    fx: function(B, pos, X, ev, rnd) { return { add: 1 + Math.floor(rnd() * 8) }; } },

  /* ── 特殊(不进卡池) ── */
  empty:    { name: '空格',   e: '', r: -1, v: 0, tags: [], d: '空空如也。但有些伙伴喜欢空格……' },
  ryori:    { name: '料理',   e: '🍱', r: -1, v: 3, tags: ['食物'], d: '妖梦的手艺,幽幽子吃掉 +5 并成长。' }
};

/* ═══════════ 3.5 联动声明(点击查询用,与 fx 保持一致) ═══════════ */
// id/ids 指定符号, tag/tags 指定标签, empty 空格, adjAny 相邻任意
// adj 仅限相邻, eat 消灭目标, make 转化目标
var USES = {
  doll:     [{ id: 'alice', adj: true }],
  cirno:    [{ id: 'frog', adj: true, eat: true }],
  rumia:    [{ tag: '动物', adj: true, eat: true }],
  mystia:   [{ tag: '食材', adj: true }, { id: 'rumia' }],
  chen:     [{ id: 'ran', adj: true }],
  ran:      [{ id: 'chen' }, { id: 'yukari', adj: true }],
  alice:    [{ id: 'doll', adj: true }, { empty: true }],
  koakuma:  [{ id: 'book' }, { id: 'patchouli' }],
  meiling:  [{ empty: true, adj: true }],
  nitori:   [{ id: 'cucumber' }, { tag: '道具' }],
  momiji:   [{ empty: true }],
  reisen:   [{ id: 'herb' }, { id: 'eirin' }],
  rin:      [{ tag: '妖怪', adj: true, eat: true }],
  kasa:     [{ empty: true }],
  sunflower:[{ tag: '自然', adj: true }],
  aya:      [{ tag: '角色' }],
  marisa:   [{ id: 'mushroom' }],
  reimu:    [{ adjAny: true, adj: true }],
  sakuya:   [{ tag: '饮品' }, { id: 'remilia' }],
  remilia:  [{ id: 'tea' }],
  patchouli:[{ id: 'book' }],
  youmu:    [{ tag: '食材', adj: true, make: 'ryori' }, { id: 'hanrei' }],
  yuyuko:   [{ tags: ['食材', '食物'], adj: true, eat: true }],
  sanae:    [{ id: 'star' }],
  suwako:   [{ id: 'frog' }],
  suika:    [{ id: 'sake', adj: true, eat: true }, { id: 'yuugi' }],
  yuugi:    [{ tag: '饮品' }],
  eirin:    [{ id: 'herb', adj: true, eat: true }],
  yuuka:    [{ ids: ['sakura', 'sunflower'] }],
  yukari:   [{ adjAny: true, adj: true }],
  kanako:   [{ tag: '自然' }],
  kaguya:   [{ tag: '道具' }],
  utsuho:   [{ adjAny: true, adj: true, eat: true }],
  satori:   [{ tag: '角色' }, { tag: '角色', adj: true }],
  komachi:  [{ produce: 'coin' }],
  keine:    [{ produce: 'book' }],
  lily:     [{ produce: 'sakura' }],
  nightbug: [{ produce: 'bug' }],
  tenshi:   [{ produce: 'peach' }],
  petri:    [{ produce: 'mushroom' }],
  frogpound:[{ produce: 'frog' }],
  kedamanest:[{ produce: 'kedama' }],
  takeout:  [{ produce: 'onigiri' }, { produce: 'dango' }, { produce: 'cucumber' }],
  sakecellar:[{ produce: 'sake' }, { id: 'suika' }, { id: 'yuugi' }],
  herbgarden:[{ produce: 'herb' }],
  teafield: [{ produce: 'tea' }, { id: 'remilia' }]
};
for (var _uid in USES) SYMBOLS[_uid].uses = USES[_uid];

// uses 匹配:引擎在 enginePos,候选格 cell 在 cellPos
function matchesAnyUse(uses, cell, cellPos, enginePos) {
  for (var k = 0; k < uses.length; k++) {
    var u = uses[k];
    if (u.adj && adjPos(enginePos).indexOf(cellPos) < 0) continue;
    if (u.id && cell.id === u.id) return true;
    if (u.ids && u.ids.indexOf(cell.id) >= 0) return true;
    if (u.produce && cell.id === u.produce) return true;
    if (u.tag && hasTag(cell.id, u.tag)) return true;
    if (u.tags) { for (var t = 0; t < u.tags.length; t++) if (hasTag(cell.id, u.tags[t])) return true; }
    if (u.empty && cell.id === 'empty') return true;
    if (u.adjAny && alive(cell)) return true;
  }
  return false;
}
// 双向联动表:needs=我需要谁, givers=谁需要我, produces=我产出谁
function linksFor(id) {
  var needs = [], seen = {}, givers = [], produces = [], i, j, tid;
  function push(x) { if (!seen[x]) { seen[x] = 1; needs.push(x); } }
  var d = SYMBOLS[id];
  if (d.uses) {
    for (i = 0; i < d.uses.length; i++) {
      var u = d.uses[i];
      if (u.produce) { if (produces.indexOf(u.produce) < 0) produces.push(u.produce); continue; }
      if (u.id) push(u.id);
      if (u.ids) for (j = 0; j < u.ids.length; j++) push(u.ids[j]);
      if (u.empty) push('empty');
      if (u.adjAny) push('__adj');
      var tags = u.tags || (u.tag ? [u.tag] : null);
      if (tags) {
        for (tid in SYMBOLS) {
          if (tid === id) continue;
          if (SYMBOLS[tid].r < 0 && tid !== 'ryori') continue;
          for (j = 0; j < tags.length; j++) if (hasTag(tid, tags[j])) { push(tid); break; }
        }
      }
    }
  }
  for (var yid in SYMBOLS) {
    if (yid === id || SYMBOLS[yid].r < 0 || !SYMBOLS[yid].uses) continue;
    var us = SYMBOLS[yid].uses, hit = false;
    for (i = 0; i < us.length && !hit; i++) {
      var u2 = us[i];
      if (u2.id === id || (u2.ids && u2.ids.indexOf(id) >= 0)) hit = true;
      else if (u2.produce === id) hit = true;
      else if (u2.tag && hasTag(id, u2.tag)) hit = true;
      else if (u2.tags) { for (j = 0; j < u2.tags.length; j++) if (hasTag(id, u2.tags[j])) { hit = true; break; } }
      else if (u2.empty && id === 'empty') hit = true;
    }
    if (hit) givers.push(yid);
  }
  return { needs: needs, givers: givers, produces: produces };
}

/* ═══════════ 4. 道具数据(22 种) ═══════════ */
var ITEMS = {
  orb:        { name: '阴阳玉',       e: '🔮', r: 0, d: '每次转动 +3 🪙', spinFlat: 3 },
  basket:     { name: '蘑菇篮',       e: '🧺', r: 0, d: '蘑菇基础值 ×2', baseMultId: { mushroom: 2 } },
  teaset:     { name: '红茶套装',     e: '🫖', r: 0, d: '所有饮品基础值 ×2', baseMultTag: { '饮品': 2 } },
  toolbox:    { name: '河童工具箱',   e: '🧰', r: 0, d: '所有道具基础值 ×2', baseMultTag: { '道具': 2 } },
  bento:      { name: '贪吃鬼餐盒',   e: '🍱', r: 1, d: '所有消灭行为每个额外 +2', eatBonus: 2 },
  gohei:      { name: '御币',         e: '📿', r: 1, d: '灵梦的结界效果翻倍', fxDouble: ['reimu'] },
  frogfrozen: { name: '冰冻青蛙',     e: '🧊', r: 1, d: '琪露诺冻青蛙效果翻倍', fxDouble: ['cirno'] },
  news:       { name: '新闻订阅',     e: '📰', r: 1, d: '文的效果翻倍', fxDouble: ['aya'] },
  cart:       { name: '猫车',         e: '🛒', r: 1, d: '阿燐的效果翻倍', fxDouble: ['rin'] },
  yakitori:   { name: '夜雀烤炉',     e: '🍢', r: 1, d: '所有食材基础值 ×2', baseMultTag: { '食材': 2 } },
  menu:       { name: '白玉楼菜单',   e: '📜', r: 1, d: '料理 +2', addBase: { ryori: 2 } },
  kourindou:  { name: '香霖堂会员卡', e: '💳', r: 1, d: '跳过三选一时额外 +5 🪙', skipBonus: 5 },
  rabbitfoot: { name: '幸运兔脚',     e: '🐰', r: 2, d: '每次交租后,三选一中稀有概率 +2%、传说 +1%(最多 +20%/+10%)', luck: true },
  starvessel: { name: '星之器',       e: '🌟', r: 2, d: '所有自然基础值 ×2', baseMultTag: { '自然': 2 } },
  hakkero:    { name: '迷你八卦炉',   e: '🔦', r: 2, d: '魔理沙总产出 ×2', payoutMult: { marisa: 2 } },
  saisenbox:  { name: '赛钱箱',       e: '📦', r: 2, d: '每次交租后返还 10% 租金', rentRefund: 0.1 },
  amulet:     { name: '金运御守',     e: '🧧', r: 2, d: '每次交租后 +[天数×3] 🪙', rentCoinsDay: 3 },
  gapumbrella:{ name: '隙间之伞',     e: '🌂', r: 2, d: '每次交租后 +1 重抽代币', rentReroll: 1 },
  moonrobe:   { name: '月之羽衣',     e: '🌙', r: 2, d: '传说符号基础值 ×2', baseMultRarity: { 3: 2 } },
  sweep:      { name: '博丽大扫除',   e: '🧹', r: 2, d: '获得时立即移除收藏中最弱的符号', onGain: 'removeWeakest' },
  hourai:     { name: '蓬莱之药',     e: '⚗️', r: 3, d: '获得时 +2 重抽、+2 移除代币', onGain: 'tokens' },
  wind:       { name: '幻想乡的风',   e: '🌪️', r: 3, d: '所有消灭收益 ×1.5', eatMult: 1.5 },
  tengu_fan:  { name: '天狗团扇',     e: '🪭', r: 3, d: '每天第一次转动收入 ×1.5', firstMult: 1.5 },
  doll2:      { name: '替身人偶',     e: '🎎', r: 3, d: '交不起租时自动免死一次(消耗)', revive: true }
};

/* ═══════════ 5. 状态与结算核心(纯逻辑) ═══════════ */
function freshState() {
  var S = {
    v: 1, coins: CONFIG.START_COINS, day: 1, spinsLeft: spinsFor(1), spinsUsed: 0,
    collection: [], items: [],
    reroll: 1, remove: 0,
    totalPaid: 0, totalEarned: 0,
    endless: false, won: false, uidSeq: 1000,
    luckB: 0, luckG: 0,
    offer: null, itemOffer: null, phase: 'idle',
    dex: {}, lastGain: 0
  };
  for (var i = 0; i < CONFIG.START_DECK.length; i++) S.collection.push(mkInst(S, CONFIG.START_DECK[i]));
  return S;
}
function mkInst(S, id) { return { u: ++S.uidSeq, id: id, p: 0 }; }

// 从收藏无放回抽 20 格,不足补空格;格子位置随机分布
function dealBoard(S, rnd) {
  rnd = rnd || Math.random;
  var pool = S.collection.slice(), i, t;
  for (i = pool.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  var B = [];
  for (i = 0; i < CONFIG.CELLS; i++) {
    B.push(pool[i] ? { u: pool[i].u, id: pool[i].id, p: pool[i].p || 0, c: pool[i].c || 0 } : { id: 'empty', p: 0 });
  }
  // 位置洗牌:让符号随机散落在棋盘上,而不是挤在前面几行
  for (i = B.length - 1; i > 0; i--) { var k = Math.floor(rnd() * (i + 1)); t = B[i]; B[i] = B[k]; B[k] = t; }
  return B;
}

// 道具上下文
function makeCtx(S) {
  var X = { S: S };
  X.has = function(iid) { return S.items.indexOf(iid) >= 0; };
  X.eatBonus = X.has('bento') ? ITEMS.bento.eatBonus : 0;
  X.eatMult = X.has('wind') ? ITEMS.wind.eatMult : 1;
  X.eatVal = function(base) { return Math.round((base + X.eatBonus) * X.eatMult); };
  X.spinFlat = 0;
  X.firstMult = 1;
  var i, it;
  for (i = 0; i < S.items.length; i++) {
    it = ITEMS[S.items[i]];
    if (it.spinFlat) X.spinFlat += it.spinFlat;
    if (it.firstMult) X.firstMult *= it.firstMult;
  }
  X.baseBonus = function(cell) {
    var b = 0;
    for (var i = 0; i < S.items.length; i++) {
      var it = ITEMS[S.items[i]];
      if (it.addBase && it.addBase[cell.id]) b += it.addBase[cell.id];
    }
    return b;
  };
  X.baseMult = function(cell) {
    var m = 1, d = SYMBOLS[cell.id];
    for (var i = 0; i < S.items.length; i++) {
      var it = ITEMS[S.items[i]];
      if (it.baseMultId && it.baseMultId[cell.id]) m *= it.baseMultId[cell.id];
      if (it.baseMultTag) for (var t in it.baseMultTag) if (hasTag(cell.id, t)) m *= it.baseMultTag[t];
      if (it.baseMultRarity && it.baseMultRarity[d.r]) m *= it.baseMultRarity[d.r];
    }
    return m;
  };
  X.payoutMult = function(id) {
    var m = 1;
    for (var i = 0; i < S.items.length; i++) {
      var pm = ITEMS[S.items[i]].payoutMult;
      if (pm && pm[id]) m *= pm[id];
    }
    return m;
  };
  X.dbl = function(id) {
    for (var i = 0; i < S.items.length; i++) {
      var fd = ITEMS[S.items[i]].fxDouble;
      if (fd && fd.indexOf(id) >= 0) return true;
    }
    return false;
  };
  X.grow = function(id, n) {
    for (var i = 0; i < S.collection.length; i++) if (S.collection[i].id === id) S.collection[i].p += n;
  };
  X.addToCollection = function(id) { S.collection.push(mkInst(S, id)); };
  X.removeU = function(u) { (S._removeUs = S._removeUs || []).push(u); };
  return X;
}

// 结算一整个棋盘(调用前 spinsUsed 尚未自增,用于天狗团扇判定)
function resolveBoard(B, S, rnd) {
  rnd = rnd || Math.random;
  var X = makeCtx(S);
  var ev = [], pos, cell, def;
  // 预结算(爱丽丝放人偶)
  for (pos = 0; pos < B.length; pos++) {
    cell = B[pos];
    if (!alive(cell)) continue;
    def = SYMBOLS[cell.id];
    if (def.pre) def.pre(B, pos, X, ev, rnd);
  }
  // 主结算:从左到右、从上到下
  var total = 0;
  for (pos = 0; pos < B.length; pos++) {
    cell = B[pos];
    if (!alive(cell)) continue;
    def = SYMBOLS[cell.id];
    var base = Math.round((def.v + (cell.p || 0) + X.baseBonus(cell)) * X.baseMult(cell));
    var res = def.fx ? def.fx(B, pos, X, ev, rnd) : null;
    var add = (res && res.add) || 0;
    if (add > 0 && X.dbl(cell.id)) add *= 2;
    var gain = base + add;
    gain = Math.round(gain * X.payoutMult(cell.id));
    cell.payout = gain;
    if (gain > 0) ev.push({ pos: pos, gain: gain, kind: 'pay', id: cell.id, msg: res && res.msg });
    total += gain;
  }
  // 遗言/成长类附加收益
  for (var i = 0; i < ev.length; i++) if (ev[i].gain && ev[i].kind !== 'pay') total += ev[i].gain;
  total += X.spinFlat;
  if (X.firstMult > 1 && S.spinsUsed === 0) total = Math.round(total * X.firstMult);
  // 计数器回写(天子等):棋盘格 c → 收藏实例
  for (pos = 0; pos < B.length; pos++) {
    cell = B[pos];
    if (cell.u !== undefined && cell.c !== undefined) {
      for (var k = 0; k < S.collection.length; k++) {
        if (S.collection[k].u === cell.u) { S.collection[k].c = cell.c; break; }
      }
    }
  }
  return { total: total, events: ev };
}

// 生成符号三选一
function idsOfRarity(r) {
  var out = [];
  for (var id in SYMBOLS) if (SYMBOLS[id].r === r) out.push(id);
  return out;
}
function rollRarity(w, rnd) {
  var x = rnd() * 100, acc = 0, i;
  for (i = 0; i < w.length; i++) { acc += w[i]; if (x < acc) return i; }
  return w.length - 1;
}
function genOffer(S, rnd) {
  rnd = rnd || Math.random;
  var tier = S.day <= 3 ? 0 : (S.day <= 6 ? 1 : (S.day <= 9 ? 2 : 3));
  var w = CONFIG.RARE_W[tier].slice();
  if (S.luckB || S.luckG) {
    w[0] = Math.max(5, w[0] - S.luckB - S.luckG);
    w[2] += S.luckB;
    w[3] += S.luckG;
  }
  var out = [], guard = 0;
  while (out.length < 3 && guard++ < 300) {
    var pool = idsOfRarity(rollRarity(w, rnd));
    var id = pool[Math.floor(rnd() * pool.length)];
    if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}
function genItemOffer(S, rnd) {
  rnd = rnd || Math.random;
  var out = [], guard = 0;
  while (out.length < 3 && guard++ < 300) {
    var r = rollRarity(CONFIG.ITEM_W, rnd);
    var pool = [];
    for (var id in ITEMS) if (ITEMS[id].r === r && S.items.indexOf(id) < 0) pool.push(id);
    if (!pool.length) continue;
    var iid = pool[Math.floor(rnd() * pool.length)];
    if (out.indexOf(iid) < 0) out.push(iid);
  }
  return out;   // 可能不足 3 个(道具快集齐时)
}

// node 导出(数值模拟用)
var API = {
  CONFIG: CONFIG, SYMBOLS: SYMBOLS, ITEMS: ITEMS,
  rentFor: rentFor, spinsFor: spinsFor,
  freshState: freshState, mkInst: mkInst, dealBoard: dealBoard,
  makeCtx: makeCtx, resolveBoard: resolveBoard,
  genOffer: genOffer, genItemOffer: genItemOffer, idsOfRarity: idsOfRarity,
  linksFor: linksFor, matchesAnyUse: matchesAnyUse
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window === 'undefined') return;   // node 环境到此为止

/* ═══════════ 6. UI:全局状态 ═══════════ */
var S = null, BEST = null;
var el = {}, cellEls = [], viewBoard = null;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var RARE_NAMES = ['普通', '优秀', '稀有', '传说'];
var animating = false;

/* ═══════════ 7. 音效(文件优先,合成兜底) ═══════════ */
var SND = (function() {
  var ctx = null, muted = false, files = {}, bgm = null, bgmTried = false;
  var FILES = {
    tick: 'audio/sfx/tick.mp3', coin: 'audio/sfx/coin.mp3', eat: 'audio/sfx/eat.mp3',
    select: 'audio/sfx/select.mp3', pay: 'audio/sfx/pay.mp3', fail: 'audio/sfx/fail.mp3'
  };
  function ensureCtx() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function tryLoad() {
    for (var k in FILES) {
      (function(k) {
        var a = new Audio();
        a.preload = 'auto';
        a.addEventListener('canplaythrough', function() { files[k] = a; });
        a.addEventListener('error', function() {});
        a.src = FILES[k];
      })(k);
    }
  }
  function beep(freq, dur, type, vol, slide) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  var SYNTH = {
    tick: function() { beep(750, 0.04, 'square', 0.05); },
    coin: function() { beep(1150, 0.07, 'sine', 0.07, 1500); },
    eat: function() { beep(220, 0.1, 'sawtooth', 0.06, 120); },
    grow: function() { beep(500, 0.16, 'sine', 0.08, 950); },
    select: function() { beep(620, 0.09, 'triangle', 0.09, 830); },
    pay: function() { beep(523, 0.12, 'triangle', 0.1); setTimeout(function() { beep(659, 0.12, 'triangle', 0.1); }, 110); setTimeout(function() { beep(784, 0.2, 'triangle', 0.1); }, 220); },
    fail: function() { beep(320, 0.5, 'sawtooth', 0.09, 90); },
    click: function() { beep(500, 0.04, 'triangle', 0.06); }
  };
  return {
    unlock: function() { ensureCtx(); if (!bgmTried) { bgmTried = true; tryLoad();
      bgm = new Audio(); bgm.loop = true; bgm.volume = 0.2;
      bgm.addEventListener('error', function() { bgm = null; });
      bgm.src = CONFIG.BGM;
      if (bgm) { var p = bgm.play(); if (p && p.catch) p.catch(function() {}); }
    } },
    play: function(name) {
      if (muted) return;
      ensureCtx();
      if (files[name]) { try { var a = files[name].cloneNode(); a.volume = 0.6; a.play(); return; } catch (e) {} }
      if (SYNTH[name]) SYNTH[name]();
    },
    setMuted: function(m) { muted = m; if (bgm) { if (m) bgm.pause(); else { var p = bgm.play(); if (p && p.catch) p.catch(function() {}); } } },
    isMuted: function() { return muted; }
  };
})();

/* ═══════════ 8. 存档 ═══════════ */
function saveGame() {
  if (!S || S.phase === 'over') return;
  try {
    var data = {
      v: S.v, coins: S.coins, day: S.day, spinsLeft: S.spinsLeft, spinsUsed: S.spinsUsed,
      collection: S.collection, items: S.items, reroll: S.reroll, remove: S.remove,
      totalPaid: S.totalPaid, totalEarned: S.totalEarned, endless: S.endless, won: S.won,
      uidSeq: S.uidSeq, offer: S.offer, itemOffer: S.itemOffer, phase: S.phase, dex: S.dex,
      luckB: S.luckB, luckG: S.luckG
    };
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
  } catch (e) {}
}
function loadGame() {
  try {
    var raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || !d.collection || !d.collection.length) return null;
    return d;
  } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) {} }
function loadBest() {
  try { return JSON.parse(localStorage.getItem(CONFIG.BEST_KEY) || 'null'); } catch (e) { return null; }
}
function saveBest() {
  var d = { day: S.day, paid: S.totalPaid };
  if (!BEST || d.day > BEST.day || (d.day === BEST.day && d.paid > BEST.paid)) {
    BEST = d;
    try { localStorage.setItem(CONFIG.BEST_KEY, JSON.stringify(BEST)); } catch (e) {}
  }
}
function markDex(id) { if (!S.dex[id]) { S.dex[id] = 1; } }

/* ═══════════ 9. 渲染:HUD 与棋盘 ═══════════ */
function symHTML(id) {
  var d = SYMBOLS[id];
  if (d.img) return '<img src="' + d.img + '" alt="' + esc(d.name) + '" data-e="' + d.e + '" onerror="this.outerHTML=this.dataset.e">';
  return d.e || '';
}
function hud() {
  el.hudDay.textContent = (S.endless ? '第 ' + S.day + ' 天 · 无尽' : '第 ' + S.day + ' 天');
  el.hudCoins.textContent = S.coins;
  el.hudRent.textContent = rentFor(S.day);
  el.hudSpins.textContent = '剩 ' + S.spinsLeft + ' 转';
  var total = spinsFor(S.day);
  el.rentFill.style.width = Math.round((S.spinsUsed / total) * 100) + '%';
  el.collCount.textContent = S.collection.length;
  el.hudBest.textContent = BEST ? ('第' + BEST.day + '天/' + BEST.paid + '🪙') : '-';
}
function buildBoard() {
  el.board.innerHTML = '';
  cellEls = [];
  for (var i = 0; i < CONFIG.CELLS; i++) {
    var c = document.createElement('div');
    c.className = 'cell';
    c.innerHTML = '<span class="sym"></span><span class="val"></span>';
    c.setAttribute('data-pos', i);
    el.board.appendChild(c);
    cellEls.push(c);
  }
}
function setCell(pos, cell) {
  var c = cellEls[pos];
  var d = SYMBOLS[cell.id];
  c.querySelector('.sym').innerHTML = symHTML(cell.id);
  c.className = 'cell' + (cell.id === 'empty' ? ' empty' : '') + (d.r === 3 ? ' legendary-cell' : '');
  c.querySelector('.val').textContent = '';
}
function previewBoard() {
  var B = dealBoard(S);
  viewBoard = B;
  for (var i = 0; i < CONFIG.CELLS; i++) setCell(i, B[i]);
}
function floater(pos, txt, cls) {
  var cell = cellEls[pos];
  var f = document.createElement('div');
  f.className = 'floater' + (cls ? ' ' + cls : '');
  f.textContent = txt;
  f.style.left = (cell.offsetLeft + cell.offsetWidth / 2 - 16) + 'px';
  f.style.top = (cell.offsetTop + 4) + 'px';
  el.board.appendChild(f);
  setTimeout(function() { if (f.parentNode) f.parentNode.removeChild(f); }, 1000);
}
function toast(msg) {
  el.spinMsg.textContent = msg;
}

/* ═══════════ 10. 转动与结算动画 ═══════════ */
function doSpin() {
  if (!S || S.phase !== 'idle' || animating) return;
  SND.unlock();
  hideLinkPanel();
  S.phase = 'anim'; animating = true;
  el.btnSpin.disabled = true;
  el.spinGain.textContent = '';
  S.spinsLeft--;
  S.board = dealBoard(S);
  viewBoard = S.board;
  toast('祈愿中……');
  animRoll(function() {
    var res = resolveBoard(S.board, S, Math.random);
    S.spinsUsed++;
    animResolve(res, function() {
      S.coins += res.total;
      S.totalEarned += res.total;
      S.lastGain = res.total;
      // 阿空核爆后移除
      if (S._removeUs && S._removeUs.length) {
        S.collection = S.collection.filter(function(inst) { return S._removeUs.indexOf(inst.u) < 0; });
        S._removeUs = [];
        toast('☢️ 阿空从收藏中消失了……');
      } else {
        toast(res.total > 0 ? '本转收入' : '这一转静悄悄的……');
      }
      el.spinGain.textContent = '+' + res.total + ' 🪙';
      el.hudCoins.classList.add('flash');
      setTimeout(function() { el.hudCoins.classList.remove('flash'); }, 400);
      if (res.total >= 80) {
        el.board.classList.add('shake');
        setTimeout(function() { el.board.classList.remove('shake'); }, 450);
      }
      hud(); saveGame();
      animating = false;
      if (S.spinsLeft <= 0) showRent();
      else { S.phase = 'offer'; genAndShowOffer(); }
    });
  });
}
function animRoll(cb) {
  var cells = cellEls;
  var pool = [];
  var seen = {};
  for (var i = 0; i < S.collection.length; i++) if (!seen[S.collection[i].id]) { seen[S.collection[i].id] = 1; pool.push(S.collection[i].id); }
  if (!pool.length) pool = ['coin'];
  var stopped = {}, timers = [], iv = null, done = false;
  function finishCol(c) {
    stopped[c] = true;
    for (var r = 0; r < CONFIG.ROWS; r++) {
      var pos = r * CONFIG.COLS + c;
      cells[pos].classList.remove('rolling');
      setCell(pos, S.board[pos]);
    }
    SND.play('tick');
  }
  iv = setInterval(function() {
    for (var c = 0; c < CONFIG.COLS; c++) {
      if (stopped[c]) continue;
      for (var r = 0; r < CONFIG.ROWS; r++) {
        var pos = r * CONFIG.COLS + c;
        cells[pos].querySelector('.sym').innerHTML = symHTML(pool[Math.floor(Math.random() * pool.length)]);
        cells[pos].classList.add('rolling');
        cells[pos].classList.remove('empty', 'legendary-cell');
      }
    }
  }, 70);
  for (var c = 0; c < CONFIG.COLS; c++) {
    (function(c) {
      timers.push(setTimeout(function() {
        finishCol(c);
        if (c === CONFIG.COLS - 1 && !done) { done = true; clearInterval(iv); el.board.onclick = null; setTimeout(cb, 150); }
      }, 480 + c * 190));
    })(c);
  }
  el.board.onclick = function() {
    if (done) return;
    done = true;
    clearInterval(iv);
    for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
    for (var cc = 0; cc < CONFIG.COLS; cc++) finishCol(cc);
    el.board.onclick = null;
    cb();
  };
}
function animResolve(res, cb) {
  var evs = res.events, i = 0, ended = false;
  var delay = evs.length > 16 ? 50 : 85;
  function applyEvent(e) {
    var cell = cellEls[e.pos];
    if (!cell) return;
    if (e.kind === 'pay') {
      cell.classList.add('hit');
      cell.querySelector('.val').textContent = '+' + e.gain;
      floater(e.pos, '+' + e.gain, e.gain >= 20 ? 'big' : '');
      SND.play('coin');
      setTimeout(function() { cell.classList.remove('hit'); }, 420);
    } else if (e.kind === 'die') {
      cell.classList.add('dying');
      SND.play('eat');
      setTimeout(function() {
        cell.classList.remove('dying');
        cell.querySelector('.sym').innerHTML = '';
        cell.classList.add('empty');
      }, 460);
    } else if (e.kind === 'eat') {
      floater(e.pos, '+' + e.gain, 'eat');
    } else if (e.kind === 'grow') {
      floater(e.pos, (e.gain ? '+' + e.gain + ' ' : '') + (e.msg || ''), 'grow');
      SND.play('grow');
    } else if (e.kind === 'born') {
      var cd = { id: e.id, p: 0 };
      setCell(e.pos, cd);
      cell.classList.add('born');
      setTimeout(function() { cell.classList.remove('born'); }, 420);
    }
  }
  function end() {
    if (ended) return;
    ended = true;
    el.board.onclick = null;
    cb();
  }
  function step() {
    if (i >= evs.length) { end(); return; }
    applyEvent(evs[i]); i++;
    setTimeout(step, delay);
  }
  el.board.onclick = function() { while (i < evs.length) { applyEvent(evs[i]); i++; } end(); };
  if (!evs.length) { end(); return; }
  step();
}

/* ═══════════ 10.5 联动查询(点击符号) ═══════════ */
function relatedCells(pos) {
  var B = viewBoard, targets = [], users = [], i;
  var me = B[pos], d = SYMBOLS[me.id];
  if (d.uses) {
    for (i = 0; i < B.length; i++) {
      if (i === pos || !B[i] || B[i].dead) continue;
      if (matchesAnyUse(d.uses, B[i], i, pos)) targets.push(i);
    }
  }
  for (i = 0; i < B.length; i++) {
    if (i === pos || !alive(B[i])) continue;
    var yd = SYMBOLS[B[i].id];
    if (yd.uses && matchesAnyUse(yd.uses, me, pos, i)) users.push(i);
  }
  return { targets: targets, users: users };
}
function clearLinkHL() {
  for (var i = 0; i < cellEls.length; i++) cellEls[i].classList.remove('linked', 'user');
}
function chipHTML(id2) {
  if (id2 === 'empty') return '<span class="lp-chip" data-id="empty">⬛ 空格</span>';
  if (id2 === '__adj') return '<span class="lp-chip static">✨ 相邻任意符号</span>';
  return '<span class="lp-chip" data-id="' + id2 + '">' + symHTML(id2) + ' ' + esc(SYMBOLS[id2].name) + '</span>';
}
function showLinkPanel(id, instP) {
  var d = SYMBOLS[id];
  var lk = linksFor(id);
  var rare = d.r >= 0 ? RARE_NAMES[d.r] : '特殊';
  el.lpHead.innerHTML = '<span class="lp-sym">' + symHTML(id) + '</span><span>' +
    '<span class="lp-name">' + esc(d.name) + '</span>' +
    '<div class="lp-meta">' + rare + (d.r >= 0 ? ' · 基础 ' + d.v + '🪙' : '') + (instP ? ' · 已成长 +' + instP : '') + '</div></span>';
  var body = '<div class="lp-desc">' + esc(d.d) + '</div>';
  if (lk.needs.length) {
    body += '<div class="lp-sec">⛓ 需要 / 目标</div><div class="lp-chips">';
    for (var i = 0; i < lk.needs.length; i++) body += chipHTML(lk.needs[i]);
    body += '</div>';
  }
  if (lk.produces.length) {
    body += '<div class="lp-sec">🏭 产出</div><div class="lp-chips">';
    for (var p = 0; p < lk.produces.length; p++) body += chipHTML(lk.produces[p]);
    body += '</div>';
  }
  if (lk.givers.length) {
    body += '<div class="lp-sec">🔗 谁需要它</div><div class="lp-chips">';
    for (var j = 0; j < lk.givers.length; j++) body += chipHTML(lk.givers[j]);
    body += '</div>';
  }
  if (!lk.needs.length && !lk.givers.length && !lk.produces.length) body += '<div class="lp-sec" style="color:#8a7e9a;">暂无联动,朴实无华。</div>';
  el.lpBody.innerHTML = body;
  el.linkPanel.classList.add('show');
  var chips = el.lpBody.querySelectorAll('.lp-chip[data-id]');
  for (var i = 0; i < chips.length; i++) {
    chips[i].onclick = function() { SND.play('click'); clearLinkHL(); showLinkPanel(this.getAttribute('data-id'), 0); };
  }
}
function hideLinkPanel() {
  if (el.linkPanel) el.linkPanel.classList.remove('show');
  clearLinkHL();
}
// 道具预览(复用联动面板,无联动栏)
function showItemPanel(id) {
  var d = ITEMS[id];
  el.lpHead.innerHTML = '<span class="lp-sym">' + d.e + '</span><span>' +
    '<span class="lp-name">' + esc(d.name) + '</span>' +
    '<div class="lp-meta">' + RARE_NAMES[d.r] + ' · 道具</div></span>';
  el.lpBody.innerHTML = '<div class="lp-desc">' + esc(d.d) + '</div>';
  clearLinkHL();
  el.linkPanel.classList.add('show');
}
function inspectCell(pos) {
  if (!viewBoard) return;
  var me = viewBoard[pos];
  if (!me) return;
  if (me.dead) me = { id: 'empty', p: 0 };
  clearLinkHL();
  if (me.id !== 'empty') {
    var rel = relatedCells(pos);
    for (var i = 0; i < rel.targets.length; i++) cellEls[rel.targets[i]].classList.add('linked');
    for (var j = 0; j < rel.users.length; j++) cellEls[rel.users[j]].classList.add('linked', 'user');
  }
  SND.play('click');
  showLinkPanel(me.id, me.p || 0);
}
// 三选一卡片的联动提示行
function offerLinkLine(id) {
  var d = SYMBOLS[id], lk = linksFor(id);
  var arr = d.uses ? lk.needs : lk.givers;
  var out = '', n = 0;
  for (var i = 0; i < arr.length && n < 5; i++) {
    var x = arr[i];
    if (x === '__adj') continue;
    out += x === 'empty' ? '⬛' : symHTML(x);
    n++;
  }
  if (!out) return '';
  return (d.uses ? '需 ' : '被 ') + out;
}

/* ═══════════ 11. 三选一(符号) ═══════════ */
function genAndShowOffer() {
  if (!S.offer) S.offer = genOffer(S);
  for (var i = 0; i < S.offer.length; i++) markDex(S.offer[i]);
  saveGame();
  var html = '';
  for (var i = 0; i < S.offer.length; i++) {
    var id = S.offer[i], d = SYMBOLS[id];
    html += '<div class="pick-card r' + d.r + '" data-i="' + i + '">' +
      '<div class="pc-sym">' + symHTML(id) + '</div>' +
      '<div class="pc-name">' + esc(d.name) + '</div>' +
      '<div class="pc-val">' + d.v + ' 🪙</div>' +
      '<div class="pc-desc">' + esc(d.d) + '</div>' +
      '<div class="pc-links">' + offerLinkLine(id) + '</div>' +
      '<div class="pc-rare">' + RARE_NAMES[d.r] + '</div></div>';
  }
  el.offerCards.innerHTML = html;
  el.rerollCnt.textContent = S.reroll;
  el.btnReroll.style.display = S.reroll > 0 ? '' : 'none';
  var skipB = CONFIG.SKIP_COINS + (S.items.indexOf('kourindou') >= 0 ? ITEMS.kourindou.skipBonus : 0);
  el.btnSkip.textContent = '跳过 +' + skipB + '🪙';
  show(el.offerOverlay);
  var cards = el.offerCards.querySelectorAll('.pick-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = function() { pickOffer(parseInt(this.getAttribute('data-i'), 10)); };
  }
}
function pickOffer(i) {
  if (S.phase !== 'offer') return;
  SND.play('select');
  var id = S.offer[i];
  S.collection.push(mkInst(S, id));
  markDex(id);
  toast('「' + SYMBOLS[id].name + '」加入了!');
  S.offer = null; S.phase = 'idle';
  hide(el.offerOverlay);
  hud(); saveGame();
  el.btnSpin.disabled = false;
  previewBoard();
}
function skipOffer() {
  if (S.phase !== 'offer') return;
  SND.play('click');
  var b = CONFIG.SKIP_COINS + (S.items.indexOf('kourindou') >= 0 ? ITEMS.kourindou.skipBonus : 0);
  S.coins += b;
  toast('跳过了选择 +' + b + '🪙');
  S.offer = null; S.phase = 'idle';
  hide(el.offerOverlay);
  hud(); saveGame();
  el.btnSpin.disabled = false;
}
function rerollOffer() {
  if (S.phase !== 'offer' || S.reroll <= 0) return;
  SND.play('click');
  S.reroll--;
  S.offer = genOffer(S);
  genAndShowOffer();
}

/* ═══════════ 12. 收租 ═══════════ */
function showRent() {
  S.phase = 'rent';
  var amt = rentFor(S.day);
  el.rentDay.textContent = S.day;
  el.rentAmt.textContent = amt;
  if (S.coins >= amt) {
    el.btnPay.textContent = '💰 缴纳赛钱(' + amt + ')';
  } else if (S.items.indexOf('doll2') >= 0) {
    el.btnPay.textContent = '🎎 使用替身人偶免死!';
  } else {
    el.btnPay.textContent = '💀 交不起……接受退治';
  }
  show(el.rentOverlay);
  SND.play('click');
}
function payRent() {
  if (S.phase !== 'rent') return;
  var amt = rentFor(S.day);
  hide(el.rentOverlay);
  if (S.coins >= amt) {
    S.coins -= amt;
    S.totalPaid += amt;
    SND.play('pay');
    if (window.MQ && MQ.particles) {
      var nodes = MQ.particles.confetti(document.querySelector('.game-wrap'), { count: 20 });
      setTimeout(function() { for (var i = 0; i < nodes.length; i++) if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]); }, 2600);
    }
    toast('缴纳了 ' + amt + '🪙 赛钱!');
    // 道具:交租后
    for (var i = 0; i < S.items.length; i++) {
      var it = ITEMS[S.items[i]];
      if (it.rentRefund) { var rf = Math.round(amt * it.rentRefund); S.coins += rf; toast('赛钱箱返还 +' + rf + '🪙'); }
      if (it.rentCoins) S.coins += it.rentCoins;
      if (it.rentCoinsDay) S.coins += S.day * it.rentCoinsDay;
      if (it.rentReroll) S.reroll += it.rentReroll;
      if (it.luck) {
        S.luckB = Math.min(20, S.luckB + 2);
        S.luckG = Math.min(10, S.luckG + 1);
      }
    }
    afterRentPaid();
  } else if (S.items.indexOf('doll2') >= 0) {
    S.items.splice(S.items.indexOf('doll2'), 1);
    SND.play('grow');
    toast('🎎 替身人偶替你挨了灵梦一符!免死一次');
    afterRentPaid();
  } else {
    gameOver();
  }
}
function afterRentPaid() {
  if (S.day % 3 === 0) { S.reroll++; S.remove++; toast('获得 重抽+1 / 移除+1 代币!'); }
  hud(); saveGame();
  if (S.day === CONFIG.WIN_DAY && !S.won) { winGame(); return; }
  S.phase = 'item';
  genAndShowItemOffer();
}
function nextDay() {
  S.day++;
  S.spinsLeft = spinsFor(S.day);
  S.spinsUsed = 0;
  S.phase = 'idle';
  hud(); saveGame();
  el.btnSpin.disabled = false;
  previewBoard();
  toast('第 ' + S.day + ' 天,继续赚赛钱吧!');
}

/* ═══════════ 13. 三选一(道具) ═══════════ */
function genAndShowItemOffer() {
  if (!S.itemOffer) S.itemOffer = genItemOffer(S);
  saveGame();
  if (!S.itemOffer.length) {   // 道具已集齐
    S.coins += 20;
    toast('道具集齐了!灵梦留下了 20🪙');
    S.itemOffer = null;
    nextDay();
    return;
  }
  for (var i = 0; i < S.itemOffer.length; i++) markDex('item_' + S.itemOffer[i]);
  var html = '';
  for (var i = 0; i < S.itemOffer.length; i++) {
    var id = S.itemOffer[i], d = ITEMS[id];
    html += '<div class="pick-card r' + d.r + '" data-i="' + i + '">' +
      '<div class="pc-sym">' + d.e + '</div>' +
      '<div class="pc-name">' + esc(d.name) + '</div>' +
      '<div class="pc-val">道具</div>' +
      '<div class="pc-desc">' + esc(d.d) + '</div>' +
      '<div class="pc-rare">' + RARE_NAMES[d.r] + '</div></div>';
  }
  el.itemCards.innerHTML = html;
  show(el.itemOverlay);
  var cards = el.itemCards.querySelectorAll('.pick-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = function() { pickItem(parseInt(this.getAttribute('data-i'), 10)); };
  }
}
function pickItem(i) {
  if (S.phase !== 'item') return;
  SND.play('select');
  var id = S.itemOffer[i];
  S.items.push(id);
  var it = ITEMS[id];
  if (it.onGain === 'removeWeakest') {
    var w = -1, wv = 1e9;
    for (var k = 0; k < S.collection.length; k++) {
      var inst = S.collection[k];
      var vv = SYMBOLS[inst.id].v + (inst.p || 0) + SYMBOLS[inst.id].r * 0.1;
      if (vv < wv) { wv = vv; w = k; }
    }
    if (w >= 0 && S.collection.length > CONFIG.MIN_DECK) {
      toast('博丽大扫除:移除了「' + SYMBOLS[S.collection[w].id].name + '」');
      S.collection.splice(w, 1);
    }
  } else if (it.onGain === 'tokens') {
    S.reroll += 2; S.remove += 2;
  }
  toast('获得道具「' + it.name + '」!');
  S.itemOffer = null;
  hide(el.itemOverlay);
  nextDay();
}
function skipItem() {
  if (S.phase !== 'item') return;
  SND.play('click');
  S.coins += CONFIG.ITEM_SKIP_COINS;
  S.itemOffer = null;
  hide(el.itemOverlay);
  nextDay();
}

/* ═══════════ 14. 通关与结束 ═══════════ */
function statHTML() {
  return '<div class="stat-box"><div class="sv">' + S.day + '</div><div class="sl">存活天数</div></div>' +
    '<div class="stat-box"><div class="sv">' + S.totalPaid + '</div><div class="sl">缴纳赛钱</div></div>' +
    '<div class="stat-box"><div class="sv">' + S.totalEarned + '</div><div class="sl">总收入</div></div>' +
    '<div class="stat-box"><div class="sv">' + S.collection.length + '</div><div class="sl">收藏规模</div></div>';
}
function winGame() {
  S.won = true;
  S.phase = 'win';
  saveBest();
  el.winStats.innerHTML = statHTML();
  show(el.winOverlay);
  SND.play('pay');
  if (window.MQ && MQ.particles) {
    var nodes = MQ.particles.confetti(document.querySelector('.game-wrap'), { count: 36 });
    setTimeout(function() { for (var i = 0; i < nodes.length; i++) if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]); }, 3000);
  }
  loadLB('lbAreaWin', S.totalPaid);
}
function gameOver() {
  S.phase = 'over';
  SND.play('fail');
  saveBest();
  clearSave();
  el.overLine.textContent = '「' + (S.day <= 3 ? '才第 ' + S.day + ' 天就交不起?杂鱼~' : '交不起赛钱就给我出去!') + '」';
  el.overStats.innerHTML = statHTML();
  show(el.overOverlay);
  loadLB('lbArea', S.totalPaid);
}
function goEndless() {
  S.endless = true;
  hide(el.winOverlay);
  S.phase = 'item';
  genAndShowItemOffer();
}

/* ═══════════ 15. 排行榜(与幸存者同款) ═══════════ */
function loadLB(areaId, sc) {
  var area = $(areaId);

  // 登录墙
  if (!Auth.isLoggedIn()) {
    Auth.loginPrompt(area, function() { loadLB(areaId, sc); });
    return;
  }
  area.innerHTML = '<p style="color:#8a7e9a;font-size:13px;">⏳ 加载排行榜...</p>';
  fetch(API_BASE + 'api/leaderboard.php?game=' + CONFIG.LB_GAME, { headers: { 'Authorization': 'Bearer ' + Auth.token() } })
    .then(function(r) {
      if (r.status === 401) {
        Auth.loginPrompt(area, function() { loadLB(areaId, sc); });
        return null;
      }
      return r.json();
    })
    .then(function(data) {
      if (!data) return;
      var rank = -1;
      for (var i = 0; i < data.length; i++) if (sc > data[i].score) { rank = i + 1; break; }
      if (rank < 0) rank = data.length < 20 ? data.length + 1 : 0;
      renderLB(area, data, rank, sc, areaId);
    })
    .catch(function() {
      area.innerHTML = '<p class="lb-note">排行榜暂不可用(本地纪录已保存)</p>';
    });
}
function renderLB(area, data, rank, sc, areaId) {
  var html = '<div class="lb-wrap">';
  if (rank > 0) {
    html += '<div class="lb-submit">' +
      '<button class="lb-btn" id="lbSubmit_' + areaId + '">提交成绩</button>' +
      '<button class="lb-btn-ghost" id="lbSkip_' + areaId + '">跳过</button></div>';
  } else if (data.length >= 20) {
    html += '<p class="lb-note">你的成绩未进入前 20</p>';
  }
  html += '<div class="lb-toggle" id="lbToggle_' + areaId + '">📊 排行榜 ▸</div>' +
    '<div class="lb-table-wrap" id="lbWrap_' + areaId + '" style="display:none;">' +
    '<table class="lb-table"><thead><tr><th>#</th><th>名字</th><th>缴纳</th><th>天数</th><th>日期</th></tr></thead><tbody>';
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var cls = (rank > 0 && i + 1 === rank && d.score === sc) ? ' class="lb-my"' : '';
    html += '<tr' + cls + '><td>' + (i + 1) + '</td><td>' + esc(d.name) + '</td><td>' + d.score + '</td><td>' + (d.graze || 0) + '</td><td>' + (d.time || '') + '</td></tr>';
  }
  html += '</tbody></table></div></div>';
  area.innerHTML = html;
  var toggle = $('lbToggle_' + areaId), wrap = $('lbWrap_' + areaId);
  toggle.addEventListener('click', function() {
    var open = wrap.style.display !== 'none';
    wrap.style.display = open ? 'none' : 'block';
    toggle.textContent = open ? '📊 排行榜 ▸' : '📊 排行榜 ▾';
  });
  if (rank > 0) {
    $('lbSubmit_' + areaId).addEventListener('click', function() { submitLB(area, areaId); });
    $('lbSkip_' + areaId).addEventListener('click', function() { area.innerHTML = ''; });
  }
}
function submitLB(area, areaId) {
  if (!Auth.isLoggedIn()) {
    area.innerHTML = '<p class="lb-err">需要登录后提交成绩</p>';
    Auth.openModal('login', function() { loadLB(areaId, S.totalPaid); });
    return;
  }
  var btn = $('lbSubmit_' + areaId);
  btn.disabled = true; btn.textContent = '提交中...';
  var form = new FormData();
  form.append('score', String(S.totalPaid));
  form.append('graze', String(S.day));
  form.append('game', CONFIG.LB_GAME);
  fetch(API_BASE + 'api/leaderboard.php', {
    method: 'POST', body: form,
    headers: { 'Authorization': 'Bearer ' + Auth.token() }
  })
    .then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j }; }); })
    .then(function(res) {
      if (res.status === 401) {
        area.innerHTML = '<p class="lb-err">需要登录后提交成绩</p>';
        Auth.openModal('login', function() { loadLB(areaId, S.totalPaid); });
        return;
      }
      if (res.body.ok) {
        area.innerHTML = '<p class="lb-ok">✅ 提交成功!排名第 <b>' + res.body.rank + '</b></p>';
        loadLB(areaId, S.totalPaid);
      } else {
        area.innerHTML = '<p class="lb-err">提交失败:' + (res.body.error || '未知错误') + '</p>';
      }
    })
    .catch(function() { area.innerHTML = '<p class="lb-err">网络错误,稍后再试</p>'; });
}

/* ═══════════ 16. 收藏与图鉴 ═══════════ */
var removeMode = false;
function showColl() {
  renderColl();
  show(el.collOverlay);
  SND.play('click');
}
function renderColl() {
  // 道具区
  if (S.items.length) {
    el.collItemsWrap.classList.remove('hide');
    var ihtml = '';
    for (var t = 0; t < S.items.length; t++) {
      var iid = S.items[t];
      ihtml += '<span class="coll-item" data-iid="' + iid + '">' + ITEMS[iid].e + '<span class="ci-name">' + esc(ITEMS[iid].name) + '</span></span>';
    }
    el.collItems.innerHTML = ihtml;
    var iCells = el.collItems.querySelectorAll('.coll-item');
    for (var q = 0; q < iCells.length; q++) {
      iCells[q].onclick = function() {
        SND.play('click');
        hide(el.collOverlay);
        showItemPanel(this.getAttribute('data-iid'));
      };
    }
  } else {
    el.collItemsWrap.classList.add('hide');
  }
  var groups = {}, order = [];
  for (var i = 0; i < S.collection.length; i++) {
    var inst = S.collection[i];
    if (!groups[inst.id]) { groups[inst.id] = { id: inst.id, n: 0, p: 0 }; order.push(inst.id); }
    groups[inst.id].n++;
    if ((inst.p || 0) > groups[inst.id].p) groups[inst.id].p = inst.p;
  }
  order.sort(function(a, b) { return SYMBOLS[a].r - SYMBOLS[b].r || a.localeCompare(b); });
  var html = '';
  for (var i = 0; i < order.length; i++) {
    var g = groups[order[i]];
    html += '<div class="coll-cell' + (removeMode ? ' removable' : '') + '" data-id="' + g.id + '" title="' + esc(SYMBOLS[g.id].name) + ': ' + esc(SYMBOLS[g.id].d) + '">' +
      symHTML(g.id) +
      (g.n > 1 ? '<span class="cnt">×' + g.n + '</span>' : '') +
      (g.p > 0 ? '<span class="pp">+' + g.p + '</span>' : '') +
      '</div>';
  }
  el.collGrid.innerHTML = html;
  el.collInfo.textContent = '(' + S.collection.length + ' 个)';
  el.removeCnt.textContent = S.remove;
  el.btnRemoveMode.style.display = S.remove > 0 && !removeMode ? '' : 'none';
  el.collTip.textContent = removeMode ? '点击要移除的符号(收藏不能少于 ' + CONFIG.MIN_DECK + ' 个)' : '转盘每转从收藏中抽 20 个填满格子,多余的随机抽取。';
  if (removeMode) {
    var cells = el.collGrid.querySelectorAll('.coll-cell');
    for (var i = 0; i < cells.length; i++) {
      cells[i].onclick = function() { removeOne(this.getAttribute('data-id')); };
    }
  } else {
    var cells2 = el.collGrid.querySelectorAll('.coll-cell');
    for (var j = 0; j < cells2.length; j++) {
      cells2[j].onclick = function() {
        SND.play('click');
        hide(el.collOverlay);
        showLinkPanel(this.getAttribute('data-id'), groups[this.getAttribute('data-id')].p);
      };
    }
  }
}
function removeOne(id) {
  if (S.remove <= 0 || S.collection.length <= CONFIG.MIN_DECK) { toast('收藏不能少于 ' + CONFIG.MIN_DECK + ' 个!'); return; }
  for (var i = 0; i < S.collection.length; i++) {
    if (S.collection[i].id === id) {
      S.collection.splice(i, 1);
      S.remove--;
      SND.play('eat');
      toast('移除了「' + SYMBOLS[id].name + '」');
      break;
    }
  }
  if (S.remove <= 0) removeMode = false;
  renderColl();
  hud(); saveGame();
}
function showDex() {
  var html = '';
  var secs = [['普通', 0], ['优秀', 1], ['稀有', 2], ['传说', 3]];
  for (var s = 0; s < secs.length; s++) {
    html += '<div class="dex-sec">' + secs[s][0] + '</div><div class="dex-row">';
    for (var id in SYMBOLS) {
      if (SYMBOLS[id].r !== secs[s][1]) continue;
      var seen = S.dex[id];
      html += '<div class="dex-item' + (seen ? '' : ' locked') + '" data-id="' + id + '" data-t="sym">' +
        '<div class="di-sym">' + (seen ? symHTML(id) : '❓') + '</div>' +
        '<div class="di-name">' + (seen ? esc(SYMBOLS[id].name) : '???') + '</div></div>';
    }
    html += '</div>';
  }
  html += '<div class="dex-sec">道具</div><div class="dex-row">';
  for (var iid in ITEMS) {
    var seen2 = S.dex['item_' + iid];
    html += '<div class="dex-item' + (seen2 ? '' : ' locked') + '" data-id="' + iid + '" data-t="item">' +
      '<div class="di-sym">' + (seen2 ? ITEMS[iid].e : '❓') + '</div>' +
      '<div class="di-name">' + (seen2 ? esc(ITEMS[iid].name) : '???') + '</div></div>';
  }
  html += '</div>';
  el.dexBody.innerHTML = html;
  var items = el.dexBody.querySelectorAll('.dex-item:not(.locked)');
  for (var i = 0; i < items.length; i++) {
    items[i].onclick = function() {
      var t = this.getAttribute('data-t'), id = this.getAttribute('data-id');
      hide(el.dexOverlay);
      if (t === 'sym') { SND.play('click'); showLinkPanel(id, 0); }
      else { SND.play('click'); showItemPanel(id); }
    };
  }
  show(el.dexOverlay);
  SND.play('click');
}

/* ═══════════ 17. 弹层开关与启动 ═══════════ */
function show(o) { o.classList.remove('hide'); }
function hide(o) { o.classList.add('hide'); }
function hideAll() {
  var os = [el.startOverlay, el.offerOverlay, el.rentOverlay, el.itemOverlay, el.collOverlay, el.dexOverlay, el.helpOverlay, el.winOverlay, el.overOverlay];
  for (var i = 0; i < os.length; i++) hide(os[i]);
}
function newGame() {
  clearSave();
  S = freshState();
  hideAll();
  SND.unlock();
  hud();
  buildBoard();
  previewBoard();
  el.btnSpin.disabled = false;
  toast('点击「祈愿」转动转盘');
  saveGame();
  SND.play('select');
}
function resumeGame(data) {
  S = data;
  hideAll();
  hud();
  buildBoard();
  previewBoard();
  toast('欢迎回来!第 ' + S.day + ' 天继续');
  if (S.phase === 'offer' && S.offer) { genAndShowOffer(); }
  else if (S.phase === 'item' && S.itemOffer) { genAndShowItemOffer(); }
  else if (S.phase === 'rent') { showRent(); }
  else if (S.phase === 'win') { winGame(); }
  else { S.phase = 'idle'; el.btnSpin.disabled = false; }
}
function bindEvents() {
  el.btnSpin.onclick = doSpin;
  // 空闲状态下点击格子 → 查看联动(动画进行中点击=跳过,不冲突)
  el.board.addEventListener('click', function(e) {
    if (!S || S.phase !== 'idle' || animating) return;
    var t = e.target;
    while (t && t !== el.board && !(t.classList && t.classList.contains('cell'))) t = t.parentNode;
    if (!t || t === el.board) return;
    var pos = parseInt(t.getAttribute('data-pos'), 10);
    if (pos >= 0) inspectCell(pos);
  });
  el.lpClose.onclick = hideLinkPanel;
  el.btnSkip.onclick = skipOffer;
  el.btnReroll.onclick = rerollOffer;
  el.btnPay.onclick = payRent;
  el.btnItemSkip.onclick = skipItem;
  el.btnColl.onclick = function() { if (S && !animating) { removeMode = false; showColl(); } };
  el.btnCollClose.onclick = function() { hide(el.collOverlay); };
  el.btnRemoveMode.onclick = function() { if (S.remove > 0) { removeMode = true; renderColl(); } };
  el.btnDex.onclick = function() { if (S && !animating) showDex(); };
  el.btnDexClose.onclick = function() { hide(el.dexOverlay); };
  el.btnHelp.onclick = function() { show(el.helpOverlay); SND.play('click'); };
  el.btnHelpClose.onclick = function() { hide(el.helpOverlay); };
  el.btnNewGame.onclick = newGame;
  el.btnResume.onclick = function() { var d = loadGame(); if (d) { SND.unlock(); resumeGame(d); SND.play('select'); } };
  el.btnOverRestart.onclick = newGame;
  el.btnWinRestart.onclick = newGame;
  el.btnEndless.onclick = goEndless;
  el.btnMute.onclick = function() {
    var m = !SND.isMuted();
    SND.setMuted(m);
    try { localStorage.setItem(CONFIG.MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    el.btnMute.textContent = m ? '🔇' : '🔊';
  };
}
function boot() {
  var ids = ['hudDay', 'hudCoins', 'hudBest', 'hudRent', 'hudSpins', 'rentFill', 'board', 'spinMsg', 'spinGain',
    'btnSpin', 'btnColl', 'btnDex', 'btnMute', 'btnHelp', 'collCount',
    'startOverlay', 'btnNewGame', 'btnResume', 'bestLine',
    'offerOverlay', 'offerCards', 'btnReroll', 'rerollCnt', 'btnSkip',
    'rentOverlay', 'rentDay', 'rentAmt', 'btnPay',
    'itemOverlay', 'itemCards', 'btnItemSkip',
    'collOverlay', 'collGrid', 'collInfo', 'btnRemoveMode', 'removeCnt', 'btnCollClose', 'collTip',
    'collItemsWrap', 'collItems',
    'dexOverlay', 'dexBody', 'btnDexClose',
    'helpOverlay', 'btnHelpClose',
    'winOverlay', 'winStats', 'btnEndless', 'btnWinRestart',
    'overOverlay', 'overLine', 'overStats', 'btnOverRestart',
    'linkPanel', 'lpHead', 'lpBody', 'lpClose'];
  for (var i = 0; i < ids.length; i++) el[ids[i]] = $(ids[i]);
  BEST = loadBest();
  try { if (localStorage.getItem(CONFIG.MUTE_KEY) === '1') { SND.setMuted(true); el.btnMute.textContent = '🔇'; } } catch (e) {}
  bindEvents();
  // 最佳纪录
  if (BEST) el.bestLine.textContent = '🏆 最佳纪录:第 ' + BEST.day + ' 天 · 共缴纳 ' + BEST.paid + ' 🪙';
  // 断点续玩
  var save = loadGame();
  if (save) {
    el.btnResume.classList.remove('hide');
    el.btnResume.textContent = '▶ 继续上次(第 ' + save.day + ' 天 · ' + save.coins + '🪙)';
  }
  buildBoard();
  // 开场前摆一个静态棋盘
  S = freshState();
  previewBoard();
  S = null;
  el.btnSpin.disabled = true;
  show(el.startOverlay);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

root.ML = API;
})(typeof window !== 'undefined' ? window : this);
