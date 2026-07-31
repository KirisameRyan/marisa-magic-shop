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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSponsor);
  } else {
    injectSponsor();
  }
})();

// ── 广告切换(已废弃,保留兼容) ──
function toggleAds(state) {}
