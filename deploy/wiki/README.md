# 霧雨魔法店 Wiki

独立运行的 MediaWiki 1.43 LTS，默认使用 Citizen 皮肤、简体中文和可视化编辑器。首页、示例条目和「作品条目」模板会在首次启动时导入。

## 登录和权限

| 身份 | Wiki 权限 |
| --- | --- |
| 未登录访客 | 浏览和搜索 |
| 管理员创建的普通账号 | 浏览和个人关注列表 |
| 管理员授权的编辑者 | 新建、编辑条目和讨论页 |
| 管理员 | 创建账号、管理 Wiki、授予或撤销编辑权限 |

管理员使用独立的 Wiki 用户名和密码登录。进入 `Special:CreateAccount` 为受邀者创建账号，再到 `Special:UserRights` 为其分配 `editor` 组。未获授权者无法注册，也无法编辑或发表讨论。

官网账号接入已关闭。更新服务器代码后，执行 `docker compose --env-file deploy/wiki/.env -f deploy/wiki/compose.yaml up -d --force-recreate` 应用新配置。官网服务器也需更新 `api/wiki-auth.php`，该旧入口现在返回 410。可以移除运行环境中旧的 `WIKI_SSO_SITE`、`WIKI_SSO_BACKEND`、`MMS_WIKI_SSO_SECRET` 配置。

若之前已经通过官网登录过 Wiki，原有 Wiki 用户及编辑历史会保留。上线前在用户列表检查这些账号，通过封禁或调整用户组撤销不再授权的访问。已存在的会话可能持续到失效或退出。

## 本地启动

启动 Docker Desktop 后，从仓库根目录执行：

```powershell
docker compose -f deploy/wiki/compose.yaml up -d --build
docker compose -f deploy/wiki/compose.yaml logs -f wiki
```

构建会优先使用 `deploy/wiki/citizen-3.23.0.tar.gz`。如果服务器无法下载 Citizen，可以把该版本的官方源码包按此文件名上传，再重新构建。两种方式都校验同一份 SHA-256。

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

Wiki 使用独立账号系统，由管理员在 Wiki 内创建和授权账号。

[MediaWiki 官方容器说明](https://hub.docker.com/_/mediawiki) · [Citizen 皮肤](https://www.mediawiki.org/wiki/Skin:Citizen)
