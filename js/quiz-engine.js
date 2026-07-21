// =============================================
//  霧雨魔法店 · 通用测验引擎 MQ.engine
//  状态机: intro → quiz → loading → reveal → result
//  依赖: utils.js / quiz-storage.js / quiz-stats.js / reveal-screen.js
//
//  最小用法:
//    var quiz = MQ.engine({
//      questions: QUESTIONS,            // [{q, opts:[...]}]
//      storageKey: 'quiz_xxx_v1',
//      trackKey: 'xxx_take',
//      loadingSteps: ['正在分析…', …],
//      reveal: { title:'✨ 鉴定完成', color:'#f0c060', hint:'结果生成中…' },
//      calcResult: function(answers) { return resultObj; },
//      renderIntro: function(app, api) { app.innerHTML = …; },
//      renderResult: function(app, result, api) { app.innerHTML = …; }
//    });
//    quiz.render();
//
//  引擎自动暴露全局函数(供 inline onclick 使用):
//    startQuiz() / answer(i) / goBack() / resumeQuiz() / restart()
//  可用 config.expose = {start:'start'} 改名,或设 false 禁用
// =============================================
window.MQ = window.MQ || {};

MQ.engine = function(config) {
  var state = 'intro';
  var idx = 0;
  var answers = [];
  var result = null;
  var app = null;

  var QUESTIONS = config.questions || [];
  var STORAGE_KEY = config.storageKey || 'quiz_mq_v1';
  var TRACK_KEY = config.trackKey || '';
  var LOADING_STEPS = config.loadingSteps || ['正在分析…', '计算结果中…', '马上好…'];
  var qWord = config.questionWord || '问';
  var LETTERS = config.letters || 'ABCDEFGH';

  // ── 数据适配:兼容 {q,opts:[str]} 和 {q,opts:[{txt}]} 两种 schema ──
  function qText(q) { return (typeof q === 'string') ? q : q.q; }
  function qOpts(q) { return q.opts || []; }
  function optText(o) {
    if (typeof o === 'string') return o;
    if (o.txt != null) return o.txt;
    if (o.t != null) return o.t;
    return String(o);
  }

  // ── 渲染分发 ──
  function render() {
    if (typeof toggleAds === 'function') toggleAds(state);
    app = app || document.getElementById(config.appId || 'app');
    if (!app) return;
    if (state === 'intro') config.renderIntro(app, api);
    else if (state === 'quiz') renderQuestion();
    else if (state === 'loading') renderLoading();
    else if (state === 'result') config.renderResult(app, result, api);
    // 状态切换微过渡(common.css .mq-fade)
    app.classList.remove('mq-fade');
    void app.offsetWidth;
    app.classList.add('mq-fade');
  }

  // ── 答题页(全站统一的进度条/题号/选项/上一题)──
  function renderQuestion() {
    if (idx >= QUESTIONS.length) { state = 'loading'; render(); return; }
    var q = QUESTIONS[idx];
    var opts = qOpts(q);
    var pct = Math.round((idx / QUESTIONS.length) * 100);
    var html =
      '<div class="progress-wrap">' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="progress-text">' + (idx + 1) + ' / ' + QUESTIONS.length + '</div>' +
      '</div>' +
      '<div class="q-num">第 ' + (idx + 1) + ' ' + qWord + '</div>' +
      '<div class="q-text">' + qText(q) + '</div>' +
      '<div class="options">';
    for (var i = 0; i < opts.length; i++) {
      html +=
        '<button class="opt-btn" onclick="' + names.answer + '(' + i + ')">' +
          '<span class="opt-letter">' + (LETTERS[i] || '?') + '</span>' + optText(opts[i]) +
        '</button>';
    }
    html += '</div>';
    if (idx > 0 && config.canBack !== false) {
      html += '<div style="text-align:center;"><button class="btn-back" onclick="' + names.back + '()">← 上一题</button></div>';
    }
    app.innerHTML = html;
    if (config.onQuestion) config.onQuestion(idx, q);
  }

  // ── 加载页(文案轮播)──
  function renderLoading() {
    app.innerHTML =
      '<div class="loading-wrap">' +
        '<div class="loading-orb"></div>' +
        '<p class="loading-text" id="ltxt">' + LOADING_STEPS[0] + '</p>' +
      '</div>';
    cycleLoading(1);
  }

  function cycleLoading(i) {
    if (i >= LOADING_STEPS.length) { finishLoading(); return; }
    sleep(450 + Math.random() * 500).then(function() {
      var lt = document.getElementById('ltxt');
      if (!lt) return; // 已离开加载页
      lt.textContent = LOADING_STEPS[i];
      cycleLoading(i + 1);
    });
  }

  // ── 揭示屏 → 结果 ──
  function resolveField(v, r) { return (typeof v === 'function') ? v(r) : v; }

  function finishLoading() {
    quizClear(STORAGE_KEY);
    result = config.calcResult(answers);
    var rv = config.reveal || {};
    showReveal(
      resolveField(rv.title, result) || '✨ 鉴定完成',
      resolveField(rv.code, result) || resolveField(rv.name, result) || '',
      resolveField(rv.color, result) || 'var(--gold)',
      resolveField(rv.hint, result) || '结果生成中…',
      function() { state = 'result'; render(); }
    );
  }

  // ── 公开 API ──
  var api = {
    start: function() {
      state = 'quiz'; idx = 0; answers = []; result = null;
      if (TRACK_KEY) trackStart(TRACK_KEY);
      quizClear(STORAGE_KEY);
      if (config.onStart) config.onStart();
      render();
    },
    answer: function(i) {
      if (state !== 'quiz' || idx >= QUESTIONS.length) return;
      answers.push(qOpts(QUESTIONS[idx])[i]);
      idx++;
      quizSave(STORAGE_KEY, { idx: idx, answers: answers });
      render();
    },
    back: function() {
      if (state !== 'quiz' || idx <= 0) return;
      idx--; answers.pop();
      quizSave(STORAGE_KEY, { idx: idx, answers: answers });
      render();
    },
    resume: function() {
      var d = quizLoad(STORAGE_KEY);
      if (!d || d.idx <= 0) return;
      state = 'quiz'; idx = d.idx; answers = d.answers || [];
      render();
    },
    restart: function() {
      state = 'intro'; idx = 0; answers = []; result = null;
      quizClear(STORAGE_KEY);
      render();
    },
    render: render,
    // 给 renderIntro 用的辅助:续答按钮 + 人数统计绑定
    resumeBtn: function(label) { return resumeButton(STORAGE_KEY, label) || ''; },
    bindCount: function(elOrId, opts) { if (TRACK_KEY) bindCount(elOrId, TRACK_KEY, opts); },
    getResult: function() { return result; },
    getState: function() { return { state: state, idx: idx, answers: answers }; }
  };

  // ── 暴露全局函数名(inline onclick 用)──
  var names = { start: 'startQuiz', answer: 'answer', back: 'goBack', resume: 'resumeQuiz', restart: 'restart' };
  if (config.expose === false) {
    names = {};
  } else if (config.expose) {
    for (var k in config.expose) names[k] = config.expose[k];
  }
  if (names.start) window[names.start] = api.start;
  if (names.answer) window[names.answer] = api.answer;
  if (names.back) window[names.back] = api.back;
  if (names.resume) window[names.resume] = api.resume;
  if (names.restart) window[names.restart] = api.restart;

  return api;
};
