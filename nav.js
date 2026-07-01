// =============================================
//  霧雨魔法店 · 共享导航
// =============================================
(function() {
  var current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  var navData = {
    brand: { href: 'index.html', text: '霧 雨 魔 法 店' },
    sections: [
      {
        label: '🔥 热门测试',
        links: [
          { href: 'waifu-test.html',       emoji: '💕', text: '二次元老婆' },
          { href: 'quiz-animal-real.html', emoji: '🧬', text: '灵魂动物' },
          { href: 'quiz-internet.html',    emoji: '🌐', text: '抽象大手子' }
        ]
      },
      {
        label: '🎮 玩玩小游戏',
        links: [
          { href: 'marisa_dash.html', emoji: '🧹', text: '魔理沙快跑' }
        ]
      },
      {
        label: '🆕 最新上线',
        links: [
          { href: 'quiz-genshin.html',      emoji: '✨', text: '原神人格' },
          { href: 'quiz-major.html',       emoji: '🏗️', text: '张雪峰选专业' },
          { href: 'quiz-otti.html',        emoji: '🎭', text: 'OTTI人格' }
        ]
      },
      {
        label: '📦 更多测试 ▸',
        collapsed: true,
        links: [
          { href: 'quiz-touhou.html',             emoji: '🏮', text: '东方人物' },
          { href: 'quiz-anime-world.html',        emoji: '🗺️', text: '二次元故乡' },
          { href: 'quiz-anime-hero.html',         emoji: '⚔️', text: '动漫男主' },
          { href: 'gaokao.html',                  emoji: '🎓', text: '高考出分' },
          { href: 'bingo.html',                   emoji: '🎯', text: '社会宾果' },
          { href: 'quiz-internet-identity.html',  emoji: '🪪', text: '互联网身份' },
          { href: 'quiz-fruit.html',              emoji: '🧠', text: '读心水果' },
          { href: 'quiz-food.html',               emoji: '🍽️', text: '今天吃啥' },
          { href: 'quiz-food-care.html',          emoji: '🍲', text: '对症下菜' },
          { href: 'quiz-deepspace.html',         emoji: '💘', text: '恋与深空' },
          { href: 'quiz-hometown.html',           emoji: '🏠', text: '灵魂故乡' },
          { href: 'quiz-animal.html',             emoji: '🐾', text: '灵魂动物·旧' },
          { href: 'quiz-otokonoko.html',        emoji: '💅', text: '男娘指数' },
          { href: 'quiz-sexual.html',           emoji: '⚠️', text: 'X压抑程度' },
          { href: 'collect.html',                 emoji: '📝', text: '建议新彩蛋' }
        ]
      },
      {
        label: '🔗 其他',
        links: [
          { href: 'feedback.html',          emoji: '💬', text: '反馈建议' },
          { href: 'https://space.bilibili.com/1029138222', emoji: '🅱', text: 'B站频道', ext: true }
        ]
      }
    ]
  };

  function isActive(href) { return current === href.toLowerCase(); }

  var navLinksHTML = '';
  for (var s = 0; s < navData.sections.length; s++) {
    var links = navData.sections[s].links;
    for (var l = 0; l < links.length; l++) {
      var ln = links[l];
      if (ln.ext) continue;
      var active = isActive(ln.href);
      navLinksHTML += '<a href="' + ln.href + '"' + (active ? ' style="color:var(--gold);"' : '') + '>' + ln.text + '</a>';
    }
  }

  var overlayHTML = '';
  var moreIdBase = 'navMore';
  for (var s2 = 0; s2 < navData.sections.length; s2++) {
    var sec = navData.sections[s2];
    if (sec.collapsed) {
      overlayHTML += '<div class="nav-section" onclick="var e=document.getElementById(\''+moreIdBase+'\');var t=this;if(e.style.display===\'none\'){e.style.display=\'block\';t.textContent=t.textContent.replace(\'▸\',\'▾\')}else{e.style.display=\'none\';t.textContent=t.textContent.replace(\'▾\',\'▸\')}" style="cursor:pointer;">' + sec.label + '</div>';
      overlayHTML += '<div id="'+moreIdBase+'" style="display:none;">';
      for (var l2 = 0; l2 < sec.links.length; l2++) {
        var ln2 = sec.links[l2];
        var active2 = isActive(ln2.href);
        var target = ln2.ext ? ' target="_blank"' : '';
        overlayHTML += '<a href="' + ln2.href + '"' + (active2 ? ' style="color:var(--gold);"' : '') + target + '>' + ln2.emoji + ' ' + ln2.text + '</a>';
      }
      overlayHTML += '</div>';
    } else {
      overlayHTML += '<div class="nav-section">' + sec.label + '</div>';
      for (var l3 = 0; l3 < sec.links.length; l3++) {
        var ln3 = sec.links[l3];
        var active3 = isActive(ln3.href);
        var target3 = ln3.ext ? ' target="_blank"' : '';
        overlayHTML += '<a href="' + ln3.href + '"' + (active3 ? ' style="color:var(--gold);"' : '') + target3 + '>' + ln3.emoji + ' ' + ln3.text + '</a>';
      }
    }
  }

  var allHTML =
    '<nav class="shop-bar">' +
      '<a href="' + navData.brand.href + '" class="brand">' + navData.brand.text + '</a>' +
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
