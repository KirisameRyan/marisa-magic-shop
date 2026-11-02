#!/usr/bin/env bash
# Run on the Linux website server, from a reviewed checkout. Does not replace site.db.
set -euo pipefail
site_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ ${EUID} -ne 0 ]]; then echo '请使用 sudo bash deploy/install-exchange.sh [网站私有数据目录]' >&2; exit 1; fi
node_bin="$(command -v node || true)"
if [[ -z "$node_bin" ]] || [[ "$($node_bin -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then echo '请先在服务器安装 Node.js 24 或更新版本，然后重试。' >&2; exit 1; fi
# HEAD only: never download or inspect account database contents.
if ! "$node_bin" -e 'const origin=process.env.MMS_PUBLIC_ORIGIN||"https://www.azureflame.cloud";(async()=>{for(const path of ["/var/private/site.db","/services/exchange/server.cjs"]){const r=await fetch(new URL(path,origin),{method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(8000)});if(![401,403,404,410].includes(r.status))throw Error(path+" 返回 HTTP "+r.status);}})().catch(e=>{console.error("私有路径保护检查未通过："+e.message);process.exitCode=1;})'; then
  echo '请先在网站 Nginx server 块加载 deploy/nginx-security.conf，nginx -t 通过后重载，再运行安装脚本。自定义域名请设置 MMS_PUBLIC_ORIGIN。' >&2
  exit 1
fi
private_dir="${1:-${MMS_PRIVATE_DIR:-$site_root/var/private}}"
if [[ ! -d "$private_dir" ]]; then echo '未找到网站私有数据目录。请把网站 MMS_PRIVATE_DIR 的实际路径作为第一个参数。' >&2; exit 1; fi
private_dir="$(cd -- "$private_dir" && pwd -P)"
if [[ ! -f "$private_dir/site.db" ]]; then echo '指定目录没有网站现有 site.db；已停止，不会创建空账户库。请使用网站 MMS_PRIVATE_DIR 的实际路径。' >&2; exit 1; fi
for value in "$site_root" "$private_dir" "$node_bin"; do
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *'"'* || "$value" == *'\'* || "$value" == *'%'* ]]; then echo '部署路径包含不支持的字符，请使用普通绝对路径。' >&2; exit 1; fi
done
service_user="${MMS_EXCHANGE_USER:-$(stat -c '%U' "$private_dir/site.db")}"
if [[ "$service_user" == root ]] || ! id "$service_user" >/dev/null 2>&1; then echo '请通过 MMS_EXCHANGE_USER 指定具有网站私有目录权限的普通服务用户（例如 www 或 www-data），不使用 root 运行交易服务。' >&2; exit 1; fi
if ! runuser -u "$service_user" -- test -r "$private_dir/site.db" || ! runuser -u "$service_user" -- test -w "$private_dir" || ! runuser -u "$service_user" -- test -r "$site_root/services/exchange/server.cjs" || ! runuser -u "$service_user" -- test -x "$node_bin"; then echo '服务用户无法访问 Node、网站代码或私有数据库目录，请先检查权限。' >&2; exit 1; fi
port="${MMS_EXCHANGE_PORT:-8098}"
if [[ ! "$port" =~ ^[0-9]{4,5}$ ]] || ((port<1024 || port>65535)); then echo 'MMS_EXCHANGE_PORT 不正确' >&2; exit 1; fi
for target in /etc/mms-exchange.env /etc/systemd/system/mms-exchange.service; do
  if [[ -f "$target" ]]; then cp --backup=numbered -- "$target" "$target.bak"; fi
done
umask 077
printf 'MMS_PRIVATE_DIR="%s"\nMMS_EXCHANGE_PORT=%s\nMMS_EXCHANGE_RESUME=0\n' "$private_dir" "$port" > /etc/mms-exchange.env
cat > /etc/systemd/system/mms-exchange.service <<UNIT
[Unit]
Description=Gensokyo shared exchange
After=network.target
[Service]
Type=simple
User=$service_user
WorkingDirectory=$site_root
EnvironmentFile=/etc/mms-exchange.env
ExecStart="$node_bin" "$site_root/services/exchange/server.cjs"
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemd-analyze verify /etc/systemd/system/mms-exchange.service
systemctl daemon-reload
systemctl enable mms-exchange.service
systemctl restart mms-exchange.service
healthy=0
for attempt in {1..10}; do
  if "$node_bin" -e 'fetch("http://127.0.0.1:"+process.argv[1]+"/api/exchange/health",{signal:AbortSignal.timeout(1500)}).then(async r=>{const d=await r.json();if(!r.ok||d.service!=="gensokyo-exchange"||d.halted)process.exitCode=1;}).catch(()=>process.exitCode=1)' "$port"; then healthy=1; break; fi
  sleep 1
done
if [[ "$healthy" -ne 1 ]]; then echo '交易服务未就绪或处于维护暂停，请查看：sudo journalctl -u mms-exchange -n 40 --no-pager' >&2; exit 1; fi
echo '交易服务已启动并设为开机自启。前端使用 api/exchange.php，不需要新增 Nginx 代理规则。'
echo '如果 PHP 配置了自定义 MMS_EXCHANGE_PORT，请确认与此服务一致；默认均为 8098。'
