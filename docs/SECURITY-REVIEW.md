# 安全审查与部署交接（2026-10-19）

本次是源码、Git 跟踪文件与本地发布包审查，不等同于对线上服务器做了完整渗透测试。报告不包含凭证原文。

| 发现 | 风险 | 本次处理 |
| --- | --- | --- |
| `api/llm-config.php` 曾提交智谱 Key | 仓库读者可调用供应商 API | 清除字面量，仅从 `MMS_ZHIPU_API_KEY` 读取 |
| QQ Bot Secret 硬编码；签名头缺失时跳过验签 | 凭证滥用、伪造事件 | 按店主要求删除 Bot 入口与实现；部署规则对旧端点返回 410 |
| Android `www.zip` 包含 `data/site.db` | 数据库可能随离线包公开 | 旧包移出 Git，改为发布白名单；检查的当前旧包中 users/sessions/resets/transactions 均为 0 行，这不能证明其他历史包没有数据 |
| 黑名单打包器遍历整个仓库 | 新增目录可能连同私有数据被打包 | 所有入口统一使用 `scripts/public-files.py` 白名单 |
| 运行数据库、限流文件在公开目录 | 配置不当会被直接下载 | 数据库和鉴权限流状态改用 `MMS_PRIVATE_DIR`；Apache/Nginx 限制私有路径 |
| SMTP 与海报下载关闭 TLS 校验 | 连接可能被中间人篡改 | 恢复服务端证书校验 |
| 登录 Token 允许通过 URL 参数传递 | 可能进入日志、历史记录、Referer | 会话认证只接受 Authorization Bearer 头 |
| AI 解析无独立消费配额 | 登录用户可消耗供应商额度 | 增加每用户每小时 20 次解析配额；供应商错误正文不返回浏览器 |

## 必须在平台及服务器上完成的步骤

1. **在智谱平台撤销旧 Key**，为继续使用的账本 AI 功能创建新 Key，仅配置到 PHP-FPM / 系统服务环境。Bot 已移除，但 QQ 开放平台的旧 Secret 仍需撤销或停用该应用。
2. 账本只有截图识别与异常 CSV 的 AI 整理需要智谱。手动记账、规则可识别的 CSV、小游戏、测验、记忆信号均不需要。服务未配置时 AI 功能不可用。
3. 设置 `MMS_PRIVATE_DIR` 为 Web 根目录外的绝对路径，设置 `.env.example` 中需要的变量。示例文件不会自动被 PHP 加载；PHP-FPM 常需在 pool 配置中显式传入环境变量。
4. 进入维护状态、停止数据库写入，在相同环境下执行 `php scripts/migrate-private-data.php`；不要复制在线 SQLite 的单独主文件而遗漏 WAL。旧数据库存在但未迁移时，新代码会停止初始化，以免表现为“账号全丢了”。
5. 以新发布目录部署。若沿用原目录，明确清除旧的 `api/bot.php`、`api/bot_token.php`、`toy-build/`、`android-app/`、旧 ZIP/APK、数据库公开副本与缓存中的旧资源。**仅 git pull 不保证未跟踪旧文件被清除。**
6. Apache 安装 `.htaccess` 并确认 AllowOverride 生效；Nginx 必须显式安装 `deploy/nginx-security.conf`，不能指望 `.htaccess` 生效。为私有目录设置仅服务账号可读写的权限。
7. 上线后验证：`/.git/config`、`/api/llm-config.php`、`/data/site.db`、`/var/private/site.db`、`/apps/android/`、旧 ZIP 均返回 403/404；Bot 返回 410/404；公开角色数据和 Unity 游戏仍正常。
8. 如曾部署或提供含真实账号记录的旧离线包，应进一步评估会话失效、密码重置与用户告知。本次没有调用真实供应商 API 来“验证”旧凭证，以免增加暴露或消费。

## Git 历史仍需单独处理

初始源码修复后，店主额外授权了 GitHub 历史清理。隔离清理与验证结果见 [历史清理记录](HISTORY-CLEANUP.md)。Gitee、Fork、平台缓存与他人的旧克隆仍不能视为已清除。以下历史路径与旧提交 ID 用于审计定位：

- `api/llm-config.php`：历史提交 `af074d4`、`bd34d18`。
- `api/bot_token.php`：历史提交 `84abbff`。
- `android-app/app/src/main/assets/www.zip`：多个历史版本。

已在隔离副本使用 `git-filter-repo` 替换已知凭证、移除上述旧文件，并保持当前源码树不变。只授权更新 GitHub master；Gitee 需恢复写入权限后再处理。协作者应重新克隆，不得把旧历史合并回来。凭证撤销和服务器部署仍须完成。

参考：[GitHub 敏感数据清理说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)、[OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)。

## 防止再次混入

- `python scripts/security-scan.py`：扫描当前 Git 跟踪及未忽略的新文本；输出只有文件、行号、规则和 `[REDACTED]`。
- `python scripts/security-scan.py --staged`：扫描暂存内容。启用仓库 Hook：`git config core.hooksPath .githooks`。
- GitHub CI 执行扫描、发布边界、目录唯一性、PHP 语法和后端回归检查。扫描器是启发式检查，不是“没有其他漏洞”的证明。
- `.gitignore` 屏蔽私有配置、数据库、签名文件、安装包、构建输出与本地旧包。版本控制只收源码和必要运行资源。
