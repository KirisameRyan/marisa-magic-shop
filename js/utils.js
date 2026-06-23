// =============================================
//  霧雨魔法店 · 通用工具函数
// =============================================

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function copyToClipboard(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      alert(successMsg || '已复制！发给朋友试试 😈');
    }).catch(function() {
      prompt('复制这段文字发给朋友：', text);
    });
  } else {
    prompt('复制这段文字发给朋友：', text);
  }
}
