# 霧雨魔法店

小游戏、趣味测试、虚构故事与创作工具。主站：[www.azureflame.cloud](https://www.azureflame.cloud)。

## 入口

- `index.html`：小店首页与精选作品。
- `games.html`：游戏室。
- `tests.html`：测试屋。
- `stories.html`：故事角。
- `tools.html`：工具与创作，包含记忆信号工作室和账本。
- `explore.html`：全站搜索、主题筛选与分页。

目录唯一来源是 `js/catalog.js`。保留已有作品 URL，新增作品按 [页面规范](docs/PAGE-STANDARD.md) 登记。主站复用已有像素角色美术，采用纸色、墨绿和印章橙；图标字体本地提供，记忆信号是可离线使用的单文件页面。

## 开发与预览

```powershell
python scripts/build-site-pages.py
python zyms/build.py
python scripts/serve.py 8098
```

本地服务器只公开允许发布的文件。不要把仓库根目录作为未经限制的静态站点公开。

## 验证

```powershell
python scripts/security-scan.py
python scripts/test-publication.py
node scripts/check-catalog.mjs
php scripts/test-api.php
node scripts/test-site.mjs
node scripts/test-zyms.mjs
```

PHP 功能测试需要 PDO SQLite 与 mbstring；浏览器测试需要本机 Chrome。生产接口还需要相应 PHP 扩展。提交钩子可通过 `git config core.hooksPath .githooks` 启用；CI 也会检查凭证与发布边界。

## 发布与仓库边界

```powershell
python scripts/release.py manifest
python scripts/release.py web --include-api
python scripts/release.py android
python scripts/release.py toy --game baka
```

发布物只生成到忽略的 `dist/`。Android 源码在 `apps/android/`，Toy 专用源码在 `packages/toy/`；ZIP、APK、签名文件、数据库不再提交。QQ Bot 已移除。详见 [仓库与构建规范](docs/REPOSITORY-LAYOUT.md)。

## 服务器配置与安全交接

- 密钥只从服务器环境读取，变量名见 `.env.example`。该文件是说明，不会自动加载。
- 账本截图识别和异常 CSV 辅助解析使用智谱；其他功能不依赖智谱。旧 Key 必须在平台撤销。
- 数据库使用 `MMS_PRIVATE_DIR`，应位于站点根目录之外。升级前停写并执行 `php scripts/migrate-private-data.php`。
- Apache 使用 `.htaccess`；Nginx 需单独安装 `deploy/nginx-security.conf`。
- 已按授权清理 GitHub 分支历史中的已知凭证与旧包；Gitee、Fork、旧克隆与缓存另行处理，见 [历史清理记录](docs/HISTORY-CLEANUP.md)。

部署前必须阅读 [安全审查与交接](docs/SECURITY-REVIEW.md)。纯静态托管不会执行 PHP，账号、在线存档和账本 AI 需要独立后端。
