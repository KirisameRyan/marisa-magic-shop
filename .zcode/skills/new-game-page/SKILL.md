---
name: new-game-page
description: 为霧雨魔法店创建新的网页小游戏（canvas/互动游戏页）。涵盖 HTML 骨架、目录与命名、引擎代码模式、必做功能（暂停/静音/最高分/触屏）、站点注册（catalog.js + page-base）、排行榜/云存档接入、Toy 平台打包发布的完整制作规范。当用户要做新游戏、新建游戏页、上架游戏、问游戏页规范、或要把游戏打包上 Toy 时使用。
---

# 新建游戏页面 · Skill

为霧雨魔法店创建新的网页小游戏。**先找同类参照再动手，不要从零发明结构**：

- 单文件小游戏参照 `polo_ball.html` + `js/polo-ball.js`
- 多模块大游戏参照 `stg.html` + `js/stg/`（多文件挂 `window.<命名空间>`）
- 有排行榜/存档需求的参照 `marisa_survivor.html` + `js/marisa-survivor.js`

---

## 快速开始（5 步）

1. 建页面 `<game>.html`：复制参照页骨架，改标题、页面专属样式、overlay
2. 建引擎：`js/<game>.js`（单文件 IIFE）或 `js/<game>/`（多模块，html 里按依赖顺序引入）
3. 素材放 `images/<game>/`；音效放 `audio/sfx/`（全站共享）或 `audio/<game>/`（专属）
4. 在 `js/catalog.js` 的 `games` 数组加一条（新游戏同时加 `latest`）
5. 在 `js/page-base.js` 的 `injectSponsor()` 排除名单里加页面文件名

## HTML 骨架（一致性极强，照抄）

```html
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>游戏名 · 霧雨魔法店</title>
<script src="js/analytics.js"></script>
<script src="js/page-base.js"></script>
<link rel="stylesheet" href="css/common.css">
<style>/* 只写页面专属样式：手写 reset、深色底 var(--bg)、overlay、触屏 UI */</style>
</head>
<body>
  <div class="wrap">
    <canvas id="game" width="..." height="..."></canvas>
    <!-- 触屏 UI（按需）：虚拟摇杆/按钮，默认 .hide -->
    <!-- 场景遮罩 overlay（标题/暂停/结算…），用 .hide class 切换显示 -->
  </div>
  <script src="js/数据文件.js"></script>   <!-- 按需，如 js/stg/data.js -->
  <script src="js/<game>.js"></script>    <!-- 引擎，放最后 -->
</body>
```

**禁止事项：**
- **不要**手写 favicon / 广告 script（page-base 自动注入）
- **不要**在页面里引 `nav.js`/`shopNav`（那是测验页/主页的，游戏页不需要）
- **不要**重复 common.css 已有变量与组件（`--bg`/`--gold`/`--purple`/`--border`、金色渐变按钮等），只做主题覆盖

## 目录与命名规范

| 对象 | 规范 | 例 |
|---|---|---|
| 页面 | `<game>.html`，标题带「 · 霧雨魔法店」 | `stg.html` |
| 引擎 | 与 html 同名（连接符风格跟 html 保持一致） | `polo_ball.html` ↔ `js/polo-ball.js` |
| 多模块 | `js/<game>/` 目录，按依赖顺序引入，全部挂 `window.<NS>` | `js/stg/{data,engine,player,bullets,enemies,boss,main}.js` → `window.STG` |
| 图片 | `images/<game>/`，命名拼音或英文小写 | `images/stg/boss1.jpg` |
| 音效 | 共享 `audio/sfx/`；专属 `audio/<game>/`；BGM `audio/bgm.mp3` | |
| 存档 key | `<game>_` 前缀，全站唯一 | `ms_best`、`stg_best`、`stg_muted` |

## 引擎代码模式（单文件 IIFE）

```
头注释块（游戏名 · 一句话架构）
(function () { 'use strict';
  canvas/W/H 常量
  ── 可调参数 ──  var OPT = {...}      ← 所有魔数集中一处，别散在函数里
  ── DOM ──       var el = {...};      ← getElementById 批量取
  ── 状态 ──      var state = 'title'; // title|play|paused|result 状态机，用注释列出全部状态
  ── 音效 ──      有音频文件优先加载，没有则 WebAudio 合成兜底；≥60ms 节流防刷屏；静音开关
  init / update / draw 系列（按实体分函数）
  ── 主循环 ──    固定步长积分 + requestAnimationFrame
  事件绑定（键盘 + 触屏 + 静音按钮 + 失焦清输入）
})();
```

多模块版：数据/常量放 `data.js`，底层（preload/粒子/星空）放 `engine.js`，玩法实体各自一文件，`main.js` 只做状态机与编排。模块间只通过命名空间通信（如 `STG.CONFIG`、`STG.bullets.fire()`）。

## 必做功能清单（缺一项就是半成品）

- [ ] **暂停**：按钮 + Esc/P，切后台自动暂停
- [ ] **静音开关**：音效/BGM 可关，偏好存 localStorage
- [ ] **最高分**：`localStorage.setItem('<game>_best', ...)`，标题画面与结算画面都显示
- [ ] **触屏适配**：`touch-action:none`、虚拟摇杆或按钮、双指/低速等手势；`ontouchstart` + coarse pointer 检测
- [ ] **失焦清输入**：`blur`/`visibilitychange` 时清空按键状态防卡键
- [ ] **加载降级**：图片加载失败要有程序化绘制兜底，不能白屏崩
- [ ] **响应式**：canvas 按容器缩放，`@media (max-width: 420px)` 调整 UI

## 站点注册（不做等于没上线）

`js/catalog.js` 是唯一数据源（主页货架 + 汉堡菜单 + 搜索全自动），条目格式：

```js
{ href: 'stg.html', emoji: '🌟', name: '星之魔弹',
  tag: '弹幕射击', color: 'purple',
  desc: '一句话卖点，写清玩法与特色。' }
```

- `color` 色板：`red` / `purple` / `gold` / `blue` / `green` / `pink` / `lime` / `dark`
- 新游戏同时加进 `games` 和 `latest`
- `js/page-base.js` 的 `injectSponsor()` 硬编码排除名单加页面文件名（游戏页不注赞助码）
- 可选：README.md 小游戏清单补一行

## 排行榜 / 云存档接入

page-base 已预载 `api-config.js`（`window.API_BASE`）和 `auth.js`（`Auth` 模块），直接用：

```js
// 拉排行榜（每游戏一个 game=<slug>）
fetch(API_BASE + 'api/leaderboard.php?game=<slug>', { headers: { 'Authorization': 'Bearer ' + Auth.token() } })
  .then(function(r) {
    if (r.status === 401) { Auth.loginPrompt(lbArea, loadLB); return null; }
    return r.json();
  });
// 提交分数：POST FormData + Bearer token，同样 401 → Auth.loginPrompt
// 云存档：Auth.api('api/gamesave.php', { method:'POST', body:f, silent:true })
```

本地最高分**无论如何都要有**（localStorage），排行榜是增强不是替代。

## Toy 平台发布

打包到 `toy-build/<slug>/`（手动按依赖拷贝，只带本游戏所需文件）：

```
toy-build/<slug>/
  index.html      ← 精简单页：去掉 analytics.js，背景按 Toy 风格调
  ...其余页面
  fengmian.png    ← 封面图
  nav.js          ← Toy 版空壳（无 shopNav，toggleNav 空实现）
  page-base.js / css/common.css / js/(仅所需模块) / images/(仅所需) / audio/(仅所需)
```

zip 后用 toy CLI 上传，**发布/更新是 预览→确认→提交审核 两段式**，铁律与命令详见用户级 skill `toy`（`~/.agents/skills/toy/SKILL.md`），AI 调用一律 `--json`。

---

## 上线检查清单

- [ ] 存档 key（`<game>_best` 等）全站唯一
- [ ] head 只有 `analytics.js` + `page-base.js` + `common.css`（+ 页面 style），标题带「 · 霧雨魔法店」
- [ ] 未手写 favicon / 广告 / nav；未重复 common.css 组件样式
- [ ] 引擎有 OPT 参数表、状态机注释、加载降级
- [ ] 暂停 / 静音 / 最高分 / 触屏 / 失焦清输入 全部可用
- [ ] 图片路径正确且失败有兜底；音效文件存在或走合成兜底
- [ ] 测试全流程：标题 → 玩法说明 → 开局 → 暂停/恢复 → 中弹 → 结算 → 再来一次 → 中途刷新不崩
- [ ] 移动端实测：摇杆/按钮/双指手势、切后台暂停
- [ ] 在 `js/catalog.js` 加了条目（games + latest）
- [ ] 在 `js/page-base.js` `injectSponsor()` 排除名单登记
- [ ] 需要排行榜 → `api/leaderboard.php?game=<slug>` 接入并实测提交
- [ ] 上 Toy → `toy-build/<slug>/` 按依赖拷贝 + fengmian.png + 两段式提交
