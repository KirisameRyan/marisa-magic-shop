# 新建测验页面 · Skill

为霧雨魔法店创建新的互动测验页面。遵循统一的模板和共享模块。

---

## 必用模板（HTML 骨架）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>页面标题 · 霧雨魔法店</title>
<script src="js/analytics.js"></script>
<link rel="stylesheet" href="css/common.css">
<script src="js/reveal-screen.js"></script>
<script src="js/page-base.js"></script>
<style>
/* ══ 页面专属样式（覆盖/扩展 common.css）══ */
body { background-image: radial-gradient(ellipse at 30% 0%, rgba(147,51,234,.05) 0%, transparent 50%), radial-gradient(ellipse at 70% 100%, rgba(59,130,246,.03) 0%, transparent 50%); }
.container { max-width: 560px; }
.container::before { background: linear-gradient(90deg, #accent1, #accent2, #accent1); }

.intro-badge { color: #accent1; border-color: rgba(...); }
.btn-start { background: linear-gradient(135deg, #accent1, #accent2); color: #fff; }
.progress-fill { background: linear-gradient(90deg, #accent1, #accent2); }
.q-num { color: #accent1; }
.opt-btn:hover .opt-letter { background: #accent1; }
</style>
</head>
<body>

<div id="shopNav"></div>
<script src="nav.js"></script>

<div class="container" id="app"></div>

<script src="js/utils.js"></script>
<script src="js/quiz-storage.js"></script>
<script src="js/quiz-stats.js"></script>
<script src="js/result-footer.js"></script>
<script src="js/canvas-utils.js"></script>
<!-- canvas-utils.js: 只在需要生成分享海报时引入 -->

<script>
/* ══ 页面专属 JS ══ */
var STORAGE_KEY = 'quiz_xxxxx_v1';
var TRACK_KEY = 'xxxxx_take';
// ... quiz logic ...
</script>

</body>
</html>
```

**关键点：**
- `page-base.js` 自动注入 favicon、广告脚本、广告 div（`#ad1`/`#ad2`/`#ad3`）、星空 CSS
- `reveal-screen.js` 自动注入 OTTI 风格揭示屏 CSS
- **不要**在 head 中手动写 `<link rel="icon">`、广告 script、adwork-net div
- **不要**在 style 中重复写 shop-bar / nav-overlay / .container / .intro / .btn / .progress / .q-num / .options / .opt-btn / .home-link / .notice / .loading-wrap 等样式（都已包含在 common.css）

---

## 共享 JS 模块速查

| 文件 | 导出函数 | 用途 |
|---|---|---|
| `js/utils.js` | `sleep(ms)`, `shuffle(arr)`, `copyToClipboard(text, msg)` | 通用工具 |
| `js/reveal-screen.js` | `showReveal(title, code, color, hint, callback, [duration])` | OTTI 风格揭示屏动画 |
| `js/quiz-storage.js` | `quizSave(key, data)`, `quizLoad(key)`, `quizClear(key)`, `resumeButton(key, [label])` | localStorage 断点续答 |
| `js/quiz-stats.js` | `trackStart(egg)`, `trackFooled(egg)`, `getCount(egg, callback)`, `getTypeStats(prefix, callback)` | 服务端统计数据 |
| `js/result-footer.js` | `resultFooterHTML([options])` | 结果页底部 QQ 群 + B站链接 + notice |
| `js/canvas-utils.js` | `loadImg(src)`, `roundRect(...)`, `wrapText(...)` | Canvas 海报生成（选配） |

### showReveal 用法

在 loading 结束后、result 渲染前插入：

```js
showReveal(
  '⏳ 鉴定完成',       // title: 顶部标题
  resultName,          // code:  中间大字（角色名/结果码）
  '#accent',           // color: 文字颜色
  '数据解码中…',       // hint:  底部闪烁提示
  function() {         // callback: 1.4s 后自动执行
    renderResult();
  }
);
```

### localStorage 集成模式

```js
var STORAGE_KEY = 'quiz_xxxxx_v1';

// 开始新测试
function startQuiz() {
  quizClear(STORAGE_KEY);
  // reset state...
  render();
}

// 每题回答后保存
function answer(i) {
  answers.push(...);
  idx++;
  quizSave(STORAGE_KEY, {idx: idx, answers: answers});
  render();
}

// intro 页面显示续答按钮
function renderIntro(app) {
  var resumeHTML = resumeButton(STORAGE_KEY);
  // ... include resumeHTML in intro layout
}

// 续答时恢复
function resumeQuiz() {
  var d = quizLoad(STORAGE_KEY);
  if (d) { idx = d.idx; answers = d.answers; /* 恢复其他状态 */ }
  render();
}
```

### 服务端统计集成模式

```js
var TRACK_KEY = 'xxxxx_take';

// intro 页显示统计
function renderIntro(app) {
  getCount(TRACK_KEY, function(cnt) {
    document.getElementById('takeCount').textContent = '已有 ' + cnt + ' 人测过！';
  });
  // ... include <span id="takeCount"> in HTML
}

// 开始测试时记录
function startQuiz() {
  trackStart(TRACK_KEY);
  // ...
}

// 有忽悠效果的，额外调用
function trackFool(eggName) {
  trackFooled('xxxxx_fooled');
}
```

### result-footer 用法

```js
// 在 result HTML 末尾拼接：
resultHTML += resultFooterHTML({
  notice: '本结果由霧雨魔法店出品 · 仅供娱乐',
  qqImg: 'images/qq-group.jpg',  // 可选，默认值
  qqGroup: '702973928'           // 可选，默认值
});
```

---

## CSS 约定

### 覆盖 common.css 的常用入口

```css
.container { max-width: 560px; }                          /* 默认 580px */
.container::before { background: 渐变; }                  /* 顶部 3px 装饰条颜色 */
.intro-badge { color: #accent; border-color: ...; }       /* Badge 强调色 */
.btn-start { background: 渐变; }                          /* 开始按钮色 */
.btn-main { background: #accent; }                        /* 主按钮色 */
.progress-fill { background: 渐变; }                      /* 进度条色 */
.q-num { color: #accent; }                                /* 题号色 */
.opt-btn:hover { border-color: #accent; }                  /* 选项边框 */
.opt-btn:hover .opt-letter { background: #accent; }        /* 选项字母 */
```

### 配色建议

为每个测验设一个主题色系（1-2 色），所有 `#accent1`/`#accent2` 统一替换。建议色值：
- 紫系：`#7c3aed` + `#3b82f6`
- 橙系：`#f59e0b` + `#ef4444`
- 绿系：`#6fcf97` + `#22c55e`
- 粉系：`#ec4899` + `#f472b6`
- 蓝系：`#0ea5e9` + `#6366f1`
- 金系：`#f0c060` + `#e8a830`

---

## 测验状态机

统一使用 `state` 变量管理页面状态：

```
intro → quiz → loading → reveal → result
                    ↓
                  (可选: troll / lowconf / fooled → real)
```

### 最小实现（简单计分型）

```js
var state = 'intro', idx = 0, answers = [];
var QUESTIONS = [...];  // {q, opts:[{t, s:{charKey: val}}]}
var CHARS = {...};      // {key: {n, e, c, tg, de}}
var lastChar = null;

function render() {
  toggleAds(state);
  var app = document.getElementById('app');
  if (state === 'intro') renderIntro(app);
  else if (state === 'quiz') renderQuestion(app);
  else if (state === 'loading') renderLoading(app);
  else if (state === 'result') renderResult(app);
}

function renderLoading(app) {
  app.innerHTML = '<div class="loading-wrap"><div class="loading-orb"></div><p class="loading-text">正在分析…</p></div>';
  // 模拟短暂延迟后揭示
  setTimeout(function() { calcResult(); showRevealDelayed(); }, 600);
}

function showRevealDelayed() {
  var c = CHARS[lastChar];
  showReveal('鉴定完成', c.n, c.c, '数据解码中…', function() {
    state = 'result'; render();
  });
}

function renderResult(app) {
  var c = CHARS[lastChar];
  app.innerHTML = '<div class="result">...' + resultFooterHTML({notice:'...'}) + '</div>';
}
```

### 高级模式（多维评分 + 余弦匹配）

参考：`quiz-animal-real.html`（5 维向量 + 余弦相似度）、`quiz-internet.html`（校准 + 距离匹配 + 隐藏触发）

### 忽悠模式（fake then real）

参考：`quiz-genshin.html`、`quiz-otokonoko.html`
- Loading → Reveal → 假结果（显示假评分）→ 按钮点击 → 真实结果
- 需调用 `trackFooled('xxx_fooled')` 记录被忽悠人数

---

## 关键数据结构约定

### 题目格式
```js
{ q: '题目文本', opts: [
  { t: '选项A', scores: {key1: 2, key2: 1} },
  { t: '选项B', scores: {key1: 1, key3: 2} }
]}
```
- 计分方式可灵活：`scores`、`v`、`s`、`d` 均可，只要 calcResult 能正确解析

### 结果格式
```js
{ key: { n: '名称', e: 'emoji', c: '#颜色', tg: '标签', de: '描述', tags: ['标签1', '标签2'] } }
```

---

## 新建页面上线检查清单

- [ ] `STORAGE_KEY` 唯一且格式为 `'quiz_xxxxx_v1'`
- [ ] `TRACK_KEY` 唯一且格式为 `'xxxxx_take'`
- [ ] head 中包含 `analytics.js` + `common.css` + `reveal-screen.js` + `page-base.js`
- [ ] body 中包含 `nav.js` + `utils.js` + `quiz-storage.js` + `quiz-stats.js` + `result-footer.js`
- [ ] **未**写死 favicon / ad script / adwork-net div（page-base 自动注入）
- [ ] **未**重复 shop-bar / nav-overlay / .container / .btn 等 common.css 样式
- [ ] `render()` 开头调用 `toggleAds(state)` 控制广告显示
- [ ] intro 页包含 `resumeButton(STORAGE_KEY)` + `getCount(TRACK_KEY)`
- [ ] `startQuiz()` 中调用 `trackStart(TRACK_KEY)` + `quizClear(STORAGE_KEY)`
- [ ] 每题回答后调用 `quizSave(STORAGE_KEY, {idx, answers})`
- [ ] loading 结束后调用 `showReveal(...)` 再进 result
- [ ] result 页使用 `resultFooterHTML()` 代替手写 QQ 群/B站/notice
- [ ] 响应式：`@media (max-width: 420px)` 调整字号
- [ ] 测试：intro → 答题 → 揭示屏动画 → 结果 → 分享 → 重测 → 续答
- [ ] 在 `nav.js` 中添加该页面的导航入口
- [ ] 在 `index.html` 中添加该页面的展示卡片
