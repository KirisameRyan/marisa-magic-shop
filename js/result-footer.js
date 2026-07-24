// =============================================
//  霧雨魔法店 · 结果页底部组件
//  用法: resultFooterHTML() 返回 HTML 字符串
//  直接拼入各页面的 result 渲染中
// =============================================

function resultFooterHTML(options) {
  options = options || {};
  var qqImg = options.qqImg || 'images/qq-group.jpg';
  var qqGroup = options.qqGroup || '702973928';
  var extra = options.extra || '';
  var notice = options.notice || '霧雨魔法店 · 数据仅供娱乐';
  return '<div class="qq-section">'+
    '<img src="'+qqImg+'" alt="QQ群二维码" onerror="this.style.display=\'none\'">'+
    '<p><strong style="color:var(--gold);">加群一起玩</strong><br>群号 '+qqGroup+' · 更多抽象好活</p>'+
    '</div>'+
    '<p style="font-size:11px;text-align:center;margin-top:8px;"><a href="https://space.bilibili.com/1029138222" target="_blank" style="color:var(--pink);text-decoration:none;">🅱 关注B站 · 霧雨魔法店</a></p>'+
    extra+
    '<p class="notice">'+notice+'</p>';
}
