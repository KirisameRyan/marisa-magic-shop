// ═══════════════════════════════════════════
//  魔理沙幸存者 · 本地调试控制台（不进 Toy 包）
//  用法：调试页面自动激活，或在任意页面 URL 加 ?debug=1
//  开合：反引号 ` 或 F2
// ═══════════════════════════════════════════
(function () {
  'use strict';
  var ACTIVE = (typeof window.__SURVIVOR_DEBUG__ !== 'undefined' && window.__SURVIVOR_DEBUG__) ||
               /[?&]debug=1\b/.test(location.search);
  if (!ACTIVE) return;

  var ms = null, panel = null, fab = null, open = false;
  var timer = setInterval(function () {
    if (window.__ms) { ms = window.__ms; clearInterval(timer); boot(); }
  }, 200);

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }
  function btn(label, fn, cls) {
    var b = el('button', 'dbg-btn' + (cls ? ' ' + cls : ''), label);
    b.addEventListener('click', function () { try { fn(); } catch (e) { console.warn(e); } setTimeout(refresh, 60); });
    return b;
  }
  function sec(title) {
    var s = el('div', 'dbg-sec');
    s.appendChild(el('h4', null, title));
    return s;
  }
  function row(label) {
    var r = el('div', 'dbg-row');
    r.appendChild(el('span', 'dbg-name', label));
    var box = el('span', 'dbg-acts');
    r.appendChild(box);
    r._box = box;
    return r;
  }

  function boot() {
    var st = el('style', null,
      '#dbgFab{position:fixed;right:12px;bottom:96px;z-index:99998;width:40px;height:40px;border-radius:12px;border:1px solid #f0c060;background:rgba(36,30,42,.92);color:#f0c060;font-size:18px;cursor:pointer;}' +
      '#dbgPanel{position:fixed;right:0;top:0;bottom:0;width:340px;max-width:88vw;z-index:99999;background:rgba(16,12,22,.97);border-left:1px solid #3a3045;overflow-y:auto;padding:10px 10px 60px;display:none;font-size:12px;color:#e0d8ec;}' +
      '#dbgPanel.on{display:block;}' +
      '#dbgPanel h3{color:#f0c060;font-size:13px;letter-spacing:2px;margin:4px 0 8px;}' +
      '.dbg-sec{border:1px solid #332b42;border-radius:10px;padding:6px 8px;margin-bottom:8px;background:rgba(255,255,255,.02);}' +
      '.dbg-sec h4{color:#8fd8ff;font-size:11px;letter-spacing:1px;margin:2px 0 6px;}' +
      '.dbg-row{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 0;border-bottom:1px dashed rgba(58,48,69,.5);}' +
      '.dbg-name{color:#c9bfd8;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}' +
      '.dbg-acts{display:flex;gap:3px;flex-shrink:0;}' +
      '.dbg-btn{font-size:10px;padding:2px 6px;border-radius:6px;border:1px solid #5f4a8c;background:rgba(184,159,255,.08);color:#cbb8ff;cursor:pointer;font-family:inherit;}' +
      '.dbg-btn:hover{background:rgba(184,159,255,.22);}' +
      '.dbg-btn.gold{border-color:#f0c060;color:#f0c060;}' +
      '.dbg-btn.danger{border-color:#ef4444;color:#ef4444;}' +
      '.dbg-btn:disabled{opacity:.3;cursor:default;}' +
      '.dbg-info{font-size:11px;color:#8a7e9a;line-height:1.7;}');
    document.head.appendChild(st);

    fab = el('button', null, '🐞');
    fab.id = 'dbgFab';
    fab.title = '调试控制台（` / F2）';
    fab.addEventListener('click', toggle);
    document.body.appendChild(fab);

    panel = el('div', null, '<h3>🐞 调试控制台</h3><div id="dbgBody"></div>');
    panel.id = 'dbgPanel';
    document.body.appendChild(panel);
    document.addEventListener('keydown', function (e) {
      if (e.key === '`' || e.key === 'F2') { e.preventDefault(); toggle(); }
    });
    refresh();
  }

  function toggle() { open = !open; panel.classList.toggle('on', open); if (open) refresh(); }

  function refresh() {
    var body = document.getElementById('dbgBody');
    if (!body) return;
    body.innerHTML = '';
    var info = ms.state ? ms.state() : {};
    body.appendChild(el('div', 'dbg-info',
      '状态: ' + info.gameState + ' · Lv' + info.level + ' · 怪 ' + info.enemies + ' · ' + Math.floor(info.gameTime || 0) + 's' +
      '<br>武器: ' + (ms.weapons() || []).map(function (w) { return w.id + (w.evoed ? '★' : 'Lv' + w.lv); }).join(' ') +
      '<br>遗物: ' + Object.keys(ms.relics() || {}).map(function (k) { return k + '×' + ms.relics()[k]; }).join(' ') || '无'));

    // 玩家
    var ps = sec('玩家');
    var pr = row('无敌：' + (ms.godState() ? '开' : '关'));
    pr._box.appendChild(btn('切换', function () { ms.god(!ms.godState()); }, ms.godState() ? 'gold' : ''));
    ps.appendChild(pr);
    var ph = row('生命 / 护盾');
    ph._box.appendChild(btn('回满', function () { ms.heal(); }));
    ps.appendChild(ph);
    var pl = row('升级');
    pl._box.appendChild(btn('+1', function () { ms.gainLevels(1); }));
    pl._box.appendChild(btn('+5', function () { ms.gainLevels(5); }));
    ps.appendChild(pl);
    var pt = row('时间');
    pt._box.appendChild(btn('+60s', function () { ms.skipTime(60); }));
    pt._box.appendChild(btn('+300s', function () { ms.skipTime(300); }));
    ps.appendChild(pt);
    var pm = row('P点 / 清屏');
    pm._box.appendChild(btn('全收', function () { ms.magnetAll(); }));
    pm._box.appendChild(btn('清怪', function () { ms.clearEnemies(); }, 'danger'));
    ps.appendChild(pm);
    body.appendChild(ps);

    // Boss
    var bs = sec('Boss');
    var b1 = row('召唤'); b1._box.appendChild(btn('蕾米', function () { ms.spawnBoss(0); }));
    b1._box.appendChild(btn('芙兰', function () { ms.spawnBoss(1); })); bs.appendChild(b1);
    var b2 = row('符卡'); b2._box.appendChild(btn('秒当前', function () { ms.dmgBoss(1e9); }));
    b2._box.appendChild(btn('跳下一张', function () { ms.nextCard(); }));
    b2._box.appendChild(btn('击破 Boss', function () { ms.killBoss(); }, 'danger')); bs.appendChild(b2);
    body.appendChild(bs);

    // 武器
    var ws = sec('武器（12 把 · 上限 6 格）');
    (ms.wpnList ? ms.wpnList() : []).forEach(function (w) {
      var owned = (ms.weapons() || []).filter(function (x) { return x.id === w.id; })[0];
      var r = row(w.icon + ' ' + w.name + (owned ? '（' + (owned.evoed ? '★已进化' : 'Lv' + owned.lv) + '）' : ''));
      if (!owned) r._box.appendChild(btn('添加', function () { ms.addWeapon(w.id, 1); }));
      else {
        r._box.appendChild(btn('+1', function () { ms.levelWeapon(w.id, 1); }));
        r._box.appendChild(btn('满', function () { ms.maxWeapon(w.id); }));
        if (!owned.evoed) r._box.appendChild(btn('进化', function () { ms.evoWeapon(w.id); }, 'gold'));
        r._box.appendChild(btn('移除', function () { ms.removeWeapon(w.id); }, 'danger'));
      }
      ws.appendChild(r);
    });
    body.appendChild(ws);

    // 强化
    var es = sec('强化');
    var ep = row('基础被动'); ep._box.appendChild(btn('全部满级', function () { ms.maxPassives(); })); es.appendChild(ep);
    (ms.pasList ? ms.pasList() : []).forEach(function (p) {
      var r = row(p.icon + ' ' + p.name);
      r._box.appendChild(btn('+1', function () { ms.addPassive(p.id, 1); }));
      es.appendChild(r);
    });
    var ea = row('属性'); ea._box.appendChild(btn('灵力+1', function () { ms.setAttr('rei', (ms.attrs().rei || 0) + 1); }));
    ea._box.appendChild(btn('魔力+1', function () { ms.setAttr('ma', (ms.attrs().ma || 0) + 1); })); es.appendChild(ea);
    (ms.typeList ? ms.typeList() : []).forEach(function (t) {
      var r = row(t.icon + ' ' + t.name + '（' + t.label + '）');
      r._box.appendChild(btn('+1', function () { ms.setType(t.id, (ms.types()[t.id] || 0) + 1); }));
      es.appendChild(r);
    });
    var em = row('一键满'); em._box.appendChild(btn('面板全满', function () { ms.maxPanel(); }, 'gold')); es.appendChild(em);
    body.appendChild(es);

    // 遗物
    var rs = sec('遗物');
    var rr = row('全部添加'); rr._box.appendChild(btn('添加全部', function () { ms.giveAllRelics(); }, 'gold')); rs.appendChild(rr);
    (ms.relicList ? ms.relicList() : []).forEach(function (x) {
      var r = row(x.icon + ' ' + x.name + (x.boss >= 0 ? '（Boss 专属）' : ''));
      r._box.appendChild(btn('添加', function () { ms.addRelic(x.id); }));
      rs.appendChild(r);
    });
    body.appendChild(rs);

    // 怪物
    var gs = sec('生成怪物');
    var mons = ['fairy', 'mogu', 'split', 'ghost', 'butterfly', 'sunflower', 'boar', 'shieldf', 'elite', 'eliteM', 'eliteC', 'redfairy', 'crystal', 'exec'];
    mons.forEach(function (t) {
      var r = row(t);
      r._box.appendChild(btn('×1', function () { ms.spawn(t); }));
      r._box.appendChild(btn('×5', function () { for (var i = 0; i < 5; i++) ms.spawn(t); }));
      gs.appendChild(r);
    });
    body.appendChild(gs);
  }
})();
