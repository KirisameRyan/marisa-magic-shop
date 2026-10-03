# 魔理沙幸存者 · 改造方案 v2（动态分辨率 / 悬浮摇杆 / 全屏锁定）

> 本文档是 v1（`marisa_survivor_改造方案.md`）的**增量修订**，基于 v1 已落地的代码实测后编写。
> 目标文件仍然只有两个：`marisa_survivor.html`、`js/marisa-survivor.js`。
> 硬性约束同 v1：纯原生 ES5（`var`/`function`）、零依赖、不改游戏数值与存档、行号会漂移一律按标识符搜索定位。

---

## 0. v2 要解决的问题

### 0.1 用户反馈（实测均已复现确认）

| # | 反馈 | 现状与根因 |
|---|------|-----------|
| F1 | fitStage 按固定 16:9 填充，手机屏幕比例各异，左右大黑边 | `var W = 960, H = 540` 是常量，`fitStage()` 只按 `s=min(aw/W,ah/H)` 缩放。**逻辑分辨率固定** → 844×390 横屏实测画布仅 608px 宽，两侧各约 118px 黑边，屏幕利用率 72% |
| F2 | 固定摇杆手感奇怪 | `JOY = { x:105, y:H-105, r:62 }` 固定左下，touchstart 还做了摇杆区距离门（约 594 行），手指必须够到角落 |
| F3 | 误触画面外区域会触发页面滑动 | body 仅 `overflow:hidden` + `touch-action:manipulation`，iOS 橡皮筋/Android 下拉刷新/滚动链都没封死；且顶部站点导航常驻占 48px |
| F4 | 排查其他移动端 bug | 见 0.2（实测新发现） |

### 0.2 实测新发现的 bug（844×390 / 390×844 模拟验证）

| # | bug | 证据/根因 |
|---|-----|----------|
| B1 | **暂停按钮在开始页、选角页裸露**（未开局也显示在画面右上） | `#pauseBtn` 无任何按 gameState 显隐的逻辑 |
| B2 | **横屏暂停面板"继续/重新开始"按钮被挤出屏幕** | `.pause-box` 内容流式排布，390 高度下摘要+Tab+12格数据占满，`.pz-foot` 需要滚动才够到 |
| B3 | **按暂停键会同时激活摇杆**（隐患） | `#pauseBtn` 在 `.stage` 内、是 wrap 子树，触摸事件冒泡到 wrap 的 touchstart 会激活摇杆。现有代码无 `e.target` 排除 |
| B4 | **HUD 文字在小屏过小** | 逻辑字号 9~13px，s≈0.63 时物理仅 5.7~8.2px，计时/血量勉强可辨 |
| B5 | **Boss 条与 HP 条在窄逻辑宽下重叠** | drawHUD 中 boss 条宽 `min(560, W-360)` 居中：W=920 时 boss 条左缘 180 < HP 条右缘 216 |
| B6 | **刷怪半径硬编码** | `spawnEnemy` 的 `dist = 640 + rand*120`（约 715 行）按 960×540 半对角线(≈551)设计；视口变宽后怪会**刷在屏幕内**。同类：520（约 1042/1062 行 wave 刷怪）、620（约 1091 行处刑者）、Boss 入场 `player.y - 620`（约 775 行） |
| B7 | 结算页排行榜名字输入框在横屏弹键盘时可能被遮 | 输入框在 overlay 滚动流内，未做 focus 滚动 |

---

## 1. 核心架构决策：动态逻辑分辨率（F1 的总方案）

### 1.1 原则

**不是拉伸，不是 letterbox，而是视口自适应**：逻辑高度恒定，逻辑宽度随设备宽高比伸缩——每个设备看到的世界垂直范围一致（难度公平），水平方向宽屏多看、窄屏少看。canvas 物理像素永远 1:1 匹配，画面零变形、零黑边。

### 1.2 fitStage v2 规范（替换现有约 13–32 行）

```js
var BASE_H = 540;          // 逻辑高度恒定基准
var HUD_SCALE = 1;         // HUD 独立缩放（供 drawHUD/摇杆使用）
function fitStage() {
  // …（沿用现有：取 stageEl/stageUiEl/wrap，aw/ah 为 0 时 return）
  var aspect = aw / ah;
  if (aspect >= 1) {
    // 横屏/方屏：动态逻辑宽
    H = BASE_H;
    W = Math.round(BASE_H * aspect);
    if (W > 1600) W = 1600;              // 超宽屏视野封顶
  } else {
    // 竖屏跳过引导的降级路径：维持固定 960×540 letterbox（现状行为）
    W = 960; H = 540;
  }
  var s = Math.min(aw / W, ah / H);      // aspect>=1 时两边恰好同时贴满，无黑边
  if (s > 2) s = 2;
  STAGE_S = s;
  stageEl.style.width  = Math.round(W * s) + 'px';
  stageEl.style.height = Math.round(H * s) + 'px';
  // ★ stage-ui 逻辑盒跟随动态 W/H（原为写死 960×540）
  stageUiEl.style.width  = W + 'px';
  stageUiEl.style.height = H + 'px';
  stageUiEl.style.transform = 'scale(' + s + ')';
  var k = Math.min(2.5, s * (window.devicePixelRatio || 1));
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = true;
  // ★ HUD 独立缩放：小屏放大，保证文字物理可读（9px 逻辑在 s=0.63 时仅 5.7px）
  HUD_SCALE = Math.min(1.6, Math.max(1, 1.05 / s));
}
```

注意：`W`/`H` 从"常量"变为"每次 fitStage 可写的 var"（本来就是 `var`，语义变化而已）。

### 1.3 W/H 动态化影响清单（逐条核对，多数天然兼容）

| 代码位置（标识符） | 现状 | 处置 |
|---|---|---|
| `camX = player.x - W/2`（draw 内） | 每帧读 W/H | ✅ 天然兼容，不动 |
| `onScreen(x,y,m)`、`drawBgLayer` 平铺循环 | 每帧读 W/H | ✅ 不动 |
| 各 `fillRect(0,0,W,H)`（清屏/压暗/红闪/白闪/低血晕） | 每帧读 | ✅ 不动 |
| 低血晕 `createRadialGradient(W/2,H/2,…)`、魔法阵 `W/2,H/2` | 每帧读 | ✅ 不动 |
| 竖向光束 `lineTo(vx4, H)`、`fillRect(lvx-14, 0, 28, H)` | 每帧读 | ✅ 不动 |
| `drawHUD()`（3591 起） | 每帧读但写死 200px 条宽/9px 字 | ⚠️ 按 §1.4 改造 |
| `toCanvas()` | 基于 getBoundingClientRect | ✅ 不动 |
| `JOY`（581 行） | 加载期固化 `H-105` | ❌ 删除，被 Workstream G 悬浮摇杆取代 |
| `spawnEnemy` 刷怪半径 `640+rand*120` | 按 960×540 设计 | ⚠️ 改 `Math.sqrt(W*W+H*H)/2 + 60 + Math.random()*120` |
| wave 刷怪 520（约 1042/1062）、处刑者 620（约 1091） | 同上 | ⚠️ 同样改用半对角线公式（提取 helper：`function viewSpawnDist(m){ return Math.sqrt(W*W+H*H)/2 + m; }`） |
| Boss 入场 `player.y - 620`（约 775） | 固定 | ⚠️ 改 `player.y - (H/2 + 90)` |
| `.stage-ui` 内 spellCard/bossBanner/eventBanner | % 定位 + 逻辑盒 | ✅ % 定位天然适配动态盒（配合 1.2 中 stage-ui 尺寸动态化） |

### 1.4 drawHUD 适配（B4/B5）

- 所有尺寸/字号乘 `HUD_SCALE`：HP 条 `hw = Math.min(200*HUD_SCALE, W*0.3)`、`hh = 13*HUD_SCALE`；字号 `9px`→`(9*HUD_SCALE)+'px'` 等（hudStrokeText 的字体参数是字符串，用拼接）。
- Boss 条：宽 `bw = Math.min(520, W - 500*HUD_SCALE)`（保证不与 HP 条重叠）；当 `W < 1000` 时 Boss 条整体从 y=14 下移到 y=46（HP 行下方），名字字号减 1。
- 其余不变。

---

## 2. Workstream G：悬浮摇杆（F2，替换 581–621 行整段）

### 2.1 交互规范

```
按下（touchstart，gameState==='playing' 且摇杆未激活）：
  - e.target 若位于 #pauseBtn 或任何 button/overlay 内 → 忽略（防 B3 穿透）
  - 落点即摇杆基准点：joy.bx/joy.by = toCanvas(touch)
拖动（touchmove）：
  - 位移 = (当前触点 - 基准点)，逻辑坐标换算后取方向
  - 有效半径 R=56 逻辑单位：模长 d=min(dist,56)，dx=dir.x*d/56，dy=dir.y*d/56
  - 死区：dist<6 → dx=dy=0
抬起（touchend/cancel）：释放，摇杆消失
多指：仅跟踪第一个 identifier，其余忽略（沿用 joy.id 机制）
```

### 2.2 绘制规范（draw 内，替换原固定摇杆段）

- 仅 `joy.active` 时绘制：基准环（r=56，fill `#b89fff`，alpha 0.22）+ 摇杆柄（r=22，位于 基准点+方向×min(dist,56)，alpha 0.5）。
- 新手引导：`isTouch && gameState==='playing' && gameTime<6 && !joy.active` 时，在玩家下方 60 逻辑单位处画呼吸提示文字「按住屏幕任意位置拖动」（11px×HUD_SCALE，alpha 正弦呼吸）。

### 2.3 删除清单

- `var JOY = {...}`、touchstart 中的摇杆区距离门（`jdx*jdx+…>(JOY.r+55)^2`）、draw 中 `JOY.x/JOY.y` 引用。
- `joy.sx/joy.sy`（client 基准）改为逻辑基准 `joy.bx/joy.by`；touchmove 里直接用 `toCanvas(t.clientX,t.clientY)` 减基准点，省去 client→逻辑的比例换算错误风险。

---

## 3. Workstream H：页面滑动锁定 + 伪全屏（F3）

### 3.1 滑动锁死（三层兜底）

```css
/* 1. 滚动链/橡皮筋/下拉刷新 */
html, body { overscroll-behavior: none; }
/* 2. 游戏区禁掉一切触摸默认行为（缩放/滚动/双击放大） */
.canvas-wrap { touch-action: none; }
/* 3. 但菜单 overlay 内必须可滚动（暂停面板/公告/排行榜） */
.overlay { touch-action: pan-y; }
```

```js
// 4. JS 兜底：局内 wrap 上的 touchmove 一律阻止（不再只在 joy.active 时）
wrap.addEventListener('touchmove', function(e){
  if (gameState === 'playing') e.preventDefault();
}, { passive:false });
// 5. 长按菜单/右键
wrap.addEventListener('contextmenu', function(e){ e.preventDefault(); });
```

body 补 `-webkit-touch-callout: none;`（iOS 长按弹窗）。

### 3.2 伪全屏（主方案，全平台通用）+ Fullscreen API（增强）

**主方案：`body.ingame` 隐藏站点导航**——不依赖任何 API，iOS/微信/X5 全部生效：

```css
body.ingame #shopNav { display: none; }
body.ingame .game-container { height: 100dvh; padding-left:0; padding-right:0; }
```

- 进入：`startGame()` 末尾 `document.body.classList.add('ingame')`（nav 隐藏 → wrap 变高 → resize 事件触发 fitStage 自动铺满）。加一行兜底：classList.add 后手动调一次 `fitStage()`（部分浏览器 display:none 不触发 resize）。
- 退出：回到开始页的出口（死亡结算"返回"/初始化流程显示 startOverlay 处）`remove('ingame')` + 同样手动 `fitStage()`。grep `startOverlay` 的 `classList.remove('hide')` 全部出口。

**增强：Fullscreen API + 横屏锁定**（Android Chrome 可连系统栏一起隐藏）：

```js
function tryEnterFS() {
  var el = document.documentElement;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) { try { var p = fn.call(el); if (p && p.catch) p.catch(function(){}); } catch(e){} }
  if (screen.orientation && screen.orientation.lock) {
    try { screen.orientation.lock('landscape').catch(function(){}); } catch(e){}
  }
}
function tryExitFS() {
  var fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) { try{ fn.call(document); }catch(e){} }
}
```

- 触发时机：`startGame()` 内（该函数总是由按钮点击触发：确认/教程完成/再来一次，满足用户手势要求）。退出随 `ingame` 移除。
- iPhone Safari 无 Fullscreen API → 静默跳过，伪全屏已兜底；`screen.orientation.lock` 不支持时 catch 忽略。
- 用户手势主动退出全屏（Android 返回键）→ 不强制再进，`ingame` 状态保持即可。
- 注意：Fullscreen 后 wrap 尺寸变化同样经 resize→fitStage 自适应，**动态分辨率方案天然兼容，无需特判**。

---

## 4. Workstream I：实测 bug 修复清单（B1–B7）

| # | 修法 |
|---|------|
| B1 暂停键裸露 | JS 控制显隐：`pauseBtn.style.display = inGame ? '' : 'none'`（inGame 判定与 drawHUD 门控一致：playing/paused/levelup/relic）。在状态切换点（startGame/togglePause/showLevelUp/showRelicChoice/gameOver 及初始化）统一调一个小函数 `syncPauseBtn()`；初始化时先隐藏 |
| B2 暂停按钮不可达 | `.pause-box` 改为 `display:flex;flex-direction:column;height:100%;max-height:100%`：`.pz-head`/`.pz-tabs` 固定，`.pz-body{flex:1;min-height:0;overflow-y:auto}`，`.pz-foot` 固定收尾。**继续/重开永远钉在底部** |
| B3 暂停键触摸穿透 | wrap 的 touchstart 首行：`if (e.target && e.target.closest && e.target.closest('#pauseBtn,button,.overlay')) return;` |
| B4 HUD 过小 | 见 §1.4 HUD_SCALE |
| B5 Boss 条重叠 | 见 §1.4 窄宽下移规则 |
| B6 刷怪半径 | 见 §1.3 `viewSpawnDist(m)` helper |
| B7 输入框遮挡 | 排行榜名字输入框 `focus` 时 `scrollIntoView({block:'center'})`；横屏时可给 `#lbArea` 加 `max-height` + 滚动。低优先 |

---

## 5. 实施顺序与验收

| 阶段 | 内容 | 独立验证 |
|------|------|---------|
| 1 | §1.2 fitStage v2 + §1.3 影响清单（先不动 HUD/摇杆） | 844×390 横屏：画布铺满无黑边；1280×720、1024×768、1920×1080 同样无黑边；竖屏跳过后维持 16:9 letterbox |
| 2 | §1.4 drawHUD（HUD_SCALE + Boss 条规则） | 844×390：HP 数字、计时清晰可读；`__ms.spawnBoss(0)` 验证 Boss 条不与 HP 条重叠 |
| 3 | Workstream G 悬浮摇杆 | 真机/触屏模拟：任意位置按下即拖；松手消失；按暂停键不激活摇杆；前 6 秒引导提示 |
| 4 | Workstream H 滑动锁定 + ingame + Fullscreen | 局内四指乱划页面纹丝不动；导航栏局内消失、回开始页恢复；Android 全屏+锁横屏生效（iOS 跳过不报错） |
| 5 | Workstream I 清单 | 逐条对照回归 |
| 6 | 全量回归矩阵 | 下表 |

**回归矩阵**：1920×1080 / 1440×900 / 1280×720 / 1024×768（iPad）/ 844×390 / 667×375 / 390×844（竖屏引导→跳过两条路径）。每档验证：无黑边无拉伸、HUD 可读、刷怪不出现在屏内（`__ms.skip(60)` 后观察出生点）、暂停面板按钮可达、升级三选一不裁切。

**性能抽查**：超宽 W=1600 时满屏弹幕 60fps；`cv.width` ≤ 4000（k 封顶生效）。

---

## 6. 禁忌（在 v1 基础上追加）

1. `W`/`H` 只允许在 `fitStage()` 内赋值；任何其他代码不得写 W/H。
2. 不得为适配而改动任何玩法数值（移速/刷怪间隔/武器范围等）——视口变化导致的"看得多/少"是允许的唯一差异。
3. `#shopNav` 只许 `display:none` 切换，不得修改 nav.js 本体或影响其他页面（ingame class 只在本页 body 上）。
4. Fullscreen/orientation.lock 所有调用必须 try/catch + promise catch，任何失败不得中断开局流程。
5. 竖屏降级路径（aspect<1 固定 960×540）必须保留，不得让竖屏跳过者拿到过窄的动态 W。
6. 其余沿用 v1 §8：不动 gameState/存档 key/window.* 导出/逻辑坐标系（除本文明列的 spawn 半径与 Boss 入场外）/ES5 风格/删 DOM 前 grep。
