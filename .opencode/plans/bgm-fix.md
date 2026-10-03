# BGM 起播修复 + 暂停页音量条（待执行）

> 状态：代码编辑权限当前被禁用，等待解锁后执行。目标文件：`js/marisa-survivor.js`、`marisa_survivor.html`。

## 背景

用户反馈：桌面鼠标点击 + 键盘移动、整局游戏结束都听不到 BGM。已核实：
- `audio/bgm.mp3` 存在且 MP3 头有效（ID3v2.3，8.6MB），git 记录正常
- 音频代码路径可达：keydown → `initAudio()` → `initBgm()`
- 旧实现缺陷：`if (bgm || !CONFIG.BGM) return;` 一次创建失败后永不重试，且 `play()` 失败被静默 catch

## 改动 1：js/marisa-survivor.js 音效段（替换 initAudio/initBgm）

```js
var audioCtx = null;
var bgm = null;
var bgmVol = 18; // 0-100，可在暂停页调节
var bgmHinted = false, bgmBlockHintT = 0;
try {
  var savedBgmVol = localStorage.getItem('ms_bgmvol');
  if (savedBgmVol !== null) {
    var nv = parseInt(savedBgmVol, 10);
    if (!isNaN(nv)) bgmVol = Math.max(0, Math.min(100, nv));
  }
} catch (e) {}
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended' && audioCtx.resume) { try { audioCtx.resume(); } catch(e) {} }
  ensureBgm();
}
function ensureBgm() {
  if (!CONFIG.BGM || bgmVol <= 0) return;
  if (!bgm) {
    try {
      bgm = new Audio(CONFIG.BGM);
      bgm.loop = true;
      if (bgm.addEventListener) {
        bgm.addEventListener('error', function () {
          console.warn('[BGM] load error', bgm && bgm.error ? bgm.error.code : '');
          bgm = null;
        });
      }
    } catch (e) { bgm = null; console.warn('[BGM] create failed', e); return; }
  }
  bgm.volume = bgmVol / 100;
  if (bgm.paused) {
    var pr = bgm.play();
    if (pr && pr.then) {
      pr.then(function () {
        console.log('[BGM] playing');
        if (!bgmHinted) { bgmHinted = true; addLabel(player.x, player.y - 60, '🎵 音乐已开启', '#8fd8ff'); }
      }).catch(function (e) {
        console.warn('[BGM] blocked:', e && e.name ? e.name : e);
        if (frameCount - bgmBlockHintT > 300) {
          bgmBlockHintT = frameCount;
          addLabel(player.x, player.y - 60, '🔊 点击开启音乐', '#f0c060');
        }
      });
    }
  }
}
```

## 改动 2：手势兜底（keyup 监听之后追加）

```js
document.addEventListener('pointerdown', function() { initAudio(); }, true);
document.addEventListener('touchstart', function() { initAudio(); }, true);
```

## 改动 3：暂停页音量条

HTML（pauseOverlay 的 `.pz-body` 与 `.pz-foot` 之间）：

```html
<div class="pz-vol">
  <span>🔊</span>
  <input type="range" id="bgmVol" min="0" max="100" step="1" value="18">
  <span id="bgmVolVal">18%</span>
</div>
```

CSS：

```css
.pz-vol{display:flex;align-items:center;gap:10px;justify-content:center;margin-top:10px;font-size:12px;color:#8a7e9a;}
.pz-vol input[type=range]{width:180px;accent-color:#f0c060;}
```

JS（暂停 Tab 绑定之后）：

```js
var bgmVolEl = document.getElementById('bgmVol');
var bgmVolValEl = document.getElementById('bgmVolVal');
function applyBgmVolUI() {
  if (bgmVolEl) bgmVolEl.value = String(bgmVol);
  if (bgmVolValEl) bgmVolValEl.textContent = bgmVol + '%';
}
if (bgmVolEl) {
  applyBgmVolUI();
  bgmVolEl.addEventListener('input', function () {
    bgmVol = Math.max(0, Math.min(100, parseInt(bgmVolEl.value, 10) || 0));
    try { localStorage.setItem('ms_bgmvol', String(bgmVol)); } catch (e) {}
    if (bgmVolValEl) bgmVolValEl.textContent = bgmVol + '%';
    if (bgmVol <= 0) { if (bgm) bgm.pause(); }
    else ensureBgm();
    sfxCard();
  });
}
```

## 改动 4：调试钩子 `__ms.audio()`

```js
audio: function() {
  return {
    hasBgm: !!bgm,
    paused: bgm ? bgm.paused : null,
    currentTime: bgm ? bgm.currentTime : null,
    volume: bgm ? bgm.volume : null,
    readyState: bgm ? bgm.readyState : null,
    error: bgm && bgm.error ? bgm.error.code : null,
    ctxState: audioCtx ? audioCtx.state : null,
    vol: bgmVol
  };
},
```

## 验收

1. `node --check js/marisa-survivor.js`
2. `node scripts/test-survivor.js`（Audio 桩兼容：代码里已用 `bgm.addEventListener`/`pr.then` 能力检测）
3. 桌面：鼠标点「出发」→ 应立刻有 BGM；按键盘也可
4. 暂停页拖音量条 → 音量实时变化、刷新后保持；0 静音
5. 若仍无声：控制台执行 `__ms.audio()`，看 `paused/error/ctxState/volume` 定位
