// =============================================
//  霧雨魔法店 · 统一粒子特效 MQ.particles
//  用法:
//    MQ.particles.confetti(container, opts)  // 庆祝撒花(下落)
//    MQ.particles.sparkle(container, opts)   // 星光闪烁(原地)
//    MQ.particles.rise(container, opts)      // 粒子上升
//    MQ.particles.spawn(container, opts)     // 完全自定义
//  说明: container 需为 position:relative/absolute 定位元素
//        自动尊重 prefers-reduced-motion(直接跳过生成)
// =============================================
window.MQ = window.MQ || {};

MQ.particles = (function() {
  var injected = false;

  function inject() {
    if (injected) return;
    injected = true;
    var st = document.createElement('style');
    st.textContent =
      '@keyframes mqp-fall{0%{transform:translateY(-8vh) rotate(0deg);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translateY(108vh) rotate(340deg);opacity:0}}' +
      '@keyframes mqp-rise{0%{transform:translateY(8vh) scale(.6);opacity:0}15%{opacity:1}100%{transform:translateY(-105vh) scale(1.1);opacity:0}}' +
      '@keyframes mqp-twinkle{0%,100%{opacity:.15;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}' +
      '.mqp{position:absolute;pointer-events:none;user-select:none;z-index:1;line-height:1;}';
    document.head.appendChild(st);
  }

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // spawn(container, opts) → 生成的节点数组
  // opts: count, symbols[], anim('fall'|'rise'|'twinkle'),
  //       duration:[min,max] 秒, delay:[min,max] 秒, size:[min,max] px,
  //       colors[], left:[min,max] %, top:[min,max] %, opacity
  function spawn(container, opts) {
    if (!container || reduced()) return [];
    inject();
    opts = opts || {};
    var count = opts.count || 16;
    var symbols = opts.symbols || ['✦'];
    var anim = opts.anim || 'fall';
    var dur = opts.duration || [3, 6];
    var del = opts.delay || [0, 3];
    var size = opts.size || [10, 18];
    var colors = opts.colors || [];
    var left = opts.left || [0, 100];
    var top = opts.top || [0, 100];
    var nodes = [];
    for (var i = 0; i < count; i++) {
      var s = document.createElement('span');
      s.className = 'mqp';
      s.textContent = symbols[i % symbols.length];
      s.style.left = rand(left[0], left[1]).toFixed(2) + '%';
      s.style.top = rand(top[0], top[1]).toFixed(2) + '%';
      s.style.fontSize = rand(size[0], size[1]).toFixed(1) + 'px';
      if (colors.length) s.style.color = colors[i % colors.length];
      if (opts.opacity != null) s.style.opacity = opts.opacity;
      s.style.animation =
        'mqp-' + anim + ' ' + rand(dur[0], dur[1]).toFixed(2) + 's linear ' +
        rand(del[0], del[1]).toFixed(2) + 's infinite';
      container.appendChild(s);
      nodes.push(s);
    }
    return nodes;
  }

  // 庆祝撒花(从顶部下落 emoji)
  function confetti(container, opts) {
    opts = opts || {};
    opts.symbols = opts.symbols || ['🎉', '✨', '⭐', '💫', '🌟'];
    opts.anim = 'fall';
    opts.count = opts.count || 24;
    opts.top = opts.top || [-8, 0];
    opts.duration = opts.duration || [3, 5.5];
    return spawn(container, opts);
  }

  // 星光闪烁(原地呼吸)
  function sparkle(container, opts) {
    opts = opts || {};
    opts.symbols = opts.symbols || ['✦', '✧', '★'];
    opts.anim = 'twinkle';
    opts.count = opts.count || 14;
    opts.duration = opts.duration || [2, 4];
    opts.colors = opts.colors || ['#ffe8b0', '#f0c060', '#b89fff'];
    return spawn(container, opts);
  }

  // 粒子上升
  function rise(container, opts) {
    opts = opts || {};
    opts.symbols = opts.symbols || ['✦'];
    opts.anim = 'rise';
    opts.count = opts.count || 18;
    opts.top = opts.top || [85, 100];
    opts.duration = opts.duration || [4, 7];
    opts.colors = opts.colors || ['#f0c060', '#ffe8b0'];
    return spawn(container, opts);
  }

  return { spawn: spawn, confetti: confetti, sparkle: sparkle, rise: rise };
})();
