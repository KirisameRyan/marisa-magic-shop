// =============================================
//  霧雨魔法店 · 服务端统计
//  用法:
//    trackStart('quizname_take');        // 记录一次测试开始
//    trackFooled('quizname_fooled');    // 记录一次被忽悠
//    getCount('quizname_take', fn);     // 读取已有测试人数
//    getTypeStats('quizname_type_', fn) // 读取各类型计数
// =============================================

function trackStart(egg) {
  if (!egg) return;
  fetch('api/counter.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'egg=' + encodeURIComponent(egg)
  }).catch(function(){});
}

function trackFooled(egg) {
  if (!egg) return;
  fetch('api/counter.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'egg=' + encodeURIComponent(egg)
  }).catch(function(){});
}

function getCount(egg, callback) {
  if (!egg || !callback) return;
  fetch('api/readcount.php?egg=' + encodeURIComponent(egg))
    .then(function(r) { return r.json(); })
    .then(function(d) { callback(d.count || 0); })
    .catch(function(){});
}

function getTypeStats(prefix, callback) {
  if (!prefix || !callback) return;
  fetch('api/readcount.php?prefix=' + encodeURIComponent(prefix))
    .then(function(r) { return r.json(); })
    .then(function(d) { callback(d); })
    .catch(function(){});
}
