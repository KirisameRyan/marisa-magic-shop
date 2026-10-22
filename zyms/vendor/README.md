# 上游来源与依赖

## Retro-Style-Studio

- 作者 / 仓库：zhaoyuming3647-design，[Retro-Style-Studio](https://github.com/zhaoyuming3647-design/Retro-Style-Studio)。
- 固定版本：`5514b7dbbf5258cc3e8842cd26b724885455692b`，获取日期 2026-10-22。
- `retro-style-studio/index.html`、`dreamcore.html`、`readme.md` 是该提交的原始快照，未经改写。
- 上游 readme.md 声明 MIT；所提供链接为搜索链接，该提交根目录未提供单独的 LICENSE。保留原说明，不另行虚构作者版权年份或授权文本。
- 整合修改集中在 `../film_bundle.py`、`../retro_bundle.py`、`../retro-adapter.js`、`../retro-adapter.css`、`../retro-tools.js`、`../retro-tools.css`、`../studio-retro.js`：移除 CDN 与远程字体、预编译 Tailwind、内置 GIF 解码依赖、统一工作台配色、沙箱隔离、工作区图像传递、文件和 GIF 内存限制、手机控件换行。照片渲染管线被提取到同一原生编辑器，图层与局部效果保持可编辑；只有像素/GIF 使用隔离渲染页面。滤镜与 GIF 渲染算法来自上游。
- 初始页和页脚显示原仓库链接，页脚显示固定提交链接。生成文件中的上游 JS 保留说明注释。

## omggif 1.0.10

`omggif-1.0.10.js` 来自 https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.js ，作者 Dean McNamee，MIT，完整版权和许可保留于文件顶部，并随生成页面内置。

## Tailwind CSS 3.4.17

作者 Tailwind Labs, Inc.，MIT，许可位于 `tailwind-LICENSE.txt`。两份 `*.tailwind.css` 是预编译样式，不需要运行时下载 Tailwind。

重新编译样式时，从原始 index.html 的 `tailwind.config` 取出配置保存为 CJS；dreamcore.html 使用默认配置。用 Tailwind CLI 3.4.17，以对应完整 HTML 为 content，输入包含 `@tailwind base; @tailwind components; @tailwind utilities;`，使用 `--minify` 输出到对应 `*.tailwind.css`。普通页面构建只需 Python，不需要 Node 或网络。
