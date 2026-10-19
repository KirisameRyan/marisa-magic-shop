# Git 历史清理记录（2026-10-19）

店主明确授权：清理历史并强制推送 GitHub。范围为 GitHub `master`；Gitee 未获得可用写入凭据，本次不宣称其历史已清理。

## 方法与结果

- 使用官方 `git-filter-repo` v2.47.0，工具 SHA-256：`67447413e273fc76809289111748870b6f6072f08b17efe94863a92d810b7d94`。
- 在 `_local/history-clean.git` 隔离副本中操作，原历史恢复镜像保存在 `_local/pre-cleanup-backup.git`。这些本地目录被 Git 和发布策略排除，不应公开或合并回新历史。
- 扫描 725 个历史文本文件版本，发现 5 条规则匹配，对应 2 项不同的已泄露凭证值。报告不记录其明文。
- 替换历史中的智谱 Key；移除 QQ Bot 实现及凭证文件、Android 旧 `www.zip`、`toy-build/` 生成物、Unity 许可证、遗留页面快照与已知数据库路径；同时排除历史 APK/AAB/签名文件。
- 工具处理 132 个提交，其中 86 个被改写。首次受影响提交为 `84abbff5b551b5d2f2fc850ee908e89168a10457`，可供平台敏感缓存清理工单引用。
- 复查清理后 1,101 个不大于 5MB 的历史文件对象，未检出上述两项已知凭证值；核对指定旧路径已不再出现在 `master` 可达历史。
- 清理前后的最新源码树完全相同。改版修复提交从 `df0773c` 映射为 `e2604a6`，后续记录提交继续建立在新历史上。
- 推送使用 `--force-with-lease`，只更新指定分支，不使用 `--mirror` 向 GitHub 发送本地工具引用。

这不是“全部历史从此绝无任何秘密”的证明。未知凭证、超过检查大小的任意二进制文件、其他平台、Fork、旧克隆和平台缓存不在上述结论之内。

## 协作者与平台交接

1. 撤销旧智谱 Key 和已移除 Bot 的旧 Secret；新 Key 只注入服务器环境。历史重写无法让凭证本身失效。
2. 协作者应保存个人未提交工作，重新克隆 GitHub 仓库；不要 `git pull` 后合并旧分支，也不要将旧备份推回仓库。
3. Gitee 恢复写入权限后，应明确授权同步同一套清理后的历史；不要将 Gitee 的旧 `master` 合并回 GitHub。
4. 需要消除 GitHub 的旧 SHA 缓存或相关 PR 引用时，按 [官方流程](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) 联系平台支持。其他人的克隆和 Fork 无法由本次推送删除。
5. 生产站点仍需按 `SECURITY-REVIEW.md` 安装访问规则、设置环境变量、迁移数据库并清除旧部署文件。Git 更新不等于服务器已部署。
