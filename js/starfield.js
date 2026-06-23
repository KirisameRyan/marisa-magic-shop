// =============================================
//  霧雨魔法店 · 星空粒子动画
//  用法: 页面中放 <div id="stars"></div>
// =============================================
(function() {
  var stars = document.getElementById('stars');
  if (!stars) return;
  for (var i = 0; i < 40; i++) {
    var s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = Math.random() * 4 + 's';
    s.style.animationDuration = (2 + Math.random() * 4) + 's';
    if (Math.random() < .2) {
      s.style.width = '3px';
      s.style.height = '3px';
    }
    stars.appendChild(s);
  }
})();
