# 幻想乡交易所 Toy 版

构建：`python scripts/build-exchange-toy.py`。产物在 `dist/toy/gensokyo-exchange-时间/app` 与同目录 `gensokyo-exchange-toy.zip`。只上传 ZIP 或 app 目录，不上传整个项目。此命令不会发布或提交审核。

## 登录

点击“B站一键进入”调用官方 `toy.getUserProfile()`，经平台授权显示头像和昵称。读取 `toy.getCloudStorage(['gensokyo_exchange_account_v1'])` 恢复游戏账户，首次使用由网站 auth.php 的 toy_login 创建账户，再通过 setCloudStorage 保存随机游戏恢复凭证。之后用同一 B站账户、同一个 Toy 的私有存档恢复。平台授权有效时由SDK决定是否重复弹窗。

官方 SDK 的 UserProfileResp 为 avatar、nickname、可选 toyOpenId，类型明确说明 toyOpenId 不是鉴权凭证。本实现不向后端上报或记录 toyOpenId，也不根据客户端声明的昵称查找和放行其他账户。游戏后端使用自身生成的随机凭证恢复账户；私有云存档不是所有玩家共享存档。恢复凭证数据库只保存SHA-256摘要，一年不使用会过期，使用时续期。网站密码重置会撤销旧的Toy恢复凭证。

昵称与头像只在当前Toy显示，统一排行榜继续使用游戏账户名称。可在游戏中将初始游戏账户升级为正式网站账户，资产和ID不变。游戏账本、实时市场、条件单、教学记录和三个排行榜仍在网站服务器。拒绝授权、读取存档失败、存档损坏、凭证无效均停止创建新账户，避免覆盖旧档；首次写入失败保留本页待保存账户，重试不重复创建。SDK限流307044采用有限指数退避，不轮询平台存档。

## 服务器配置（上传包之前）

必须先把本次更新的 api/auth.php、api/auth-lib.php、api/bootstrap.php、api/exchange.php、js/gensokyo-network.js 和交易后端文件部署到网站。新增 toy_credentials 私有表会自动创建，旧账户和K线不重置。

PHP-FPM环境和Node的 /etc/mms-exchange.env 都要将实际Toy页面来源加入 MMS_ALLOWED_ORIGINS，保留原网站来源。按当前官方地址预计包含 https://www.bilibili.com；正式预览若运行于不同内容来源，应核对真实 Origin 后加入该精确来源，不使用通配符，不允许 null。只配Node不配PHP会无法登录，只配PHP不配Node会无法交易。PHP-FPM环境配置可通过宝塔对应PHP进程管理配置env项；更新后重载PHP服务，并 systemctl restart mms-exchange。仅改Node的EnvironmentFile不会自动传给PHP。

API固定为 https://www.azureflame.cloud/，没有将域名或凭证放进查询参数；CORS同时暴露ETag用于减少重复响应。ZIP不包含数据库、PHP、Node服务、私有配置或密钥。

## 检查与限制

本地逻辑测试覆盖首次授权、私有存档恢复、拒绝授权、读写失败不覆盖、重试幂等、服务端恢复与重置失效。SDK真实授权弹窗和平台环境必须在真实Toy预览及B站App中验证，不能以模拟测试宣称已经上线可用。没有用普通B站登录Cookie、昵称或伪造OpenID替代授权。

官方资料：[SDK](https://www.bilibili.com/toy/publish/sdk)，[官方SDK脚本](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)，[官方包体检查说明](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md)。
