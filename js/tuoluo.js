// =============================================
//  抽陀螺模拟器 · 页面壳引擎
//  负责: 开始/暂停/静音/结算/排行榜(全部 HTML 化)
//  与 Unity WebGL 双向通信:
//    Unity → 页面: postMessage (tuoluo_ready/tick/judge/score/pause)
//    页面 → Unity: UnityInstanceGlobal.SendMessage('ParentCommandPump','OnCommand',json)
// =============================================
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var iframe = $('gameIframe');
  var LAST = { score: 0, perfects: 0, maxCombo: 0, rating: '' };

  // ── Unity 实例就绪后, 才可 SendMessage ──
  var unityReady = false;

  function send(cmd) {
    if (!unityReady) return;
    try {
      iframe.contentWindow.UnityInstanceGlobal.SendMessage('ParentCommandPump', 'OnCommand', JSON.stringify(cmd));
    } catch (e) {
      console.warn('[tuoluo] send failed', e);
    }
  }

  // ═══════════ 页面状态切换 ═══════════
  function show(id) { $(id).classList.remove('hide'); }
  function hide(id) { $(id).classList.add('hide'); }

  function startGame() {
    hide('startOverlay');
    hide('resultOverlay');
    hide('pauseOverlay');
    $('scoreVal').textContent = '0';
    $('spinVal').textContent = '60%';
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

  // ═══════════ 最高分(localStorage) ═══════════
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

  // ═══════════ 静音 ═══════════
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

  // ═══════════ Unity → 页面消息 ═══════════
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || !d.type || d.type.indexOf('tuoluo_') !== 0) return;
    switch (d.type) {
      case 'tuoluo_ready':
        unityReady = true;
        break;
      case 'tuoluo_tick':
        $('scoreVal').textContent = String(d.score || 0);
        $('spinVal').textContent = (d.spin || 0) + '%';
        break;
      case 'tuoluo_judge':
        break; // 飘字/特效由 Unity 内展示, 页面不重复
      case 'tuoluo_pause':
        if (d.paused) show('pauseOverlay');
        else hide('pauseOverlay');
        break;
      case 'tuoluo_score':
        LAST.score = d.score || 0;
        LAST.perfects = d.perfects || 0;
        LAST.maxCombo = d.maxCombo || 0;
        LAST.rating = d.rating || '';
        showResult();
        break;
    }
  });

  function showResult() {
    saveBest(LAST.score);
    $('rScore').textContent = LAST.score.toLocaleString();
    $('rRating').textContent = LAST.rating;
    $('rStats').textContent = '最高连击 ' + LAST.maxCombo + ' · 完美 ' + LAST.perfects + ' 鞭';
    $('rBest').textContent = '最高分 ' + (Math.max(parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0, LAST.score)).toLocaleString();
    $('lbBtn').style.display = '';
    $('lbArea').innerHTML = '';
    show('resultOverlay');
  }

  // ═══════════ 排行榜提交(与鹿管大作战同款) ═══════════
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

  // ═══════════ 键盘(Esc/P 暂停同步) ═══════════
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      var paused = !$('pauseOverlay').classList.contains('hide');
      togglePause(!paused);
    }
  });

  // ═══════════ 绑定 ═══════════
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

  // 初始化
  loadBest();
  setMuteUI(localStorage.getItem('tuoluo_muted') === '1');
})();
