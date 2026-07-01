// ═══════════════════════════════════════
//  魔理沙快跑 · 霧雨魔法店
//  三通道飞行跑酷游戏
// ═══════════════════════════════════════
(function(){

var cv = document.getElementById('game');
var ctx = cv.getContext('2d');
var W = 960, H = 480;
var GROUND_Y = 360;
var LANE_Y = [80, 240, 400];
var GRAZE_MARGIN = 30;
var SWITCH_COOLDOWN = 20;

// ═══════════ 素材 ═══════════
var assets = {};
function loadImage(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('Failed: ' + src)); };
    img.src = src;
  });
}
function preloadAll() {
  var base = 'images/sprites/';
  return Promise.all([
    loadImage(base + 'marisa_run1.png').then(function(i) { assets.run1 = i; }),
    loadImage(base + 'marisa_run2.png').then(function(i) { assets.run2 = i; }),
    loadImage(base + 'marisa_run3.png').then(function(i) { assets.run3 = i; }),
    loadImage(base + 'marisa_run4.png').then(function(i) { assets.run4 = i; }),
    loadImage(base + 'marisa_dash1.png').then(function(i) { assets.dash1 = i; }),
    loadImage(base + 'marisa_dash2.png').then(function(i) { assets.dash2 = i; }),
    loadImage(base + 'marisa_dash3.png').then(function(i) { assets.dash3 = i; }),
    loadImage(base + 'marisa_dash4.png').then(function(i) { assets.dash4 = i; }),
    loadImage(base + 'reimu_run0.png').then(function(i) { assets.re_run0 = i; }),
    loadImage(base + 'reimu_run1.png').then(function(i) { assets.re_run1 = i; }),
    loadImage(base + 'reimu_run2.png').then(function(i) { assets.re_run2 = i; }),
    loadImage(base + 'reimu_run3.png').then(function(i) { assets.re_run3 = i; }),
    loadImage(base + 'reimu_dash0.png').then(function(i) { assets.re_dash0 = i; }),
    loadImage(base + 'reimu_dash1.png').then(function(i) { assets.re_dash1 = i; }),
    loadImage(base + 'reimu_dash2.png').then(function(i) { assets.re_dash2 = i; }),
    loadImage(base + 'mogu.png').then(function(i) { assets.mogu = i; }),
    loadImage(base + 'yaojing.png').then(function(i) { assets.yaojing = i; }),
    loadImage(base + 'beijing.jpeg').then(function(i) { assets.bg = i; }),
  ]);
}
var runFrames = [], dashFrames = [];
var reimuRunFrames = [], reimuDashFrames = [];
function setupFrames() {
  runFrames  = [assets.run1, assets.run2, assets.run3, assets.run4];
  dashFrames = [assets.dash1, assets.dash2, assets.dash3, assets.dash4];
  reimuRunFrames  = [assets.re_run0, assets.re_run1, assets.re_run2, assets.re_run3];
  reimuDashFrames = [assets.re_dash0, assets.re_dash1, assets.re_dash2];
}

// ═══════════ 音效 ═══════════
var audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function playTone(freq, dur, type, vol, sweep) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (sweep) osc.frequency.linearRampToValueAtTime(sweep, t + dur);
  gain.gain.setValueAtTime((vol || 0.08), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}
function sfxSwitch()     { playTone(400, 0.06, 'sine', 0.06, 800); }
function sfxGraze()      { playTone(800, 0.06, 'sine', 0.1); playTone(1200, 0.04, 'sine', 0.06); }
function sfxDash()       { playTone(200, 0.2, 'sawtooth', 0.08, 900); playTone(80, 0.15, 'triangle', 0.04); }
function sfxHit()        { playTone(60, 0.25, 'triangle', 0.15); playTone(40, 0.3, 'sawtooth', 0.08); }
function sfxCombo()      { playTone(500,0.06,'square',0.08); setTimeout(function(){playTone(700,0.06,'square',0.08)},60); setTimeout(function(){playTone(900,0.08,'square',0.1)},120); }
function sfxStar()       { playTone(600,0.06,'sine',0.08); playTone(900,0.06,'sine',0.06); playTone(1200,0.08,'sine',0.05); }

// ═══════════ 游戏状态 ═══════════
var gameState = 'loading';
var playerChar = 'marisa';
var CHAR = {
  marisa: { vW:110, vH:98, cW:44, cH:52, dashMax:210, maxCharges:3, switchCD:20, scoreRate:1.2, grazeM:36 },
  reimu:  { vW:92, vH:86, cW:36, cH:40, dashMax:270, maxCharges:4, switchCD:16, scoreRate:1.0, grazeM:42 }
};
var score = 0, bestScore = 0, bestGraze = 0;
var speed = 5, frameCount = 0;
var preDashSpeed = 5;
var lastTs = 0, dt = 1;
var obstacleTimer = 0, powerUpTimer = 0, heartTimer = 0;
var grazeStreak = 0, maxGrazeStreak = 0, totalGraze = 0;
var lastObstacleTime = 0;
var deathFlash = 0;
var posHistory = [];
var dashTimer = 0, dashMax = 210;
var dashCharges = 0, maxDashCharges = 3;
var lives = 3, maxLives = 5, invTimer = 0;
var hearts = [];
var player = {
  x: 100, lane: 1, targetY: 240, visualW: 110, visualH: 98,
  colW: 40, colH: 48, switchCooldown: 0, animState: 'run'
};
var laneObstacles = [[], [], []];
var powerUps = [];
var particles = [];
var floatingTexts = [];
var bgScroll = 0;

var keys = {};

// ═══════════ 存储 ═══════════
function loadBest() {
  bestScore = parseInt(localStorage.getItem('marisa_runner_best') || '0');
  bestGraze = parseInt(localStorage.getItem('marisa_runner_graze') || '0');
}
function saveBest() {
  if (Math.floor(score) > bestScore) { bestScore = Math.floor(score); localStorage.setItem('marisa_runner_best', bestScore); }
  if (maxGrazeStreak > bestGraze) { bestGraze = maxGrazeStreak; localStorage.setItem('marisa_runner_graze', bestGraze); }
}

// ═══════════ 输入 ═══════════
function getPlayerCenterX() { return player.x + player.visualW / 2; }
function getPlayerCenterY() { return player.targetY; }
function getPlayerHitbox() {
  var left = player.x + (player.visualW - player.colW) / 2;
  var top  = player.targetY - player.colH / 2;
  return { x: left, y: top, w: player.colW, h: player.colH };
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'w' || e.key === 's' || e.key === 'W' || e.key === 'S') e.preventDefault();
  if (!e.repeat && (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ')) switchLane(-1);
  if (!e.repeat && (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')) switchLane(1);
  if (e.key === 'x' || e.key === 'X' || e.key === 'Shift') { e.preventDefault(); activateDASH(); }
  keys[e.key] = true;
  initAudio();
});
document.addEventListener('keyup', function(e) { keys[e.key] = false; });
cv.addEventListener('touchstart', function(e) { e.preventDefault(); });

var btnU = document.getElementById('btnUp'), btnD = document.getElementById('btnDown'), btnDash = document.getElementById('btnDASH'), btnStart = document.getElementById('btnStart');
btnU.addEventListener('pointerdown', function(e) { switchLane(-1); initAudio(); e.preventDefault(); });
btnD.addEventListener('pointerdown', function(e) { switchLane(1); initAudio(); e.preventDefault(); });
btnDash.addEventListener('pointerdown', function(e) { activateDASH(); initAudio(); e.preventDefault(); });

// ═══════════ UI ═══════════
function updateScoreDisplay() {
  document.getElementById('score').textContent = String(Math.floor(score)).padStart(5, '0');
  document.getElementById('best').textContent = 'HI ' + String(bestScore).padStart(5, '0');
  document.getElementById('grazeCount').textContent = '擦弹 ' + totalGraze;
  var badge = document.getElementById('comboBadge');
  var gs = grazeStreak;
  if (gs >= 3) {
    badge.classList.add('show');
    badge.textContent = '擦弹 ×' + gs + ' (+' + (gs*5) + ')';
    if (gs >= 30) badge.style.color = '#ff6b6b';
    else if (gs >= 15) badge.style.color = '#b89fff';
    else badge.style.color = '#ffd700';
  } else badge.classList.remove('show');
  var dashInd = document.getElementById('dashInd');
  if (dashTimer > 0) { dashInd.textContent = '⚡ DASH'; dashInd.classList.add('active'); }
  else if (dashCharges > 0) { dashInd.textContent = '⚡ ×' + dashCharges; dashInd.classList.add('active'); dashInd.style.color = '#ffd700'; }
  else { dashInd.classList.remove('active'); }
}

// ═══════════ 游戏流程 ═══════════
function startGame() {
  var c = CHAR[playerChar];
  score = 0; speed = 5; frameCount = 0;
  preDashSpeed = 5;
  obstacleTimer = 0; powerUpTimer = 0; heartTimer = 0;
  grazeStreak = 0; maxGrazeStreak = 0; totalGraze = 0;
  lastObstacleTime = 0; deathFlash = 0;
  player.lane = 1; player.targetY = LANE_Y[1]; player.switchCooldown = 0; player.animState = 'run';
  player.visualW = c.vW; player.visualH = c.vH;
  player.colW = c.cW; player.colH = c.cH;
  dashMax = c.dashMax; maxDashCharges = c.maxCharges;
  SWITCH_COOLDOWN = c.switchCD; GRAZE_MARGIN = c.grazeM;
  dashTimer = 0; posHistory = []; lives = 3; invTimer = 0; hearts = []; dashCharges = 0;
  laneObstacles = [[], [], []]; particles = []; floatingTexts = []; powerUps = [];
  gameState = 'playing';
  document.getElementById('startOverlay').classList.add('hide');
  document.getElementById('lbArea').innerHTML = '';
  document.getElementById('lbArea').classList.add('hide');
  document.getElementById('qqOverlay').classList.add('hide');
  updateScoreDisplay();
}

function endGame() {
  gameState = 'over'; deathFlash = 18; saveBest();
  spawnParticles(getPlayerCenterX(), getPlayerCenterY(), '#ef4444', 30, 2, 8);
  sfxHit();
  document.getElementById('startOverlay').classList.remove('hide');
  document.getElementById('startOverlay').querySelector('h1').textContent = '💥 撞了！';
  document.getElementById('startOverlay').querySelector('.btn-start').textContent = '🔄 再来一次';
  // 排行榜
  var finalScore = Math.floor(score);
  document.getElementById('startOverlay').querySelector('p').innerHTML =
    '得分 <b style="color:#f0c060">' + finalScore + '</b> 分<br>' +
    '擦弹 <b style="color:#ffd700">' + totalGraze + '</b> 次 | 最高连击 <b style="color:#ff6b6b">' + maxGrazeStreak + '</b><br>' +
    '历史最高 <b style="color:#f0c060">' + bestScore + '</b> 分';
  // 拉取排行榜
  loadLB(finalScore);
  document.getElementById('qqOverlay').classList.remove('hide');
}

// ═══════════ 排行榜 ═══════════
var lastFinalScore = 0;

function loadLB(finalScore) {
  lastFinalScore = finalScore;
  var lbArea = document.getElementById('lbArea');
  lbArea.classList.remove('hide');
  lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:13px;">⏳ 加载排行榜...</p>';

  fetch('api/leaderboard.php')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rank = checkRank(finalScore, data);
      renderLB(lbArea, data, rank, finalScore);
    })
    .catch(function() {
      lbArea.innerHTML = '<p style="color:#8a7e9a;font-size:12px;">排行榜暂不可用</p>';
    });
}

function checkRank(score, data) {
  for (var i = 0; i < data.length; i++) {
    if (score > data[i].score) return i + 1;
  }
  return data.length < 20 ? data.length + 1 : 0;
}

function renderLB(area, data, rank, score) {
  var html = '<div class="lb-wrap">';
  if (rank > 0) {
    html += '<div class="lb-submit">';
    html += '<input id="lbName" class="lb-input" maxlength="12" placeholder="输入昵称（最多12字）">';
    html += '<button id="lbSubmit" class="lb-btn">提交</button>';
    html += '<button id="lbSkip" class="lb-btn-ghost">跳过</button>';
    html += '</div>';
  } else if (data.length >= 20) {
    html += '<p class="lb-note">你的得分未进入前20</p>';
  }
  html += '<div class="lb-toggle" id="lbToggle">📊 排行榜 ▸</div>';
  html += '<div class="lb-table-wrap" id="lbTableWrap" style="display:none;">';
  html += '<table class="lb-table"><thead><tr><th>#</th><th>名字</th><th>得分</th><th>擦弹</th><th>日期</th></tr></thead><tbody>';
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var rowRank = i + 1;
    var cls = (rank > 0 && rowRank === rank && d.score === score) ? ' class="lb-my"' : '';
    html += '<tr' + cls + '><td>' + rowRank + '</td><td>' + esc(d.name) + '</td><td>' + d.score + '</td><td>' + (d.graze||0) + '</td><td>' + (d.time||'') + '</td></tr>';
  }
  html += '</tbody></table></div></div>';
  area.innerHTML = html;

  // 折叠切换
  var toggle = document.getElementById('lbToggle');
  var wrap = document.getElementById('lbTableWrap');
  toggle.addEventListener('click', function() {
    var open = wrap.style.display !== 'none';
    wrap.style.display = open ? 'none' : 'block';
    toggle.textContent = open ? '📊 排行榜 ▸' : '📊 排行榜 ▾';
  });

  if (rank > 0) {
    document.getElementById('lbSubmit').addEventListener('click', function() { submitLB(area); });
    document.getElementById('lbSkip').addEventListener('click', function() { area.innerHTML = ''; area.classList.add('hide'); });
  }
}

function submitLB(area) {
  var nameEl = document.getElementById('lbName');
  var name = (nameEl.value || '').trim();
  if (!name || name.length > 12) { name = '魔理沙'; }
  var btn = document.getElementById('lbSubmit');
  btn.disabled = true; btn.textContent = '提交中...';

  var form = new FormData();
  form.append('name', name);
  form.append('score', String(lastFinalScore));
  form.append('graze', String(totalGraze));

  fetch('api/leaderboard.php', { method: 'POST', body: form })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.ok) {
        area.innerHTML = '<p class="lb-ok">✅ 提交成功！排名第 <b>' + res.rank + '</b></p>';
        loadLB(lastFinalScore);
        // 自动展开排行榜
        setTimeout(function() {
          var t = document.getElementById('lbToggle');
          var w = document.getElementById('lbTableWrap');
          if (t && w) { w.style.display = 'block'; t.textContent = '📊 排行榜 ▾'; }
        }, 300);
      } else {
        area.innerHTML = '<p class="lb-err">提交失败: ' + (res.error||'未知错误') + '</p>';
      }
    })
    .catch(function() {
      area.innerHTML = '<p class="lb-err">网络错误</p>';
    });
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════ 粒子 ═══════════
function spawnParticles(x, y, color, count, minR, maxR) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var spd = 1 + Math.random() * 5;
    particles.push({ x: x, y: y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2, life: 15 + Math.random() * 20, maxLife: 25, color: color, r: (minR||1)+Math.random()*((maxR||3)-(minR||1)) });
  }
}
function updateParticles() {
  for (var i = particles.length - 1; i >= 0; i--) { var p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; if (p.life <= 0) particles.splice(i, 1); }
}
function drawParticles() {
  for (var i = 0; i < particles.length; i++) { var p = particles[i]; ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// ═══════════ 浮动文字 ═══════════
function addScorePop(x, y, text, color) {
  floatingTexts.push({ x: x, y: y, text: text, color: color, life: 70, maxLife: 70, vy: -5, vx: (Math.random()-0.5)*1.5, scale: 1.6, type: 'score' });
}
function addLabelPop(x, y, text, color) {
  floatingTexts.push({ x: x, y: y, text: text, color: color, life: 95, maxLife: 95, vy: -2.2, vx: 0, scale: 0.6, type: 'label' });
}
function updateFloatingTexts() {
  for (var i = floatingTexts.length - 1; i >= 0; i--) {
    var ft = floatingTexts[i];
    ft.y += ft.vy; ft.x += ft.vx;
    ft.vy *= 0.97;
    if (ft.type === 'score') ft.scale = 1.6 - ((1 - ft.life/ft.maxLife) * 0.6);
    else ft.scale = 0.6 + ((1 - ft.life/ft.maxLife) * 0.6);
    ft.life--;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}
function drawFloatingTexts() {
  for (var i = 0; i < floatingTexts.length; i++) {
    var ft = floatingTexts[i];
    var p = ft.life / ft.maxLife;
    var alpha = p > 0.6 ? 1.0 : p / 0.6; // 前60%保持全不透明
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(ft.x, ft.y);
    ctx.scale(ft.scale, ft.scale);
    ctx.font = 'bold ' + (ft.type==='score'?18:14) + 'px sans-serif';
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
}

// ═══════════ 背景 ═══════════
function drawBackground() {
  if (assets.bg && assets.bg.complete) {
    var bgH = H;
    var bgW = (bgH / assets.bg.naturalHeight) * assets.bg.naturalWidth;
    bgScroll = (bgScroll + speed * 0.12 * dt) % bgW;
    var copies = Math.ceil(W / bgW) + 1;
    for (var c = 0; c < copies; c++) {
      ctx.drawImage(assets.bg, -bgScroll + c * bgW, 0, bgW, bgH);
    }
  } else {
    var phase = Math.floor(score / 1000);
    ctx.fillStyle = phase>=4?'#1a0404':(phase>=2?'#0d1117':'#0a0f1a');
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = 'rgba(10, 8, 18, 0.3)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(240,192,96,0.12)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0,160); ctx.lineTo(W,160); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,320); ctx.lineTo(W,320); ctx.stroke();
}

// ═══════════ 道具 ═══════════
function drawStarShape(cx, cy, r, innerR) {
  ctx.beginPath();
  for (var i = 0; i < 5; i++) {
    var outer = (i*4*Math.PI)/5 - Math.PI/2;
    var inner = outer + (2*Math.PI)/10;
    if (i===0) ctx.moveTo(cx+Math.cos(outer)*r, cy+Math.sin(outer)*r);
    else ctx.lineTo(cx+Math.cos(outer)*r, cy+Math.sin(outer)*r);
    ctx.lineTo(cx+Math.cos(inner)*(innerR||r*0.4), cy+Math.sin(inner)*(innerR||r*0.4));
  }
  ctx.closePath(); ctx.fill();
}
function drawPowerUps() {
  for (var i = 0; i < powerUps.length; i++) {
    var pu = powerUps[i];
    var py = pu.y + Math.sin(frameCount * 0.06 + i) * 4;
    ctx.globalAlpha = 0.2 + Math.sin(frameCount*0.1+i)*0.1;
    ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(pu.x, py, pu.r+4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd700'; drawStarShape(pu.x, py, pu.r, pu.r*0.4);
    ctx.fillStyle = '#fff'; drawStarShape(pu.x-1, py-1, pu.r*0.5, pu.r*0.2);
  }
}

function spawnPowerUp() {
  if (powerUps.length >= 2) return;
  var r = Math.random();
  var lane = r < 0.4 ? 0 : (r < 0.75 ? 1 : 2);
  // 同通道有近距障碍物则跳过
  var obs = laneObstacles[lane];
  var conflict = false;
  for (var oi = 0; oi < obs.length; oi++) {
    if (obs[oi].x > W - 40) { conflict = true; break; }
  }
  if (conflict) return;
  powerUps.push({ x: W + 80 + Math.random() * 40, y: LANE_Y[lane], r: 12, lane: lane });
}
function updatePowerUps() {
  for (var i = powerUps.length - 1; i >= 0; i--) {
    var pu = powerUps[i]; pu.x -= speed * dt;
    if (pu.x < -40) { powerUps.splice(i, 1); continue; }
    var dx = getPlayerCenterX() - pu.x, dy = getPlayerCenterY() - pu.y;
    if (Math.sqrt(dx*dx + dy*dy) < pu.r + 30 && gameState === 'playing') {
      if (dashCharges < maxDashCharges) dashCharges++;
      addScorePop(pu.x, pu.y - 5, '+50', '#ffd700');
      addLabelPop(pu.x, pu.y - 25, '+1 ⚡', '#ff6b6b');
      spawnParticles(pu.x, pu.y, '#ffd700', 20, 1, 5);
      sfxStar(); powerUps.splice(i, 1);
    }
  }
}

// ═══════════ 红心 ═══════════
function spawnHeart() {
  var lane = Math.floor(Math.random() * 3);
  // 同通道有近距障碍物则跳过
  var obs = laneObstacles[lane];
  var conflict = false;
  for (var oi = 0; oi < obs.length; oi++) {
    if (obs[oi].x > W - 40) { conflict = true; break; }
  }
  if (conflict) return;
  hearts.push({ x: W + 80 + Math.random() * 40, y: LANE_Y[lane], r: 10 });
}
function updateHearts() {
  for (var i = hearts.length - 1; i >= 0; i--) {
    var h = hearts[i]; h.x -= speed * dt;
    if (h.x < -40) { hearts.splice(i, 1); continue; }
    var dx = getPlayerCenterX() - h.x, dy = getPlayerCenterY() - h.y;
    if (Math.sqrt(dx*dx + dy*dy) < h.r + 24 && gameState === 'playing') {
      if (lives < maxLives) lives++;
      spawnParticles(h.x, h.y, '#ff4466', 10, 1, 3);
      hearts.splice(i, 1);
    }
  }
}
function drawHeartShape(ctx, cx, cy, size) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size/20, size/20);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-10, -4, -10, -14, 0, -8);
  ctx.bezierCurveTo(10, -14, 10, -4, 0, 6);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

// ═══════════ 障碍物 ═══════════
function spawnObstacle() {
  var phase = Math.floor(score / 1000);
  var lane;
  if (phase < 1) lane = Math.random() < 0.6 ? 2 : 1;
  else lane = Math.floor(Math.random() * 3);
  if (laneObstacles[lane].length >= 2) return;

  var ob = { x: W + 60, grazed: false, passed: false, lane: lane };
  ob.w = 96; ob.h = 96;
  ob.y = lane * 160 + 32;
  ob.hitbox = { x: ob.x + 20, y: ob.y + 20, w: 56, h: 56 };
  ob.grazeBox = { x: ob.x - GRAZE_MARGIN, y: ob.y - GRAZE_MARGIN, w: ob.w + GRAZE_MARGIN*2, h: ob.h + GRAZE_MARGIN*2 };
  if (lane === 2) { ob.type = 'm'; ob.image = assets.mogu; }
  else { ob.type = 'f'; ob.image = assets.yaojing; ob.wingOffset = Math.random()*Math.PI*2; }
  laneObstacles[lane].push(ob);
}

function updateObstacles() {
  for (var lane = 0; lane < 3; lane++) {
    var obs = laneObstacles[lane];
    for (var i = obs.length - 1; i >= 0; i--) {
      var ob = obs[i];
      ob.x -= speed * dt;
      ob.hitbox.x = ob.x + 20; ob.grazeBox.x = ob.x - GRAZE_MARGIN;
      if (ob.type === 'f') {
        var floatY = Math.sin(frameCount * 0.08 + ob.wingOffset) * 4;
        ob.hitbox.y = ob.y + floatY + 20;
        ob.grazeBox.y = ob.y + floatY - GRAZE_MARGIN;
      }
      if (ob.x + ob.w < -80) { obs.splice(i, 1); continue; }

      if (!ob.grazed && !ob.passed && gameState === 'playing' && player.lane === lane) {
        var hb = getPlayerHitbox();
        var gh = ob.grazeBox;
        if (hb.x < gh.x + gh.w && hb.x + hb.w > gh.x && hb.y < gh.y + gh.h && hb.y + hb.h > gh.y) {
          var hh = ob.hitbox;
          if (!(hb.x < hh.x + hh.w && hb.x + hb.w > hh.x && hb.y < hh.y + hh.h && hb.y + hb.h > hh.y)) {
            ob.grazed = true;
          }
        }
      }

      if (!ob.passed && ob.x + ob.w < player.x - 10) {
        ob.passed = true; lastObstacleTime = frameCount;
        if (ob.grazed) {
          grazeStreak++; totalGraze++;
          if (grazeStreak > maxGrazeStreak) maxGrazeStreak = grazeStreak;
          var bonus = grazeStreak * 5;
          score += bonus;
          var label = '擦弹 ×' + grazeStreak;
          if (grazeStreak >= 30) label = '擦弹神! ×' + grazeStreak;
          else if (grazeStreak >= 15) label = '擦弹狂 ×' + grazeStreak;
          addScorePop(getPlayerCenterX(), player.targetY - 15, '+' + bonus, '#ffd700');
          addLabelPop(getPlayerCenterX(), player.targetY - 35, label, '#ffd700');
          spawnParticles(getPlayerCenterX(), player.targetY, '#ffd700', 16, 1, 4);
          sfxGraze();
          if (grazeStreak % 20 === 0) {
            if (dashCharges < maxDashCharges) dashCharges++;
            addLabelPop(getPlayerCenterX(), player.targetY - 55, '+1 ⚡ 连击奖励!', '#ff6b6b');
            sfxCombo();
          }
        }
      }
    }
  }
}

function checkCollisions() {
  if (dashTimer > 0 || invTimer > 0) return;
  var hb = getPlayerHitbox();
  var obs = laneObstacles[player.lane];
  for (var i = 0; i < obs.length; i++) {
    var hh = obs[i].hitbox;
    if (hb.x < hh.x + hh.w && hb.x + hb.w > hh.x && hb.y < hh.y + hh.h && hb.y + hb.h > hh.y) {
      lives--;
      invTimer = 90;
      grazeStreak = 0;
      spawnParticles(getPlayerCenterX(), getPlayerCenterY(), '#ef4444', 20, 2, 6);
      sfxHit();
      if (lives <= 0) { endGame(); return; }
      return;
    }
  }
}

// ═══════════ 玩家 ═══════════
function switchLane(dir) {
  if (gameState !== 'playing' || player.switchCooldown > 0) return;
  var newLane = player.lane + dir;
  if (newLane < 0 || newLane > 2) return;
  player.lane = newLane;
  player.targetY = LANE_Y[player.lane];
  player.switchCooldown = SWITCH_COOLDOWN;
  player.animState = 'dash';
  invTimer = Math.max(invTimer, SWITCH_COOLDOWN);
  sfxSwitch();
}

function activateDASH() {
  if (gameState !== 'playing' || dashTimer > 0 || dashCharges <= 0) return;
  dashCharges--;
  grazeStreak = 0;
  preDashSpeed = speed;
  speed *= 2;
  dashTimer = dashMax;
  player.animState = 'dash';
  addLabelPop(getPlayerCenterX(), player.targetY - 30, '⚡ DASH!', '#ff6b6b');
  spawnParticles(getPlayerCenterX(), player.targetY, '#ffd700', 20, 1, 5);
  sfxDash();
}

function updatePlayer() {
  if (player.switchCooldown > 0) {
    player.switchCooldown--;
    if (player.switchCooldown === 0) player.animState = 'run';
  }
  var diff = player.targetY - getPlayerCenterY();
  if (Math.abs(diff) > 0.5) player.targetY -= diff * 0.35;

  if (dashTimer > 0) {
    player.animState = 'dash';
    for (var lane = 0; lane < 3; lane++) {
      var obs = laneObstacles[lane];
      for (var i = obs.length - 1; i >= 0; i--) {
        var ob = obs[i];
        if (ob.x + ob.w > player.x && ob.x < player.x + player.visualW) {
          score += 5; addScorePop(ob.x+ob.w/2, ob.y+ob.h/2, '+5', '#ffd700');
          spawnParticles(ob.x+ob.w/2, ob.y+ob.h/2, '#ffd700', 8, 1, 3);
          obs.splice(i, 1);
        }
      }
    }
    if (frameCount % 3 === 0) { posHistory.push({ x: player.x, y: player.targetY }); if (posHistory.length > 5) posHistory.shift(); }
  }
}

function drawPlayer() {
  var animState = player.animState;
  var fr = (playerChar === 'reimu' && animState === 'dash') ? reimuDashFrames :
           (playerChar === 'reimu') ? reimuRunFrames :
           (animState === 'dash') ? dashFrames : runFrames;
  var frameSpeed = (animState === 'dash') ? 6 : 12;
  var frameIdx = Math.floor(frameCount / frameSpeed) % fr.length;
  var img = fr[frameIdx];
  if (!img || !img.complete) return;

  var cx = player.x;
  var cy = player.targetY - player.visualH / 2;
  var dw = player.visualW, dh = player.visualH;

  if (animState === 'dash' && posHistory.length > 1) {
    for (var hi = 0; hi < posHistory.length - 1; hi++) {
      var ghost = posHistory[hi];
      ctx.globalAlpha = 0.08 + (hi / posHistory.length) * 0.12;
      ctx.drawImage(img, ghost.x, ghost.y - player.visualH/2, dw, dh);
    }
    ctx.globalAlpha = 1;
  }
  if (invTimer > 0 && Math.floor(frameCount/4) % 2 === 0) ctx.globalAlpha = 0.3;
  ctx.drawImage(img, cx, cy, dw, dh);
  ctx.globalAlpha = 1;

  if (dashTimer > 0) {
    ctx.globalAlpha = 0.25 + Math.sin(frameCount * 0.2) * 0.1;
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx + dw/2, cy + dh/2, dw/2 + 12, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ═══════════ 主循环 ═══════════
function update() {
  if (gameState !== 'playing') return;
  var now = performance.now();
  dt = Math.min((now - lastTs) / 16.67, 3);
  lastTs = now;
  frameCount++;
  var scoreMult = (dashTimer > 0) ? 2 : 1;
  score += speed * 0.1 * scoreMult * dt * CHAR[playerChar].scoreRate;
  var phase = Math.max(1, Math.floor(score / 1000) + 1);
  var speedInterval = Math.max(120, 300 - phase * 35);
  if (frameCount % speedInterval === 0) speed += 0.12;
  if (speed < 5) speed = 5;
  updatePlayer();
  if (invTimer > 0) invTimer--;
  if (dashTimer > 0) { dashTimer--; if (dashTimer === 0) { player.animState = 'run'; speed = preDashSpeed; } }
  obstacleTimer += dt; if (obstacleTimer >= Math.max(22, 55 - speed * 2.5)) { spawnObstacle(); obstacleTimer = 0; }
  updateObstacles();
  powerUpTimer += dt; if (powerUpTimer >= 450) { spawnPowerUp(); powerUpTimer = 0; }
  updatePowerUps();
  heartTimer += dt; if (heartTimer >= 1080 && hearts.length < 2) { spawnHeart(); heartTimer = 0; }
  updateHearts();
  checkCollisions();
  if (dashTimer > 0 && frameCount % 1 === 0) {
    particles.push({ x: player.x - 5, y: player.targetY + (Math.random() - 0.5) * player.visualH, vx: -speed*1.5+(Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, life: 8+Math.random()*6, maxLife: 12, color: Math.random()<0.5?'#fff':'#ffd700', r: 1+Math.random()*1.5 });
  }
  updateParticles();
  updateFloatingTexts();
  updateScoreDisplay();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  for (var lane = 0; lane < 3; lane++) {
    var obs = laneObstacles[lane];
    for (var i = 0; i < obs.length; i++) {
      var ob = obs[i];
      var drawY = ob.y;
      if (ob.type === 'f') drawY += Math.sin(frameCount * 0.08 + ob.wingOffset) * 4;
      if (ob.image && ob.image.complete) ctx.drawImage(ob.image, ob.x, drawY, 96, 96);
      else { ctx.fillStyle = ob.type==='m'?'#8b3a3a':'#8b5cf6'; ctx.fillRect(ob.x, ob.y, 96, 96); }
      if (ob.grazed && !ob.passed) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(ob.x+ob.w/2, ob.y+ob.h/2, ob.w/2+10,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
  drawPowerUps();
  for (var hi = 0; hi < hearts.length; hi++) { var h = hearts[hi]; ctx.fillStyle = '#ff4466'; drawHeartShape(ctx, h.x, h.y, h.r*2); }
  drawParticles();
  if (gameState !== 'over') drawPlayer();
  drawFloatingTexts();
  if (dashTimer > 280 && dashTimer % 10 < 5) { ctx.fillStyle = 'rgba(255,80,80,0.04)'; ctx.fillRect(0,0,W,H); }
  if (dashTimer > 0) {
    var glowAlpha = dashTimer<30 ? dashTimer/30*0.2 : 0.2;
    var grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'rgba(255,215,0,0)'); grad.addColorStop(0.05,'rgba(255,215,0,'+(glowAlpha*0.3)+')'); grad.addColorStop(0.95,'rgba(255,215,0,'+(glowAlpha*0.3)+')'); grad.addColorStop(1,'rgba(255,215,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);
  }
  if (deathFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,'+(deathFlash/18*0.5)+')'; ctx.fillRect(0,0,W,H); deathFlash--; }
  for (var li = 0; li < maxLives; li++) {
    ctx.fillStyle = li < lives ? '#ff4466' : 'rgba(255,68,102,0.2)';
    drawHeartShape(ctx, 30 + li * 28, 24, 14);
  }
  // DASH充能
  if (dashCharges > 0) {
    ctx.fillStyle = dashCharges >= 3 ? '#ff6b6b' : '#ffd700';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚡ ×' + dashCharges, 30 + maxLives * 28 + 6, 28);
    ctx.textAlign = 'start';
  }
}

function gameLoop() {
  update(); draw();
  if (gameState === 'over') document.getElementById('startOverlay').classList.remove('hide');
  requestAnimationFrame(gameLoop);
}

// ═══════════ 初始化 ═══════════
loadBest(); updateScoreDisplay();
document.getElementById('loadingOverlay').classList.remove('hide');
document.getElementById('startOverlay').classList.add('hide');
document.getElementById('lbArea').classList.add('hide');

preloadAll().then(function() {
  setupFrames();
  document.getElementById('loadingOverlay').classList.add('hide');
  document.getElementById('startOverlay').classList.remove('hide');
}).catch(function(err) {
  console.error('Sprite load failed:', err);
  setupFrames();
  document.getElementById('loadingOverlay').classList.add('hide');
  document.getElementById('startOverlay').classList.remove('hide');
});

gameLoop();

// ═══════════ 选人界面（全局函数）═══════════
var _selTouchX = 0;

window._selChar = function(ch) {
  playerChar = ch;
  var sel = document.getElementById('selectOverlay');
  document.getElementById('selMarisa').classList.toggle('selected', ch === 'marisa');
  document.getElementById('selReimu').classList.toggle('selected', ch === 'reimu');
  document.getElementById('imgMarisa').style.borderColor = ch === 'marisa' ? '#f0c060' : '#3a3045';
  document.getElementById('imgReimu').style.borderColor = ch === 'reimu' ? '#f0c060' : '#3a3045';
  sel.dataset.selected = ch;
};

window.showSelect = function() {
  document.getElementById('startOverlay').classList.add('hide');
  document.getElementById('selectOverlay').classList.remove('hide');
  window._selChar('marisa');
};

window.confirmSelect = function() {
  document.getElementById('selectOverlay').classList.add('hide');
  startGame();
};

// 键盘选人
document.addEventListener('keydown', function(e) {
  var sel = document.getElementById('selectOverlay');
  if (sel.classList.contains('hide')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    var cur = sel.dataset.selected || 'marisa';
    window._selChar(cur === 'marisa' ? 'reimu' : 'marisa');
  }
  if (e.key === 'Enter') { e.preventDefault(); window.confirmSelect(); }
});

// 触摸滑动选人
document.getElementById('selectOverlay').addEventListener('touchstart', function(e) {
  _selTouchX = e.touches[0].clientX;
});
document.getElementById('selectOverlay').addEventListener('touchend', function(e) {
  var dx = (e.changedTouches[0].clientX - _selTouchX);
  if (Math.abs(dx) > 40) {
    var cur = this.dataset.selected || 'marisa';
    window._selChar(dx > 0 ? 'marisa' : 'reimu'); // 右滑→魔理沙, 左滑→灵梦
  }
});

})();
