/* Exchange extras: announcement button in the header + 04:00 settlement countdown. */
(function () {
  'use strict';
  var API = 'api/exchange.php?route=overview';
  var POLL = 10000;
  var $ = function (sel) { return document.querySelector(sel); };
  var current = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function ensureButton() {
    if ($('#v3-announce')) return;
    var home = $('#home-open');
    if (!home || !home.parentElement) return;
    var b = document.createElement('button');
    b.id = 'v3-announce';
    b.className = 'theme-toggle';
    b.textContent = '更新公告';
    b.hidden = true;
    b.style.cssText = 'border-color:#7a3b3b;color:#ffb4a8';
    b.onclick = openDialog;
    home.parentElement.insertBefore(b, home.nextSibling);
  }

  function openDialog() {
    if (!current) return;
    var dlg = $('#v3-announce-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'v3-announce-dialog';
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = '<h2>' + esc(current.title) + '</h2><p>' + esc(current.body) + '</p>' +
      '<button id="v3-announce-close" class="submit-order">知道了</button>';
    var close = $('#v3-announce-close');
    if (close) close.onclick = function () { dlg.close(); };
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  function render(d) {
    ensureButton();
    var btn = $('#v3-announce');
    current = d.announcement || null;
    if (btn) btn.hidden = !current;

    var el = $('#v3-banner');
    var now = Date.now();
    var m = d.maintenance;
    if (m && m.until > now) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'v3-banner';
        el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
        document.body.appendChild(el);
      }
      var left = Math.max(0, Math.ceil((m.until - now) / 1000));
      el.style.display = 'block';
      el.innerHTML = '<div style="background:linear-gradient(90deg,#3a2d12,#6b5220);color:#ffe9b8;padding:10px 18px;text-align:center;' +
        'border-bottom:1px solid #8a6b2a">日终结算中 · 交易所暂停撮合，约 <b>' + left + '</b> 秒后开盘</div>';
      document.body.style.paddingTop = '42px';
      return;
    }
    if (el) el.style.display = 'none';
    document.body.style.paddingTop = '';
  }

  function tick() {
    fetch(API, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) render(d); })
      .catch(function () {});
  }

  function init() {
    ensureButton();
    tick();
    setInterval(tick, POLL);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
