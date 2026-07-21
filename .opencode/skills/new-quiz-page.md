# 新建测验页面 · Skill

为霧雨魔法店创建新的互动测验页面。**一律基于 `model.html` 模板 + `MQ.engine` 引擎**,不要从零手写状态机。

---

## 快速开始

1. 复制 `model.html` 为新页面文件(如 `quiz-xxx.html`)
2. 改 `STORAGE_KEY`(`quiz_xxx_v1`)和 `TRACK_KEY`(`xxx_take`),必须全站唯一
3. 改 DATA 区域:标题 / 副标题 / badge / QUESTIONS / RESULTS / LOADING_STEPS
4. 按需改 `calcResult` 和两处渲染(`renderIntro` / `renderResult`)
5. 在 `nav.js` 和 `index.html` 添加入口

引擎自动处理:状态机(intro → quiz → loading → reveal → result)、进度条、选项按钮、上一题、断点续答、loading 文案轮播、揭示屏、广告位切换、人数统计。

---

## HTML 骨架(模板已含,了解即可)

```html
<head>
  <script src="js/analytics.js"></script>
  <script src="js/page-base.js"></script>
  <link rel="stylesheet" href="css/common.css">
  <style>/* 只写页面专属样式(主题染色等) */</style>
</head>
<body>
  <div id="shopNav"></div>
  <script src="nav.js"></script>
  <div class="container" id="app"></div>
  <script src="js/utils.js"></script>
  <script src="js/reveal-screen.js"></script>
  <script src="js/quiz-storage.js"></script>
  <script src="js/quiz-stats.js"></script>
  <script src="js/result-footer.js"></script>
  <script src="js/quiz-engine.js"></script>
  <!-- 按需:canvas-utils.js + poster.js(海报)/ radar.js(雷达图)/ particles.js(粒子) -->
</body>
```

**禁止事项:**
- **不要**手写 favicon / 广告 script / adwork-net div(page-base 自动注入)
- **不要**重复 common.css 已有的样式(shop-bar / .container / .btn / .progress / .opt-btn / .result-* / .meta-tag / .loading-wrap 等)
- **不要**手写 answer/goBack/resumeQuiz/restart(引擎自动暴露这些全局函数)

---

## MQ 模块速查

| 模块 | API | 用途 |
|---|---|---|
| `js/quiz-engine.js` | `MQ.engine(config)` → api | 测验状态机引擎 |
| `js/quiz-stats.js` | `bindCount(el, key, {template})` / `trackStart` / `getCount` / `fmtCount` / `animateCount` | 服务端统计 + 人数显示 |
| `js/quiz-storage.js` | `quizSave/quizLoad/quizClear/resumeButton` | localStorage 断点续答 |
| `js/reveal-screen.js` | `showReveal(title, code, color, hint, callback, [duration])` | 揭示屏动画 |
| `js/result-footer.js` | `resultFooterHTML([options])` | 结果页底部 QQ群+B站+notice |
| `js/utils.js` | `sleep / shuffle / copyToClipboard` | 通用工具 |
| `js/radar.js` | `MQ.radar(vec, {labels, color, ...})` → svg 字符串 | 雷达图 |
| `js/poster.js` | `MQ.poster.frame/qrPair/screenHTML/finish` + 常量 | Canvas 分享海报 |
| `js/particles.js` | `MQ.particles.confetti/sparkle/rise/spawn` | 粒子特效(自动尊重 reduced-motion) |

## MQ.engine 配置

```js
var quiz = MQ.engine({
  questions: QUESTIONS,            // [{q, opts:[...]}] opts 支持字符串或 {txt}/{t}
  storageKey: 'quiz_xxx_v1',
  trackKey: 'xxx_take',
  loadingSteps: ['正在分析…', …],
  reveal: {                        // 每个字段都可以是函数(result)=>值
    title: '✨ 鉴定完成',
    code: function(r) { return RESULTS[r.key].name; },
    color: function(r) { return RESULTS[r.key].color; },
    hint: '结果生成中…'
  },
  calcResult: function(answers) { return {key, scores}; },
  renderIntro: function(app, api) { app.innerHTML = …; api.bindCount('takeCount', {template:'已有 {n} 人完成测试'}); },
  renderResult: function(app, result, api) { app.innerHTML = …; },
  // 可选: questionWord:'题', letters:'ABCD', canBack:false, onStart/onQuestion
});
quiz.render();   // 启动
```

引擎暴露的全局函数(inline onclick 用):`startQuiz()` `answer(i)` `goBack()` `resumeQuiz()` `restart()`。可用 `expose:{start:'start'}` 改名,`expose:false` 禁用。

api 对象还提供:`resumeBtn([label])`(续答按钮 HTML)、`bindCount(el, opts)`、`getResult()`、`getState()`。

## 数据格式约定

```js
// 题目(简单计分型)
{ q: '题目文本', opts: [
  { txt: '选项A', scores: {key1: 2, key2: 1} },
  { txt: '选项B', scores: {key1: 1} }
]}
// 结果
{ key: { name, emoji, color, tagline, desc, tags: [] } }
```

多维匹配参考:`quiz-animal-real.html`(5维余弦)、`quiz-internet.html`(校准距离);雷达图展示用 `MQ.radar`。

## CSS 约定

```css
/* 主题染色:只覆盖这些入口 */
body { background-image: radial-gradient(...页面主题色...); }
.container { max-width: 560px; }                /* 默认 580px */
.container::before { background: 渐变; }        /* 顶部装饰条 */
.intro-badge { color: #accent; border-color: ...; }
.btn-main { background: #accent; }
.progress-fill { background: 渐变; }
.q-num { color: #accent; }
.opt-btn:hover { border-color: #accent; }
```

建议色系:紫 `#7c3aed+#3b82f6` / 橙 `#f59e0b+#ef4444` / 绿 `#6fcf97+#22c55e` / 粉 `#ec4899+#f472b6` / 蓝 `#0ea5e9+#6366f1` / 金 `#f0c060+#e8a830`

---

## 上线检查清单

- [ ] `STORAGE_KEY` / `TRACK_KEY` 全站唯一
- [ ] 基于 `model.html`,**没有**手写状态机/进度条/续答逻辑
- [ ] head 只有 `analytics.js` + `page-base.js` + `common.css`(+ 页面 style)
- [ ] **未**写死 favicon / 广告 / 重复 common.css 组件样式
- [ ] intro 用 `api.resumeBtn()` + `api.bindCount()`
- [ ] result 用 `resultFooterHTML()` 收尾
- [ ] 需要海报 → 引 `canvas-utils.js` + `poster.js`,用 `MQ.poster` 常量与脚手架
- [ ] 需要雷达图 → 引 `radar.js`,用 `MQ.radar()`
- [ ] 响应式:`@media (max-width: 420px)` 调整字号
- [ ] 测试:intro → 答题 → 上一题 → 揭示屏 → 结果 → 分享 → 再来一次 →(中途关掉页面再开)续答
- [ ] 在 `nav.js` 添加导航入口
- [ ] 在 `index.html` 添加展示卡片
