// =============================================
//  霧雨魔法店 · 结果页底部组件
//  用法: resultFooterHTML() 返回 HTML 字符串
//  直接拼入各页面的 result 渲染中
// =============================================

// ── 热门测试池(玩玩别的按钮随机跳转)──
var HOT_TESTS = ['waifu-test.html', 'quiz-animal.html', 'quiz-lolicon.html', 'quiz-internet.html', 'pig-test.html', 'quiz-region.html'];

// 随机跳转到另一个热门测试(排除当前页)
function playOtherGo() {
  var cur = (window.location.pathname.split('/').pop() || '').toLowerCase();
  var pool = HOT_TESTS.filter(function(h) { return h.toLowerCase() !== cur; });
  if (!pool.length) pool = HOT_TESTS;
  window.location.href = pool[Math.floor(Math.random() * pool.length)];
}

function resultFooterHTML(options) {
  options = options || {};
  var qqImg = options.qqImg || 'images/qq-group.jpg';
  var extra = options.extra || '';
  var notice = options.notice || '霧雨魔法店 · 数据仅供娱乐';
  return '<div class="qq-section">'+
    '<a href="https://space.bilibili.com/1029138222" target="_blank" style="display:block;text-decoration:none;">'+
      '<img src="'+qqImg+'" alt="B站频道" style="border-radius:14px;" onerror="this.style.display=\'none\'">'+
      '<p style="margin-top:10px;"><strong style="color:var(--pink);">关注B站 · 霧雨魔法店</strong><br>space.bilibili.com/1029138222 · 更多抽象好活</p>'+
    '</a>'+
    '</div>'+
    '<button class="btn btn-ghost" style="max-width:280px;margin:8px auto 0;display:block;" onclick="playOtherGo()">🎮 玩玩别的？</button>'+
    extra+
    '<p class="notice">'+notice+'</p>';
}
