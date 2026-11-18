# 霧雨魔法店 Wiki

独立运行的 MediaWiki 1.43 LTS，默认使用 Citizen 皮肤、简体中文和可视化编辑器。首页、示例条目和「作品条目」模板会在首次启动时导入。

## 登录和权限

| 身份 | Wiki 权限 |
| --- | --- |
| 未登录访客、官网游客账号 | 浏览和搜索 |
| 已登录的普通官网账号 | 浏览和搜索，使用登录后的个人功能 |
| 编辑者 | 创建和编辑条目 |
| 管理员 | 管理 Wiki，可授予或撤销编辑者权限 |

首次从 Wiki 点「使用官网账号登录」后，Wiki 会按官网账号 ID 自动建立对应用户，名称为 `官网用户-<账号 ID>`。管理员登录 Wiki 后，可在 `Special:UserRights` 搜索该用户，增减 `editor` 用户组。Wiki 和官网各自维护会话，退出时分别操作。

## 本地启动

启动 Docker Desktop 后，从仓库根目录执行：

```powershell
docker compose -f deploy/wiki/compose.yaml up -d --build
docker compose -f deploy/wiki/compose.yaml logs -f wiki
```

初始化完成后打开 [本地 Wiki](http://127.0.0.1:8099)。管理员用户名为 `WikiAdmin`，初始密码可以在本机读取：

```powershell
docker compose -f deploy/wiki/compose.yaml exec wiki cat /var/lib/mediawiki/initial-admin-password
```

首次登录后在 Wiki 偏好设置中修改密码，再执行以下命令移除初始密码文件：

```powershell
docker compose -f deploy/wiki/compose.yaml exec wiki rm /var/lib/mediawiki/initial-admin-password
```

配置和 SQLite 数据保存在 `wiki-state` 卷里。使用 `docker compose down` 停止实例时会保留卷。此后通过 Wiki 编辑托管页面，修改 `pages/` 中的初始条目只影响新建的实例。

在 Wiki 内可编辑「首页」的内容和首页侧栏，也可通过 `MediaWiki:Sidebar` 调整文章页的主菜单。配色和布局由 `wiki-theme.css` 管理。

## 接入主站

Wiki 默认只监听本机。上线时为 Wiki 配置独立 HTTPS 域名，把域名反向代理到本机 8099 端口，并在 Compose 环境中设定 `WIKI_SERVER=https://实际域名`。如果本地端口有冲突，可设置 `WIKI_PORT`。域名可访问后，将主站导航指向该地址。

旧故事地址 `human-stars.html` 和 `human-star.html?id=hs-001` 在本地跳转至 8099，线上跳转至 `wiki.azureflame.cloud`。发布官网跳转页前，先让该域名可以访问 Wiki 的合集和正文。若使用其他域名，同步修改两个跳转页的备用链接及 `js/human-stars-redirect.js`。

1. 更新官网 PHP 后端及静态资源，包含 `api/wiki-auth.php` 和 `js/wiki-sign-in.js`。
2. 在官网 PHP 和 Wiki Compose 的运行环境中设置同一个独立随机密钥 `MMS_WIKI_SSO_SECRET`，至少 32 字符。
3. 在 Wiki 环境中设置 `WIKI_SSO_SITE=https://www.azureflame.cloud`，使用官网登录所在的实际来源。若容器需要走另一条受信任的内部访问路径，可另设 `WIKI_SSO_BACKEND`。
4. 执行 `docker compose -f deploy/wiki/compose.yaml up -d` 应用新环境。通过 Wiki 登录页上的「使用官网账号登录」测试登录，再用 `WikiAdmin` 给对应账号授予编辑权限。

统一登录凭证只能使用一次，签发后一分钟失效。Wiki 使用官网账号 ID 建立对应用户，不接触官网密码。Wiki 管理员仍可通过本地登录入口管理权限。

[MediaWiki 官方容器说明](https://hub.docker.com/_/mediawiki) · [Vector 2022 皮肤](https://www.mediawiki.org/wiki/Skin:Vector/2022)
