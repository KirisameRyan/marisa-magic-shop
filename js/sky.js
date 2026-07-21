// =============================================
//  霧雨魔法店 · 全站星空 MQ.sky
//  Canvas 多层视差星野 + 闪烁 + 偶发流星
//  由 page-base.js 自动加载,无需页面手动引用
//  - prefers-reduced-motion → 静态星空(只画一帧)
//  - 页面切后台 → 自动暂停渲染
// =============================================
window.MQ = window.MQ || {};

MQ.sky = (function() {
  var canvas = null, ctx = null;
  var stars = [], meteors = [];
  var w = 0, h = 0;
  var rafId = null;
  var nextMeteorAt = 0;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COLORS = [
    '255,232,176',  // 暖金
    '255,232,176',
    '184,159,255',  // 紫
    '224,216,236'   // 白
  ];

  function init() {
    if (document.getElementById('mq-sky') || !document.body) return;
    canvas = document.createElement('canvas');
    canvas.id = 'mq-sky';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    if (!ctx) { canvas.parentNode.removeChild(canvas); canvas = null; return; }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      } else if (!REDUCED) {
        loop();
      }
    });

    if (REDUCED) { drawFrame(0); return; }
    nextMeteorAt = now() + 4000 + Math.random() * 6000;
    loop();
  }

  function now() { return performance.now(); }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if (REDUCED) drawFrame(0);
  }

  function seed() {
    var count = Math.round((w * h) / 8500);
    count = Math.max(70, Math.min(count, 230));
    stars = [];
    for (var i = 0; i < count; i++) {
      var layer = Math.random();              // 0 远 → 1 近
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + layer * 1.4,
        layer: layer,
        baseA: 0.2 + layer * 0.6,
        tw: 0.4 + Math.random() * 2.2,        // 闪烁频率
        ph: Math.random() * Math.PI * 2,      // 相位
        c: COLORS[(Math.random() * COLORS.length) | 0]
      });
    }
  }

  function spawnMeteor(t) {
    var fromLeft = Math.random() < 0.5;
    meteors.push({
      x: fromLeft ? Math.random() * w * 0.4 : w * 0.6 + Math.random() * w * 0.4,
      y: Math.random() * h * 0.25,
      vx: (fromLeft ? 1 : -1) * (260 + Math.random() * 200),
      vy: 140 + Math.random() * 120,
      born: t,
      life: 700 + Math.random() * 500
    });
    nextMeteorAt = t + 5000 + Math.random() * 9000;
  }

  function drawFrame(t) {
    ctx.clearRect(0, 0, w, h);
    var i, s, a;
    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      a = s.baseA * (0.55 + 0.45 * Math.sin(s.ph + t * 0.001 * s.tw));
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + s.c + ',' + a.toFixed(3) + ')';
      ctx.arc(s.x, s.y, s.r, 0, 6.2832);
      ctx.fill();
    }
    for (i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      var age = t - m.born;
      if (age > m.life) { meteors.splice(i, 1); continue; }
      var p = age / m.life;
      var mx = m.x + m.vx * p * (m.life / 1000);
      var my = m.y + m.vy * p * (m.life / 1000);
      var alpha = (1 - p) * 0.8;
      var tx = mx - m.vx * 0.12, ty = my - m.vy * 0.12;
      var grad = ctx.createLinearGradient(mx, my, tx, ty);
      grad.addColorStop(0, 'rgba(255,240,200,' + alpha.toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  function tick(t) {
    // 视差漂移(近处快、远处慢)
    var i, s;
    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      s.x -= (0.02 + s.layer * 0.08);
      s.y += (0.008 + s.layer * 0.03);
      if (s.x < -4) s.x = w + 4;
      if (s.y > h + 4) s.y = -4;
    }
    if (t >= nextMeteorAt) spawnMeteor(t);
    drawFrame(t);
  }

  function loop() {
    if (rafId) return;
    var step = function(t) {
      rafId = null;
      tick(t);
      if (!document.hidden) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init };
})();
