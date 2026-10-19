# Toy 源码包

`src/` 保存既有 Toy 专用 HTML/JS 和专用图片。共用游戏资源位于主站目录，`targets.json` 逐项列出允许进入对应 ZIP 的路径。

使用 `python scripts/release.py toy --game baka` 等命令构建。产物位于被 Git 忽略的 `dist/toy/`；此命令不会登录或发布 Toy。禁止把旧 ZIP、运行数据库或后端配置重新放入源码。
