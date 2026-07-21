// =============================================
//  霧雨魔法店 · SVG 雷达图 MQ.radar
//  用法:
//    html += MQ.radar(vec, {
//      labels: ['维度A','维度B',...],
//      color: '#f0c060',
//      radius: 80,          // 可选
//      width: 280, height: 252  // 可选
//    });
//  收编自 quiz-hometown / quiz-anime-world / quiz-internet-identity
//  三份逐行雷同的 buildRadar()
// =============================================
window.MQ = window.MQ || {};

MQ.radar = function(uv, opts) {
  opts = opts || {};
  var n = uv.length;
  var W = opts.width || 280;
  var H = opts.height || 252;
  var cx = (opts.cx != null) ? opts.cx : W / 2;
  var cy = (opts.cy != null) ? opts.cy : H / 2 - 2;
  var R = opts.radius || 80;
  var LB = (opts.labelGap != null) ? opts.labelGap : 22;
  var color = opts.color || '#f0c060';
  var labels = opts.labels || [];
  var rings = opts.rings || [0.25, 0.5, 0.75, 1];
  var showValues = opts.showValues !== false;
  var labelColor = opts.labelColor || 'var(--muted)';
  var gridColor = opts.gridColor || 'var(--border)';
  var svgClass = opts.className ? ' class="' + opts.className + '"' : '';

  // 负值整体平移,再按最大值归一
  var minv = Math.min.apply(null, uv);
  var shifted = uv.slice();
  if (minv <= 0) {
    var offset = Math.abs(minv) + 1;
    for (var i = 0; i < shifted.length; i++) shifted[i] += offset;
  }
  var maxv = Math.max.apply(null, shifted.concat([1]));

  function pt(i, r) {
    var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  }

  var svg = '<svg' + svgClass + ' viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';

  // 网格环
  for (var g = 0; g < rings.length; g++) {
    var rp = [];
    for (var i = 0; i < n; i++) {
      var p = pt(i, R * rings[g]);
      rp.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
    }
    svg += '<polygon points="' + rp.join(' ') + '" fill="none" stroke="' + gridColor + '" stroke-width="1" opacity="' + (g === rings.length - 1 ? 0.9 : 0.45) + '"/>';
  }

  // 轴线 + 标签
  for (var i = 0; i < n; i++) {
    var e = pt(i, R);
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '" stroke="' + gridColor + '" stroke-width="1" opacity="0.45"/>';
    if (labels[i]) {
      var lp = pt(i, R + LB);
      var anc = Math.abs(lp[0] - cx) < 8 ? 'middle' : (lp[0] > cx ? 'start' : 'end');
      svg += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] - 1).toFixed(1) + '" fill="' + labelColor + '" font-size="9" text-anchor="' + anc + '">' + labels[i] + '</text>';
      if (showValues) {
        svg += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 10).toFixed(1) + '" fill="' + color + '" font-size="10" font-weight="700" text-anchor="' + anc + '">' + Math.round(uv[i]) + '</text>';
      }
    }
  }

  // 数据多边形 + 顶点
  var dp = [];
  for (var i = 0; i < n; i++) {
    var p = pt(i, (shifted[i] / maxv) * R);
    dp.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
  }
  svg += '<polygon points="' + dp.join(' ') + '" fill="' + color + '" fill-opacity="0.2" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>';
  for (var i = 0; i < n; i++) {
    var p = pt(i, (shifted[i] / maxv) * R);
    svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + color + '"/>';
  }

  return svg + '</svg>';
};
