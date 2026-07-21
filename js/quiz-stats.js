// =============================================
//  霧雨魔法店 · 服务端统计
//  用法:
//    trackStart('quizname_take');            // 记录一次测试开始
//    trackFooled('quizname_fooled');         // 记录一次被忽悠
//    getCount('quizname_take', fn);          // 读取已有测试人数
//    getTypeStats('quizname_type_', fn);     // 读取各类型计数
//    fmtCount(12345)                         // 数字格式化 → '1.2万'
//    animateCount(el, 1234)                  // 数字滚动动画
//    bindCount('#takeCount', key, opts)      // 人数显示一行绑定(推荐)
// =============================================

// ── 计数缓存(同页内避免重复请求)──
var _countCache = {};

// ── 内部:POST 计数 ──
function _trackPost(egg) {
  if (!egg) return;
  fetch('api/counter.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'egg=' + encodeURIComponent(egg)
  }).catch(function(){});
  // 计数已变,清掉本页缓存,下次读取拉新值
  delete _countCache[egg];
}

function trackStart(egg) { _trackPost(egg); }

function trackFooled(egg) { _trackPost(egg); }

function getCount(egg, callback) {
  if (!egg || !callback) return;
  if (Object.prototype.hasOwnProperty.call(_countCache, egg)) {
    callback(_countCache[egg]);
    return;
  }
  fetch('api/readcount.php?egg=' + encodeURIComponent(egg))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var n = parseInt(d && d.count, 10) || 0;
      _countCache[egg] = n;
      callback(n);
    })
    .catch(function(){ /* 静默失败:离线或接口异常时不显示 */ });
}

function getTypeStats(prefix, callback) {
  if (!prefix || !callback) return;
  fetch('api/readcount.php?prefix=' + encodeURIComponent(prefix))
    .then(function(r) { return r.json(); })
    .then(function(d) { callback(d); })
    .catch(function(){});
}

// ── 数字格式化:12345 → '1.2万',8888 → '8,888' ──
function fmtCount(n) {
  n = parseInt(n, 10) || 0;
  if (n >= 10000) return (Math.round(n / 1000) / 10) + '万';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── 数字滚动动画(尊重 prefers-reduced-motion)──
function animateCount(el, target, duration) {
  if (!el) return;
  target = parseInt(target, 10) || 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || target <= 0) { el.textContent = fmtCount(target); return; }
  var t0 = null;
  duration = duration || 800;
  function step(ts) {
    if (!t0) t0 = ts;
    var p = Math.min((ts - t0) / duration, 1);
    var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = fmtCount(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── 人数显示一行绑定 ──
// bindCount('#takeCount', TRACK_KEY, {template:'已有 {n} 人测过！', animate:true})
// 计数为 0 或接口异常时不触碰元素(保持占位/隐藏),数字滚动入场
function bindCount(elOrId, egg, opts) {
  var el = (typeof elOrId === 'string')
    ? document.getElementById(elOrId.replace(/^#/, ''))
    : elOrId;
  if (!el || !egg) return;
  opts = opts || {};
  var template = opts.template || '已有 {n} 人测过！';
  getCount(egg, function(n) {
    if (n <= 0) return;
    var parts = template.split('{n}');
    var prefix = parts[0], suffix = parts.length > 1 ? parts.slice(1).join('{n}') : '';
    if (opts.animate === false) {
      el.textContent = prefix + fmtCount(n) + suffix;
      return;
    }
    el.innerHTML = '';
    el.appendChild(document.createTextNode(prefix));
    var num = document.createElement('span');
    el.appendChild(num);
    el.appendChild(document.createTextNode(suffix));
    animateCount(num, n, opts.duration);
  });
}
