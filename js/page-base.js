// =============================================
//  霧雨魔法店 · 页面公用基础
//  注入: favicon + 赞助码 + 全站星空(sky.js) + toggleAds(空)
//  每个页面只需在 head 引入 js/page-base.js
// =============================================
(function() {
  // ── favicon ──
  var fav = document.createElement('link');
  fav.rel = 'icon';
  fav.type = 'image/svg+xml';
  fav.href = 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'><rect width=\'32\' height=\'32\' rx=\'6\' fill=\'%231a1520\'/><text x=\'16\' y=\'25\' text-anchor=\'middle\' font-size=\'24\' fill=\'%23f0c060\'>✦</text></svg>';
  document.head.appendChild(fav);

  // ── 全站星空(canvas 视差星野 + 流星)──
  var skyScript = document.createElement('script');
  skyScript.src = 'js/sky.js';
  skyScript.defer = true;
  document.head.appendChild(skyScript);

  // ── API 基址(同步优先加载, 供 fetch(API_BASE+...) 使用)──
  var apiScript = document.createElement('script');
  apiScript.src = 'js/api-config.js';
  apiScript.async = false;
  document.head.appendChild(apiScript);

  // ── 全站目录(同步优先加载, 导航/主页共用)──
  var catScript = document.createElement('script');
  catScript.src = 'js/catalog.js';
  catScript.async = false;
  document.head.appendChild(catScript);

  // ── 账号模块(右上角登录入口 + 弹窗)──
  var authScript = document.createElement('script');
  authScript.src = 'js/auth.js';
  authScript.defer = true;
  document.head.appendChild(authScript);

  // ── 赞助码注入（游戏页除外）──
  function injectSponsor() {
    var page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (page === 'marisa_dash.html' || page === 'marisa_survivor.html' || page === 'marisa_landlord.html' || page === 'street_survival.html' || page === 'demo_roulette.html') return;
    var img = document.createElement('img');
    img.src = 'images/sponsor-qr.jpg';
    img.alt = '赞助码';
    img.style.cssText = 'max-width:220px;border-radius:16px;border:2px solid var(--border);box-shadow:0 8px 32px rgba(0,0,0,.3);display:block;margin:0 auto;';
    img.onerror = function() { this.style.display = 'none'; };
    var wrap = document.createElement('div');
    wrap.className = 'qq-section';
    wrap.style.cssText = 'max-width:300px;margin:20px auto;padding-top:20px;border-top:1px solid var(--border);';
    wrap.appendChild(img);
    document.body.appendChild(wrap);
  }

  // ═══════════ 主格局导航(游戏/测试页不显示)═══════════
  // 移动端 + App 内 → 底部任务栏; 桌面端 → 左侧栏
  // 只在主 tab 页显示: 主页 / 账本(建设中) / 社区(建设中) / 我的
  // ledger.html / community.html 上线时, 把对应 disabled 改成真链接即可
  var TAB = {
    'index.html':    { href: 'index.html',  ico: '🏠', txt: '主页', active: true },
    'ledger.html':   { href: null,          ico: '📒', txt: '账本', active: false },
    'community.html':{ href: null,          ico: '💬', txt: '社区', active: false },
    'mine.html':     { href: 'mine.html',   ico: '👤', txt: '我的', active: true }
  };

  function tabItemHTML(key, page, kind) {
    var t = TAB[key];
    var cls = ((key === page) ? 'on' : '') + (t.active ? '' : ' tb-dis');
    var clsAttr = cls ? ' class="' + (kind === 'ms' ? 'ms-item ' : '') + cls.replace(/^\s+|\s+$/g, '') + '"' : (kind === 'ms' ? ' class="ms-item"' : '');
    var tip = t.active ? '' : ' data-tip="建设中，敬请期待 ✨"';
    var inner = kind === 'ms'
      ? '<span class="ms-ico">' + t.ico + '</span><span class="ms-txt">' + t.txt + '</span>'
      : '<span class="tb-ico">' + t.ico + '</span><span class="tb-txt">' + t.txt + '</span>';
    if (t.href) {
      return '<a href="' + t.href + '"' + clsAttr + '>' + inner + '</a>';
    }
    return '<a href="javascript:void(0)"' + clsAttr + tip + '>' + inner + '</a>';
  }

  function bindDisabled(nav) {
    var dis = nav.querySelectorAll('.tb-dis');
    for (var i = 0; i < dis.length; i++) {
      dis[i].addEventListener('click', function() {
        mmsToast(this.getAttribute('data-tip') || '建设中，敬请期待 ✨');
      });
    }
  }

  // 移动端 + App 内: 底部任务栏
  function injectTabBar(page) {
    var nav = document.createElement('nav');
    nav.id = 'mmsTabBar';
    nav.className = 'mms-tabbar';
    var html = '';
    for (var key in TAB) html += tabItemHTML(key, page);
    nav.innerHTML = html;
    document.body.appendChild(nav);
    bindDisabled(nav);
    var st = document.createElement('style');
    st.textContent = '#mmsTabBar{display:flex} body{padding-bottom:72px !important;}';
    document.head.appendChild(st);
  }

  // 桌面端: 左侧栏(4 主 tab + 快捷入口)
  function injectSidebar(page) {
    var nav = document.createElement('nav');
    nav.id = 'mmsSidebar';
    nav.className = 'mms-sidebar';
    var html = '';
    for (var key in TAB) html += tabItemHTML(key, page, 'ms');
    html += '<div class="ms-divider"></div>' +
      '<div class="ms-caption">快捷入口</div>' +
      '<a href="leaderboard.html" class="ms-item"><span class="ms-ico">🎮</span><span class="ms-txt">排行榜</span></a>' +
      '<a href="feedback.html" class="ms-item"><span class="ms-ico">💬</span><span class="ms-txt">反馈建议</span></a>';
    nav.innerHTML = html;
    document.body.appendChild(nav);
    bindDisabled(nav);
    // 桌面: 左侧留白, 内容在剩余空间居中
    var st = document.createElement('style');
    st.textContent = 'body{padding-left:168px !important;}';
    document.head.appendChild(st);
  }

  // 入口: 仅主 tab 页注入
  function injectNav() {
    var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (!TAB[page]) return; // 游戏/测试/工具页: 不显示
    var isApp = /mmsapp/i.test(navigator.userAgent);
    var isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isApp || isMobile) injectTabBar(page);
    else injectSidebar(page);
  }

  // 轻提示
  function mmsToast(msg) {
    var old = document.getElementById('mmsToast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'mmsToast';
    t.className = 'mms-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add('show'); }, 10);
    setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 1800);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      injectSponsor();
      injectNav();
    });
  } else {
    injectSponsor();
    injectNav();
  }
})();

// ── 广告切换(已废弃,保留兼容) ──
function toggleAds(state) {}
