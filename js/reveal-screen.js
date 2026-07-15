// =============================================
//  霧雨魔法店 · OTTI风格揭示屏
//  用法: showReveal(title, code, color, hint, callback, duration)
//  页面需有 <div id="app">
// =============================================

(function() {
  var style = document.createElement('style');
  style.textContent =
    '.reveal-screen{position:relative;padding:60px 20px;text-align:center;overflow:hidden;min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;}'+
    '.reveal-screen .scanline{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);animation:scanDown 1s infinite;}'+
    '@keyframes scanDown{0%{top:0}100%{top:100%}}'+
    '.reveal-screen .reveal-title{font-size:13px;color:var(--gold);letter-spacing:3px;margin-bottom:20px;}'+
    '.reveal-screen .reveal-code{font-size:64px;font-weight:900;color:var(--text);animation:glowPulse 1.2s infinite;letter-spacing:8px;}'+
    '@keyframes glowPulse{0%,100%{text-shadow:0 0 20px rgba(240,192,96,.3)}50%{text-shadow:0 0 40px rgba(240,192,96,.8),0 0 80px rgba(240,192,96,.3)}}'+
    '.reveal-screen .reveal-hint{font-size:11px;color:var(--muted);margin-top:16px;animation:blink 1s infinite;}'+
    '@keyframes blink{0%,100%{opacity:.3}50%{opacity:1}}'+
    '.reveal-particles{position:absolute;inset:0;pointer-events:none;overflow:hidden;}'+
    '.reveal-particle{position:absolute;color:var(--gold);font-size:14px;animation:rise linear infinite;opacity:0;}'+
    '@keyframes rise{0%{opacity:0;transform:translateY(0) rotate(0deg)}10%{opacity:.6}90%{opacity:.2}100%{opacity:0;transform:translateY(-300px) rotate(180deg)}}';
  document.head.appendChild(style);
})();

function showReveal(title, code, color, hint, callback, duration) {
  var app = document.getElementById('app');
  if (!app) return;
  var particles = '';
  for (var i = 0; i < 18; i++) {
    particles += '<span class="reveal-particle" style="left:'+(Math.random()*90+5)+'%;top:'+(Math.random()*80+10)+'%;animation-delay:'+Math.random()*3+'s;animation-duration:'+(2.5+Math.random()*3)+'s;font-size:'+(10+Math.random()*12)+'px;">✦</span>';
  }
  app.innerHTML =
    '<div class="reveal-screen">'+
      '<div class="scanline"></div>'+
      '<div class="reveal-particles">'+particles+'</div>'+
      '<div class="reveal-title">'+title+'</div>'+
      '<div class="reveal-code" style="color:'+(color||'var(--gold)')+'">'+code+'</div>'+
      '<div class="reveal-hint" style="color:'+(color||'var(--muted)')+'">'+hint+'</div>'+
    '</div>';
  setTimeout(function() {
    if (callback) callback();
    window.scrollTo({top:0, behavior:'smooth'});
  }, duration || 1400);
}
