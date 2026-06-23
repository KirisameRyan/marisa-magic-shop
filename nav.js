// =============================================
//  霧雨魔法店 · 共享导航
//  加新页面只需改这个文件！
//  用法：在 <body> 内加 <div id="shopNav"></div>
//        在 </body> 前加 <script src="nav.js"></script>
// =============================================
(function() {
  var current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  var navData = {
    brand: { href: 'index.html', text: '霧 雨 魔 法 店' },
    sections: [
      {
        label: '灵魂鉴定',
        links: [
          { href: 'quiz-animal-real.html', emoji: '🧬', text: '灵魂动物' },
          { href: 'quiz-animal.html',       emoji: '🐾', text: '灵魂动物·旧' },
          { href: 'quiz-hometown.html',     emoji: '🏠', text: '灵魂故乡' },
          { href: 'quiz-anime-world.html',  emoji: '🗺️', text: '二次元故乡' }
        ]
      },
      {
        label: '人格鉴定',
        links: [
          { href: 'quiz-internet.html',     emoji: '🌐', text: '抽象鉴定' },
          { href: 'quiz-touhou.html',       emoji: '🏮', text: '东方人物' },
          { href: 'quiz-anime-hero.html',   emoji: '⚔️', text: '动漫男主' },
          { href: 'quiz-internet-identity.html', emoji: '🪪', text: '互联网身份' },
          { href: 'quiz-fruit.html',        emoji: '🧠', text: '读心水果' }
        ]
      },
      {
        label: '趣味鉴定',
        links: [
          { href: 'waifu-test.html',        emoji: '💕', text: '二次元老婆' },
          { href: 'gaokao.html',            emoji: '🎓', text: '高考出分模拟器' },
          { href: 'bingo.html',             emoji: '🎯', text: '社会指数宾果' }
        ]
      },
      {
        label: '生活指南',
        links: [
          { href: 'quiz-food.html',         emoji: '🍽️', text: '今天吃啥' },
          { href: 'quiz-food-care.html',    emoji: '🍲', text: '对症下菜' }
        ]
      }
    ]
  };

  function isActive(href) { return current === href.toLowerCase(); }

  // 构建 nav-links（桌面端快捷链接，全隐藏，仅汉堡菜单用）
  var navLinksHTML = '';
  for (var s = 0; s < navData.sections.length; s++) {
    var links = navData.sections[s].links;
    for (var l = 0; l < links.length; l++) {
      var ln = links[l];
      var active = isActive(ln.href);
      navLinksHTML += '<a href="' + ln.href + '"' + (active ? ' style="color:var(--gold);"' : '') + '>' + ln.text + '</a>';
    }
  }

  // 构建 nav-overlay（汉堡下拉浮层）
  var overlayHTML = '';
  for (var s2 = 0; s2 < navData.sections.length; s2++) {
    var sec = navData.sections[s2];
    overlayHTML += '<div class="nav-section">' + sec.label + '</div>';
    for (var l2 = 0; l2 < sec.links.length; l2++) {
      var ln2 = sec.links[l2];
      var active2 = isActive(ln2.href);
      overlayHTML += '<a href="' + ln2.href + '"' + (active2 ? ' style="color:var(--gold);"' : '') + '>' + ln2.emoji + ' ' + ln2.text + '</a>';
    }
  }

  overlayHTML += '<div class="nav-section" style="padding-top:12px;border-top:1px solid var(--border);margin-top:4px;">关注</div>';
  overlayHTML += '<a href="https://space.bilibili.com/1029138222" target="_blank">🅱 B站频道</a>';
  overlayHTML += '<div style="font-size:10px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border);margin-top:4px;">💡 建议复制链接到浏览器打开</div>';

  var allHTML =
    '<nav class="shop-bar">' +
      '<a href="' + navData.brand.href + '" class="brand">' + navData.brand.text + '</a>' +
      '<div class="nav-links" id="navLinks">' + navLinksHTML + '</div>' +
      '<button class="hamburger" id="hamburger" onclick="toggleNav()" aria-label="菜单">' +
        '<span></span><span></span><span></span>' +
      '</button>' +
    '</nav>' +
    '<div class="nav-overlay" id="navOverlay">' + overlayHTML + '</div>';

  // 注入
  var target = document.getElementById('shopNav');
  if (target) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = allHTML;
    target.parentNode.insertBefore(wrapper.firstChild, target);
    target.parentNode.insertBefore(wrapper.firstChild, target);
    target.remove();
  }
})();

// 全局汉堡菜单逻辑
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
