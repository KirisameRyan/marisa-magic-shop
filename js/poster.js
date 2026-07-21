// =============================================
//  霧雨魔法店 · 分享海报框架 MQ.poster
//  依赖: js/canvas-utils.js (loadImg/roundRect/drawQRBox/wrapText)
//  用法:
//    var pad = MQ.poster.frame(ctx, W, H, {accent:'#f0c060'});
//    ... 画自己的内容 ...
//    await MQ.poster.qrPair(ctx, W, y, qs);
//    MQ.poster.finish(canvas);
//  常量: SITE_URL / QR_IMG / QQ_IMG / QQ_GROUP / FONT
// =============================================
window.MQ = window.MQ || {};

MQ.poster = {
  SITE_URL: 'www.azureflame.cloud',
  QR_IMG: 'images/qr-code.png',
  QQ_IMG: 'images/qq-group.png',
  QQ_GROUP: '702973928',
  FONT: '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif',

  // 标准海报框架:深底 + 斜向渐变罩 + 圆角卡片 + 顶部渐变条
  // 返回 pad(内容安全边距)
  frame: function(ctx, W, H, opts) {
    opts = opts || {};
    var pad = (opts.pad != null) ? opts.pad : 36;
    var accent = opts.accent || '#f0c060';
    var accent2 = opts.accent2 || '#b89fff';
    ctx.fillStyle = opts.bg || '#1a1520';
    ctx.fillRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(176,159,255,.10)');
    g.addColorStop(1, 'rgba(240,192,96,.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = opts.card || '#241e2a';
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, opts.radius || 28);
    ctx.fill();
    var bar = ctx.createLinearGradient(pad, 0, W - pad, 0);
    bar.addColorStop(0, accent);
    bar.addColorStop(0.5, accent2);
    bar.addColorStop(1, accent);
    ctx.fillStyle = bar;
    roundRect(ctx, pad, pad, W - pad * 2, 6, 3);
    ctx.fill();
    return pad;
  },

  // 底部双二维码(站码 + QQ群),居中排布
  // 返回实际占用的总高度(含标签),便于排版
  qrPair: async function(ctx, W, y, qs, opts) {
    opts = opts || {};
    var gap = opts.gap || 46;
    var totalW = qs * 2 + gap;
    var leftX = (W - totalW) / 2;
    var siteImg = await loadImg(opts.qrImg || MQ.poster.QR_IMG);
    var qqImg = await loadImg(opts.qqImg || MQ.poster.QQ_IMG);
    drawQRBox(ctx, siteImg, leftX, y, qs, opts.siteLabel || '扫码开测', MQ.poster.SITE_URL, opts.accent || '#f0c060');
    drawQRBox(ctx, qqImg, leftX + qs + gap, y, qs, opts.qqLabel || '加 QQ 群', '群号 ' + MQ.poster.QQ_GROUP, opts.accent2 || '#b89fff');
    if (opts.bilibili !== false) {
      ctx.fillStyle = '#8a7e9a';
      ctx.font = '11px ' + MQ.poster.FONT;
      ctx.textAlign = 'center';
      ctx.fillText('B站: bilibili.com/1029138222', W / 2, y + qs + 62);
    }
    return qs + 62;
  },

  // 海报屏 HTML 脚手架(poster-wrap + loading + img + 下载按钮)
  screenHTML: function(opts) {
    opts = opts || {};
    return '<div class="poster-wrap">' +
      '<div class="result-title" style="font-size:14px;color:var(--muted);margin-bottom:14px;">长按图片保存 / 分享</div>' +
      '<img class="poster-img" id="posterImg" alt="分享海报" style="display:none;">' +
      '<div class="loading-wrap" id="posterLoading"><div class="loading-orb"></div><p class="loading-text">正在生成海报…</p></div>' +
      '<p class="poster-hint">手机长按上图即可保存到相册；电脑可点下方按钮下载。</p>' +
      '<a class="btn btn-main" id="posterDl" download="' + (opts.filename || 'poster.png') + '" style="display:none;">⬇️ 下载海报</a>' +
      (opts.backHTML || '') +
      '</div>';
  },

  // 生成收尾:toDataURL → 显示 img / 下载按钮,隐藏 loading
  // 导出失败时把 canvas 直接塞进页面兜底
  finish: function(cv, opts) {
    opts = opts || {};
    var pi = document.getElementById(opts.imgId || 'posterImg');
    var pl = document.getElementById(opts.loadingId || 'posterLoading');
    var dl = document.getElementById(opts.dlId || 'posterDl');
    var dataUrl = null;
    try { dataUrl = cv.toDataURL('image/png'); } catch (e) {}
    if (pl) pl.style.display = 'none';
    if (dataUrl) {
      if (pi) { pi.src = dataUrl; pi.style.display = 'block'; }
      if (dl) { dl.href = dataUrl; dl.style.display = 'inline-flex'; }
    } else if (pi && pi.parentNode) {
      cv.className = 'poster-img';
      cv.style.display = 'block';
      pi.parentNode.replaceChild(cv, pi);
      var hint = document.querySelector('.poster-hint');
      if (hint) hint.textContent = '当前环境无法导出图片,可截图保存。';
    }
    return dataUrl;
  }
};
