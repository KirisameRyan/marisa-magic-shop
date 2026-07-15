// =============================================
//  霧雨魔法店 · 断点续答
//  用法:
//    quizSave(STORAGE_KEY, {qOrder, idx, answers});
//    var d = quizLoad(STORAGE_KEY);
//    quizClear(STORAGE_KEY);
// =============================================

function quizSave(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}

function quizLoad(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function quizClear(key) {
  try { localStorage.removeItem(key); } catch(e) {}
}

// 生成「继续上次测试」按钮 HTML
function resumeButton(key, label) {
  var d = quizLoad(key);
  if (!d || !d.idx || d.idx <= 0) return '';
  var total = d.qOrder ? d.qOrder.length : '?';
  var btnLabel = label || ('继续上次测试（第'+(d.idx+1)+'/'+total+'题）');
  return '<button class="btn btn-ghost" style="max-width:260px;margin:4px auto 0;display:block;" onclick="resumeQuiz()">📋 '+btnLabel+'</button>';
}
