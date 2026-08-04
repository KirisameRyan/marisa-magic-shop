// =============================================
//  霧雨魔法店 · 共享导航(菜单数据来自 js/catalog.js)
// =============================================
(function() {
  var current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  var MENU = [
    { label: '🔥 热门测试', key: 'hot',    topNav: true },
    { label: '🎮 玩玩小游戏', key: 'games', topNav: true },
    { label: '🆕 最新上线', key: 'latest' },
    { label: '📚 更多测试 ▸', key: 'more', collapsed: true },
    { label: '🧰 实用工具', key: 'tools' },
    { label: '🔗 其他', key: 'links' }
  ];

  function buildNav() {
    var cat = window.MMS_CATALOG;
    if (!cat) return false;

    function isActive(href) { return current === href.toLowerCase(); }

    var navLinksHTML = '';
    for (var s = 0; s < MENU.length; s++) {
      var sec = MENU[s];
      if (!sec.topNav) continue;
      var list = cat[sec.key] || [];
      for (var l = 0; l < list.length; l++) {
        var ln = list[l];
        if (ln.ext) continue;
        var active = isActive(ln.href);
        navLinksHTML += '<a href="' + ln.href + '"' + (active ? ' style="color:var(--gold);"' : '') + '>' + ln.name + '</a>';
      }
    }

    var overlayHTML = '';
    var moreIdBase = 'navMore';
    for (var s2 = 0; s2 < MENU.length; s2++) {
      var sec2 = MENU[s2];
      var list2 = cat[sec2.key] || [];
      if (sec2.collapsed) {
        overlayHTML += '<div class="nav-section" onclick="var e=document.getElementById(\'' + moreIdBase + '\');var t=this;if(e.style.display===\'none\'){e.style.display=\'block\';t.textContent=t.textContent.replace(\'▸\',\'▾\')}else{e.style.display=\'none\';t.textContent=t.textContent.replace(\'▾\',\'▸\')}" style="cursor:pointer;">' + sec2.label + '</div>';
        overlayHTML += '<div id="' + moreIdBase + '" style="display:none;">';
        for (var l2 = 0; l2 < list2.length; l2++) {
          var ln2 = list2[l2];
          var active2 = isActive(ln2.href);
          var target2 = ln2.ext ? ' target="_blank"' : '';
          overlayHTML += '<a href="' + ln2.href + '"' + (active2 ? ' style="color:var(--gold);"' : '') + target2 + '>' + ln2.emoji + ' ' + ln2.name + '</a>';
        }
        overlayHTML += '</div>';
      } else {
        overlayHTML += '<div class="nav-section">' + sec2.label + '</div>';
        for (var l3 = 0; l3 < list2.length; l3++) {
          var ln3 = list2[l3];
          var active3 = isActive(ln3.href);
          var target3 = ln3.ext ? ' target="_blank"' : '';
          overlayHTML += '<a href="' + ln3.href + '"' + (active3 ? ' style="color:var(--gold);"' : '') + target3 + '>' + ln3.emoji + ' ' + ln3.name + '</a>';
        }
      }
    }

    var allHTML =
      '<nav class="shop-bar">' +
        '<a href="index.html" class="brand">霧 雨 魔 法 店</a>' +
        '<div class="nav-links" id="navLinks">' + navLinksHTML + '</div>' +
        '<button class="hamburger" id="hamburger" onclick="toggleNav()" aria-label="菜单">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</nav>' +
      '<div class="nav-overlay" id="navOverlay">' + overlayHTML + '</div>';

    var target = document.getElementById('shopNav');
    if (target) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = allHTML;
      target.parentNode.insertBefore(wrapper.firstChild, target);
      target.parentNode.insertBefore(wrapper.firstChild, target);
      target.remove();
    }
    return true;
  }

  // catalog 未就绪则轮询(由 page-base 动态注入)
  if (!buildNav()) {
    var tries = 0;
    var timer = setInterval(function() {
      tries++;
      if (buildNav() || tries > 60) clearInterval(timer);
    }, 50);
  }
})();

function toggleNav() {
  var b = document.getElementById('hamburger');
  var o = document.getElementById('navOverlay');
  if (b && o) { b.classList.toggle('open'); o.classList.toggle('show'); }
}
document.addEventListener('click', function(e) {
  var o = document.getElementById('navOverlay');
  var b = document.getElementById('hamburger');
  if (o && b && !b.contains(e.target) && !o.contains(e.target)) {
    b.classList.remove('open'); o.classList.remove('show');
  }
});
