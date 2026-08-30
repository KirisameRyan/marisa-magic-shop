// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · 引擎 (engine.js)
//  素材加载 / 星空背景 / 粒子 / 浮动文字 / 对象池
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.engine = (function() {
  var C = STG.CONFIG;

  // ── 素材加载 ──
  function loadImage(src) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('素材加载失败: ' + src)); };
      img.src = src;
    });
  }
  function preloadAll() {
    var jobs = [];
    var assets = {};
    for (var key in C.ASSETS) {
      (function(k, src) {
        jobs.push(loadImage(src).then(function(i) { assets[k] = i; }, function() { assets[k] = null; }));
      })(key, C.ASSETS[key]);
    }
    return Promise.all(jobs).then(function() { return assets; });
  }

  // ── 离屏预渲染切片(大精灵表按帧缓存, 避免每帧 drawImage 大源图) ──
  var sliceCache = {};
  function slice(assets, key, sx, sy, fw, fh, scale) {
    var id = key + '|' + sx + ',' + sy + ',' + fw + ',' + fh + '|' + (scale || 1);
    if (sliceCache[id]) return sliceCache[id];
    var img = assets[key];
    if (!img) return null;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(fw * (scale || 1)));
    c.height = Math.max(1, Math.round(fh * (scale || 1)));
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = !!(scale && scale !== 1 && scale > 1.5);
    g.drawImage(img, sx, sy, fw, fh, 0, 0, c.width, c.height);
    sliceCache[id] = c;
    return c;
  }

  // ── 星空背景(三层视差, 与网站星空同源感觉) ──
  var stars = [];
  function initSky() {
    stars = [];
    var layers = [ { n: 26, sp: 14 }, { n: 18, sp: 28 }, { n: 12, sp: 44 } ];
    for (var l = 0; l < layers.length; l++) {
      var lay = layers[l];
      for (var i = 0; i < lay.n; i++) {
        stars.push({ x: Math.random() * C.W, y: Math.random() * C.H, sp: lay.sp * STG.rnd(0.7, 1.3), r: 1 + l * 0.5, a: 0.25 + Math.random() * 0.4 });
      }
    }
  }
  function drawSky(ctx, dt) {
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, C.W, C.H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.y += s.sp * dt;
      if (s.y > C.H + 2) { s.y = -2; s.x = Math.random() * C.W; }
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(STG.engine.time * 2 + i));
      ctx.fillStyle = '#ffe8b0';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // 常驻回收线已移除(改为开局提示, 见 main.js)
  }

  // ── 粒子池(爆炸火花/擦弹星光) ──
  var particles = [];
  function spark(x, y, color, n, sp) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = STG.rnd(40, sp || 220);
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: STG.rnd(0.25, 0.6), max: 0.6, color: color, r: STG.rnd(1.5, 3.5) });
    }
  }
  function drawParticles(ctx, dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── 浮动文字 ──
  var labels = [];
  function label(x, y, txt, color, size) {
    labels.push({ x: x, y: y, txt: txt, color: color || '#f0c060', size: size || 13, life: 1.0 });
  }
  function drawLabels(ctx, dt) {
    for (var i = labels.length - 1; i >= 0; i--) {
      var l = labels[i];
      l.y -= 42 * dt; l.life -= dt;
      if (l.life <= 0) { labels.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, l.life * 1.5);
      ctx.fillStyle = l.color;
      ctx.font = '700 ' + l.size + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(l.txt, l.x, l.y);
    }
    ctx.globalAlpha = 1;
  }

  // ── 时间戳 ──
  var time = 0;

  // ── 屏幕震动 ──
  var shakeT = 0, shakeDur = 0, shakeAmp = 0;
  function shake(amp, dur) { shakeAmp = Math.max(shakeAmp, amp); shakeT = 0; shakeDur = Math.max(shakeDur, dur || 0.3); }
  function applyShake(ctx, dt) {
    if (shakeT >= shakeDur || shakeAmp <= 0) return 0;
    shakeT += dt;
    var k = Math.max(0, 1 - shakeT / shakeDur);
    var dx = (Math.random() * 2 - 1) * shakeAmp * k;
    var dy = (Math.random() * 2 - 1) * shakeAmp * k;
    ctx.translate(dx, dy);
    if (shakeT >= shakeDur) { shakeAmp = 0; shakeDur = 0; }
    return 1;
  }

  // ── 全屏白闪 ──
  var flashA = 0;
  function flash(a) { flashA = Math.max(flashA, a); }
  function drawFlash(ctx, dt) {
    if (flashA <= 0.01) return;
    ctx.globalAlpha = Math.min(1, flashA);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-8, -8, C.W + 16, C.H + 16);
    ctx.globalAlpha = 1;
    flashA *= Math.pow(0.06, dt);   // 快速衰减
    if (flashA < 0.01) flashA = 0;
  }

  // ── 魔法阵(程序化: 外环 + 旋转星芒 + 内圈, 随时间扩散渐隐) ──
  // t: 0~1 生命周期; cx,cy 中心; maxR 最大半径; color 主色
  function magicCircle(ctx, cx, cy, t, maxR, color) {
    var r = maxR * (0.35 + 0.65 * t);
    var a = 1 - t;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = Math.max(0, a);
    ctx.strokeStyle = color || '#7cc4ff';
    ctx.lineWidth = 2;
    // 外环
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    // 旋转星芒(12芒)
    ctx.rotate(t * 4);
    for (var i = 0; i < 12; i++) {
      var an = (Math.PI * 2 * i) / 12;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
      ctx.stroke();
    }
    // 内圈双环
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // 中央星点
    ctx.fillStyle = color || '#7cc4ff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── 星环爆发(bomb/大爆炸演出): 扩散双环 + 16 道放射光芒 ──
  // t: 0~1 生命周期
  function starburst(ctx, cx, cy, t, maxR, color) {
    var a = Math.max(0, 1 - t);
    if (a <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color || '#ffe8b0';
    ctx.globalAlpha = a;
    ctx.lineWidth = 3 * a + 1;
    ctx.beginPath(); ctx.arc(0, 0, maxR * t, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a * 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, maxR * t * 0.72, 0, Math.PI * 2); ctx.stroke();
    // 放射光芒(随扩散缩短, 整体缓转)
    ctx.globalAlpha = a * 0.85;
    ctx.rotate(t * 1.2);
    var rl = maxR * 0.28 * (1 - t * 0.6);
    var r0 = maxR * t * 0.8;
    for (var i = 0; i < 16; i++) {
      var an = (Math.PI * 2 * i) / 16;
      ctx.beginPath();
      ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0);
      ctx.lineTo(Math.cos(an) * (r0 + rl), Math.sin(an) * (r0 + rl));
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  return {
    preloadAll: preloadAll,
    slice: slice,
    initSky: initSky,
    drawSky: drawSky,
    spark: spark,
    drawParticles: drawParticles,
    label: label,
    drawLabels: drawLabels,
    shake: shake,
    applyShake: applyShake,
    flash: flash,
    drawFlash: drawFlash,
    magicCircle: magicCircle,
    starburst: starburst,
    tick: function(dt) { time += dt; },
    get time() { return time; }
  };
})();
