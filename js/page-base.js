// =============================================
//  霧雨魔法店 · 页面公用基础
//  注入: favicon + 广告 + 全站星空(sky.js) + toggleAds
//  每个页面只需在 head 引入 js/page-base.js
// =============================================
(function() {
  // ── favicon ──
  var fav = document.createElement('link');
  fav.rel = 'icon';
  fav.type = 'image/svg+xml';
  fav.href = 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'><rect width=\'32\' height=\'32\' rx=\'6\' fill=\'%231a1520\'/><text x=\'16\' y=\'25\' text-anchor=\'middle\' font-size=\'24\' fill=\'%23f0c060\'>✦</text></svg>';
  document.head.appendChild(fav);

  // ── ad script ──
  var adScript = document.createElement('script');
  adScript.type = 'text/javascript';
  adScript.charset = 'UTF-8';
  adScript.src = 'https://cdn.adwork.net/js/makemoney.js';
  adScript.async = true;
  document.head.appendChild(adScript);

  // ── 全站星空(canvas 视差星野 + 流星)──
  var skyScript = document.createElement('script');
  skyScript.src = 'js/sky.js';
  skyScript.defer = true;
  document.head.appendChild(skyScript);

  // ── 自动注入广告 div（有 #app 的页面）──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { injectAds(); });
  } else {
    injectAds();
  }
})();

// ── 广告 div 注入（幂等，可重复调用）──
function injectAds() {
  var container = document.getElementById('app');
  if (!container) return;
  if (document.getElementById('ad1')) return;
  var frag = document.createDocumentFragment();
  for (var i = 1; i <= 3; i++) {
    var ad = document.createElement('div');
    ad.className = 'adwork-net adwork-auto';
    ad.setAttribute('data-id', '1097');
    ad.id = 'ad' + i;
    ad.style.cssText = 'display:none;max-width:300px;margin:16px auto;';
    frag.appendChild(ad);
  }
  container.parentNode.insertBefore(frag, container.nextSibling);
}

// ── 广告切换 ──
function toggleAds(state) {
  var ad1 = document.getElementById('ad1');
  var ad2 = document.getElementById('ad2');
  var ad3 = document.getElementById('ad3');
  if (ad1) ad1.style.display = (state === 'intro') ? 'block' : 'none';
  if (ad2) ad2.style.display = (state === 'quiz') ? 'block' : 'none';
  if (ad3) ad3.style.display = (state === 'result') ? 'block' : 'none';
}
