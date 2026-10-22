# 💿 旧核 · 梦核 · 怪核 图片滤镜实验室

### Retrocore · Dreamcore · Weirdcore Photo Filter Lab v6.0

**A Pure Browser-Based Parameter-Vector Photographic Aesthetics & Visual Degradation Engine**

[简体中文](#-简体中文) | [English](#-english) | [日本語](#-日本語)

### 🌐 在线体验 / Live Demo / オンライン実演

| 工作台 / Studio | 核心定位与特色 / Core Feature | 快速入口 / Access | 
| ----- | ----- | ----- | 
| **8-Bit Retro Hardware Studio** | 真实硬件级像素与 GIF 转换 | [👉 立即打开](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/) | 
| **DREAMCORE 旧核·梦核·怪核滤镜实验室** | 像素级 Canvas 梦境渲染 (v6.0) | [👉 立即打开](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/dreamcore.html) | 

## 🇨🇳 简体中文

### 🌟 项目简介

**旧核·梦核·怪核图片滤镜实验室（v6.0）** 是一款运行于现代浏览器的**单文件无依赖（Single-File）沉浸式视觉模拟工作台**。底层基于纯原生 HTML5 Canvas 2D 像素操作打造，无需安装任何依赖环境，全程在本地浏览器内完成所有图像处理，隐私绝对安全。

本工具专注于复现 1990s 至 2000 年代初的**千禧旧核（Oldcore/Nostalgiacore）**、白日梦境（Dreamcore）**与**荒诞超现实（Weirdcore/Analog Horror）视觉范式。

### 🌐 在线体验与相关工作台

| 工作台 / 项目 | 核心特色 | 在线入口 | 
| ----- | ----- | ----- | 
| **8-Bit Retro Hardware Studio** | 真实硬件级像素与 GIF 转换 | [👉 立即打开](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/) | 
| **DREAMCORE 旧核·梦核·怪核滤镜实验室** | 像素级 Canvas 梦境渲染 (v6.0) | [👉 立即打开](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/dreamcore.html) | 

### ✨ 核心特性

1. **经典胶片模拟矩阵（以胶片型号直接命名）**

   * **`Cinestill 800T`**：去除防光晕层的电影钨丝灯高感负片，重现迷雾夜景车灯、警灯与路灯周围标志性的**红橙色高光晕影（Halation）**、冷青绿暗部与高感粗颗粒。

   * **`LomoChrome Color '92`**：复古低保真美学，低饱和暖调哑光色彩、重度不规则粗颗粒、泥泞灰雾暗部与黄昏梦核氛围。

   * **`Kodak Portra 400 (+2 Push)`**：昏暗房间柔焦肖像，温暖丝滑的奶油色调、极佳的高光过渡、细腻颗粒与边缘柔和红晕。

   * **`Fujifilm Superia 400`**：偏冷青绿胶片底色、克制真实的阴天漫射光感、低反差与阈限空间静谧感。

   * **`Lucky C200`（乐凯彩卷）**：中式千禧旧核代表，青绿暗部、微黄高光与怀旧散射红晕。

   * **`Kodak Gold 200`**：经典千禧家庭相册暖金黄调、温润暗部抬升与阳光颗粒。

   * **`Fujifilm Natura 1600`**：绝版月光高感神卷，1600 度弱光彩噪、青绿灰雾与夜拍空气感。

   * **`Agfa Vista 400`**：德系浓郁街拍卷，暖红高反差与浓郁胶片层次。

   * **`Kodak Ektachrome E100`**：90s 彩色反转片正片，清冷钴蓝高锐度与画报光泽。

2. **高光红橙光晕（Halation）渲染通道**

   * 突破常规 Bloom 的白色提亮，独创高光阈值提取与高斯红橙双阶色散散射算法，精准还原电影胶片与夜巡车灯的真实光晕。

3. **符号层像素级脏化与做旧融合管线**

   * 彻底解决文字与标签“漂浮脱节”问题：日期戳、VHS OSD、怪核标签与留白边框先经过**低清像素栅格化、RGB 通道分离、VHS 色度扩散、水平撕裂、颗粒彩噪与低频脏污侵蚀**，再与画面的柔焦泛光、光晕与 CRT 扫描线统一融合。

   * 配备「文字/标签像素脏化与噪点融合度」滑块（默认 88%），自由调节做旧深度。

4. **输出图片分辨率自由控制**

   * 本地照片载入默认保留 **100% 原始尺寸**（长边超过 4096px 时严格按原始比例缩放，拒绝挤压形变）。

   * 提供 `640p`、`800p`、`720p`、`1080p`、`2K`、`4K` 预设，并支持自定义宽高像素与比例锁定导出。

5. **千禧相纸留白边框（Polaroid）客制化配字**

   * 相纸边框底部文字支持完全自由输入，清空即可呈现纯白无字经典相纸留白。

6. **怪核标签与遮挡条超幅自由操控**

   * 尺寸上限大幅拓展至 **600%**，支持跨出画布边界随意拖拽，并允许标签与纯黑遮挡条直接覆盖并溢出相纸/显像管边框。

7. **纯正 Y2K 千禧界面风格**

   * **💿 Y2K 冰晶铬银（默认）**：珍珠铬银金属渐变面板、钴蓝硬边立体投影、粉蓝高光渐变胶囊按钮、糖果粉凝胶滑块。

   * **⚡ Y2K 酸性霓虹**：千禧电子半透靛蓝壳体，荧光酸绿（`#b8ff01`）、冰青色与芭比粉碰撞。

   * 采用兼具千禧科技美学与清晰阅读体验的字体体系（`Orbitron` + `Chakra Petch` + `M PLUS Rounded 1c` / `Noto Sans SC`）。

8. **限制性随机梦境（Scoped Randomize）**

   * 可在「🎲 全域随机」、「✨ 梦核随机」、「👁️ 怪核随机」、「📼 旧核随机」中一键生成对应美学范畴的随机参数。

9. **全参数数字直接键入 & 风格复刻码（Seed）**

   * 右侧所有参数项均支持直接输入数字修改，与滑块实时双向同步。支持一键导出/导入 `DC2-...` Base64 风格复刻码。

### 🚀 快速上手

1. 下载仓库中的 `旧核·梦核·怪核图片滤镜实验室 v6.0.html`。

2. 双击在任何现代浏览器（Chrome、Edge、Safari、Firefox）中直接打开，无需搭建任何本地服务器或 Node.js 环境。

3. 点击「上传图片」或直接拖入本地照片，即可实时调色与导出高分辨率 PNG。

## 🇬🇧 English

### 🌟 Introduction

**Retrocore · Dreamcore · Weirdcore Filter Lab (v6.0)** is a **zero-dependency, single-file browser application** engineered for authentic retro-photographic emulation and visual degradation. Built upon pure Vanilla HTML5 Canvas 2D pixel processing, it runs 100% locally on your machine with zero server communication and total privacy.

The laboratory specializes in faithfully recreating the aesthetic movements of the 1990s and early 2000s: **Nostalgiacore / Oldcore**, **Dreamcore**, **Weirdcore**, and **Analog Horror**.

### 🌐 Live Demo & Companion Studios

| Studio / Project | Core Feature & Architecture | Live Access | 
| ----- | ----- | ----- | 
| **8-Bit Retro Hardware Studio** | Authentic hardware-grade pixelation & GIF conversion | [👉 Launch App](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/) | 
| **DREAMCORE Photo Filter Lab** | Pixel-grade Canvas dream degradation engine (v6.0) | [👉 Launch App](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/dreamcore.html) | 

### ✨ Key Features

1. **Iconic Film Simulation Matrix (Named Directly by Film Stocks)**

   * **`Cinestill 800T`**: Remjet-free tungsten cine stock featuring prominent warm red-orange halation halos around night lights, cool cyan-green shadow casts, and high-ISO tungsten grain.

   * **`LomoChrome Color '92`**: Lo-fi retro aesthetic with muted warm colors, heavy irregular film grain, and nostalgic hazy twilight vibes.

   * **`Kodak Portra 400 (+2 Push)`**: Soft-focus portraiture with warm creamy tones, gentle highlight roll-off, fine grain, and subtle glow.

   * **`Fujifilm Superia 400`**: Cool green-cyan film base, honest overcast lighting, subdued contrast, and quiet liminal atmosphere.

   * **`Lucky C200`**: Legendary Millennium Chinese film stock with cyan shadows, warm highlights, and authentic gritty nostalgia.

   * **`Kodak Gold 200`**: Warm amber-golden tones reminiscent of 90s family album prints.

   * **`Fujifilm Natura 1600`**: Discontinued high-speed night film with rich low-light chromatic grain and cyan shadow lift.

   * **`Agfa Vista 400`**: German street photography film with punchy magenta-red saturation and solid contrast.

   * **`Kodak Ektachrome E100`**: 90s editorial slide film with crisp contrast, deep blacks, and cool cobalt-chrome tones.

2. **Optical Red-Orange Halation Pass**

   * Custom dual-stage Gaussian dispersion algorithm that extracts intense highlights and bleeds warm red-orange tungsten halos into surrounding pixels.

3. **Pixel-Level Overlay Distress & Medium Integration Pipeline**

   * Seamlessly binds Date Stamps, VHS OSDs, Weirdcore text boxes, censor bars, and photo frames into the degraded image: every overlay undergoes **pixel-grid downsampling, RGB chromatic aberration, VHS chroma bleed, tape tear jitter, film noise, and dirty smudge erosion** before receiving bloom, halation, and scanlines.

   * Adjustable "Overlay Distress / Grain Fusion" slider (default 88%).

4. **Arbitrary Output Resolution Control**

   * Keeps 100% full-resolution uploaded images (proportional scaling for images >4096px without aspect-ratio squashing).

   * Presets for `640p`, `800p`, `720p`, `1080p`, `2K`, and `4K UHD`, alongside custom width/height inputs with aspect-ratio locking.

5. **Customizable Polaroid Paper Caption**

   * Editable caption text field for Polaroid frames; leave empty for a clean blank border.

6. **Unrestricted Weirdcore Tag / Censor Bar Manipulation**

   * Scaling slider expanded up to **600%**; freely drag tags across and beyond canvas borders, overlaying frames on demand.

7. **Authentic Millennium Y2K UI Design**

   * **💿 Y2K Cyber Chrome (Default)**: Metallic chrome panels, cobalt-blue bevel borders, bubblegum-pink gel sliders, and cyber-grid backdrop.

   * **⚡ Y2K Acid Neon**: Translucent deep indigo shell with high-voltage cyber lime (`#b8ff01`), ice cyan, and hot pink accents.

   * High-legibility futuristic typography (`Orbitron` + `Chakra Petch` + `M PLUS Rounded 1c` / `Noto Sans SC`).

8. **Scoped Randomize Generator**

   * Restrict random seed generation to "🎲 All", "✨ Dreamcore", "👁️ Weirdcore", or "📼 Oldcore".

9. **Direct Numeric Typing & Recipe Seed Code**

   * All 27 parameter inputs support direct numeric typing and keyboard arrow adjustments, with bidirectional slider sync and `DC2-...` Base64 code export/import.

### 🚀 Getting Started

1. Download `旧核·梦核·怪核图片滤镜实验室 v6.0.html` from the repository.

2. Double-click to open in any modern web browser (Chrome, Edge, Safari, Firefox).

3. Upload or drag-and-drop your image to process and export high-res PNGs immediately.

## 🇯🇵 日本語

### 🌟 プロジェクト概要

**旧核・夢核・怪核 映像濾過実験室（v6.0）** は、現代のウェブブラウザ上で完全に動作する**単一ファイル・外部依存ゼロ（Single-File）の画像処理ワークステーション**です。純粋な HTML5 Canvas 2D ピクセル演算エンジンを基盤とし、外部サーバー通信を行わず、端末内で安全かつ高速に画像処理を完結できます。

1990年代から2000年代初頭の**千禧年旧核（Nostalgiacore）**、**白日夢の残像（Dreamcore）**、そして不穏な超現実（Weirdcore / Analog Horror）の視覚言語を忠実に再現します。

### 🌐 オンライン体験・工房案内

| 工房 / 制作物 | 主な機能と特徴 | 体験・起動 | 
| ----- | ----- | ----- | 
| **8-Bit Retro Hardware Studio** | 実機水準の画素化処理と GIF 変換 | [👉 今すぐ起動](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/) | 
| **DREAMCORE 旧核・夢核・怪核 映像濾過実験室** | 画素水準の Canvas 夢境描画 (v6.0) | [👉 今すぐ起動](https://zhaoyuming3647-design.github.io/Retro-Style-Studio/dreamcore.html) | 

### ✨ 主な機能

1. **実在の銘柄に基づく名作フィルム再現群**

   * **`Cinestill 800T`**：ハレーション防止層を除去した映画用高感度タングステンフィルム。夜景の車灯や街灯の周囲に広がる鮮烈な**赤橙色の光滲み（Halation）**、冷たい青緑の暗部階調、高感度粒子を完全再現。

   * **`LomoChrome Color '92`**：低保真（Lo-fi）レトロ美学。落ち着いた低彩度の暖色、不規則で重いフィルム粒子、夕暮れの白昼夢の空気感。

   * **`Kodak Portra 400 (増感)`**：薄暗い室内での柔焦描写。温かく滑らかな乳白色調と柔らかな高光ロールオフ。

   * **`Fujifilm Superia 400`**：青緑のフィルム基底色、自然な曇天の拡散光、低明暗差と静謐な境界空間の気配。

   * **`Lucky C200`（楽凱）**：中国の千禧年を象徴する定番フィルム。青緑の暗部と微黄色の高光、懐かしい散乱ハレーション。

   * **`Kodak Gold 200`**：黄金色の暖かみと家庭用写真帖の温潤な粒子感。

   * **`Fujifilm Natura 1600`**：絶版となった超高感度夜景フィルム。豊かな色粒子と淡い青緑の暗部浮き。

   * **`Agfa Vista 400`**：濃厚な赤みと高明暗差が際立つドイツ製ストリートフィルム。

   * **`Kodak Ektachrome E100`**：90年代の雑誌グラビアを彩った高精細リバーサルフィルム。

2. **高光の赤橙色ハレーション（Halation）処理**

   * 通常の白飛び発光とは異なり、高輝度光源の周囲に映画用フィルム特有の赤橙色光芒を自然に拡散させる専用演算流。

3. **文字・記号層のピクセル劣化と画面融合**

   * 日付印字、VHS OSD、怪核文字札、写真外枠が画面から浮いてしまう违和感を解消。**低解像度量子化、RGB色ズレ、VHS色滲み、水平信号裂け、粒子、汚れ侵食**を文字層にも適用し、写真そのものと有機的に融合。

4. **出力解像度の完全制御**

   * 元画像100%の寸法を維持（長辺が4096pxを超える場合は比率を保持したまま等比縮小）。

   * `640p`、`800p`、`720p`、`1080p`、`2K`、`4K` の定型寸法、および縦横比固定の任意画素入力を完備。

5. **即席写真枠（Polaroid）の文字自由入力**

   * 写真下部の余白印字を自由に入力可能（空欄にすることで無地の白枠にも対応）。

6. **怪核文字札・目隠し帯の超大幅拡大と枠越え**

   * 寸法倍率を最大 **600%** まで拡張。画布境界の外側への自由な配置や、写真枠の上への大胆なはみ出し重ね描画に対応。

7. **千禧年 Y2K 意匠の全面採用**

   * **💿 Y2K 氷晶銀青（基本）**：真珠光沢のクロム銀金属パネル、濃紺の硬質立体影、果汁飴風の桃青勾配ボタン。

   * **⚡ Y2K 蛍光酸性**：半透明のインディゴ筐体に蛍光酸緑（`#b8ff01`）とシアンのアクセント。

   * 視認性と千禧年感を兼ね備えたフォント構成（`Orbitron` + `Chakra Petch` + `M PLUS Rounded 1c` / `Noto Sans SC`）。

8. **範囲限定の無作為生成（Scoped Randomize）**

   * 「全域」、「夢核」、「怪核」、「旧核」から範囲を絞ってワンクリック生成。

9. **全数値の直接入力と再現符号（Seed）**

   * すべての調整項目で数値の直接入力に対応。`DC2-...` Base64 符号による完全なレシピ保存・共有が可能。

### 🚀 利用方法

1. リポジトリ内の `旧核·梦核·怪核图片滤镜实验室 v6.0.html` を保存します。

2. お使いのウェブブラウザ（Chrome、Edge、Safari、Firefox等）で直接開きます（サーバー不要）。

3. 写真を投入して各パラメーターやフィルム銘柄を選び、高解像度 PNG として保存します。

## 💖 Special Thanks / 致谢 / 謝辞

This project, its complex parameter-vector photographic mathematical pipeline, responsive Canvas architecture, and Y2K aesthetic design were collaboratively conceptualized, engineered, and iterated with **Gemini 4** (Gemini).

本项目复杂的胶片模拟物理色彩管线、像素级劣化融合管线与 Y2K 界面交互体系由 **Gemini 4** 协助研发与持续迭代优化，特此致谢。

本プロジェクトの色彩劣化パイプライン、Canvas 演算体系、および Y2K 視覚設計は **Gemini 4** との共同設計・継続的な改良により開発されました。心より感謝申し上げます。

## 📄 License

This project is licensed under the [MIT License](https://www.google.com/search?q=LICENSE).
Feel free to create, experiment, and share your nostalgic creations!
