// =============================================
//  幻想乡拍卖会 v2 · 游戏逻辑
//  四人暗标 · 情报阶梯 · 格子推断 · 大厅商城
// =============================================

/* ═══════════ 1. 常量与配置 ═══════════ */
var CONFIG = {
  SAVE: 'ma_best', SAVE_SKILL: 'ma_skill', SAVE_MUTE: 'ma_mute', SAVE_BGM: 'ma_bgm',
  SAVE_MAP: 'ma_map', SAVE_COINS: 'ma_coins', SAVE_TOOLS: 'ma_tools', SAVE_HELP: 'ma_helped',
  SAVE_ROSTER: 'ma_roster', SAVE_COLLECT: 'ma_collect', SAVE_BRING: 'ma_bring',
  SAVE_STORAGE: 'ma_storage', SAVE_AI_LOG: 'ma_ai_log',
  LB_GAME: 'auction', BGM: 'audio/bgm.mp3', BGM_VOL: 0.15
};
var STARTER_CHARS = ['marisa', 'reimu'];
var CHAR_PRICE = { sanae: 350, reisen: 300, patchouli: 450, sakuya: 550, yuyuko: 650, remilia: 750 };
var THRESH = [2, 1.8, 1.6, 1.4];       // 前4轮提前结算阈值(须高出第二名: 100%/80%/60%/40%)
var SLOT_BLIND = { garbage: 70, normal: 220, treasure: 460 }; // 无情报时按仓型盲估均格价(基准地图口径)
var AI_CASH = { normal: 15000, hard: 12000 };   // AI 每局固定资金(与玩家钱包无关)
var BAILOUT = 5000;                    // 钱包不足准入费时的保底金币
var DEFAULT_PW = {
  garbage:  [55, 32, 10, 3, 0, 0],
  normal:   [40, 30, 18, 8, 3.5, 0.5],
  treasure: [25, 28, 22, 14, 8, 3]
};
var MAPS = [
  { id:'korindo',  name:'香霖堂杂货店', emoji:'🏚️', fee:1000, cls:'map-korindo', desc:'便宜货多,捡漏天堂', profW:[0.55,0.35,0.10], pw:{ garbage:[55,32,10,3,0,0], normal:[45,32,16,6,1,0], treasure:[32,30,22,11,4,1] } },
  { id:'hakurei',  name:'博丽神社募捐会', emoji:'⛩️', fee:2000, cls:'map-hakurei', desc:'标准货柜,公平竞拍', profW:[0.35,0.40,0.25], pw:null },
  { id:'scarlet',  name:'红魔馆拍卖会', emoji:'🩸', fee:3000, cls:'map-scarlet', desc:'高档货多,竞争激烈', profW:[0.22,0.38,0.40], pw:{ garbage:[50,32,13,5,0,0], normal:[42,30,17,8,2.5,0.5], treasure:[30,28,21,12,7,2] } },
  { id:'eientei',  name:'永远亭月见会', emoji:'🌙', fee:5000, cls:'map-eientei', desc:'高品质多,富贵险中求', profW:[0.12,0.35,0.53], pw:{ garbage:[48,30,15,7,0,0], normal:[38,28,18,10,5,1], treasure:[34,30,20,10,5,1] } }
];
var WH_NAMES = ['红魔馆地下室货柜','博丽神社旧仓库','雾之湖漂来的木箱','魔法之森拾荒所得','守矢神社储藏间','白玉楼杂物柜','地灵殿遗落柜','月之都走私箱','永远亭药柜','人间之里旧货箱'];
var WH_FLAVOR = {
  garbage:  { txt:['柜缝里漏出一点灰…','封条贴着「勿动」,动起来又很轻…','老远就能闻到一股霉味…'] },
  normal:   { txt:['看起来平平无奇的旧柜…','箱子边角有点磕碰,问题不大…','锁头都锈了,里面会是什么呢…'] },
  treasure: { txt:['缝隙间隐约透出光…','箱子比想象中沉得多…','还没打开,就听到铃铛一样的响声…'] }
};
var CAT_NAMES = { 食:'食物', 器:'法宝', 兵:'武器', 活:'生活', 秘:'神秘' };
var SHOP = [
  { k:'scan',  n:'全库扫描',  e:'📡', price:250, max:3, d:'立即解锁下两轮线索' },
  { k:'probe', n:'珍品探测',  e:'🔍', price:180, max:3, d:'查看紫/金/红品总件数' },
  { k:'heavy', n:'大件探针',  e:'⚖️', price:150, max:3, d:'最贵物品占用几格,并描边' }
];
var AI_TRUST = { reimu: 0.5, sanae: 1.5, yuyuko: 1.0, marisa: 0.8, remilia: 0.7, patchouli: 0.6, sakuya: 0.9, reisen: 1.2 };
var AI_AGGR = { reimu: 0.78, sanae: 0.85, marisa: 0.88, remilia: 0.92, patchouli: 0.80, sakuya: 0.82, reisen: 0.84 };
var AI_PERSONA = {
  reimu:    { vol: 0.10, probe: 0.25, spike: 0.05, lowball: 0.00, first: 'conserv', burst: 0.00 },
  sanae:    { vol: 0.22, probe: 0.15, spike: 0.05, lowball: 0.05, first: 'probe',   burst: 0.05 },
  yuyuko:   { vol: 0.08, probe: 0.10, spike: 0.00, lowball: 0.30, first: 'low',     burst: 0.28 },
  marisa:   { vol: 0.12, probe: 0.20, spike: 0.18, lowball: 0.00, first: 'wild',    burst: 0.15 },
  remilia:  { vol: 0.10, probe: 0.10, spike: 0.25, lowball: 0.00, first: 'high',    burst: 0.10 },
  patchouli:{ vol: 0.08, probe: 0.30, spike: 0.05, lowball: 0.00, first: 'probe',   burst: 0.05 },
  sakuya:   { vol: 0.10, probe: 0.10, spike: 0.00, lowball: 0.25, first: 'low',     burst: 0.12 },
  reisen:   { vol: 0.20, probe: 0.20, spike: 0.05, lowball: 0.05, first: 'wild',    burst: 0.05 }
};

/* ═══════════ 2. 角色(8人·情报向技能) ═══════════ */
var CHARS = [
  { id:'marisa',   name:'魔理沙',     img:'marisa.jpg',      emoji:'🧙', title:'恋符·透视', desc:'偷看一名对手本轮出价区间(±300)' },
  { id:'reimu',    name:'灵梦',       img:'reimu.jpg',       emoji:'⛩️', title:'直觉·估价', desc:'查看仓库真实总价值区间(±10%)' },
  { id:'sanae',    name:'早苗',       img:'早苗.jpg',        emoji:'🌿', title:'风祝·假情报', desc:'发布真假情报,动摇对手估值' },
  { id:'yuyuko',   name:'幽幽子',     img:'幽幽子.jpg',      emoji:'🌸', title:'亡我·窥宴', desc:'最贵物品占格数与类别,描边' },
  { id:'remilia',  name:'蕾米莉亚',   img:'蕾米莉亚.jpg',    emoji:'🩸', title:'命运·红瞳', desc:'揭示金/红品共占几格并点亮' },
  { id:'patchouli',name:'帕秋莉',     img:'帕秋莉.jpg',      emoji:'📖', title:'贤者·品鉴', desc:'选一品质档,看件数与占格' },
  { id:'sakuya',   name:'十六夜咲夜', img:'十六夜咲夜.jpg',  emoji:'🕰️', title:'时停·窥牌', desc:'看全场最高出价区间(±200)' },
  { id:'reisen',   name:'铃仙',       img:'铃仙.jpg',        emoji:'🐇', title:'月眼·幻惑', desc:'让一名对手误判局势,影响其下一轮出价' }
];
function charById(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i]; return CHARS[0]; }
function mapById(id) { for (var i = 0; i < MAPS.length; i++) if (MAPS[i].id === id) return MAPS[i]; return MAPS[1]; }

/* ═══════════ 3. 工具函数 ═══════════ */
function $ (id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
function rand(a, b) { return a + Math.random() * (b - a); }
function rint(a, b) { return Math.round(rand(a, b)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { var a = arr.slice(), i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function qColor(q) { return AUCTION_QUALITY[q].color; }
function qName(q) { return AUCTION_QUALITY[q].name; }
function ava(c) { return '<img class="av-img" src="images/touhou_ninnin/' + encodeURIComponent(c.img) + '" alt="' + esc(c.name) + '">'; }
function seededShuffle(n, seed) {
  var a = [], s = (seed >>> 0) || 1, i, j, t;
  for (i = 0; i < n; i++) a.push(i);
  for (i = n - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; j = s % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ═══════════ 4. 音效(文件优先,合成兜底) ═══════════ */
var SND = (function () {
  var ctx = null, sfxMuted = false, bgmMuted = false, files = {}, bgm = null, bgmTried = false;
  var FILES = {
    tick:'audio/sfx/tick.mp3', coin:'audio/sfx/coin.mp3', eat:'audio/sfx/eat.mp3',
    select:'audio/sfx/select.mp3', pay:'audio/sfx/pay.mp3', fail:'audio/sfx/fail.mp3',
    victory:'audio/sfx/victory.wav'
  };
  function ensureCtx() { try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) {} }
  function tryLoad() {
    for (var k in FILES) (function (k) {
      var a = new Audio(); a.preload = 'auto';
      a.addEventListener('canplaythrough', function () { files[k] = a; });
      a.addEventListener('error', function () {});
      a.src = FILES[k];
    })(k);
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
    tick: function () { beep(750, 0.04, 'square', 0.05); },
    coin: function () { beep(1150, 0.07, 'sine', 0.07, 1500); },
    select: function () { beep(620, 0.09, 'triangle', 0.09, 830); },
    pay: function () { beep(523, 0.12, 'triangle', 0.1); setTimeout(function () { beep(659, 0.12, 'triangle', 0.1); }, 110); setTimeout(function () { beep(784, 0.2, 'triangle', 0.1); }, 220); },
    fail: function () { beep(320, 0.5, 'sawtooth', 0.09, 90); },
    victory: function () { beep(523, 0.15, 'triangle', 0.1); setTimeout(function () { beep(659, 0.15, 'triangle', 0.1); }, 150); setTimeout(function () { beep(784, 0.2, 'triangle', 0.1); }, 300); setTimeout(function () { beep(1047, 0.35, 'triangle', 0.1); }, 450); }
  };
  return {
    unlock: function () {
      ensureCtx(); if (bgmTried) return; bgmTried = true; tryLoad();
      if (bgmMuted) return;
      bgm = new Audio(); bgm.loop = true; bgm.volume = CONFIG.BGM_VOL;
      bgm.addEventListener('error', function () { bgm = null; });
      bgm.src = CONFIG.BGM;
      var p = bgm.play(); if (p && p.catch) p.catch(function () {});
    },
    play: function (name) {
      if (sfxMuted) return; ensureCtx();
      if (files[name]) { try { var a = files[name].cloneNode(); a.volume = 0.6; a.play(); return; } catch (e) {} }
      if (SYNTH[name]) SYNTH[name]();
    },
    setSfx: function (m) { sfxMuted = m; try { localStorage.setItem(CONFIG.SAVE_MUTE, m ? '1' : '0'); } catch (e) {} },
    isSfx: function () { return sfxMuted; },
    setBgm: function (m) {
      bgmMuted = m; try { localStorage.setItem(CONFIG.SAVE_BGM, m ? '1' : '0'); } catch (e) {}
      if (bgm) { if (m) bgm.pause(); else { var p = bgm.play(); if (p && p.catch) p.catch(function () {}); } }
    },
    isBgm: function () { return bgmMuted; }
  };
})();

/* ═══════════ 4.5 轻提示(自带兜底,防 page-base 未导出) ═══════════ */
if (typeof window.mmsToast !== 'function') {
  window.mmsToast = function (msg) {
    try {
      var old = document.getElementById('mmsToast');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var t = document.createElement('div');
      t.id = 'mmsToast';
      t.className = 'mms-toast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add('show'); }, 10);
      setTimeout(function () { t.classList.remove('show'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 1800);
    } catch (e) {}
  };
}

/* ═══════════ 5. 存档 ═══════════ */
function loadBest() { try { return parseInt(localStorage.getItem(CONFIG.SAVE), 10) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { if (v > loadBest()) localStorage.setItem(CONFIG.SAVE, String(v)); } catch (e) {} }
function loadSkill() { try { return localStorage.getItem(CONFIG.SAVE_SKILL) || 'marisa'; } catch (e) { return 'marisa'; } }
function saveSkill(id) { try { localStorage.setItem(CONFIG.SAVE_SKILL, id); } catch (e) {} }
function loadMapSel() { try { return localStorage.getItem(CONFIG.SAVE_MAP) || 'hakurei'; } catch (e) { return 'hakurei'; } }
function loadCoins() { try { var v = localStorage.getItem(CONFIG.SAVE_COINS); if (v === null) { localStorage.setItem(CONFIG.SAVE_COINS, '10000'); return 10000; } return parseInt(v, 10) || 0; } catch (e) { return 10000; } }
function saveCoins(n) { try { localStorage.setItem(CONFIG.SAVE_COINS, String(n)); } catch (e) {} }
function loadTools() { try { var t = JSON.parse(localStorage.getItem(CONFIG.SAVE_TOOLS)) || {}; return { scan: t.scan || 0, probe: t.probe || 0, heavy: t.heavy || 0 }; } catch (e) { return { scan: 0, probe: 0, heavy: 0 }; } }
function saveTools(t) { try { localStorage.setItem(CONFIG.SAVE_TOOLS, JSON.stringify(t)); } catch (e) {} }
function loadHelped() { try { return localStorage.getItem(CONFIG.SAVE_HELP) === '1'; } catch (e) { return false; } }
function saveHelped(v) { try { localStorage.setItem(CONFIG.SAVE_HELP, v ? '1' : '0'); } catch (e) {} }
function loadRoster() {
  try {
    var t = JSON.parse(localStorage.getItem(CONFIG.SAVE_ROSTER));
    if (t && t.length > 0) return t.filter(function (id) { return charById(id).id === id; });
  } catch (e) {}
  try { localStorage.setItem(CONFIG.SAVE_ROSTER, JSON.stringify(STARTER_CHARS)); } catch (e) {}
  return STARTER_CHARS.slice();
}
function saveRoster(r) { try { localStorage.setItem(CONFIG.SAVE_ROSTER, JSON.stringify(r)); } catch (e) {} }
function ownChar(id) { return loadRoster().indexOf(id) > -1; }
function charPrice(id) { return CHAR_PRICE[id] || 0; }
(function () { try { SND.setSfx(localStorage.getItem(CONFIG.SAVE_MUTE) === '1'); SND.setBgm(localStorage.getItem(CONFIG.SAVE_BGM) === '1'); } catch (e) {} })();

/* ═══════════ 6. 仓库生成(地图感知) ═══════════ */
function genWarehouse(idx) {
  var profPool = ['garbage', 'normal', 'treasure'];
  var profW = (S.map && S.map.profW) || [0.35, 0.40, 0.25];
  var pw = (S.map && S.map.pw) || DEFAULT_PW;
  var r = Math.random(), profile = profPool[0], acc = 0;
  for (var i = 0; i < 3; i++) { acc += profW[i]; if (r < acc) { profile = profPool[i]; break; } }
  var target = rint(22, 32);
  if (profile === 'garbage') target = rint(22, 34);
  else if (profile === 'normal') target = rint(26, 42);
  else target = rint(30, 48);
  var w = pw[profile];
  var items = [], used = [], usedSlots = 0, guard = 0;
  while (usedSlots < target && guard++ < 800) {
    var q = pickQuality(w);
    var pool = AUCTION_ITEMS.filter(function (it) { return it.q === q && (q <= 1 || used.indexOf(it.n) === -1); });
    if (!pool.length) continue;
    var it = pick(pool);
    if (usedSlots + it.s > target + 3 && usedSlots >= target - 4) { continue; }
    used.push(it.n); usedSlots += it.s;
    items.push({ n: it.n, q: it.q, s: it.s, v: Math.round(it.v * rand(0.8, 1.2)), e: it.e, c: it.c });
  }
  var counts = [0, 0, 0, 0, 0, 0], qSlots = [0, 0, 0, 0, 0, 0], totalV = 0;
  if (!items.length) items.push({ n: '灰尘团', q: 0, s: 1, v: 3, e: '🫧', c: '活' });
  var mostExp = items[0], mostExpIdx = 0;
  items.forEach(function (it, i) { counts[it.q]++; qSlots[it.q] += it.s; totalV += it.v; if (it.v > mostExp.v) { mostExp = it; mostExpIdx = i; } });
  var seed = rint(1, 999999999);
  // 连续占位:每件物品的格子挨在一起(行序排列),大件就是一块
  var slotItem = new Array(usedSlots);
  (function () { var si = 0; items.forEach(function (it, i) { for (var k = 0; k < it.s && si < usedSlots; k++) slotItem[si++] = i; }); })();
  var clues = genClues(seed, items, counts, qSlots, mostExp, totalV);
  return {
    idx: idx, name: pick(WH_NAMES), emoji: '📦', profile: profile,
    flavor: pick(WH_FLAVOR[profile].txt),
    slots: usedSlots, items: items, counts: counts, qSlots: qSlots,
    totalV: totalV, mostExp: mostExp, mostExpIdx: mostExpIdx,
    seed: seed, slotItem: slotItem, clues: clues,
    probe: 0, clueShownPrev: 0, event: null,
    hotCells: null, hotTag: '', goldRedCells: null, patchQ: -1
  };
}
function itemCells(wh, itemIdx) {
  var out = [];
  for (var s = 0; s < wh.slots; s++) if (wh.slotItem[s] === itemIdx) out.push(s);
  return out;
}
function qualityCells(wh, q) {
  var out = [];
  for (var s = 0; s < wh.slots; s++) { var it = wh.items[wh.slotItem[s]]; if (it && it.q === q) out.push(s); }
  return out;
}
function pickQuality(w) {
  var total = w.reduce(function (a, b) { return a + b; }, 0);
  var r = Math.random() * total, acc = 0;
  for (var q = 0; q < 6; q++) { acc += w[q]; if (r < acc) return q; }
  return 0;
}
/* ═══════════ 7. 全局状态 ═══════════ */
var S = null, BEST = loadBest(), ui = {}, isAnimating = false;
var PICKED_CHAR = loadSkill(), PICKED_DIFF = 'normal', PICKED_MAP = loadMapSel();
var PREV_PAGE = 'home';

function initUI() {
  ui.hudMap = $('hudMap'); ui.hudWh = $('hudWh'); ui.hudRound = $('hudRound'); ui.hudCash = $('hudCash'); ui.hudBest = $('hudBest');
  ui.screen = $('screen');
  ui.homeOverlay = $('homeOverlay'); ui.wizardOverlay = $('wizardOverlay');
  ui.charHomeOverlay = $('charHomeOverlay'); ui.charHomeCoins = $('charHomeCoins'); ui.charHomeCards = $('charHomeCards');
  ui.shopOverlay = $('shopOverlay'); ui.shopCoins = $('shopCoins');
  ui.collectOverlay = $('collectOverlay');
  ui.storageOverlay = $('storageOverlay'); ui.aiLogOverlay = $('aiLogOverlay');
  ui.storageSum = $('storageSum'); ui.storageRows = $('storageRows'); ui.aiLogRows = $('aiLogRows');
  ui.menuCoins = $('menuCoins'); ui.wizCoins = $('wizCoins'); ui.cloudLine = $('cloudLine');
  ui.collectProgress = $('collectProgress'); ui.collectBar = $('collectBar'); ui.collectGrid = $('collectGrid');
  ui.helpOverlay = $('helpOverlay');
  ui.revealOverlay = $('revealOverlay'); ui.unboxOverlay = $('unboxOverlay');
  ui.tieOverlay = $('tieOverlay'); ui.finalOverlay = $('finalOverlay');
  ui.pickTargetOverlay = $('pickTargetOverlay'); ui.fakeInfoOverlay = $('fakeInfoOverlay');
  ui.ptTitle = $('ptTitle'); ui.pickTargetList = $('pickTargetList'); ui.fakeInfoBody = $('fakeInfoBody');
  ui.bidInputOverlay = $('bidInputOverlay');
  ui.biTitle = $('biTitle'); ui.biInput = $('biInput'); ui.biNote = $('biNote'); ui.biChips = $('biChips');
  ui.toolsDrawer = $('toolsDrawer'); ui.toolsDrawerBody = $('toolsDrawerBody');
  ui.rvGrid = $('rvGrid'); ui.rvTitle = $('rvTitle'); ui.rvNote = $('rvNote'); ui.btnRvNext = $('btnRvNext');
  ui.ubGrid = $('ubGrid'); ui.ubTitle = $('ubTitle'); ui.ubSub = $('ubSub'); ui.ubSum = $('ubSum'); ui.btnUbNext = $('btnUbNext');
  ui.ubSlots = $('ubSlots');
  ui.tieNote = $('tieNote'); ui.tieBidPanel = $('tieBidPanel');
  ui.finalTitle = $('finalTitle'); ui.finalDesc = $('finalDesc'); ui.finalStats = $('finalStats'); ui.finalRank = $('finalRank');
  ui.coinsGain = $('coinsGain');
  ui.lbArea = $('lbArea');
}
function setHud() {
  ui.hudMap.textContent = S.map ? S.map.emoji + ' ' + S.map.name : '';
  ui.hudWh.textContent = '本局货柜';
  ui.hudRound.innerHTML = S.wh ? ('第 <b>' + S.round + '</b> 轮' + (S.wh.probe ? '·📡' : '')) : '筹备中';
  ui.hudCash.textContent = fmt(S.player.cash);
  ui.hudBest.textContent = BEST ? fmt(BEST) : '-';
}
function setEvent(html) {
  if (!S || !S.wh) return;
  S.wh.event = { html: html };
}
function qualityLine(arr, unit) {
  var parts = [];
  for (var q = 0; q < 6; q++) if (arr[q] > 0) parts.push('<span style="color:' + qColor(q) + '">' + qName(q).charAt(0) + '</span>' + arr[q] + unit);
  return parts.join(' ');
}
function hideOverlay(o) { o.classList.add('hide'); }

/* ── 玩法说明(翻页) ── */
var HELP_PAGE = 1;
var HELP_PAGES = [
  { t: '① 一局怎么玩', c: [
    '1. 选拍卖场(交准入费)→ 选角色 → 带道具',
    '2. 四人暗标,最多 5 轮,金额全程保密',
    '3. 第 5 轮价高者得;并列则加时再标',
    '4. 开箱逐格揭晓,藏品入仓库,可出售换金币'
  ] },
  { t: '② 情报阶梯', c: [
    '每轮解锁一条线索,每局的线索都不一样',
    '格子颜色=品质:白绿蓝紫金红',
    '大件的格子会连成一块,留意凸起区域',
    '技能/道具能获得只有你知道的额外情报'
  ] },
  { t: '③ 出价与结算', c: [
    '前 4 轮最高价碾压第二名 100%/80%/60%/40% 即提前成交',
    '出价高于真实价值→爆仓,超出部分 30% 分给其他人',
    '拍下:赚货值与成交价的差价;未拍下:亏准入费',
    '全站通用「金币」:钱包=出价资金=商城货币'
  ] },
  { t: '④ 养成与云端', c: [
    '金币解锁新角色、购买道具、出售仓库藏品',
    '图鉴收集 107 件藏品,对手档案了解 8 位 AI 的风格',
    '登录后存档自动同步云端,换设备不丢进度',
    '困难模式没有估价器,情报全靠自己判断'
  ] }
];
function renderHelpPage() {
  var p = HELP_PAGES[HELP_PAGE - 1];
  $('helpTitle').textContent = p.t;
  $('helpBody').innerHTML = p.c.map(function (l) { return '<div class="hp-line">' + l + '</div>'; }).join('');
  document.querySelectorAll('#helpOverlay .hp-dot').forEach(function (d) {
    d.classList.toggle('on', parseInt(d.getAttribute('data-p'), 10) === HELP_PAGE);
  });
  $('btnHelpPrev').classList.toggle('hide', HELP_PAGE === 1);
  $('btnHelpNext').classList.toggle('hide', HELP_PAGE >= HELP_PAGES.length);
  $('btnHelpClose').classList.toggle('hide', HELP_PAGE < HELP_PAGES.length);
  $('btnHelpDone').classList.toggle('hide', HELP_PAGE !== HELP_PAGES.length);
}
function helpGo(d) { HELP_PAGE = clamp(HELP_PAGE + d, 1, HELP_PAGES.length); renderHelpPage(); SND.play('tick'); }
function helpJump(n) { HELP_PAGE = n; renderHelpPage(); SND.play('tick'); }
function openHelp() { HELP_PAGE = 1; renderHelpPage(); ui.helpOverlay.classList.remove('hide'); }

/* ═══════════ 8. 情报池 / 估值 / 可视化 ═══════════ */
var CLUE_T = {
  bluePlus: '蓝品以上件数', mostExp: '最贵物品', catCount: '某类物品数量',
  topQ: '最高品质档', qDist: '品质分布(件)', slotDist: '各档占格', valRange: '价值区间'
};
var CLUE_ICO = {
  bluePlus: '🔵', mostExp: '⚖️', catCount: '🏷️',
  topQ: '💎', qDist: '📊', slotDist: '🧩', valRange: '💰'
};
function genClues(seed, items, counts, qSlots, mostExp, totalV) {
  var cats = ['食', '器', '兵', '活', '秘'];
  var cat = cats[seed % cats.length];
  var pool = ['bluePlus', 'mostExp', 'catCount', 'topQ', 'qDist', 'slotDist', 'valRange'];
  var order = seededShuffle(pool.length, (seed ^ 0x9e37) >>> 0 || 7);
  var types = order.slice(0, 4).map(function (i) { return pool[i]; });
  return types.map(function (key) {
    var c = { key: key, unlocked: false };
    if (key === 'catCount') {
      c.extra = cat;
      c.v = items.filter(function (it) { return it.c === cat; }).length + ' 件(' + CAT_NAMES[cat] + ')';
    } else if (key === 'bluePlus') {
      c.v = (counts[3] + counts[4] + counts[5]) + ' 件';
    } else if (key === 'mostExp') {
      c.v = '占 <b>' + mostExp.s + ' 格</b>' + (mostExp.q >= 4 ? ' · <span style="color:#f0c060">疑似高品!</span>' : '');
    } else if (key === 'topQ') {
      var top = 0; counts.forEach(function (n2, q2) { if (n2 > 0) top = q2; });
      c.extra = top;
      c.v = qName(top) + (top >= 4 ? ' — 柜里藏着' + qName(top) + '!' : '');
    } else if (key === 'qDist') {
      c.v = qualityLine(counts, '件');
    } else if (key === 'slotDist') {
      c.v = qualityLine(qSlots, '格');
    } else if (key === 'valRange') {
      c.v = '约 <b>' + fmt(Math.round(totalV * 0.6)) + ' ~ ' + fmt(Math.round(totalV * 0.9)) + '</b> 金币';
    }
    return c;
  });
}
function clueCount(wh) { return clamp((S.round || 1) + (wh.probe || 0), 1, 4); }
function clueSet(wh) {
  var n = clueCount(wh);
  var known = {};
  for (var i = 0; i < wh.clues.length && i < n; i++) known[wh.clues[i].key] = true;
  return known;
}
function estimateNow(wh) {
  var known = clueSet(wh);
  if (known.qDist) { var s = 0; for (var q = 0; q < 6; q++) s += wh.counts[q] * AUCTION_QUALITY[q].itemAvg; return Math.round(s); }
  if (known.slotDist) { var s2 = 0; for (var q2 = 0; q2 < 6; q2++) s2 += wh.qSlots[q2] * AUCTION_QUALITY[q2].slotRate; return s2; }
  if (known.valRange) return Math.round(wh.totalV * 0.75);
  var base = Math.round(wh.slots * SLOT_BLIND[wh.profile]);
  if (known.topQ) {
    var top = wh.clues[0].extra;
    for (var i = 1; i < wh.clues.length; i++) if (wh.clues[i].key === 'topQ') top = wh.clues[i].extra;
    if (top >= 5) base = Math.round(base * 1.6);
    else if (top === 4) base = Math.round(base * 1.35);
    else if (top === 3) base = Math.round(base * 1.15);
  }
  if (known.bluePlus) base += (wh.counts[3] + wh.counts[4] + wh.counts[5]) * 2200;
  if (known.mostExp) base += wh.mostExp.s * 1200;
  return base;
}
function slotGridHTML(wh) {
  var known = clueSet(wh).slotDist === true;
  var cells = [];
  for (var i = 0; i < wh.slots; i++) cells.push({ q: -1, hot: false, tag: '' });
  if (known && wh.slotItem) {
    for (var si = 0; si < wh.slots; si++) {
      var it = wh.items[wh.slotItem[si]];
      if (it) cells[si].q = it.q;
    }
  }
  if (wh.goldRedCells) {
    wh.goldRedCells.forEach(function (g) { if (g < cells.length) cells[g].q = 5; });
  }
  if (wh.patchQ >= 0) {
    qualityCells(wh, wh.patchQ).forEach(function (p) { if (p < cells.length) cells[p].q = wh.patchQ; });
  }
  if (wh.hotCells) wh.hotCells.forEach(function (h) { if (h < cells.length) { cells[h].hot = true; if (wh.hotTag) cells[h].tag = wh.hotTag; } });
  var n = clueCount(wh);
  var firstReveal = known && (wh.clueShownPrev || 0) < n;
  var justMarked = wh._just === true;
  var html = '<div class="slot-grid">' + cells.map(function (c, i) {
    var cls = c.q >= 0 ? ' q' + c.q : ' unk';
    if (c.hot) cls += ' hot';
    if (c.tag) cls += ' tagged';
    var bounce = (firstReveal && c.q >= 0) || (justMarked && (c.hot || c.q === 5 || (wh.patchQ >= 0 && c.q === wh.patchQ)));
    return '<div class="sl-cell' + cls + (bounce ? ' reveal-bounce' : '') + '" style="' + (bounce ? 'animation-delay:' + (i * 0.02).toFixed(2) + 's;' : '') + '" data-tag="' + c.tag + '"></div>';
  }).join('') + '</div>';
  wh._just = false;
  return html;
}
function clueFieldsHTML(wh) {
  var n = clueCount(wh);
  var just = n > (wh.clueShownPrev || 0);
  var html = '<div class="clue-panel"><div class="clue-title">🔍 情报阶梯 <span style="font-size:10px;color:#5a5266;">每轮解锁一条,每局线索不同</span></div>';
  wh.clues.forEach(function (c, i) {
    var unlocked = i < n;
    var flash = just && unlocked && i === n - 1 ? ' flash' : '';
    html += '<div class="clue-field' + (unlocked ? '' : ' locked') + flash + '">' +
      '<span class="cf-ico">' + CLUE_ICO[c.key] + '</span>' +
      '<span class="cf-t">' + CLUE_T[c.key] + '</span>' +
      '<span class="cf-v">' + (unlocked ? c.v : '未知') + '</span></div>';
  });
  html += '<div class="clue-event">' + (wh.event ? wh.event.html : '') + '</div></div>';
  wh.clueShownPrev = n;
  return html;
}
function calcHTML(wh) {
  var n = clueCount(wh);
  var est = estimateNow(wh);
  var conserv = Math.max(100, Math.round(est * 0.72 / 10) * 10);
  var lo = Math.max(100, Math.round(est * 0.55 / 10) * 10), hi = Math.max(100, Math.round(est * 0.9 / 10) * 10);
  var html = '';
  if (S.diff === 'hard') {
    html += '<div class="calc-note">🔒 困难模式关闭估值器<br>当前情报可信度:' + (n >= 3 ? '<b style="color:#6fcf97">高</b>' : (n === 2 ? '<b style="color:#f0c060">中</b>' : '<b style="color:#ef4444">低</b>')) + '(已解锁 ' + n + '/4 条线索),自行判断</div>';
  } else {
    html += '<div class="calc-head">' +
      '<div class="calc-box"><div class="cb-t">保守估值</div><div class="cb-v">' + fmt(conserv) + '</div></div>' +
      '<div class="calc-box"><div class="cb-t">期望估值</div><div class="cb-v">' + fmt(est) + '</div></div>' +
      '<div class="calc-box range"><div class="cb-t">建议区间</div><div class="cb-v">' + fmt(lo) + '~' + fmt(hi) + '</div></div></div>';
    var known = clueSet(wh);
    var rows = '';
    for (var q = 0; q < 6; q++) {
      var info = '', val = 0;
      if (known.slotDist) { info = wh.qSlots[q] + ' 格'; val = wh.qSlots[q] * AUCTION_QUALITY[q].slotRate; }
      else if (known.qDist) { info = wh.counts[q] + ' 件'; val = Math.round(wh.counts[q] * AUCTION_QUALITY[q].itemAvg); }
      else { info = '🔒'; }
      rows += '<div class="calc-row' + (info === '🔒' ? ' unknown' : '') + '">' +
        '<span class="q-dot" style="background:' + qColor(q) + '"></span>' +
        '<span class="q-name">' + qName(q) + '</span>' +
        '<span class="q-val">' + info + (val ? ' → <b>' + fmt(val) + '</b>' : '') + '</span></div>';
    }
    if (!known.slotDist && !known.qDist) {
      rows = '<div class="calc-row unknown"><span class="q-name" style="width:auto;">基于 ' + n + ' 条线索的盲估,线索越多越准</span></div>';
    }
    html += rows + '<div style="font-size:10px;color:#5a5266;margin-top:6px;">第 ' + S.round + ' 轮 · 保守=期望×72% · 建议=期望×55%~90%</div>';
  }
  return html;
}

/* ═══════════ 9. AI 行为 ═══════════ */
function aiMake(ai) {
  ai.estFactor = 1; ai.skillUsed = false;
  ai.skillReady = ai.char.id === 'marisa' ? 0 : (Math.random() < 0.85 ? (Math.random() < 0.5 ? 2 : 3) : 0);
  ai.estTmp = 0; ai.bid = 0; ai.assess = ''; ai.mood = '';
  ai.patchTier = rint(3, 5);   // 帕秋莉自带的私有品鉴档位
  ai.delusion = null;
}
// AI 私有情报:按角色性格与技能,各自掌握不同的信息碎片
function aiIntel(ai, wh) {
  var c = ai.char.id;
  if (c === 'reimu') return Math.round(wh.totalV * rand(0.95, 1.05));          // 直觉:近乎真实总价
  if (c === 'remilia') return Math.round(estimateNow(wh) + (wh.counts[4] + wh.counts[5]) * 2500); // 红瞳:金红件数加成
  if (c === 'yuyuko') return Math.round(estimateNow(wh) + wh.mostExp.s * 1400); // 亡我:知道最贵大件
  if (c === 'patchouli') return Math.round(estimateNow(wh) + wh.counts[ai.patchTier] * (AUCTION_QUALITY[ai.patchTier].itemAvg - SLOT_BLIND[wh.profile]) * 0.8); // 品鉴:一档精确
  if (c === 'sanae') return Math.round(estimateNow(wh) * rand(0.85, 1.15));     // 风祝:全靠流言,最不稳
  if (c === 'marisa') return Math.round(estimateNow(wh) * rand(0.9, 1.1));      // 直觉型,时灵时不灵
  return estimateNow(wh);
}
function aiEstimate(ai, wh) {
  var base = aiIntel(ai, wh);
  var err = { reimu: 0.06, remilia: 0.10, yuyuko: 0.10, patchouli: 0.10, sanae: 0.25, marisa: 0.20, sakuya: 0.16, reisen: 0.18 }[ai.char.id] || 0.2;
  if (ai.skillUsed) err *= 0.3;
  base *= 1 + rand(-err, err);
  base *= ai.estFactor;
  return base;
}
function aiAggr(ai) {
  if (ai.char.id === 'yuyuko') return [0.65, 0.72, 0.8, 0.88, 0.95][S.round - 1] + (S.diff === 'hard' ? 0.05 : 0);
  return AI_AGGR[ai.char.id] + (S.diff === 'hard' ? 0.05 : 0);
}
function aiBid(ai, wh) {
  var est = aiEstimate(ai, wh);
  var agg = aiAggr(ai);
  var cap = Math.max(100, Math.min(ai.cash * (S.round >= 5 ? 0.9 : 0.75), ai.cash - 100));
  var p = AI_PERSONA[ai.char.id] || { vol: 0.1, lowball: 0.05, spike: 0.05, probe: 0.1, first: 'probe', burst: 0 };
  var final = S.round >= 5;
  var mult = rand(1 - p.vol, 1 + p.vol) * rand(0.9, 1.1);
  ai.mood = '';
  if (S.round === 1 && !final) {
    // 首轮策略:人格决定第一印象
    if (p.first === 'conserv') { mult *= rand(0.72, 0.88); ai.mood = '在观望'; }
    else if (p.first === 'low') { mult *= rand(0.55, 0.72); ai.mood = '在压价'; }
    else if (p.first === 'high') { mult *= rand(1.12, 1.32); ai.mood = '在抬价'; }
    else if (p.first === 'wild') {
      var r0 = Math.random();
      if (r0 < 0.18) { mult *= rand(1.4, 1.7); ai.mood = '在暴冲'; }
      else if (r0 < 0.36) { mult *= rand(0.5, 0.65); ai.mood = '在试探'; }
      else { mult *= rand(0.8, 1.05); ai.mood = '在盘算'; }
    } else { mult *= rand(0.75, 0.95); ai.mood = '在试探'; }
  } else if (final) {
    if (Math.random() < p.burst) { mult *= rand(1.25, 1.5); ai.mood = '压上全部判断!'; }
    else if (ai.char.id === 'sakuya' && Math.random() < 0.3) { mult *= rand(1.1, 1.25); ai.mood = '在紧逼'; }
    else mult *= rand(0.95, 1.05);
  } else {
    var r = Math.random();
    if (r < p.lowball) { mult *= rand(0.55, 0.7); ai.mood = '在压价'; }
    else if (r < p.lowball + p.spike) { mult *= rand(1.05, 1.25); ai.mood = '在试探'; }
    else if (r < p.lowball + p.spike + p.probe) { mult *= rand(1.0, 1.15); ai.mood = '试探中'; }
    else ai.mood = '在盘算';
  }
  if (ai.delusion && ai.delusion.round === S.round) {
    mult *= ai.delusion.ahead ? 0.85 : 1.15;   // 铃仙:误判领先→收手,误判落后→加码
  }
  var bid = est * agg * mult;
  bid = clamp(Math.round(bid / 10) * 10, 100, cap);
  ai.estTmp = est;
  ai.delusion = null;
  return bid;
}
function aiSkillFire(ai) {
  var c = ai.char.id;
  ai.skillUsed = true;
  if (c === 'reimu') {
    setEvent('⚡ ' + ai.char.name + '施展了「直觉·估价」…她似乎看穿了仓库价值!');
    mmsToast('⚡ ' + ai.char.name + '看穿了仓库价值!');
  } else if (c === 'sanae') {
    var up = Math.random() < 0.5;
    aiAis(false).forEach(function (o) { if (o !== ai) o.estFactor *= up ? 1.15 : 0.85; });
    setEvent('🐍 ' + ai.char.name + '似乎在散布流言…其他对手有些动摇了?');
    mmsToast('🐍 ' + ai.char.name + '散布了流言!');
  } else if (c === 'yuyuko') {
    setEvent('🌸 ' + ai.char.name + '闻了闻柜子…她对大件的位置有了数。');
    mmsToast('🌸 幽幽子锁定了大件!');
  } else if (c === 'marisa') {
    setEvent('🧙 ' + ai.char.name + '摸出了一枚八卦炉…她在盯着你。');
  } else if (c === 'remilia') {
    ai.bid = Math.min(ai.cash - 100, ai.bid * 1.1);
    setEvent('🩸 ' + ai.char.name + '的红瞳扫过货柜…她抬高了出价!');
  } else if (c === 'patchouli') {
    setEvent('📖 ' + ai.char.name + '翻开了魔法书,像是在估算什么…');
  } else if (c === 'sakuya') {
    ai.bid = Math.max(100, ai.bid * 0.9);
    setEvent('🕰️ ' + ai.char.name + '的怀表停了一秒…她压低了出价。');
  } else if (c === 'reisen') {
    var t = aiAis(false).filter(function (o) { return o !== ai; });
    if (t.length) { var o = pick(t); o.estFactor *= Math.random() < 0.5 ? 1.1 : 0.9; }
    setEvent('🐇 ' + ai.char.name + '的月眼闪动…有人被幻惑了?');
  }
  SND.play('select');
}
function aiAis(includeMe) {
  var out = [];
  S.ais.forEach(function (ai) { if (ai.char.id !== S.player.char.id) out.push(ai); });
  return out;
}

/* ═══════════ 10. 菜单页 / 三步向导 / 角色之家 / 商城 ═══════════ */
var WIZ_STEP = 1;
function hideAllPages() {
  [ui.homeOverlay, ui.charHomeOverlay, ui.shopOverlay, ui.wizardOverlay, ui.collectOverlay, ui.storageOverlay, ui.aiLogOverlay].forEach(function (o) { o.classList.add('hide'); });
}
function showMenu() {
  hideAllPages();
  ui.homeOverlay.classList.remove('hide');
  updateCoins();
  var b = $('bestLine');
  b.textContent = BEST > 0 ? '🏆 历史最高净资产 ' + fmt(BEST) + ' 金币' : '头一回?先拍个柜子热热身。';
  $('btnMute').textContent = SND.isSfx() ? '🔇' : '🔊';
  $('btnMenuSfx').textContent = SND.isSfx() ? '🔇 音效' : '🔊 音效';
  $('btnMenuBgm').textContent = SND.isBgm() ? '🔇 音乐' : '🎵 音乐';
  var cl = $('cloudLine');
  cl.textContent = (window.Auth && Auth.isLoggedIn()) ? '☁️ 云端存档已连接 (' + esc((Auth.user() || {}).username || '') + ')' : '☁️ 未登录 · 存档仅在本机,登录后可云端同步';
  $('btnToolsFab').classList.add('hide');
}
function showWizard() {
  hideAllPages();
  ui.wizardOverlay.classList.remove('hide');
  WIZ_STEP = 1;
  renderWizard();
  if (!loadHelped()) { saveHelped(true); openHelp(); }
  $('btnToolsFab').classList.add('hide');
}
function showCharHome() {
  hideAllPages();
  ui.charHomeOverlay.classList.remove('hide');
  renderCharHome();
  $('btnToolsFab').classList.add('hide');
}
function showShop() {
  hideAllPages();
  ui.shopOverlay.classList.remove('hide');
  renderShop();
  $('btnToolsFab').classList.add('hide');
}
function showCollect() {
  hideAllPages();
  ui.collectOverlay.classList.remove('hide');
  renderCollect();
  $('btnToolsFab').classList.add('hide');
}
function showStorage() {
  hideAllPages();
  ui.storageOverlay.classList.remove('hide');
  renderStorage();
  $('btnToolsFab').classList.add('hide');
}
function showAiLog() {
  hideAllPages();
  ui.aiLogOverlay.classList.remove('hide');
  renderAiLog();
  $('btnToolsFab').classList.add('hide');
}
function renderAiLog() {
  updateCoins();
  var html = '';
  CHARS.forEach(function (c) {
    var st = aiLogStat(c.id);
    if (!st) {
      html += '<div class="shop-card" style="opacity:.7;">' +
        '<span class="sh-e">' + ava(c) + '</span>' +
        '<span class="sh-info"><b>' + c.name + '</b><br>还没交手过…去打一局观察她的风格吧</span></div>';
      return;
    }
    html += '<div class="shop-card">' +
      '<span class="sh-e">' + ava(c) + '</span>' +
      '<span class="sh-info"><b>' + c.name + '</b> · <span style="color:#b89fff;">' + st.style + '</span><br>' +
      '参拍 ' + st.games + ' 局 · 成交率 ' + st.wr + '% · 平均溢价 ' + (st.prem >= 0 ? '+' : '') + st.prem + '%<br>' +
      '<span class="sh-own">' + AI_BLURB[c.id] + '</span></span></div>';
  });
  $('aiLogRows').innerHTML = html;
}
var AI_BLURB = {
  reimu:    '「直觉很少出错,但她也只信直觉。」',
  sanae:    '「流言的源头,她自己都分不清真假。」',
  yuyuko:   '「平时摸鱼,最后一口咬得最狠。」',
  marisa:   '「赌性大,偶尔暴冲,偶尔装傻。」',
  remilia:  '「夜之王喜欢用价格碾压一切。」',
  patchouli:'「不看书不出价,看书必捡漏。」',
  sakuya:   '「她的出价和怀表一样精准。」',
  reisen:   '「月都算法派,但也会看走眼。」'
};
function updateCoins() {
  var c = fmt(loadCoins());
  $('menuCoins').textContent = c;
  if (ui.shopCoins) ui.shopCoins.textContent = c;
  if (ui.charHomeCoins) ui.charHomeCoins.textContent = c;
  if (ui.wizCoins) ui.wizCoins.textContent = c;
  var cc = $('collectCoins'); if (cc) cc.textContent = c;
  var sc = $('storageCoins'); if (sc) sc.textContent = c;
  var ac = $('aiLogCoins'); if (ac) ac.textContent = c;
}
function renderWizard() {
  updateCoins();
  var stepMap = $('wizStepMap'), stepChar = $('wizStepChar'), stepTools = $('wizStepTools');
  stepMap.classList.toggle('hide', WIZ_STEP !== 1);
  stepChar.classList.toggle('hide', WIZ_STEP !== 2);
  stepTools.classList.toggle('hide', WIZ_STEP !== 3);
  document.querySelectorAll('#wizardOverlay .wiz-dot').forEach(function (d) {
    d.classList.toggle('on', parseInt(d.getAttribute('data-step'), 10) <= WIZ_STEP);
  });
  renderMapCards();
  renderCharCards();
  renderWizTools();
  $('btnWizBack').classList.toggle('hide', WIZ_STEP === 1);
  $('btnWizNext').classList.toggle('hide', WIZ_STEP >= 3);
  $('btnWizStart').classList.toggle('hide', WIZ_STEP !== 3);
  document.querySelectorAll('#wizardOverlay .diff-btn').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-diff') === PICKED_DIFF); });
}
function wizNext() { if (WIZ_STEP < 3) { WIZ_STEP++; renderWizard(); SND.play('tick'); } }
function wizBack() { if (WIZ_STEP > 1) { WIZ_STEP--; renderWizard(); SND.play('tick'); } }
function wizGo(n) { if (n >= 1 && n <= 3 && n !== WIZ_STEP) { WIZ_STEP = n; renderWizard(); SND.play('tick'); } }
function renderMapCards() {
  var html = MAPS.map(function (m) {
    return '<div class="map-card' + (PICKED_MAP === m.id ? ' sel' : '') + '" onclick="pickMap(\'' + m.id + '\')">' +
      '<div class="mp-e">' + m.emoji + '</div>' +
      '<div class="mp-n">' + m.name + '</div>' +
      '<div class="mp-f">准入费 ' + fmt(m.fee) + ' 金币</div>' +
      '<div class="mp-d">' + m.desc + '</div></div>';
  }).join('');
  $('mapCards').innerHTML = html;
}
function pickMap(id) {
  PICKED_MAP = id;
  try { localStorage.setItem(CONFIG.SAVE_MAP, id); } catch (e) {}
  renderMapCards();
  SND.play('tick');
  cloudPush();
}
function pickDiff(d) {
  PICKED_DIFF = d;
  document.querySelectorAll('#wizardOverlay .diff-btn').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-diff') === d); });
  SND.play('tick');
}
function renderCharCards() {
  var roster = loadRoster();
  if (roster.indexOf(PICKED_CHAR) === -1) { PICKED_CHAR = STARTER_CHARS[0]; saveSkill(PICKED_CHAR); }
  var html = '';
  CHARS.forEach(function (c) {
    var owned = roster.indexOf(c.id) > -1;
    html += '<div class="pick-card' + (PICKED_CHAR === c.id ? ' sel' : '') + '" ' + (owned ? 'onclick="pickChar(\'' + c.id + '\')"' : 'onclick="toCharHome()"') + '>' +
      '<div class="pc-ava">' + ava(c) + '</div>' +
      '<div class="pc-name">' + c.name + (owned ? '' : ' 🔒') + '</div>' +
      '<div class="pc-skill">' + c.title + '</div>' +
      '<div class="pc-desc">' + (owned ? c.desc : '去角色之家解锁 ' + fmt(charPrice(c.id)) + ' 🪙') + '</div>' +
      (owned ? '<span class="pc-own">✔ 已拥有</span>' : '<div class="pc-lock">🔒 未拥有</div>') + '</div>';
  });
  $('charCards').innerHTML = html;
}
function toCharHome() { PREV_PAGE = 'wizard'; showCharHome(); }
function charHomeBack() { if (PREV_PAGE === 'wizard') showWizard(); else showMenu(); }
function pickChar(id) { PICKED_CHAR = id; saveSkill(id); renderCharCards(); SND.play('select'); cloudPush(); }
function loadBring() {
  try { var t = JSON.parse(localStorage.getItem(CONFIG.SAVE_BRING)) || {}; return { scan: t.scan || 0, probe: t.probe || 0, heavy: t.heavy || 0 }; }
  catch (e) { return { scan: 0, probe: 0, heavy: 0 }; }
}
function saveBring(b) { try { localStorage.setItem(CONFIG.SAVE_BRING, JSON.stringify(b)); } catch (e) {} }
function bringTotal() { var b = loadBring(); return (b.scan || 0) + (b.probe || 0) + (b.heavy || 0); }
function toggleBring(k) {
  var tools = loadTools();
  var bring = loadBring();
  if (bring[k]) {
    bring[k] = 0;
  } else {
    if ((tools[k] || 0) <= 0) { mmsToast('你还没有这个道具,去「🛒 道具商城」买吧'); return; }
    if (bringTotal() >= 3) { mmsToast('最多携带 3 个道具,先卸下一个吧'); SND.play('fail'); return; }
    bring[k] = 1;
  }
  saveBring(bring);
  renderWizTools();
  SND.play('tick');
}
function renderWizTools() {
  var tools = loadTools();
  var bring = loadBring();
  var rows = SHOP.map(function (it) {
    var n = tools[it.k] || 0;
    var on = bring[it.k] === 1;
    return '<div class="shop-card' + (on ? ' bring-on' : '') + '" style="cursor:pointer;" onclick="toggleBring(\'' + it.k + '\')">' +
      '<span class="sh-e">' + it.e + '</span>' +
      '<span class="sh-info"><b>' + it.n + '</b><br>' + it.d + '<br><span class="sh-own">持有 ×' + n + '</span></span>' +
      '<span class="br-badge">' + (on ? '✔ 携带' : '不带') + '</span></div>';
  }).join('');
  $('wizToolsRows').innerHTML = rows || '<div style="font-size:11px;color:#8a7e9a;text-align:center;padding:8px;">还没道具?去「🛒 道具商城」逛逛</div>';
  $('wizToolsSum').textContent = '携带 ' + bringTotal() + '/3 · 局内点右下角 🎒 使用(每轮限 1 个)';
}
function renderCharHome() {
  updateCoins();
  var roster = loadRoster();
  var html = CHARS.map(function (c) {
    var owned = roster.indexOf(c.id) > -1;
    var sel = PICKED_CHAR === c.id ? ' sel' : '';
    return '<div class="pick-card' + (owned ? sel : '') + '">' +
      '<div class="pc-ava">' + ava(c) + '</div>' +
      '<div class="pc-name">' + c.name + (owned ? (PICKED_CHAR === c.id ? ' · 出战' : '') : '') + '</div>' +
      '<div class="pc-skill">' + c.title + '</div>' +
      '<div class="pc-desc">' + c.desc + '</div>' +
      (owned
        ? '<span class="pc-own">✔ 已拥有</span>'
        : '<button class="pc-buy" onclick="buyChar(\'' + c.id + '\');event.stopPropagation;">🔓 ' + fmt(charPrice(c.id)) + ' 🪙</button>') +
      '</div>';
  }).join('');
  ui.charHomeCards.innerHTML = html;
}
function buyChar(id) {
  var roster = loadRoster();
  if (roster.indexOf(id) > -1) { mmsToast('已经拥有这位角色了'); return; }
  var price = charPrice(id);
  if (price <= 0) { mmsToast('这位角色不参加购买(免费出战中)'); return; }
  var coins = loadCoins();
  if (coins < price) {
    mmsToast('金币不够!打一局拍卖会赚点吧(初始 1000)');
    SND.play('fail');
    return;
  }
  roster.push(id);
  saveRoster(roster);
  saveCoins(coins - price);
  SND.play('coin');
  mmsToast('🔓 解锁 ' + charById(id).name + '!去「开始游戏」选她出战吧');
  renderCharHome();
  cloudPush();
}
function renderShop() {
  updateCoins();
  var tools = loadTools();
  $('shopRows').innerHTML = SHOP.map(function (it) {
    var own = tools[it.k] || 0;
    var full = own >= it.max;
    return '<div class="shop-card">' +
      '<span class="sh-e">' + it.e + '</span>' +
      '<span class="sh-info"><b>' + it.n + '</b><br>' + it.d + '<br><span class="sh-own">持有 ×' + own + '/' + it.max + '</span></span>' +
      '<button class="sh-btn' + (full ? ' limit' : '') + '"' + (full ? ' disabled' : '') + ' onclick="buyTool(\'' + it.k + '\')">' + (full ? '已满' : it.price + ' 🪙') + '</button></div>';
  }).join('');
}
function buyTool(k) {
  var it = null; SHOP.forEach(function (x) { if (x.k === k) it = x; });
  if (!it) return;
  var coins = loadCoins();
  var tools = loadTools();
  if (coins < it.price) { mmsToast('金币不够!打一局拍卖会赚点吧'); SND.play('fail'); return; }
  if ((tools[k] || 0) >= it.max) { mmsToast('已经囤满 ' + it.max + ' 个了'); return; }
  tools[k] = (tools[k] || 0) + 1;
  saveTools(tools);
  saveCoins(coins - it.price);
  renderShop();
  SND.play('coin');
  mmsToast('✅ 购入 ' + it.n + ' ×1');
  cloudPush();
}
function newGame() {
  trackStart('marisa_auction_take');
  SND.unlock();
  var m = mapById(PICKED_MAP);
  var me = charById(ownChar(PICKED_CHAR) ? PICKED_CHAR : STARTER_CHARS[0]);
  var others = shuffle(CHARS.filter(function (c) { return c.id !== me.id; })).slice(0, 3);
  var wallet = loadCoins();
  var startWallet = wallet;
  if (wallet < m.fee) {
    wallet = BAILOUT;
    saveCoins(wallet);
    mmsToast('🔰 金币不足准入费,雾雨魔法店救助金 ' + fmt(BAILOUT) + ' 金币已入账');
  }
  var cash = wallet - m.fee;
  var aiCash = AI_CASH[PICKED_DIFF] || AI_CASH.normal;
  S = {
    map: m, diff: PICKED_DIFF, fee: m.fee,
    startWallet: startWallet, walletStart: wallet,
    player: { char: me, cash: cash, bid: 0, locked: false, inv: [], skillUsed: false },
    ais: others.map(function (c) { return { char: c, cash: aiCash, bid: 0, locked: false, inv: [], estFactor: 1, skillUsed: false, skillReady: 0 }; }),
    round: 1, stats: { won: 0, legends: 0, spent: 0, gained: 0, comps: 0 },
    tools: loadTools(), bring: loadBring(),
    wh: null
  };
  S.wh = genWarehouse(0);
  S.ais.forEach(aiMake);
  S.toolUsedRound = -1; S.toolKind = '';
  document.body.className = m.cls;
  hideOverlay(ui.wizardOverlay);
  ui.finalOverlay.classList.add('hide');
  $('btnToolsFab').classList.remove('hide');
  enterBid();
}
function enterBid() {
  var wh = S.wh;
  S.round = 1;
  S.player.locked = false; S.player.bid = 0;
  S.ais.forEach(function (ai) { ai.locked = false; ai.bid = aiBid(ai, wh); });
  renderBid();
  scheduleSeatFlips();
}

/* ═══════════ 11. 竞拍屏 ═══════════ */
var seatFlipTimer = null;
function scheduleSeatFlips() {
  clearTimeout(seatFlipTimer);
  var n = rint(2, 3);
  for (var i = 0; i < n; i++) (function (ai) {
    setTimeout(function () {
      if (!S || !S.wh || S.player.locked || isAnimating) return;
      ai.assess = 'panic';
      var el = document.querySelector('[data-seat="' + ai.char.id + '"] .st');
      if (el) { el.textContent = '😰 犹豫…'; el.className = 'st panic'; }
      setTimeout(function () {
        ai.assess = '';
        if (el) {
          el.textContent = ai.mood ? (ai.mood === '在压价' ? '🕳️' : '🧐') + ' ' + ai.mood : '🤔 思考中';
          el.className = 'st';
        }
      }, rint(1200, 2200));
    }, rint(600, 2600));
  })(pick(S.ais));
}
function moodIco(m) {
  if (m === '在压价') return '🕳️';
  if (m === '在抬价' || m === '在暴冲' || m === '在紧逼' || m === '压上全部判断!') return '🔥';
  if (m === '在观望') return '👀';
  return '🧐';
}
function seatHTML(p, tag) {
  var st;
  if (p.locked) st = '<div class="st done">✅ 已出价</div>';
  else if (p.assess === 'panic') st = '<div class="st panic">😰 犹豫…</div>';
  else if (p.mood) st = '<div class="st">' + moodIco(p.mood) + ' ' + p.mood + '</div>';
  else st = '<div class="st">🤔 思考中</div>';
  return '<div class="seat' + (tag === 'me' ? ' me' : '') + (p.locked ? ' locked' : '') + '" data-seat="' + p.char.id + '">' +
    '<div class="av">' + ava(p.char) + '</div>' +
    '<div class="nm">' + p.char.name + (tag === 'me' ? '·你' : '') + '</div>' + st +
    '<div class="bid-tag">📝</div></div>';
}
function renderBid() {
  var wh = S.wh;
  setHud();
  var html =
    '<div class="wh-card">' +
      '<div class="wh-name"><span class="wh-emoji">' + wh.emoji + '</span>' + wh.name + '</div>' +
      '<div class="wh-meta">🕳️ 共 <b>' + wh.slots + '</b> 格</div>' +
      '<div class="wh-flavor">' + wh.flavor + '</div>' +
      slotGridHTML(wh) +
    '</div>' +
    clueFieldsHTML(wh) +
    '<div class="calc-toggle" onclick="toggleCalc()">📐 实时估价 <span id="calcArrow">▾</span></div>' +
    '<div class="calc-panel hide" id="calcPanel">' + calcHTML(wh) + '</div>' +
    '<div class="seats">' + seatHTML(S.player, 'me') + S.ais.map(function (ai) { return seatHTML(ai); }).join('') + '</div>' +
    '<div class="bid-panel" id="bidPanel">' + bidPanelHTML() + '</div>';
  ui.screen.innerHTML = html;
  updateFab();
}
function toggleCalc() {
  var p = $('calcPanel'), a = $('calcArrow');
  if (!p) return;
  var show = p.classList.toggle('hide');
  if (a) a.textContent = show ? '▸' : '▾';
}
function bidPanelHTML() {
  var me = S.player;
  var skillBtn = '<button class="bp-skill" ' + (me.skillUsed || S.player.locked ? 'disabled' : '') + ' onclick="useSkill()">' +
    '<span class="bs-e">' + me.char.emoji + '</span>' +
    '<span class="bs-info"><b>' + me.char.title + '</b> — ' + me.char.desc + '</span>' +
    '<span class="bs-badge">' + (me.skillUsed ? '已用' : '每局 1 次 ▶') + '</span></button>';
  if (S.player.locked) {
    return skillBtn +
      '<div class="bp-row"><span>本轮出价</span><span class="bp-amt" style="cursor:default;">' + fmt(S.player.bid) + ' <small>金币</small></span></div>' +
      '<div class="bp-note ok">✅ 已锁定,等待揭标…</div>';
  }
  return skillBtn +
    '<div class="bp-row"><span>你的出价</span><span class="bp-amt" id="bpAmt" onclick="openBidInput(\'normal\')">点击输入</span></div>' +
    '<button class="bp-lock" onclick="openBidInput(\'normal\')">✋ 输入出价并锁定</button>' +
    '<div class="bp-note">点击金额或按钮弹出输入框,出价全程保密</div>';
}

/* ═══════════ 12. 出价输入弹层 ═══════════ */
var BID_MODE = 'normal';
function openBidInput(mode) {
  if (!S || S.player.locked || isAnimating) return;
  BID_MODE = mode || 'normal';
  var min = 100, max = S.player.cash;
  var note = '当前资金 ' + fmt(S.player.cash) + ' 金币 · 出价全程保密';
  if (BID_MODE === 'tie') { min = Math.min(S.tie.floor, S.player.cash); note = '加时出价,必须 ≥ ' + fmt(min) + ',低于者出局'; }
  ui.biTitle.textContent = BID_MODE === 'tie' ? '⚖️ 加时暗标' : '✍️ 输入你的出价';
  var inp = ui.biInput;
  inp.min = String(min); inp.max = String(max);
  inp.value = String(min);
  ui.biNote.textContent = note;
  ui.biChips.innerHTML = [1000, 3000, 5000, max].map(function (v) {
    return '<button class="bi-chip" onclick="setBidChip(' + v + ')">' + (v >= max ? '梭哈' : fmt(v)) + '</button>';
  }).join('');
  ui.bidInputOverlay.classList.remove('hide');
  setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 120);
}
function bidStep(d) {
  var inp = ui.biInput, v = parseInt(inp.value, 10) || 0;
  var max = parseInt(inp.max, 10), min = parseInt(inp.min, 10);
  inp.value = String(Math.max(min, Math.min(max, v + d)));
  SND.play('tick');
}
function setBidChip(v) {
  var inp = ui.biInput, max = parseInt(inp.max, 10);
  inp.value = String(Math.min(max, v));
  SND.play('tick');
}
function confirmBid() {
  var v = parseInt(ui.biInput.value, 10);
  if (!v || isNaN(v)) { mmsToast('请输入有效数字'); return; }
  var max = parseInt(ui.biInput.max, 10), min = parseInt(ui.biInput.min, 10);
  v = clamp(Math.round(v / 10) * 10, min, max);
  ui.bidInputOverlay.classList.add('hide');
  if (BID_MODE === 'tie') tieLock(v);
  else playerLock(v);
}
function cancelBidInput() { ui.bidInputOverlay.classList.add('hide'); }

/* ═══════════ 13. 技能与道具 ═══════════ */
var PICK_CB = null;
function openPickTarget(title, list, cb) {
  PICK_CB = cb;
  ui.ptTitle.textContent = title;
  ui.pickTargetList.innerHTML = list.map(function (it) {
    return '<button class="info-btn" onclick="pickTargetItem(\'' + esc(it.id) + '\')">' + it.label + '</button>';
  }).join('');
  ui.pickTargetOverlay.classList.remove('hide');
}
function pickTargetItem(id) { if (PICK_CB) PICK_CB(id); }
function useSkill() {
  var me = S.player;
  if (!S || !S.wh) return;
  if (me.skillUsed) { mmsToast('技能已经用过了!'); return; }
  if (S.player.locked) { mmsToast('出价已锁定!'); return; }
  var c = me.char.id;
  if (c === 'marisa') {
    openPickTarget('🧙 恋符·透视 — 选一名目标', S.ais.map(function (ai) { return { id: ai.char.id, label: ai.char.emoji + ' ' + ai.char.name }; }), peekTarget);
  } else if (c === 'reimu') {
    var v = S.wh.totalV;
    setEvent('⛩️ 直觉·估价:真实总价值约 <b>' + fmt(Math.round(v * 0.9)) + ' ~ ' + fmt(Math.round(v * 1.1)) + '</b> 金币');
    mmsToast('⛩️ 估价 ' + fmt(Math.round(v * 0.9)) + '~' + fmt(Math.round(v * 1.1)));
    me.skillUsed = true; SND.play('select'); renderBid();
  } else if (c === 'sanae') {
    showFakeInfo();
  } else if (c === 'yuyuko') {
    var m = S.wh.mostExp;
    S.wh.hotCells = itemCells(S.wh, S.wh.mostExpIdx);
    S.wh.hotTag = CAT_NAMES[m.c];
    S.wh._just = true;
    setEvent('🌸 亡我·窥宴:最贵物品 <b>' + m.s + ' 格</b> · <b>' + CAT_NAMES[m.c] + '类</b>,格子已描边');
    mmsToast('🌸 大件:' + m.s + ' 格 · ' + CAT_NAMES[m.c] + '类');
    me.skillUsed = true; SND.play('select'); renderBid();
  } else if (c === 'remilia') {
    var grCells = qualityCells(S.wh, 4).concat(qualityCells(S.wh, 5));
    S.wh.goldRedCells = grCells;
    S.wh._just = true;
    setEvent('🩸 命运·红瞳:金/红品共占 <b>' + grCells.length + ' 格</b>,已点亮');
    mmsToast('🩸 金红共 ' + grCells.length + ' 格');
    me.skillUsed = true; SND.play('select'); renderBid();
  } else if (c === 'patchouli') {
    openPickTarget('📖 贤者·品鉴 — 选一个品质档', AUCTION_QUALITY.map(function (q, i) { return { id: String(i), label: '<span style="color:' + q.color + '">●</span> ' + q.name }; }), patchTierPick);
  } else if (c === 'sakuya') {
    var best = null;
    S.ais.forEach(function (ai) { if (!best || ai.bid > best.bid) best = ai; });
    var lo = Math.max(100, best.bid - 200), hi = best.bid + 200;
    setEvent('🕰️ 时停·窥牌:当前最高出价约 <b>' + fmt(lo) + ' ~ ' + fmt(hi) + '</b>(' + best.char.name + ')');
    mmsToast('🕰️ 最高出价 ' + fmt(lo) + '~' + fmt(hi));
    me.skillUsed = true; SND.play('select'); renderBid();
  } else if (c === 'reisen') {
    openPickTarget('🐇 月眼·幻惑 — 选一名目标', S.ais.map(function (ai) { return { id: ai.char.id, label: ai.char.emoji + ' ' + ai.char.name }; }), reisenTarget);
  }
}
function peekTarget(id) {
  var ai = null; S.ais.forEach(function (a) { if (a.char.id === id) ai = a; });
  if (!ai) return;
  var lo = Math.max(100, ai.bid - 300), hi = ai.bid + 300;
  setEvent('🧙 恋符·透视:' + ai.char.name + ' 出价约 <b>' + fmt(lo) + ' ~ ' + fmt(hi) + '</b>');
  mmsToast('🧙 ' + ai.char.name + ':' + fmt(lo) + '~' + fmt(hi));
  S.player.skillUsed = true; SND.play('select');
  ui.pickTargetOverlay.classList.add('hide');
  renderBid();
}
function patchTierPick(id) {
  var q = parseInt(id, 10);
  var wh = S.wh;
  wh.patchQ = q;
  wh._just = true;
  setEvent('📖 贤者·品鉴:' + qName(q) + ' 共 <b>' + wh.counts[q] + ' 件</b> · 占 <b>' + wh.qSlots[q] + ' 格</b>');
  mmsToast('📖 ' + qName(q) + ':' + wh.counts[q] + ' 件 / ' + wh.qSlots[q] + ' 格');
  S.player.skillUsed = true; SND.play('select');
  ui.pickTargetOverlay.classList.add('hide');
  renderBid();
}
function reisenTarget(id) {
  var ai = null; S.ais.forEach(function (a) { if (a.char.id === id) ai = a; });
  if (!ai) return;
  var up = Math.random() < 0.5;
  ai.delusion = { ahead: up, round: S.round + 1 };
  setEvent('🐇 月眼·幻惑:' + ai.char.name + ' 误以为' + (up ? '自己大幅领先,下一轮会收手' : '自己落后了,下一轮会加码') + '…');
  mmsToast('🐇 幻惑生效!');
  S.player.skillUsed = true; SND.play('select');
  ui.pickTargetOverlay.classList.add('hide');
  renderBid();
}
function showFakeInfo() {
  var html =
    '<div class="rate-row" style="justify-content:center;margin-bottom:8px;"><b style="color:#8fd8ff;">你要散布什么?先选真伪</b></div>' +
    '<div class="diff-row">' +
      '<button class="diff-btn sel" id="fakeTruthBtn" onclick="fakeTruth(true)">✅ 真情报</button>' +
      '<button class="diff-btn" id="fakeLieBtn" onclick="fakeTruth(false)">❌ 假情报</button>' +
    '</div>' +
    '<div class="diff-row" id="fakeContentRow">' +
      '<button class="diff-btn" onclick="fakeContent(true)">💎 此柜有红品!</button>' +
      '<button class="diff-btn" onclick="fakeContent(false)">🗑️ 此柜全是白绿货!</button>' +
    '</div>' +
    '<div style="font-size:11px;color:#8a7e9a;margin-top:4px;">对手对这条情报的反应各不相同:早苗深信不疑,灵梦将信将疑。</div>';
  ui.fakeInfoBody.innerHTML = html;
  S._fake = { truth: true };
  ui.fakeInfoOverlay.classList.remove('hide');
}
function fakeTruth(t) {
  S._fake.truth = t;
  document.querySelectorAll('#fakeTruthBtn, #fakeLieBtn').forEach(function (b) {
    b.classList.toggle('sel', (t && b.id === 'fakeTruthBtn') || (!t && b.id === 'fakeLieBtn'));
  });
  SND.play('tick');
}
function fakeContent(up) {
  var truth = S._fake.truth;
  var base = truth ? (up ? 1.15 : 0.85) : (up ? 0.85 : 1.15);
  S.ais.forEach(function (ai) {
    ai.estFactor *= 1 + (base - 1) * AI_TRUST[ai.char.id];
  });
  setEvent('🐍 你发布了情报:「' + (up ? '此柜有红品!' : '此柜全是白绿货!') + '」(' + (truth ? '真' : '假') + ')');
  S.ais.forEach(function (ai) { ai.bid = aiBid(ai, S.wh); });
  ui.fakeInfoOverlay.classList.add('hide');
  S.player.skillUsed = true;
  SND.play('select');
  renderBid();
  mmsToast('🐍 情报已生效…有人动摇了,有人冷笑。');
}
function toggleToolsDrawer() {
  var d = ui.toolsDrawer;
  if (d.classList.contains('hide')) { renderToolsDrawer(); d.classList.remove('hide'); }
  else d.classList.add('hide');
}
function renderToolsDrawer() {
  var itemsHtml = SHOP.map(function (it) {
    var n = (S.tools && S.tools[it.k]) || 0;
    var brought = S.bring && S.bring[it.k];
    var used = S.toolUsedRound === S.round && S.toolKind === it.k;
    var empty = n <= 0;
    if (!brought) return '';
    return '<button class="tool-card' + (used || empty ? ' used' : '') + (empty ? ' empty' : '') + '" onclick="useItem(\'' + it.k + '\')">' +
      '<span class="tc-e">' + it.e + '</span>' +
      '<span class="tc-info"><b>' + it.n + '</b><br>' + (empty ? '去「🛒 商城」买一个吧' : it.d) + '</span>' +
      '<span class="tc-badge">' + (used ? '本轮已用' : (empty ? '×0' : '×' + n)) + '</span></button>';
  }).join('');
  ui.toolsDrawerBody.innerHTML = itemsHtml || '<div style="font-size:11px;color:#8a7e9a;text-align:center;padding:8px;">本局未携带道具,下一局向导第三步记得带上</div>';
}
function updateFab() {
  var fab = $('btnToolsFab');
  if (!fab) return;
  if (!S || !S.wh) { fab.classList.add('hide'); return; }
  fab.classList.remove('hide');
  var n = 0;
  SHOP.forEach(function (it) { n += (S.bring && S.bring[it.k]) ? 1 : 0; });
  var badge = $('fabBadge');
  badge.textContent = n > 0 ? String(n) : '';
  badge.style.display = n > 0 ? 'flex' : 'none';
}
function useItem(k) {
  if (!S || !S.wh) return;
  if (S.player.locked) { mmsToast('出价已锁定!'); return; }
  if (S.toolUsedRound === S.round) { mmsToast('本轮已经用过道具了!'); return; }
  var n = (S.tools && S.tools[k]) || 0;
  if (n <= 0) { mmsToast('道具用完了,去商城买一个吧'); return; }
  if (!S.bring || !S.bring[k]) { mmsToast('这局没带这个道具,下一局从向导第三步携带'); return; }
  var wh = S.wh;
  if (k === 'scan') {
    wh.probe = Math.min(4, wh.probe + 2);
    setEvent('📡 全库扫描:情报阶梯提前解锁!');
    mmsToast('📡 线索解锁!');
  } else if (k === 'probe') {
    var cnt = wh.counts[3] + wh.counts[4] + wh.counts[5];
    setEvent('🔍 珍品探测:紫/金/红品共 <b>' + cnt + ' 件</b>');
    mmsToast('🔍 珍品 ' + cnt + ' 件');
  } else if (k === 'heavy') {
    wh.hotCells = itemCells(wh, wh.mostExpIdx);
    wh._just = true;
    setEvent('⚖️ 大件探针:最贵物品占用 <b>' + wh.mostExp.s + ' 格</b>,格子已描边');
    mmsToast('⚖️ 大件 ' + wh.mostExp.s + ' 格');
  }
  S.tools[k]--;
  S.toolUsedRound = S.round; S.toolKind = k;
  SND.play('select');
  renderBid();
  renderToolsDrawer();
}

/* ═══════════ 14. 出价与结算 ═══════════ */
function playerLock(amt) {
  if (S.player.locked || isAnimating) return;
  amt = clamp(Math.round(amt / 10) * 10, 100, S.player.cash);
  S.player.bid = amt;
  S.player.locked = true;
  S.ais.forEach(function (ai) { ai.locked = true; });
  SND.play('pay');
  setTimeout(function () { resolveRound(); }, 900);
  feedbackNote(amt);
}
function feedbackNote(pb) {
  var bids = S.ais.map(function (ai) { return ai.bid; }).sort(function (a, b) { return b - a; });
  var txt;
  if (pb > bids[0]) txt = '你的出价位居全场最高!';
  else if (pb > bids[1]) txt = '你的出价接近领先区间…';
  else if (pb > bids[2]) txt = '你的出价高于部分对手…';
  else txt = '你的出价似乎偏低…';
  setEvent('🗣️ 反馈:' + txt);
  renderBid();
  mmsToast(txt);
}
function checkEarly(round, bids, wh) {
  if (round > 4) return false;
  var maxBid = 0, maxIdx = [];
  bids.forEach(function (b) { if (b.amt > maxBid) maxBid = b.amt; });
  bids.forEach(function (b) { if (b.amt === maxBid) maxIdx.push(b.who); });
  if (maxIdx.length !== 1) return false;
  var all = bids.slice().sort(function (a, b) { return b.amt - a.amt; });
  var second = all.length > 1 ? all[1].amt : 0;
  if (maxBid < second * THRESH[round - 1]) return false;
  if (maxBid < estimateNow(wh) * 0.55) return false;
  return true;
}
function resolveRound() {
  if (isAnimating) return;
  isAnimating = true;
  var wh = S.wh;
  S.ais.forEach(function (ai) {
    if (ai.char.id !== 'marisa' && !ai.skillUsed && ai.skillReady === S.round) aiSkillFire(ai);
  });
  S.ais.forEach(function (ai) {
    if (ai.char.id === 'marisa' && !ai.skillUsed && Math.random() < 0.35 && S.player.bid > ai.bid) {
      ai.skillUsed = true;
      ai.bid = Math.min(ai.cash - 100, S.player.bid + 300);
      setEvent('🧙 魔理沙看穿了你的出价,狠狠加了一手!');
      mmsToast('🧙 魔理沙看穿了你的出价!');
      renderBid();
    }
  });
  var bids = [{ who: 'p', amt: S.player.bid }].concat(S.ais.map(function (ai) { return { who: ai.char.id, amt: ai.bid }; }));
  var maxBid = 0, maxIdx = [];
  bids.forEach(function (b) { if (b.amt > maxBid) maxBid = b.amt; });
  bids.forEach(function (b) { if (b.amt === maxBid) maxIdx.push(b.who); });
  var early = checkEarly(S.round, bids, wh);
  S.wh.tmp = { bids: bids, maxIdx: maxIdx, maxBid: maxBid, early: early };
  showReveal();
}
function showReveal() {
  ui.revealOverlay.classList.remove('hide');
  var tmp = S.wh.tmp;
  ui.rvTitle.textContent = '📢 第 ' + S.round + ' 轮开标' + (tmp.early ? ' · ⚡ 提前成交!' : (S.round === 5 ? ' · 最终轮' : ''));
  var html = '';
  tmp.bids.forEach(function (b, i) {
    html += '<div class="rv-card" id="rv' + i + '">' +
      '<div class="rv-av">' + (b.who === 'p' ? ava(S.player.char) : ava(charById(b.who))) + '</div>' +
      '<div class="rv-nm">' + (b.who === 'p' ? S.player.char.name + '·你' : charById(b.who).name) + '</div>' +
      '<div class="rv-bid">❓</div>' +
      '<div class="rv-face"></div></div>';
  });
  ui.rvGrid.innerHTML = html;
  ui.rvNote.innerHTML = '';
  flipBids(0);
}
function flipBids(i) {
  if (i >= S.wh.tmp.bids.length) { afterFlip(); return; }
  var card = $('rv' + i);
  if (card) {
    var b = S.wh.tmp.bids[i];
    setTimeout(function () {
      card.querySelector('.rv-bid').textContent = fmt(b.amt);
      SND.play('tick');
      flipBids(i + 1);
    }, 420);
  } else { flipBids(i + 1); }
}
function afterFlip() {
  var tmp = S.wh.tmp;
  var winner = tmp.maxIdx[0];
  var bidObj = null; tmp.bids.forEach(function (b) { if (b.who === winner) bidObj = b; });
  tmp.winner = winner; tmp.winnerAmt = bidObj.amt;
  tmp.bids.forEach(function (b, i) {
    if (b.who === winner) { var c = $('rv' + i); if (c) c.classList.add('hl'); }
  });
  SND.play('coin');
  if (tmp.early) {
    ui.rvNote.innerHTML = '⚡ 碾压成功!' + (winner === 'p' ? '你' : charById(winner).name) + ' 以 ' + fmt(tmp.winnerAmt) + ' 金币提前成交!';
  } else if (S.round < 5) {
    ui.rvNote.innerHTML = '差距未达阈值,进入第 ' + (S.round + 1) + ' 轮——线索继续释放…';
  } else {
    ui.rvNote.innerHTML = '最终轮,价高者得!';
  }
  var wl = winLine(winner);
  if (wl) ui.rvNote.innerHTML += '<br><i style="color:#8fd8ff;">' + (winner === 'p' ? '你' : charById(winner).name) + ':「' + wl + '」</i>';
  ui.btnRvNext.onclick = function () {
    ui.revealOverlay.classList.add('hide');
    isAnimating = false;
    if (tmp.early) { doSettle(); }
    else if (S.round < 5) {
      S.round++;
      S.player.locked = false; S.player.bid = 0;
      S.ais.forEach(function (ai) { ai.locked = false; ai.bid = aiBid(ai, S.wh); });
      S.toolUsedRound = -1; S.toolKind = '';
      renderBid();
      scheduleSeatFlips();
    } else if (tmp.maxIdx.length > 1) {
      startTie();
    } else {
      doSettle();
    }
  };
}
function aiByWho(who) {
  if (who === 'p') return null;
  for (var i = 0; i < S.ais.length; i++) if (S.ais[i].char.id === who) return S.ais[i];
  return null;
}
var WIN_LINES = {
  marisa:   ['看穿啦!这种柜子逃不出我的眼睛!', '嘿嘿,借我两件玩玩?'],
  reimu:    ['赛钱箱到手,神社修缮费有着落了。', '直觉而已,不值一提。'],
  sanae:    ['风神大人保佑!果然没白祈祷。', '情报,有时候比实力重要呢。'],
  yuyuko:   ['唔…这块点心,我收下了。', '味道不错,谢谢款待。'],
  remilia:  ['当然是我的,夜之王从不失手。', '区区拍卖,何足挂齿。'],
  patchouli:['书上写的是对的,很好。', '算术,是最诚实的魔法。'],
  sakuya:   ['时间到了,东西归我。', '红茶和藏品,都需要恰到好处。'],
  reisen:   ['月都的算法,可不会出错。', '唔…只是按惯例处理罢了。']
};
function winLine(who) {
  var ls = WIN_LINES[who];
  return ls ? pick(ls) : '';
}

/* ── 平局加时 ── */
function startTie() {
  S.tie = { attempts: 1, floor: S.wh.tmp.maxBid };
  var playerTied = S.wh.tmp.maxIdx.indexOf('p') > -1;
  ui.tieNote.textContent = '第 5 轮并列最高 ' + fmt(S.wh.tmp.maxBid) + ' 金币,同价者加时暗标 · 第 1 次';
  if (!playerTied) {
    ui.tieBidPanel.innerHTML = '<div style="text-align:center;padding:12px;color:#8a7e9a;font-size:13px;">对手们正在加时竞价…</div>';
    ui.tieOverlay.classList.remove('hide');
    setTimeout(function () { tieAiRound(); }, 1400);
  } else {
    S.player.bid = 0; S.player.locked = false;
    ui.tieBidPanel.innerHTML = tieBidPanelHTML();
    ui.tieOverlay.classList.remove('hide');
  }
}
function tieBidPanelHTML() {
  var floor = Math.min(S.tie.floor, S.player.cash);
  return '<div class="bp-row"><span>加时出价(≥' + fmt(floor) + ')</span><span class="bp-amt" onclick="openBidInput(\'tie\')">点击输入</span></div>' +
    '<button class="bp-lock" onclick="openBidInput(\'tie\')">✋ 加时出价</button>' +
    '<div class="bp-note">价低者出局,平则继续加时</div>';
}
function tieLock(amt) {
  if (isAnimating) return;
  amt = clamp(Math.round(amt / 10) * 10, Math.min(S.tie.floor, S.player.cash), S.player.cash);
  S.player.bid = amt;
  SND.play('pay');
  setTimeout(finishTie, 800);
}
function tieAiRound() {
  var bids = [];
  S.wh.tmp.maxIdx.forEach(function (w) {
    var ai = aiByWho(w);
    var amt = ai ? Math.min(ai.cash - 100, S.tie.floor + rint(100, 1000)) : S.tie.floor;
    bids.push({ who: w, amt: amt });
  });
  S.wh.tmp.tieBids = bids;
  finishTie();
}
function finishTie() {
  var tmp = S.wh.tmp;
  var tied = tmp.maxIdx.slice();
  var bids = S.wh.tmp.tieBids || [];
  var myBid = tied.indexOf('p') > -1 ? S.player.bid : null;
  var scores = tied.map(function (w) {
    var b = null;
    bids.forEach(function (x) { if (x.who === w) b = x; });
    return { who: w, amt: w === 'p' ? myBid : (b ? b.amt : tmp.maxBid) };
  });
  var maxAmt = 0; scores.forEach(function (s) { if (s.amt > maxAmt) maxAmt = s.amt; });
  var winners = scores.filter(function (s) { return s.amt === maxAmt; });
  if (winners.length === 1 || S.tie.attempts >= 4) {
    var w = winners.length === 1 ? winners[0] : pick(winners);
    tmp.winner = w.who; tmp.winnerAmt = w.amt;
    ui.tieOverlay.classList.add('hide');
    mmsToast('⚖️ ' + (w.who === 'p' ? '你' : charById(w.who).name) + ' 赢得了加时!');
    SND.play('coin');
    setTimeout(doSettle, 600);
  } else {
    S.tie.attempts++;
    ui.tieNote.textContent = '仍并列 ' + fmt(maxAmt) + ' 金币!继续加时 · 第 ' + S.tie.attempts + ' 次';
    S.tie.floor = maxAmt;
    if (tied.indexOf('p') > -1) {
      S.player.bid = 0; S.player.locked = false;
      ui.tieBidPanel.innerHTML = tieBidPanelHTML();
    } else {
      setTimeout(tieAiRound, 1400);
    }
  }
}
function doSettle() {
  var tmp = S.wh.tmp;
  var winner = tmp.winner;
  var wh = S.wh;
  if (winner === 'p') {
    S.player.cash -= tmp.winnerAmt;
    S.stats.spent += tmp.winnerAmt;
  } else {
    S.ais.forEach(function (ai) { if (ai.char.id === winner) { ai.cash -= tmp.winnerAmt; S.stats.spent += tmp.winnerAmt; } });
  }
  var comp = 0, compMsg = '';
  if (tmp.winnerAmt > wh.totalV) {
    comp = Math.round((tmp.winnerAmt - wh.totalV) * 0.3 / 3);
    if (comp > 0) {
      if (winner === 'p') {
        S.ais.forEach(function (ai) { ai.cash += comp; });
        compMsg = '💸 爆仓!差价 30% 分给三位对手,每人 +' + fmt(comp);
      } else {
        S.player.cash += comp;
        S.stats.comps += comp;
        compMsg = '💸 ' + charById(winner).name + ' 爆仓!你分到了 ' + fmt(comp) + ' 金币补偿';
      }
    }
  }
  if (compMsg) mmsToast(compMsg);
  isAnimating = false;
  showUnbox();
}
function showUnbox() {
  ui.unboxOverlay.classList.remove('hide');
  ui.ubSum.classList.add('hide'); ui.btnUbNext.classList.add('hide');
  var wh = S.wh, winner = wh.tmp.winner;
  ui.ubTitle.textContent = (winner === 'p' ? '🎉 你拍下了仓库!' : '📦 ' + charById(winner).name + ' 拍下了仓库');
  ui.ubSub.textContent = '成交价 ' + fmt(wh.tmp.winnerAmt) + ' 金币 · 逐个格子揭晓…';
  var slotHtml = '';
  if (wh.slotItem) {
    for (var s = 0; s < wh.slots; s++) slotHtml += '<div class="sl-cell unk" id="ubSlot' + s + '"></div>';
  }
  ui.ubSlots.innerHTML = '<div class="slot-grid">' + slotHtml + '</div>';
  var order = shuffle(wh.items.map(function (it, i) { return i; }));
  ui.ubGrid.innerHTML = wh.items.map(function (it) {
    return '<div class="it-cell q' + it.q + '"><div class="it-s">' + it.s + '格</div><div class="it-e">' + it.e + '</div><div class="it-v">' + fmt(it.v) + '</div><div class="it-n">' + it.n + '</div></div>';
  }).join('');
  revealItem(order, 0, ui.ubGrid.children);
}
function revealItem(order, i, cells) {
  if (i >= order.length) { afterUnbox(); return; }
  var it = S.wh.items[order[i]];
  var cell = cells[order[i]];
  setTimeout(function () {
    cell.classList.add('show');
    if (S.wh.slotItem) {
      S.wh.slotItem.forEach(function (itIdx, s) {
        if (itIdx === order[i]) {
          var sc = $('ubSlot' + s);
          if (sc) sc.className = 'sl-cell q' + it.q + ' show';
        }
      });
    }
    if (it.q === 5) { SND.play('victory'); } else if (it.q >= 3) { SND.play('coin'); } else { SND.play('select'); }
    revealItem(order, i + 1, cells);
  }, 430);
}
function afterUnbox() {
  var wh = S.wh, winner = wh.tmp.winner;
  var sumEl = ui.ubSum;
  sumEl.classList.remove('hide');
  if (winner === 'p') {
    wh.items.forEach(function (it) { if (it.q === 5) S.stats.legends++; });
    S.stats.won++;
    S.stats.gained += wh.totalV;
    var added = registerCollect(wh.items);
    storeItems(wh.items);
    if (added > 0) mmsToast('📚 图鉴新增 ' + added + ' 件!藏品已入仓库');
  } else {
    S.ais.forEach(function (ai) { if (ai.char.id === winner) ai.inv = ai.inv.concat(wh.items); });
  }
  var profit = wh.totalV - wh.tmp.winnerAmt;
  var cls = profit >= 0 ? 'profit' : 'loss';
  var gr = 0, grV = 0;
  wh.items.forEach(function (it) { if (it.q >= 4) { gr++; grV += it.v; } });
  var pct = wh.totalV > 0 ? Math.round(grV / wh.totalV * 100) : 0;
  sumEl.innerHTML = '货柜真实总价值 <b>' + fmt(wh.totalV) + '</b> 金币<br>' +
    '<div class="us-v ' + cls + '">' + (profit >= 0 ? '+' : '') + fmt(profit) + ' 金币</div>' +
    (grV > 0 ? '<div class="us-gr">💎 金/红品 ' + gr + ' 件,贡献了总价值的 ' + pct + '%</div>' : '') +
    (S.stats.legends > 0 ? '<div style="font-size:11px;color:#ff5470;margin-top:4px;">👑 本局已开出传说 ×' + S.stats.legends + '</div>' : '');
  if (profit >= 0) SND.play('coin'); else SND.play('fail');
  ui.btnUbNext.classList.remove('hide');
  ui.btnUbNext.textContent = '🏁 看结果!';
  ui.btnUbNext.onclick = function () {
    ui.unboxOverlay.classList.add('hide');
    finalize();
  };
}

/* ═══════════ 15. 结算屏 ═══════════ */
function storageValue() {
  var st = loadStorage();
  var v = 0;
  for (var k in st) v += st[k].v;
  return v;
}
function netWorth(p) {
  var v = p.cash;
  if (p === S.player) { v += storageValue(); }
  else { p.inv.forEach(function (it) { v += it.v; }); }
  return v;
}
function titleOf(nw) {
  if (nw >= 15000) return { t: '🏆 幻想乡第一竞拍王', c: '#f0c060', d: '连灵梦都对你刮目相看——当然,她主要关心你拍到的赛钱箱。' };
  if (nw >= 12500) return { t: '🥇 捡漏大师', c: '#b89fff', d: '差价利润全进了你的口袋,对手们开始研究你的出价习惯。' };
  if (nw >= 10500) return { t: '🥈 精明收藏家', c: '#8fd8ff', d: '不亏就是赚,更何况你还赚了。' };
  if (nw >= 9000)  return { t: '🙂 勉强回本', c: '#6fcf97', d: '账面上没亏,但你的对手也觉得他们赢了。' };
  if (nw >= 7500)  return { t: '🤡 小亏一笔', c: '#f4b860', d: '「投资嘛,总要有学费的。」你对自己说。' };
  if (nw >= 5500)  return { t: '😵 冤大头预备役', c: '#f472b6', d: '早苗的情报你都信?啊,原来是你自己发的。' };
  return { t: '💸 幻想乡头号冤大头', c: '#ef4444', d: '魔理沙把钱都数好了,正等着看你下次再来。' };
}
function finalize() {
  var wh = S.wh;
  var walletEnd = S.player.cash;
  var net = walletEnd - S.walletStart;
  saveCoins(walletEnd);
  BEST = Math.max(BEST, netWorth(S.player));
  saveBest(BEST);
  ui.coinsGain.classList.remove('hide');
  ui.coinsGain.innerHTML = '🪙 本局 <b>' + (net >= 0 ? '+' : '') + fmt(net) + ' 金币</b> · 余额 ' + fmt(walletEnd) +
    '<div style="font-size:11px;font-weight:400;margin-top:2px;">' +
    (S.stats.won > 0
      ? '拍下货柜:货值 ' + fmt(wh.totalV) + ' · 成交 ' + fmt(wh.tmp.winnerAmt)
      : (S.stats.comps > 0 ? '未拍下,爆仓补偿 +' + fmt(S.stats.comps) : '未拍下,已付准入费 -' + fmt(S.fee))) +
    '</div>';
  saveTools(S.tools);
  var t = titleOf(netWorth(S.player));
  ui.finalTitle.textContent = t.t;
  ui.finalTitle.style.color = t.c;
  ui.finalDesc.textContent = t.d;
  ui.finalStats.innerHTML =
    '<div class="stat-box"><div class="sv">' + fmt(netWorth(S.player)) + '</div><div class="sl">净资产(含仓库)</div></div>' +
    '<div class="stat-box"><div class="sv">' + (S.stats.won > 0 ? '✔' : '✘') + '</div><div class="sl">本局拍下</div></div>' +
    '<div class="stat-box"><div class="sv">' + S.stats.legends + '</div><div class="sl">开出传说</div></div>';
  loadLB();
  $('btnToolsFab').classList.add('hide');
  ui.finalOverlay.classList.remove('hide');
  SND.play('victory');
  cloudPush();
  recordAiLog();
}
/* ── 排行榜 ── */
function loadLB() {
  ui.lbArea.innerHTML = '<div class="lb-wrap"><button class="lb-btn-ghost lb-toggle" onclick="toggleLB()">🏆 查看排行榜 ▸</button><div class="lb-body hide"></div></div>';
}
function toggleLB() {
  var wrap = ui.lbArea.querySelector('.lb-wrap');
  var body = wrap.querySelector('.lb-body');
  var shown = !body.classList.contains('hide');
  body.classList.toggle('hide');
  if (shown) return;
  if (!window.Auth || !Auth.isLoggedIn()) {
    body.innerHTML = '<p class="lb-note">登录后可查看并提交你的战绩</p>';
    body.classList.remove('hide');
    return;
  }
  body.innerHTML = '<p class="lb-note">加载中…</p>';
  body.classList.remove('hide');
  fetch(API_BASE + 'api/leaderboard.php?game=' + CONFIG.LB_GAME, { headers: { 'Authorization': 'Bearer ' + Auth.token() } })
    .then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.list) { body.innerHTML = '<p class="lb-note">暂无榜单数据</p>'; return; }
      var html = '<table class="lb-table"><tr><th>#</th><th>玩家</th><th>净资产</th></tr>';
      d.list.forEach(function (it, i) {
        html += '<tr class="' + (it.me ? 'lb-my' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(it.name || '?') + '</td><td>' + fmt(it.score || 0) + '</td></tr>';
      });
      html += '</table>';
      body.innerHTML = html + '<button class="lb-btn-ghost lb-toggle" style="margin-top:8px;" onclick="submitScore()">✍️ 提交本局战绩</button>';
    }).catch(function () { body.innerHTML = '<p class="lb-note">加载失败</p>'; });
}
function submitScore() {
  var body = ui.lbArea.querySelector('.lb-body');
  if (!body) return;
  if (!window.Auth || !Auth.isLoggedIn()) { Auth.openModal('login', function () { toggleLB(); }); return; }
  body.innerHTML = '<p class="lb-note">提交中…</p>';
  var f = new FormData();
  f.append('score', String(Math.round(netWorth(S.player))));
  fetch(API_BASE + 'api/leaderboard.php?game=' + CONFIG.LB_GAME, {
    method: 'POST', body: f, headers: { 'Authorization': 'Bearer ' + Auth.token() }
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res.ok) body.innerHTML = '<p class="lb-ok">✅ 已上榜 · 第 ' + res.rank + ' 名</p>';
    else body.innerHTML = '<p class="lb-err">⚠️ ' + esc(res.error || '提交失败') + '</p>';
  }).catch(function () { body.innerHTML = '<p class="lb-err">网络错误</p>'; });
}

/* ── 对手档案 ── */
function loadAiLog() {
  try { return JSON.parse(localStorage.getItem(CONFIG.SAVE_AI_LOG)) || {}; } catch (e) { return {}; }
}
function saveAiLog(l) { try { localStorage.setItem(CONFIG.SAVE_AI_LOG, JSON.stringify(l)); } catch (e) {} }
function recordAiLog() {
  try {
    var log = loadAiLog();
    var rank = [S.player].concat(S.ais).sort(function (a, b) { return netWorth(b) - netWorth(a); });
    S.ais.forEach(function (ai) {
      var d = log[ai.char.id] || { games: 0, won: 0, bidSum: 0, winBidSum: 0, winValue: 0 };
      d.games++;
      if (S.wh.tmp.winner === ai.char.id) {
        d.won++;
        d.winBidSum += S.wh.tmp.winnerAmt;
        d.winValue += S.wh.totalV;
      }
      d.bidSum += ai.bid;
      log[ai.char.id] = d;
    });
    saveAiLog(log);
  } catch (e) {}
}
function aiLogStat(id) {
  var d = (loadAiLog())[id] || null;
  if (!d || !d.games) return null;
  var wr = Math.round(d.won / d.games * 100);
  var prem = d.won > 0 ? Math.round((d.winBidSum - d.winValue) / d.winValue * 100) : 0;
  var avgBid = Math.round(d.bidSum / d.games);
  var style = '观望型';
  if (d.won > 0 && prem > 10) style = '抬价型';
  else if (d.won > 0 && prem < -8) style = '捡漏型';
  else if (wr > 55) style = '强势型';
  else if (avgBid > 6000) style = '豪爽型';
  return { games: d.games, wr: wr, prem: prem, avgBid: avgBid, style: style };
}

/* ═══════════ 15.5 收藏图鉴 ═══════════ */
function loadCollect() {
  try { var t = JSON.parse(localStorage.getItem(CONFIG.SAVE_COLLECT)) || {}; return t; } catch (e) { return {}; }
}
function saveCollect(c) { try { localStorage.setItem(CONFIG.SAVE_COLLECT, JSON.stringify(c)); } catch (e) {} }
function registerCollect(items) {
  var c = loadCollect();
  var added = 0;
  items.forEach(function (it) { if (!c[it.n]) added++; c[it.n] = (c[it.n] || 0) + 1; });
  saveCollect(c);
  cloudPush();
  return added;
}
function collectStats() {
  var c = loadCollect();
  var distinct = 0, total = 0;
  for (var k in c) { distinct++; total += c[k]; }
  return { distinct: distinct, total: total };
}
/* ── 藏品仓库 ── */
function loadStorage() {
  try { return JSON.parse(localStorage.getItem(CONFIG.SAVE_STORAGE)) || {}; } catch (e) { return {}; }
}
function saveStorage(st) { try { localStorage.setItem(CONFIG.SAVE_STORAGE, JSON.stringify(st)); } catch (e) {} }
function storeItems(items) {
  var st = loadStorage();
  items.forEach(function (it) {
    if (!st[it.n]) st[it.n] = { c: 0, v: 0, q: it.q, e: it.e };
    st[it.n].c++; st[it.n].v += it.v;
  });
  saveStorage(st);
  cloudPush();
}
function sellItem(name) {
  var st = loadStorage();
  var it = st[name];
  if (!it || it.c <= 0) { mmsToast('仓库里没有这件藏品'); return; }
  var avg = Math.round(it.v / it.c);
  var price = Math.round(avg * 0.8);
  saveCoins(loadCoins() + price);
  it.c--; it.v -= avg;
  if (it.c <= 0) delete st[name];
  saveStorage(st);
  SND.play('coin');
  mmsToast('💰 出售 ' + name + ' ×1 · +' + fmt(price) + ' 金币');
  renderStorage();
}
function sellAllStorage() {
  var st = loadStorage();
  var total = 0, n = 0;
  for (var k in st) { total += st[k].v; n += st[k].c; }
  if (n <= 0) { mmsToast('仓库是空的'); return; }
  var price = Math.round(total * 0.8);
  saveCoins(loadCoins() + price);
  saveStorage({});
  SND.play('coin');
  mmsToast('💰 清仓出售 ' + n + ' 件 · +' + fmt(price) + ' 金币');
  renderStorage();
}
function renderStorage() {
  if (!$('storageSum') || !$('storageRows')) return;
  updateCoins();
  var st = loadStorage();
  var rows = [];
  var total = 0, n = 0;
  for (var k in st) { total += st[k].v; n += st[k].c; }
  $('storageSum').innerHTML = '仓库共 <b>' + n + '</b> 件 · 总价值 <b>' + fmt(total) + '</b> 金币' +
    (n > 0 ? ' · <button class="sh-btn" style="margin-left:6px;" onclick="sellAllStorage()">全部出售 ×80%</button>' : '');
  $('storageRows').innerHTML = Object.keys(st).map(function (name) {
    var it = st[name];
    var avg = Math.round(it.v / it.c);
    return '<div class="shop-card">' +
      '<span class="sh-e">' + it.e + '</span>' +
      '<span class="sh-info"><b>' + name + '</b><br>单价约 ' + fmt(avg) + ' · 出售 ' + fmt(Math.round(avg * 0.8)) + '<br><span class="sh-own">×' + it.c + '</span></span>' +
      '<button class="sh-btn" onclick="sellItem(\'' + esc(name) + '\')">出售</button></div>';
  }).join('') || '<div style="font-size:12px;color:#8a7e9a;text-align:center;padding:14px;">仓库空空如也,去拍一柜吧!出售价 = 估值×80%</div>';
}
function renderCollect() {
  var c = loadCollect();
  var st = collectStats();
  var pct = Math.round(st.distinct / AUCTION_ITEMS.length * 100);
  $('collectProgress').textContent = '图鉴完成度 ' + st.distinct + '/' + AUCTION_ITEMS.length + ' (' + pct + '%)';
  $('collectBar').style.width = pct + '%';
  var html = '';
  AUCTION_QUALITY.forEach(function (q, qi) {
    var items = AUCTION_ITEMS.filter(function (it) { return it.q === qi; });
    html += '<div class="col-q"><span class="q-dot" style="background:' + q.color + '"></span>' + q.name +
      ' <span style="font-size:10px;color:#8a7e9a;">' + items.filter(function (it) { return c[it.n]; }).length + '/' + items.length + '</span></div>' +
      '<div class="col-grid">' + items.map(function (it) {
        var got = c[it.n] || 0;
        return '<div class="col-cell' + (got ? ' q' + it.q : '') + '">' +
          '<div class="cc-e">' + (got ? it.e : '?') + '</div>' +
          '<div class="cc-n">' + (got ? it.n : '未获得') + '</div>' +
          (got ? '<div class="cc-c">×' + got + '</div>' : '') + '</div>';
      }).join('') + '</div>';
  });
  $('collectGrid').innerHTML = html;
}

/* ═══════════ 15.6 云端存档 ═══════════ */
var cloudTimer = null;
function cloudPack() {
  return {
    coins: loadCoins(), roster: loadRoster(), tools: loadTools(), collect: loadCollect(),
    storage: loadStorage(), aiLog: loadAiLog(),
    best: BEST, skill: PICKED_CHAR, map: PICKED_MAP, helped: loadHelped(),
    updated_at: Date.now()
  };
}
function cloudPush() {
  if (!window.Auth || !Auth.isLoggedIn || !Auth.isLoggedIn()) return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(function () {
    cloudTimer = null;
    try {
      var p = cloudPack();
      var f = new FormData();
      f.append('action', 'save');
      f.append('game', 'auction');
      f.append('data', JSON.stringify(p));
      f.append('updated_at', String(p.updated_at));
      Auth.api('api/gamesave.php', { method: 'POST', body: f, silent: true })
        .then(function (res) {
          if (res && res.ok) {
            try { localStorage.setItem(CONFIG.SAVE_SYNC, String(p.updated_at)); } catch (e) {}
          } else if (res && res.error === '云端有更新的存档') {
            cloudLoad();
          }
        }).catch(function () {});
    } catch (e) {}
  }, 1500);
}
function cloudLoad() {
  if (!window.Auth || !Auth.isLoggedIn || !Auth.isLoggedIn()) return;
  var f = new FormData();
  f.append('action', 'load');
  f.append('game', 'auction');
  Auth.api('api/gamesave.php', { method: 'POST', body: f, silent: true }).then(function (res) {
    if (!res || !res.ok || !res.data) return;
    var d = res.data;
    var localAt = 0;
    try { localAt = parseInt(localStorage.getItem(CONFIG.SAVE_SYNC), 10) || 0; } catch (e) {}
    if (d.updated_at <= localAt) return;
    try {
      if (typeof d.coins === 'number') saveCoins(d.coins);
      if (d.roster && d.roster.length) { saveRoster(d.roster.filter(function (id) { return charById(id).id === id; })); }
      if (d.tools) saveTools({ scan: d.tools.scan || 0, probe: d.tools.probe || 0, heavy: d.tools.heavy || 0 });
      if (d.collect) saveCollect(d.collect);
      if (d.storage) saveStorage(d.storage);
      if (d.aiLog) saveAiLog(d.aiLog);
      if (typeof d.best === 'number') { BEST = d.best; saveBest(d.best); }
      if (d.skill) { PICKED_CHAR = ownChar(d.skill) ? d.skill : PICKED_CHAR; saveSkill(PICKED_CHAR); }
      if (d.map) { PICKED_MAP = mapById(d.map) ? d.map : PICKED_MAP; saveMap(PICKED_MAP); }
      if (typeof d.helped === 'boolean') saveHelped(d.helped);
      localStorage.setItem(CONFIG.SAVE_SYNC, String(d.updated_at));
    } catch (e) {}
    mmsToast('☁️ 已同步云端存档');
    if (!ui.homeOverlay.classList.contains('hide')) showMenu();
    else if (!ui.charHomeOverlay.classList.contains('hide')) renderCharHome();
    else if (!ui.shopOverlay.classList.contains('hide')) renderShop();
    else if (!ui.collectOverlay.classList.contains('hide')) renderCollect();
    else if (!ui.storageOverlay.classList.contains('hide')) renderStorage();
    else if (!ui.aiLogOverlay.classList.contains('hide')) renderAiLog();
  }).catch(function () {});
}
function saveMap(id) { try { localStorage.setItem(CONFIG.SAVE_MAP, id); } catch (e) {} }

/* ═══════════ 16. 分享海报 ═══════════ */
function showPoster() {
  ui.finalOverlay.classList.add('hide');
  var backBtn = '<button class="btn btn-ghost" style="max-width:280px;margin:8px auto 0;display:block;" onclick="closePoster()">← 返回终局</button>';
  ui.screen.innerHTML = MQ.poster.screenHTML({ filename: '幻想乡拍卖会.png', backHTML: backBtn });
  buildPoster();
}
function closePoster() {
  ui.finalOverlay.classList.remove('hide');
  ui.screen.innerHTML = '';
}
function buildPoster() {
  var W = 640, H = 960, pad = 36;
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var ctx = cv.getContext('2d');
  var FONT = MQ.poster.FONT;
  MQ.poster.frame(ctx, W, H, { accent: '#f0c060', accent2: '#b89fff' });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0c060'; ctx.font = '600 17px ' + FONT;
  ctx.fillText('霧 雨 魔 法 店 · 幻想乡拍卖会', W / 2, 96);
  var t = titleOf(netWorth(S.player));
  ctx.fillStyle = t.c; ctx.font = '800 30px ' + FONT;
  ctx.fillText(t.t, W / 2, 146);
  ctx.fillStyle = '#8a7e9a'; ctx.font = '13px ' + FONT;
  ctx.fillText('最终净资产 ' + fmt(netWorth(S.player)) + ' 金币 · 拍下 ' + S.stats.won + ' 柜 · 传说 ×' + S.stats.legends, W / 2, 176);
  var qCounts = [0, 0, 0, 0, 0, 0];
  S.player.inv.forEach(function (it) { qCounts[it.q]++; });
  var qy = 212, qx0 = W / 2 - 230;
  ctx.textAlign = 'left';
  AUCTION_QUALITY.forEach(function (q, i) {
    ctx.fillStyle = q.color; ctx.font = '14px ' + FONT;
    ctx.fillText('● ' + q.name, qx0, qy);
    ctx.fillStyle = '#e0d8ec';
    ctx.fillText('×' + qCounts[i], qx0 + 150, qy);
    qy += 30;
  });
  ctx.fillStyle = '#8a7e9a'; ctx.font = '13px ' + FONT;
  ctx.fillText('暗标五轮 · 情报为王 · 开箱为生', W / 2, qy + 8);
  ctx.textAlign = 'center';
  var qrY = 640;
  MQ.poster.qrPair(ctx, W, qrY, 108, { siteLabel: '扫码来拍', qqLabel: '关注B站' }).then(function () {
    MQ.poster.finish(cv);
  });
}

/* ═══════════ 17. 事件绑定与启动 ═══════════ */
function bindEvents() {
  $('btnMenuStart').addEventListener('click', showWizard);
  $('btnWizClose').addEventListener('click', showMenu);
  $('btnWizBack').addEventListener('click', wizBack);
  $('btnWizNext').addEventListener('click', wizNext);
  $('btnWizStart').addEventListener('click', newGame);
  $('btnHelp').addEventListener('click', openHelp);
  $('btnHomeHelp').addEventListener('click', openHelp);
  $('btnCollectPage').addEventListener('click', showCollect);
  $('btnCollectBack').addEventListener('click', showMenu);
  $('btnStoragePage').addEventListener('click', showStorage);
  $('btnStorageBack').addEventListener('click', showMenu);
  $('btnAiLogPage').addEventListener('click', showAiLog);
  $('btnAiLogBack').addEventListener('click', showMenu);
  $('btnCharHome').addEventListener('click', function () { PREV_PAGE = 'home'; showCharHome(); });
  $('btnCharHomeBack').addEventListener('click', charHomeBack);
  $('btnCharHomeDone').addEventListener('click', charHomeBack);
  $('btnShopPage').addEventListener('click', showShop);
  $('btnShopBack').addEventListener('click', showMenu);
  $('btnShopHome').addEventListener('click', showMenu);
  $('btnCollectPage').addEventListener('click', showCollect);
  $('btnCollectBack').addEventListener('click', showMenu);
  $('btnMenuSfx').addEventListener('click', function () {
    SND.setSfx(!SND.isSfx());
    this.textContent = SND.isSfx() ? '🔇 音效' : '🔊 音效';
  });
  $('btnMenuBgm').addEventListener('click', function () {
    SND.setBgm(!SND.isBgm());
    this.textContent = SND.isBgm() ? '🔇 音乐' : '🎵 音乐';
  });
  $('btnMute').addEventListener('click', function () {
    SND.setSfx(!SND.isSfx());
    this.textContent = SND.isSfx() ? '🔇' : '🔊';
  });
  $('btnTargetCancel').addEventListener('click', function () { ui.pickTargetOverlay.classList.add('hide'); });
  $('btnFakeCancel').addEventListener('click', function () { ui.fakeInfoOverlay.classList.add('hide'); });
  $('btnFinalRestart').addEventListener('click', function () {
    ui.finalOverlay.classList.add('hide');
    showMenu();
  });
  $('btnPoster').addEventListener('click', showPoster);
  $('biConfirm').addEventListener('click', confirmBid);
  $('biCancel').addEventListener('click', cancelBidInput);
  document.addEventListener('click', function (e) {
    if (e.target === ui.toolsDrawer) ui.toolsDrawer.classList.add('hide');
  });
}
document.addEventListener('DOMContentLoaded', function () {
  initUI();
  bindEvents();
  document.body.className = mapById(PICKED_MAP).cls;
  showMenu();
  $('btnMenuSfx').textContent = SND.isSfx() ? '🔇 音效' : '🔊 音效';
  $('btnMenuBgm').textContent = SND.isBgm() ? '🔇 音乐' : '🎵 音乐';
  try { bindCount('takeCount', 'marisa_auction_take', { template: '已有 {n} 位收藏家来拍过', animate: true }); } catch (e) {}
  loadCoins();
  if (window.Auth && Auth.onAuth) Auth.onAuth(function () { cloudLoad(); });
  cloudLoad();
});

