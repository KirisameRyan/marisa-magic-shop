// =============================================
//  霧雨魔法店 · 页面公用基础
//  注入: favicon + 全站星空(sky.js) + toggleAds(空)
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
})();

// ── 广告切换(已废弃,保留兼容) ──
function toggleAds(state) {}
