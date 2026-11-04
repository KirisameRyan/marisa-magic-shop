#!/usr/bin/env node
'use strict';
/**
 * ETF 成分股 8 → 12 迁移（管理员离线操作，绝不由调度器调用）
 * ------------------------------------------------------------
 * 线上老库的 ETF 只有 8 家成分，v3 代码默认 12 家。直接覆盖会导致
 * IOPV / 加权 PE / 前端展示全部对不上，所以需要一次显式的 rebase：
 *
 *   1. 取当前 ETF 价格 P（或 --price 指定）
 *   2. 用 12 家股票的市值权重构造新篮子
 *   3. 整体缩放，使新 IOPV 在切换瞬间恰好等于 P（价格连续、无跳空）
 *   4. 写 ledger + state.etfMigration，幂等
 *
 * 用法（必须先停服）：
 *   node scripts/migrate-etf-12.cjs            # dry-run
 *   node scripts/migrate-etf-12.cjs --apply
 *   node scripts/migrate-etf-12.cjs --apply --price 105.2
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const E = require('../js/gensokyo-engine.js');

const KEY = 'etf-12-migration-20261105';
const ASSET = 'gensokyo-etf';

function die(msg) { console.error('\n[中止] ' + msg + '\n'); process.exit(1); }
function fmt(n, d = 2) { return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d }); }

function parseArgs(argv) {
  const out = { apply: false, price: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--price') out.price = Number(argv[++i]);
    else die('未知参数 ' + a);
  }
  if (out.price !== null && !(out.price > 0)) die('--price 必须是正数');
  return out;
}

function privateDirectory() {
  if (process.env.MMS_PRIVATE_DIR) return process.env.MMS_PRIVATE_DIR;
  const envFile = '/etc/mms-exchange.env';
  if (!fs.existsSync(envFile)) die('找不到 /etc/mms-exchange.env，请设置 MMS_PRIVATE_DIR');
  const m = fs.readFileSync(envFile, 'utf8').match(/^\s*MMS_PRIVATE_DIR\s*=\s*(.+?)\s*$/m);
  if (!m) die('/etc/mms-exchange.env 里没有 MMS_PRIVATE_DIR');
  return m[1].replace(/^["']|["']$/g, '');
}

function checkLease(db) {
  const lease = db.prepare('SELECT until_ms FROM lease WHERE id=1').get();
  if (lease && lease.until_ms > Date.now() + 1000) {
    die('交易服务仍在运行（租约还有 ' + Math.ceil((lease.until_ms - Date.now()) / 1000) + ' 秒）。请先 systemctl stop mms-exchange，等 15 秒再试。');
  }
}

function backupDb(privateDir) {
  const src = path.join(privateDir, 'exchange.db');
  try {
    const { backup } = require('./backup-exchange.cjs');
    return backup(privateDir, path.join(privateDir, 'etf-migration-backup-' + new Date().toISOString().replace(/[:.]/g, '-')));
  } catch (e) {
    const dir = path.join(privateDir, 'etf-migration-backup-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const s of ['', '-wal', '-shm']) if (fs.existsSync(src + s)) fs.copyFileSync(src + s, path.join(dir, 'exchange.db' + s));
    console.warn('[提醒] 官方备份未执行（' + e.message + '），已退化为文件拷贝：' + dir);
    return dir;
  }
}

function buildBasket(s, etf, price) {
  const stocks = s.assets.filter(a => a.kind !== 'etf' && a.kind !== 'crypto');
  if (stocks.length !== 12) throw Error('股票数量不是 12（当前 ' + stocks.length + '），停止迁移');
  const rows = stocks.map(a => ({ a, cap: (a.referenceFloat || 5000000) * a.price }));
  const total = rows.reduce((n, x) => n + x.cap, 0);
  if (!(total > 0)) throw Error('市值总和无效');
  let basket = rows.map(({ a, cap }) => ({
    asset: a.id,
    quantity: price * (cap / total) / a.price,
    initialWeight: Math.round(cap / total * 1e6) / 1e6,
  }));
  const nav = basket.reduce((n, b) => { const a = s.assets.find(x => x.id === b.asset); return n + b.quantity * a.price; }, 0);
  const k = price / nav;
  basket = basket.map(b => ({ ...b, quantity: Math.round(b.quantity * k * 1e8) / 1e8 }));
  const nav2 = basket.reduce((n, b) => { const a = s.assets.find(x => x.id === b.asset); return n + b.quantity * a.price; }, 0);
  return { basket, nav: nav2 };
}

function main() {
  const opts = parseArgs(process.argv);
  const dir = privateDirectory();
  const file = path.join(dir, 'exchange.db');
  if (!fs.existsSync(file)) die('找不到 ' + file);

  const db = new DatabaseSync(file);
  try {
    checkLease(db);
    const row = db.prepare('SELECT json FROM state WHERE id=1').get();
    if (!row) die('state 表没有快照');
    const s = JSON.parse(row.json);
    const etf = s.assets.find(a => a.id === ASSET);
    if (!etf) die('找不到 ETF 标的 ' + ASSET);

    if (s.etfMigration && s.etfMigration.id === KEY) {
      console.log('已经迁移过：' + JSON.stringify(s.etfMigration).slice(0, 200));
      return;
    }
    if (Array.isArray(etf.basket) && etf.basket.length === 12) {
      console.log('ETF 已经是 12 家成分，无需迁移。');
      return;
    }

    const price = opts.price ?? etf.price;
    if (!(price > 0)) die('ETF 价格无效');
    const oldBasket = Array.isArray(etf.basket) ? etf.basket : [];
    const oldNav = oldBasket.reduce((n, b) => { const a = s.assets.find(x => x.id === b.asset); return n + b.quantity * (a ? a.price : 0); }, 0);
    const { basket, nav } = buildBasket(s, etf, price);

    console.log('\n=== ETF 8 → 12 迁移方案 ===');
    console.log(`ETF 现价     ${fmt(price, 3)}`);
    console.log(`旧篮子       ${oldBasket.length} 家，旧 IOPV ${fmt(oldNav, 3)}，溢价 ${fmt((price / oldNav - 1) * 100, 3)}%`);
    console.log(`新篮子       12 家，新 IOPV ${fmt(nav, 3)}，溢价 ${fmt((price / nav - 1) * 100, 4)}%`);
    console.log('新篮子明细：');
    for (const b of basket) {
      const a = s.assets.find(x => x.id === b.asset);
      console.log(`  ${a.name.padEnd(12)} 权重 ${(b.initialWeight * 100).toFixed(2)}%  数量 ${fmt(b.quantity, 6)}  价 ${fmt(a.price, 2)}`);
    }
    if (!opts.apply) { console.log('\n[dry-run] 加 --apply 执行。'); return; }

    const backupDir = backupDb(dir);
    console.log('备份完成：' + backupDir);

    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      const fresh = JSON.parse(db.prepare('SELECT json FROM state WHERE id=1').get().json);
      if (fresh.etfMigration && fresh.etfMigration.id === KEY) throw Error('已被其他进程迁移');
      const f = fresh.assets.find(a => a.id === ASSET);
      f.basket = basket;
      E.refreshEtf(fresh);
      f.anchorTarget = f.iopv;
      fresh.etfMigration = { id: KEY, at: now, price, from: oldBasket.length, to: 12, oldNav: E.round(oldNav), newNav: E.round(f.iopv) };
      fresh._journal ||= [];
      fresh._journal.push({ event: 'etf-migration-' + now, userId: 0, time: now, kind: 'etf-basket-migration', from: oldBasket.length, to: 12, price, oldNav: E.round(oldNav), newNav: E.round(f.iopv) });
      db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(fresh));
      db.exec('COMMIT');
      console.log('\n迁移完成：12 家成分，IOPV ' + fmt(f.iopv, 3) + '，价格 ' + fmt(f.price, 3));
    } catch (e) {
      db.exec('ROLLBACK');
      die('写入失败，已回滚：' + e.message);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) main();
module.exports = { buildBasket, KEY };
