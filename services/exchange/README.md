# 幻想乡交易所后端

这是可本机联调的多人版本，尚未部署到生产服务器。网站账户 ID 是游戏账户的唯一绑定键；首次开通发放一次 100,000 游戏币。无邮箱账户可以正常交易。

## 运行要求

- Node.js 24（使用内置 `node:sqlite`，无 npm 依赖）。
- 现有网站 PHP 8.1+，启用 PDO SQLite、mbstring；发送邮件还需要 openssl 和正确的 SMTP 环境变量。
- PHP 与 Node 使用同一台服务器、同一个 `MMS_PRIVATE_DIR`。其中 `site.db` 是现有网站账户库，`exchange.db` 是独立交易库，均必须位于网页根目录之外。

## 本机开发

```powershell
# PHP 不在 PATH 时设置 PHP_BIN，或使用 _local/php-runtime/php.exe
node scripts/dev-exchange.cjs 8098
```

打开 `http://127.0.0.1:8098/gensokyo_exchange.html`，注册本机测试账户，再进入共享市场。该命令只读写 `_local/exchange-dev/`，不会使用网站真实账户库；其他端口使用独立的带端口后缀目录。邮件发送被关闭。不要在本机测试页面输入真实网站密码。

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
6. 使用 `deploy/mms-exchange.service` 配置 systemd 常驻单个 Node 服务（检查 User、Group、Node 路径和 WorkingDirectory）。Node 只监听 `127.0.0.1`，通过 `deploy/exchange.nginx.conf` 把 `/api/exchange/` 代理到它，保留原 `/api/auth.php` 的 PHP-FPM 处理。同时安装仓库已有的 `deploy/nginx-security.conf`，拒绝私有目录、数据库和配置文件的 HTTP 访问。Nginx 应先 `nginx -t` 再重载。不要对交易接口添加 CDN 缓存。
7. 发布前用两个测试账户完成注册、登录、跨玩家成交、撤单、重启持仓恢复、排行榜和会话失效检查。旧库首次访问认证接口时自动迁移可选邮箱字段；不更改原用户 ID、原邮箱和旧密码哈希。

## 撮合、账本和恢复

- 服务端接收限价委托、冻结资金，每分钟整点统一撮合。旧余单先进入盘口，系统报价更新后处理新委托，再处理系统自主流量。价格优先，同价按服务端接受序号排序，按被动单价格成交。这是分钟批处理规则，不是传统单一成交价集合竞价。
- 玩家与系统共享有限数量的盘口，系统不直接强改收盘价；没有玩家时也有系统自主买卖。普通买卖与逐仓合约分账，杠杆只开放 2/3/5/10/20 倍。自成交取消主动单；每账户最多 30 笔未完成委托。
- 下单、撤单、追加保证金和开通账户均要求幂等键；资金状态、成交、流水和请求回执在一个 SQLite 事务内保存。用户只能取消自己的委托，客户端提交余额、用户 ID 或排名字段会被拒绝。
- 每日北京时间 04:00 记录切日之前的资产快照，不重置本金、不强制平仓。榜单按当前净资产降序，平手按开户时间和用户 ID 排序，展示前 100 名及个人排名。
- 网页每 10 秒读取状态以展示订单变化，成交仍只有一分钟一次。前端可计算图表、估算费用并缓存登录会话；服务端重新验证并决定所有正式交易结果。本地练习资金不能导入正式盘。
- 服务中断超过 5 分钟后暂停市场，避免对停机期间的行情盲目补算。管理员核对账本和委托后，可在一次重启中设置 `MMS_EXCHANGE_RESUME=1` 跳过停机区间，随后恢复为 0。恢复不撤销玩家余单，恢复后的下一分钟仍会撮合；恢复前应通知玩家并审查风险仓位。

## 当前边界

这是单服务、单写者的首版后端：SQLite 租约阻止双进程同时撮合，不能直接多副本扩容。当前市场状态采用事务性 JSON 快照，另存成交、流水和日快照；尚未完成大规模压测、备份恢复演练或跨机器灾备，不宣称可承载某个在线人数。上线前根据实际机器做压测，持续监控内存、撮合耗时和数据库大小；流水和幂等回执当前不自动清理。

注册限流可以减轻滥用，但可选邮箱不能保证一人一号。当前没有跨账户对刷识别和完整反操纵机制；有奖活动前需要单独制定参赛资格、异常成交审查和排名冻结规则。用户注册本身不等于领取现金或现实资产。

Toy 入口还没有接入：目前不能仅凭前端声称的 B 站 UID 自动绑定账户。后续必须核验平台支持的可信身份凭证，提供显式绑定已有网站账户的流程，且禁止按同名或邮箱自动合并。完成后仍读取此服务的同一份排行。

## 检查命令

```sh
node --test scripts/test-gensokyo-engine.cjs scripts/test-gensokyo-market-data.cjs scripts/test-gensokyo-risk-etf.cjs scripts/test-auth-registration.cjs scripts/test-exchange-server.cjs
php scripts/test-api.php
python scripts/security-scan.py
python scripts/test-publication.py
```
