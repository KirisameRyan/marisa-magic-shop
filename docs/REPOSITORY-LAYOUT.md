# 源码、客户端与发布物边界

当前选择模块化单仓库：网站和两个客户端共用游戏资源，统一维护发布白名单比立即拆出多个互相复制资源的仓库更可靠。以后 Android 或 Toy 需要独立团队、权限或发布节奏时，再用独立仓库维护源码；凭证、用户数据库和构建产物在任何仓库都不应提交。

| 路径 | 用途 | 是否发布到网站 |
| --- | --- | --- |
| 根 HTML、`css/`、`js/`、`images/`、`audio/`、`unity/` | 网站和游戏运行资源 | 按白名单发布 |
| `zyms/` | 记忆信号源码与单文件产物 | 仅发布组装后的 HTML |
| `api/` | PHP 接口与环境配置入口 | 仅 Web 后端包；禁直接访问配置/公共库 |
| `apps/android/` | Android 客户端源码 | 否 |
| `packages/toy/src/` | Toy 专用入口和适配源码 | 否；仅进入对应 Toy ZIP |
| `packages/toy/targets.json` | 每个 Toy 的共享资源清单 | 否 |
| `scripts/`、`templates/`、`docs/`、`.agents/` | 开发、规范、技能 | 否 |
| `dist/` | 每次构建的发布目录/ZIP | Git 忽略 |
| `var/private/` 或 `MMS_PRIVATE_DIR` | 私有数据库、配额等运行状态 | Git 忽略且禁止 HTTP 访问 |
| `_local/` | 旧包隔离、临时工具 | Git 忽略且禁止 HTTP 访问 |

QQ Bot 已按要求移除，不作为网站模块继续维护。旧的 `toy-build/` 已移出版本控制，Android 内嵌的旧 `www.zip` 也已隔离。保留旧包只是为了本地恢复与调查，不能拿去重新发布。

## 构建入口

```powershell
python scripts/build-site-pages.py
python zyms/build.py
python scripts/release.py manifest
python scripts/release.py web --include-api
python scripts/release.py android
python scripts/release.py toy --game baka
python scripts/release.py toy --game marisa_survivor
python scripts/release.py toy --game tuoluo
```

`web` 默认只含静态资源，`--include-api` 才加入 PHP。静态托管环境无法使用账号、云存档或账本 AI 接口。Android 命令生成白名单 `www.zip` 并写入 `apps/android/app/src/main/assets/`；APK 仍需 Android Studio / Android SDK 编译，本次不生成或提交 APK。签名和 `local.properties` 保留本地，不随源码发布。

Toy 使用原先专用适配源码，引用 `targets.json` 明确列出的共享资源，不会把主站账号、服务端或整个仓库塞进 ZIP。本次只构建和验证，不发布到 Toy 平台。

旧 PowerShell/PHP 打包脚本保留兼容入口，统一调用 Python。PHP 兼容脚本只允许 CLI，默认 `python3`，可用 `MMS_PYTHON_BIN` 指定解释器。

本地预览使用 `python scripts/serve.py 8098`，只监听本机并执行公开文件策略。不要用整个仓库的普通静态目录服务作为公开服务器。
