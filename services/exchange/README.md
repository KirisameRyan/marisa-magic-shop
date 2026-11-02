# 幻想乡交易所后端

本游戏仅提供需要网站账户登录的线上多人玩法。网站账户 ID 是游戏账户的唯一绑定键；首次开通发放一次 100,000 游戏币。无邮箱账户可以正常交易。

## 运行要求

- Node.js 24（使用内置 `node:sqlite`，无 npm 依赖）。
- 现有网站 PHP 8.1+，启用 PDO SQLite、mbstring；发送邮件还需要 openssl 和正确的 SMTP 环境变量。
- PHP 与 Node 使用同一台服务器、同一个 `MMS_PRIVATE_DIR`。其中 `site.db` 是现有网站账户库，`exchange.db` 是独立交易库，均必须位于网页根目录之外。

## 推荐上线方式（现有 PHP 网站）

只更新网站文件不会自动运行交易服务。先在网站 Nginx 的 `server` 块加载 `deploy/nginx-security.conf`（Apache 的 `.htaccess` 不会在 Nginx 生效），运行 `nginx -t` 通过后重载。匿名访问 `/var/private/site.db` 和 `/services/exchange/server.cjs` 应返回 403 或 404，不能返回 200。安装脚本会用 HEAD 请求检查保护是否生效，不读取数据库内容。

首次部署需要在服务器安装 Node.js 24+，然后在仓库根目录执行：

```sh
sudo bash deploy/install-exchange.sh
# 若网站私有数据不在默认 var/private 下，传入 PHP 使用的 MMS_PRIVATE_DIR：
sudo bash deploy/install-exchange.sh /实际的网站私有数据目录
```

脚本只接受包含现有 `site.db` 的目录，不创建空网站账户库。使用账户库的普通文件属主运行服务；如果属主为 root，需要明确指定普通服务用户，例如 `sudo MMS_EXCHANGE_USER=www bash deploy/install-exchange.sh /实际目录`。安装前备份私有数据库；脚本会备份被替换的 systemd 配置，注册常驻及开机启动服务，不覆盖游戏账本。

前端默认请求同域 `api/exchange.php?route=...`，由现有 PHP 转发到回环地址 8098，所以不必新增 Nginx 代理规则。PHP 需要开启 `allow_url_fopen`；若自定义端口，PHP 和 Node 的 `MMS_EXCHANGE_PORT` 必须一致。原 `/api/exchange/` 反向代理仍可用于直接调用。

上线后访问 `api/exchange.php?route=health`：正常返回 `ok: true`、`service: gensokyo-exchange`、`halted: false`。404 表示 PHP 网关文件未更新；503 表示 Node 未运行、端口不一致或 PHP 无法访问回环服务。市场和排行榜接口需要登录，匿名返回 401 是正常行为。查看后台日志：`sudo journalctl -u mms-exchange -n 40 --no-pager`。

## 初始 K 线

`services/exchange/initial-market.json` 是用户当前预览的纯行情快照：9 个标的，每个 2161 根一分钟 K 线，不包含资金、持仓、订单或凭据。只在交易库首次创建时加载，整体平移到启动时刻，保留形态、价格及成交量。随后每分钟由共享市场撮合生成新行情。重启不会重新导入，已有市场和账户不会重置。不要删除生产 `exchange.db` 来刷新 K 线。该文件不提供玩家上传接口。

## 本机开发

```powershell
# PHP 不在 PATH 时设置 PHP_BIN，或使用 _local/php-runtime/php.exe
node scripts/dev-exchange.cjs 8098
```

打开 `http://127.0.0.1:8098/gensokyo_exchange.html`，注册本机测试账户，登录后自动进入共享市场。该命令只读写 `_local/exchange-dev/`，不会使用网站真实账户库；其他端口使用独立的带端口后缀目录。邮件发送被关闭。不要在本机测试页面输入真实网站密码。

## 部署到现有网站

1. 备份现有网站文件和私有 SQLite 数据（含 WAL；建议停服务后备份，或使用 SQLite 在线备份）。不要用空账户库覆盖现有 `site.db`。若旧库仍在公开 `data/` 下，先按仓库已有 `scripts/migrate-private-data.php` 的流程迁移到私有目录。
2. 执行 `node scripts/build-exchange.cjs`，生成 `dist/exchange/<构建编号>/`。它是现有网站的增量文件包，不含用户数据、凭据、PHP 运行时和本机测试账户，也不是完整网站备份。
3. 将包内文件按相同相对路径覆盖到现有网站源目录（例 `/srv/mms-site`）。新增 `services/` 和 `deploy/` 必须禁止外部 HTTP 访问；不要将整个源码仓库公开作为静态站点。包中的部署配置需要按实际服务器路径调整。
4. PHP-FPM 与 Node 均设置 `MMS_PRIVATE_DIR=/srv/mms-private`，确保服务用户能读写此目录及 SQLite WAL/SHM。设置 `MMS_PUBLIC_ORIGIN=https://你的规范域名`；前端、登录、游戏用同一个规范域名，复用现有网站会话。
5. 为 Node 创建 `/etc/mms-exchange.env`，例如：

   ```ini
   MMS_PRIVATE_DIR=/srv/mms-private
   MMS_EXCHANGE_PORT=8098
   MMS_ALLOWED_ORIGINS=https://你的规范域名
   MMS_EXCHANGE_RESUME=0
   ```

   PHP 同样配置允许的来源；`MMS_AUTH_UPSTREAM` 仅供本机联调，生产留空。邮件为可选找回方式；需要启用时给 PHP 配置 `.env.example` 中的 SMTP 项，不能放进前端。
6. 默认可直接使用上面的安装脚本与 PHP 网关。若选择手动 Nginx 方案，使用 `deploy/mms-exchange.service` 配置 systemd 常驻单个 Node 服务（检查 User、Group、Node 路径和 WorkingDirectory）。Node 只监听 `127.0.0.1`，通过 `deploy/exchange.nginx.conf` 把 `/api/exchange/` 代理到它，保留原 `/api/auth.php` 的 PHP-FPM 处理。同时安装仓库已有的 `deploy/nginx-security.conf`，拒绝私有目录、数据库和配置文件的 HTTP 访问。Nginx 应先 `nginx -t` 再重载。不要对交易接口添加 CDN 缓存。
7. 发布前用两个测试账户完成注册、登录、跨玩家成交、撤单、重启持仓恢复、排行榜和会话失效检查。旧库首次访问认证接口时自动迁移可选邮箱字段；不更改原用户 ID、原邮箱和旧密码哈希。

## 撮合、账本和恢复

- 服务端接收限价委托、冻结资金，每分钟整点统一撮合。旧余单先进入盘口，系统报价更新后处理新委托，再处理系统自主流量。价格优先，同价按服务端接受序号排序，按被动单价格成交。这是分钟批处理规则，不是传统单一成交价集合竞价。
- 玩家与系统共享有限数量的盘口，系统不直接强改收盘价；没有玩家时也有系统自主买卖。普通买卖与逐仓合约分账，杠杆只开放 2/3/5/10/20 倍。自成交取消主动单；每账户最多 30 笔未完成委托。
- 下单、撤单、追加保证金和开通账户均要求幂等键；资金状态、成交、流水和请求回执在一个 SQLite 事务内保存。用户只能取消自己的委托，客户端提交余额、用户 ID 或排名字段会被拒绝。
- 每日北京时间 04:00 记录切日之前的资产快照，不重置本金、不强制平仓。榜单按当前净资产降序，平手按开户时间和用户 ID 排序，展示前 100 名及个人排名。
- 网页每 10 秒读取状态以展示订单变化，成交仍只有一分钟一次。前端可计算图表、估算费用并缓存登录会话；服务端重新验证并决定所有正式交易结果。界面不再提供本地练习；客户端不保存游戏资产或本地撮合结果。
- 服务中断超过 5 分钟后暂停市场，避免对停机期间的行情盲目补算。管理员核对账本和委托后，可在一次重启中设置 `MMS_EXCHANGE_RESUME=1` 跳过停机区间，随后恢复为 0。恢复不撤销玩家余单，恢复后的下一分钟仍会撮合；恢复前应通知玩家并审查风险仓位。

## 当前边界

这是单服务、单写者的首版后端：SQLite 租约阻止双进程同时撮合，不能直接多副本扩容。当前市场状态采用事务性 JSON 快照，另存成交、流水和日快照；尚未完成大规模压测、备份恢复演练或跨机器灾备，不宣称可承载某个在线人数。上线前根据实际机器做压测，持续监控内存、撮合耗时和数据库大小；流水和幂等回执当前不自动清理。

注册限流可以减轻滥用，但可选邮箱不能保证一人一号。当前没有跨账户对刷识别和完整反操纵机制；有奖活动前需要单独制定参赛资格、异常成交审查和排名冻结规则。用户注册本身不等于领取现金或现实资产。

Toy 入口还没有接入：目前不能仅凭前端声称的 B 站 UID 自动绑定账户。后续必须核验平台支持的可信身份凭证，提供显式绑定已有网站账户的流程，且禁止按同名或邮箱自动合并。完成后仍读取此服务的同一份排行。

## 检查命令

```sh
node --test scripts/test-gensokyo-engine.cjs scripts/test-gensokyo-market-data.cjs scripts/test-gensokyo-risk-etf.cjs scripts/test-auth-registration.cjs scripts/test-exchange-server.cjs scripts/test-exchange-gateway.cjs
php scripts/test-api.php
python scripts/security-scan.py
python scripts/test-publication.py
```

## 整手与临时停牌

新委托每手100份，单笔最多1000手；五档基础深度每档1000–5000份，仍受资金和库存约束。5分钟价格偏离达到10%后单独停牌3分钟，可撤单和追加保证金，不接收新委托。不设全天涨跌停，旧零股仓位可整笔退出。详见 [整手与停牌说明](../../docs/幻想乡交易所-整手与临时停牌.md)。

## 首页与数量输入

默认打开交易所首页，含登录/注册、8个产业与1只ETF的24小时涨跌红绿图。首页摘要通过公开只读 `overview` 接口获取，按分钟刷新，不提供账户、挂单或持仓数据；交易与完整行情仍要求有效登录。数量、盘口和成交统一显示份数，输入最小100份、步长100份，支持加减按钮；不再把输入数乘100。此更新包含Node与PHP接口，线上同步代码后需要重启 mms-exchange 服务。

## 新增挂牌与数据保留

市场现有12只股票与1只ETF；ETF保留原8只成分。重启只补齐缺失股票，不覆盖既有K线、账户、持仓和委托。更新前可用 `node scripts/backup-exchange.cjs` 生成站外数据库快照；请勿上传本机数据库、删除线上数据库或更换私有目录。详见[新增挂牌与更新说明](../../docs/幻想乡交易所-新增挂牌与更新数据说明.md)。

## 玩家动态与挂单观察

显著玩家参与成交以及停复牌会生成独立交易动态资讯，不再次影响参考价值。排行榜可展开玩家的主要未成交挂单摘要，按实际余量更新，不显示私有现金、持仓、杠杆或订单ID。详见[玩家动态与挂单观察](../../docs/幻想乡交易所-玩家动态与挂单观察.md)。
