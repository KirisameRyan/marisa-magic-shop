// =============================================
//  霧雨魔法店 · Canvas 工具函数
//  用于海报/卡片生成
// =============================================

function loadImg(src) {
  return new Promise(function(resolve) {
    if (!src) { resolve(null); return; }
    var im = new Image();
    im.onload = function() { resolve(im); };
    im.onerror = function() { resolve(null); };
    im.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawQRBox(ctx, img, x, y, qs, label, sub, accent) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, x - 7, y - 7, qs + 14, qs + 14, 12);
  ctx.fill();
  ctx.textAlign = 'center';
  if (img) {
    ctx.drawImage(img, x, y, qs, qs);
  } else {
    ctx.fillStyle = '#1a1520';
    ctx.font = '13px sans-serif';
    ctx.fillText('扫码区', x + qs / 2, y + qs / 2);
  }
  ctx.fillStyle = accent;
  ctx.font = '600 15px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(label, x + qs / 2, y + qs + 30);
  ctx.fillStyle = '#8a7e9a';
  ctx.font = '12px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(sub, x + qs / 2, y + qs + 50);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  var line = '', lines = [];
  for (var i = 0; i < text.length; i++) {
    var test = line + text[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = text[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  for (var j = 0; j < lines.length; j++) {
    ctx.fillText(lines[j], x, y + j * lh);
  }
}

function wrapToLines(ctx, text, maxW) {
  var line = '', out = [];
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (ctx.measureText(line + ch).width > maxW && line) {
      out.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) out.push(line);
  return out;
}
