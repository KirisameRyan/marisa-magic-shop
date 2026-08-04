// =============================================
//  霧雨魔法店 · 主页渲染器
//  从 js/catalog.js 生成货架 + 搜索过滤
// =============================================
(function() {
  function cardHTML(item) {
    return '<a href="' + item.href + '" class="card card-' + item.color + '" data-search="' +
      (item.name + ' ' + item.tag + ' ' + item.desc).replace(/"/g, '&quot;') + '">' +
      '<div class="icon">' + item.emoji + '</div>' +
      '<div class="tag">' + item.tag + '</div>' +
      '<h3>' + item.name + '</h3>' +
      '<p class="desc">' + item.desc + '</p></a>';
  }

  function shelfHTML(icon, title, items, collapsible, anchorId) {
    var cards = '';
    for (var i = 0; i < items.length; i++) cards += cardHTML(items[i]);
    var anchor = anchorId ? ' id="' + anchorId + '"' : '';
    if (collapsible) {
      return '<div class="shelf"' + anchor + ' data-shelf>' +
        '<div class="shelf-title" onclick="toggleMore()" style="cursor:pointer;"><span class="shelf-icon">' + icon + '</span> ' + title +
        '<span class="shelf-count">' + items.length + ' 件</span><span style="margin-left:8px;font-size:16px;" id="moreArrow">▸</span></div>' +
        '<div class="cards" id="moreCards" style="display:none;">' + cards + '</div></div>';
    }
    return '<div class="shelf"' + anchor + ' data-shelf>' +
      '<div class="shelf-title"><span class="shelf-icon">' + icon + '</span> ' + title +
      '<span class="shelf-count">' + items.length + ' 件</span></div>' +
      '<div class="cards">' + cards + '</div></div>';
  }

  function render() {
    var cat = window.MMS_CATALOG;
    if (!cat) return false;
    var box = document.getElementById('shelves');
    if (!box) return true;
    var html = '';
    html += shelfHTML('🎮', '玩玩小游戏', cat.games, false, 'games');
    html += shelfHTML('🔥', '热门测试', cat.hot);
    html += shelfHTML('🆕', '最新上线', cat.latest);
    html += shelfHTML('📚', '更多测试', cat.more, true);
    html += shelfHTML('🧰', '实用工具', cat.tools);
    box.innerHTML = html;
    return true;
  }

  if (!render()) {
    var tries = 0;
    var timer = setInterval(function() {
      tries++;
      if (render() || tries > 60) clearInterval(timer);
    }, 50);
  }

  // ═══════ 搜索过滤 ═══════
  function onSearch() {
    var kw = document.getElementById('homeSearch').value.trim().toLowerCase();
    var shelves = document.querySelectorAll('[data-shelf]');
    var any = false;
    for (var i = 0; i < shelves.length; i++) {
      var cards = shelves[i].querySelectorAll('.card');
      var shown = 0;
      for (var j = 0; j < cards.length; j++) {
        var hit = !kw || cards[j].getAttribute('data-search').toLowerCase().indexOf(kw) !== -1;
        cards[j].style.display = hit ? '' : 'none';
        if (hit) shown++;
      }
      shelves[i].style.display = shown ? '' : 'none';
      if (shown) any = true;
    }
    var empty = document.getElementById('searchEmpty');
    if (empty) empty.style.display = any ? 'none' : 'block';
  }
  window.addEventListener('load', function() {
    var input = document.getElementById('homeSearch');
    if (input) input.addEventListener('input', onSearch);
  });
})();

function toggleMore() {
  var cards = document.getElementById('moreCards');
  var arrow = document.getElementById('moreArrow');
  if (cards && arrow) {
    if (cards.style.display === 'none') {
      cards.style.display = 'flex';
      arrow.textContent = '▾';
    } else {
      cards.style.display = 'none';
      arrow.textContent = '▸';
    }
  }
}
