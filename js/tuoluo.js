// =============================================
//  抽陀螺模拟器 · 页面壳引擎
//  负责: 开始/暂停/静音/结算/排行榜/难度/事件(全部 HTML 化)
//  与 Unity WebGL 双向通信:
//    Unity → 页面: postMessage (tuoluo_ready/tick/judge/score/pause/event/event_end)
//    页面 → Unity: UnityInstanceGlobal.SendMessage('ParentCommandPump','OnCommand',json)
// =============================================
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var iframe = $('gameIframe');
  var LAST = { score: 0, perfects: 0, maxCombo: 0, tier: 0, team: '', desc: '' };

  var unityReady = false;
  var pendingCmds = [];   // Unity 未就绪时的命令队列(ready 后按序重放)
  var bootFailed = false;

  function send(cmd) {
    if (bootFailed) return;
    if (!unityReady) {
      pendingCmds.push(cmd);
      return;
    }
    try {
      iframe.contentWindow.UnityInstanceGlobal.SendMessage('ParentCommandPump', 'OnCommand', JSON.stringify(cmd));
    } catch (e) {
      console.warn('[tuoluo] send failed', e);
    }
  }

  // Unity 就绪: 解除按钮禁用, 隐藏 loading, 重放队列
  function onUnityReady() {
    unityReady = true;
    bootFailed = false;
    hide('loadingMask');
    setUiEnabled(true);
    // 先同步静音状态
    send({ type: 'tuoluo_audio_muted', muted: localStorage.getItem('tuoluo_muted') === '1' });
    // 重放队列(按序)
    var q = pendingCmds;
    pendingCmds = [];
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      if (c.type === 'tuoluo_audio_muted') continue; // 已在上面统一同步
      try {
        iframe.contentWindow.UnityInstanceGlobal.SendMessage('ParentCommandPump', 'OnCommand', JSON.stringify(c));
      } catch (e) { console.warn('[tuoluo] replay failed', e); }
    }
  }

  function setUiEnabled(on) {
    $('startBtn').disabled = !on;
    $('startBtn').textContent = on ? '开始抽打!' : '加载中…';
    $$('.diff-btn').forEach(function (b) { b.disabled = !on; });
    $('helpToggle').disabled = !on;
  }

  function show(id) { $(id).classList.remove('hide'); }
  function hide(id) { $(id).classList.add('hide'); }

  var selectedDiff = 1; // 默认 MSI

  function startGame() {
    if (!unityReady) {
      // 未就绪时入队，并禁用按钮防止重复点击
      setUiEnabled(false);
      pendingCmds.push({ type: 'tuoluo_difficulty', level: selectedDiff });
      pendingCmds.push({ type: 'tuoluo_state', state: 'play' });
      return;
    }
    hide('startOverlay');
    hide('resultOverlay');
    hide('pauseOverlay');
    $('scoreVal').textContent = '0';
    $('spinVal').textContent = '60%';
    send({ type: 'tuoluo_difficulty', level: selectedDiff });
    send({ type: 'tuoluo_state', state: 'play' });
  }

  function backToTitle() {
    hide('resultOverlay');
    hide('pauseOverlay');
    show('startOverlay');
    loadBest();
    send({ type: 'tuoluo_state', state: 'idle' });
  }

  function togglePause(force) {
    var paused = force !== undefined ? force : !$('pauseOverlay').classList.contains('hide');
    if (paused) {
      show('pauseOverlay');
      send({ type: 'tuoluo_pause', paused: true });
    } else {
      hide('pauseOverlay');
      send({ type: 'tuoluo_pause', paused: false });
    }
  }

  // 最高分
  var BEST_KEY = 'tuoluo_best';
  function loadBest() {
    var b = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    $('startBest').textContent = String(b);
  }
  function saveBest(v) {
    var b = Math.max(parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0, v);
    localStorage.setItem(BEST_KEY, String(b));
    loadBest();
  }

  // 静音
  function setMuteUI(muted) {
    $('muteBtn').textContent = muted ? '🔇' : '🔊';
    $('muteBtn').classList.toggle('off', muted);
  }
  function toggleMute() {
    var muted = localStorage.getItem('tuoluo_muted') === '1';
    muted = !muted;
    localStorage.setItem('tuoluo_muted', muted ? '1' : '0');
    setMuteUI(muted);
    send({ type: 'tuoluo_audio_muted', muted: muted });
  }

  // 事件徽章
  function showEventBadge(name, good) {
    var b = $('eventBadge');
    b.textContent = name;
    b.classList.remove('good', 'bad');
    b.classList.add(good ? 'good' : 'bad');
    b.style.display = 'block';
  }
  function hideEventBadge() {
    $('eventBadge').style.display = 'none';
  }

  // 结算显示
  function showResult() {
    saveBest(LAST.score);

    // 根据 tier 选战队图片
    var imgName = LAST.team.toLowerCase();
    // 特殊处理 Gen.G
    if (imgName === 'gen.g') imgName = 'geng';

    $('rTeamImg').src = 'images/tes/' + imgName + '.webp';
    $('rTeamImg').alt = LAST.team;
    $('rTeamName').textContent = LAST.team;
    $('rFlavor').textContent = '根据你的抽陀螺手法 你的战力级别是 ' + LAST.team + '!';
    $('rDesc').textContent = LAST.desc;
    $('rScore').textContent = LAST.score.toLocaleString();
    $('rCombo').textContent = LAST.maxCombo.toLocaleString();
    $('rPerfect').textContent = LAST.perfects.toLocaleString();
    $('rBest').textContent = (Math.max(parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0, LAST.score)).toLocaleString();

    $('lbBtn').style.display = '';
    $('lbArea').innerHTML = '';
    show('resultOverlay');
  }

  // Unity 消息
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || !d.type || d.type.indexOf('tuoluo_') !== 0) return;
    switch (d.type) {
      case 'tuoluo_ready':
        onUnityReady();
        break;
      case 'tuoluo_tick':
        $('scoreVal').textContent = String(d.score || 0);
        $('spinVal').textContent = (d.spin || 0) + '%';
        break;
      case 'tuoluo_judge':
        break;
      case 'tuoluo_pause':
        if (d.paused) show('pauseOverlay');
        else hide('pauseOverlay');
        break;
      case 'tuoluo_event':
        showEventBadge(d.name, d.good);
        break;
      case 'tuoluo_event_end':
        hideEventBadge();
        break;
      case 'tuoluo_score':
        LAST.score = d.score || 0;
        LAST.perfects = d.perfects || 0;
        LAST.maxCombo = d.maxCombo || 0;
        LAST.tier = d.tier || 0;
        LAST.team = d.team || '';
        LAST.desc = d.desc || '';
        showResult();
        break;
      case 'tuoluo_progress':
        // Unity 加载进度 (iframe 通过 postMessage 发送)
        if (d.progress !== undefined) {
          $('loadingProgress').style.width = (d.progress * 100) + '%';
          if (d.progress >= 1) $('loadingText').textContent = '初始化中…';
        }
        break;
      case 'tuoluo_error':
        // Unity 加载失败
        bootFailed = true;
        $('loadingText').textContent = '加载失败，请重试';
        $('loadingError').textContent = d.message || '未知错误';
        $('loadingProgress').style.width = '0%';
        $('loadingRetry').style.display = 'inline-block';
        break;
    }
  });

  // 排行榜提交
  function submitScore() {
    var btn = $('lbBtn');
    if (!window.Auth || !Auth.isLoggedIn()) {
      Auth.openModal('login', function () { submitScore(); });
      return;
    }
    btn.disabled = true;
    btn.textContent = '提交中…';
    var f = new FormData();
    f.append('score', String(LAST.score));
    f.append('graze', String(LAST.perfects));
    fetch(API_BASE + 'api/leaderboard.php?game=tuoluo', {
      method: 'POST',
      body: f,
      headers: { 'Authorization': 'Bearer ' + Auth.token() }
    }).then(function (r) { return r.json(); }).then(function (res) {
      btn.disabled = false;
      if (res.ok) btn.textContent = '✅ 已上榜 · 第 ' + res.rank + ' 名';
      else btn.textContent = '⚠️ ' + (res.error || '提交失败');
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = '网络错误';
    });
  }

  // 键盘
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      var paused = !$('pauseOverlay').classList.contains('hide');
      togglePause(!paused);
    }
  });

  // 绑定
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('homeBtn').addEventListener('click', backToTitle);
  $('resumeBtn').addEventListener('click', function () { togglePause(false); });
  $('restartBtn').addEventListener('click', startGame);
  $('quitBtn').addEventListener('click', backToTitle);
  $('muteBtn').addEventListener('click', toggleMute);
  $('pauseBtn').addEventListener('click', function () { togglePause(true); });
  $('lbBtn').addEventListener('click', submitScore);
  $('helpToggle').addEventListener('click', function () {
    $('helpPanel').classList.toggle('open');
  });

  // 难度按钮
  $$('.diff-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      selectedDiff = parseInt(b.dataset.diff, 10);
      $$('.diff-btn').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    });
  });

  // 初始化
  loadBest();
  setMuteUI(localStorage.getItem('tuoluo_muted') === '1');
  // 初始禁用 UI，等待 Unity 就绪
  setUiEnabled(false);

  // 监听 iframe 内 Unity 的 bootState 文本(boot hook 写入)驱动进度/就绪/错误
  function watchBootState() {
    var timer = setInterval(function () {
      var bd = null;
      try { bd = iframe.contentDocument.getElementById('bootState'); } catch (e) {}
      if (!bd) return;
      var s = bd.textContent || '';
      if (s.indexOf('progress ') === 0) {
        var pct = parseInt(s.split('progress ')[1], 10);
        if (!isNaN(pct)) $('loadingProgress').style.width = pct + '%';
      } else if (s === 'ready') {
        clearInterval(timer);
      } else if (s.indexOf('FAIL') === 0 || s.indexOf('JSERR') === 0 || s.indexOf('LOADFAIL') === 0 || s.indexOf('PROMREJ') === 0) {
        clearInterval(timer);
        bootFailed = true;
        $('loadingText').textContent = '加载失败，请重试';
        $('loadingError').textContent = s;
        $('loadingProgress').style.width = '0%';
        $('loadingRetry').style.display = 'inline-block';
      }
    }, 400);
  }
  watchBootState();

  // 90s 看门狗
  setTimeout(function () {
    if (!unityReady && !bootFailed) {
      bootFailed = true;
      $('loadingText').textContent = '加载超时，请重试';
      $('loadingError').textContent = '90秒内未收到就绪信号';
      $('loadingProgress').style.width = '0%';
      $('loadingRetry').style.display = 'inline-block';
    }
  }, 90000);

  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
})();