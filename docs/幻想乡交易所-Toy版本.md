# 幻想乡交易所 Toy 版

构建：`python scripts/build-exchange-toy.py`。产物在 `dist/toy/gensokyo-exchange-时间/app` 与同目录 `gensokyo-exchange-toy.zip`。只上传 ZIP 或 app 目录，不上传整个项目。此命令不会发布或提交审核。

## 登录

点击“B站一键进入”调用官方 `toy.getUserProfile()`，授权后显示头像和昵称。新版向独立 `api/toy.php` 发送 `action=login`、昵称，以及已有的随机存档凭证；不再走网站 auth.php 的游客开户/网站登录分支。昵称是显示信息，不是登录证明。头像仅在当前Toy页面展示，不上传OpenID。

服务器在私有 site.db 中使用独立的 toy_players、toy_game_credentials、toy_game_sessions 表；新账户使用负数ID，与网站正数ID隔离，不写 users、guest_accounts、sessions。共用同一交易市场、账本和排行榜，界面显示“昵称 · B站账户”。每次授权登录同步昵称，进入市场时同步排行榜名称。不同玩家可以同名，账户不会按昵称合并。

私有云存档键仍是 gensokyo_exchange_account_v1，保留原格式。旧 toy_credentials 凭证首次通过新入口恢复时自动迁移，沿用原市场ID，因此资金、持仓、条件单、订单不变；迁移后从旧凭证表移除该凭证。旧网站记录保留作兼容，不批量删除账户。旧版 auth.php/toy_login 暂保留供旧前端兼容，新版不会调用。

新会话仅被交易服务与 toy.php 认可，不允许进入网站其他功能。恢复凭证服务端只存SHA256，一年未使用失效；游戏会话30天，退出会撤销当前会话。前端会话只保存在本页内存，恢复凭证只放Toy用户私有云存档。

SDK返回的 toyOpenId 明确不是鉴权凭证。当前机制依靠私有云存档中的随机密钥保护已有资产；不能宣称服务端已验证B站实名或昵称归属，也不能保证恶意客户端绝不能创建多个账户。昵称不能用于找回或接管其他账户。读档失败、存档损坏、凭证无效均停止开户，首次写档失败保留本页待保存账户供重试。

## 服务器配置（上传包之前）

必须先把本次更新的 api/toy.php、api/auth.php、api/auth-lib.php、api/bootstrap.php、api/exchange.php、js/gensokyo-network.js 和交易后端文件部署到网站。新增独立Toy账户表会自动创建，旧账户和K线不重置。

当前修复版已经在PHP登录/交易接口和Node交易服务中默认追加精确来源 https://www.bilibili.com 和实际Toy运行来源 https://www.bilibilitoy.com，且不会被原有 MMS_ALLOWED_ORIGINS 覆盖。PHP其他业务接口不因此放宽来源。

上传最新 api/toy.php、services/exchange/store.cjs、api/bootstrap.php、api/auth.php、api/exchange.php、api/auth-lib.php 和 services/exchange/server.cjs 后，执行 systemctl restart mms-exchange；若PHP配置不检查文件更新，请在宝塔重载对应PHP服务。单独重启但不更新代码不会改变旧白名单。

若真实Toy的请求Origin不同于上述两个已允许来源，按页面错误提示核对真实来源，再通过 PHP-FPM 环境与 Node 的 /etc/mms-exchange.env 同时配置 MMS_TOY_ORIGINS，逗号分隔精确HTTPS来源。不要使用通配符或 null。Node EnvironmentFile 不会自动传给PHP。

本次线上只读检查已确认：无Origin访问overview为200，B站来源访问为403 Origin not allowed，登录预检同样403。这是未放行来源导致的浏览器跨域拒绝，不是Toy不支持联网。新版Toy包在失败时显示具体来源，便于定位。
API固定为 https://www.azureflame.cloud/，没有将域名或凭证放进查询参数；CORS同时暴露ETag用于减少重复响应。ZIP不包含数据库、PHP、Node服务、私有配置或密钥。

## 检查与限制

本地逻辑测试覆盖首次授权、私有存档恢复、拒绝授权、读写失败不覆盖、重试幂等、服务端恢复与重置失效。SDK真实授权弹窗和平台环境必须在真实Toy预览及B站App中验证，不能以模拟测试宣称已经上线可用。没有用普通B站登录Cookie、昵称或伪造OpenID替代授权。

官方资料：[SDK](https://www.bilibili.com/toy/publish/sdk)，[官方SDK脚本](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)，[官方包体检查说明](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md)。
