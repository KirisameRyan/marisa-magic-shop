# Toy 源码包

`src/` 保存既有 Toy 专用 HTML/JS 和专用图片。共用游戏资源位于主站目录，`targets.json` 逐项列出允许进入对应 ZIP 的路径。

使用 `python scripts/release.py toy --game baka` 等命令构建。产物位于被 Git 忽略的 `dist/toy/`；此命令不会登录或发布 Toy。禁止把旧 ZIP、运行数据库或后端配置重新放入源码。

幻想乡交易所使用 `python scripts/build-exchange-toy.py` 专门构建，以复用主站界面并转换联网、登录与资源路径。入口调用官方 getUserProfile，使用Toy私有云存档恢复游戏账户，详见 `docs/幻想乡交易所-Toy版本.md`。该构建不上传、不提交审核。
