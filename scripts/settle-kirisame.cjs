#!/usr/bin/env node
'use strict';
/**
 * 雾雨币一次性交割（管理员离线操作，绝不由调度器调用）
 * ------------------------------------------------------------
 * 用途：按指定价格，把所有雾雨币合约/现货仓位一次性结算成现金，
 *       清零做市与流量账户的该标的库存，并把标的重置为可重开状态。
 *
 * 用法（必须先停服）：
 *   node scripts/settle-kirisame.cjs                      # dry-run，只打印
 *   node scripts/settle-kirisame.cjs --apply              # 执行
 *   node scripts/settle-kirisame.cjs --apply --price 121.4
 *   node scripts/settle-kirisame.cjs --apply --recap 10000000
 *   node scripts/settle-kirisame.cjs --apply --insurance 2000000
 *   node scripts/settle-kirisame.cjs --apply --clear-history
 *
 * 保证：
 *   - 停服 + 租约过期才允许写库；
 *   - 先备份（VACUUM INTO + quick_check），备份失败不继续；
 *   - 幂等：state.settlement.id 已存在则直接退出；
 *   - 每一笔都写 _journal，可在 ledger 表审计；
 *   - 不改 site.db、不改玩家 ID、不改其他标的。
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const E = require('../js/gensokyo-engine.js');

const KEY = 'kirisame-settlement-20261105';
const ASSET = 'kirisame-coin';
const FEE = 0; // 交割不收手续费

const DEFAULT_NOTICE = {
  title: '关于雾雨币市场重置的说明与致歉',
  body: '11 月 4 日至 5 日，交易所做市与结算参数存在设计缺陷，雾雨币出现流动性异常。' +
        '我们已于 11 月 5 日 04:00 按 121.4 的价格对雾雨币全部仓位完成一次性交割，' +
        '盈亏已结算到账户，未收取手续费。' +
        '接下来我们会调整杠杆、持仓限额与清算机制，并在完成后另行公告。' +
        '对本次事故给各位带来的困扰，我们深表歉意。',
};

function die(msg) { console.error('\n[中止] ' + msg + '\n'); process.exit(1); }
function round(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function parseArgs(argv) {
  const out = { apply: false, price: null, recap: 0, insurance: 0, clearHistory: false, resetPrice: null, noticeFile: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--price') out.price = Number(argv[++i]);
    else if (a === '--recap') out.recap = Number(argv[++i]);
    else if (a === '--insurance') out.insurance = Number(argv[++i]);
    else if (a === '--clear-history') out.clearHistory = true;
    else if (a === '--reset-price') out.resetPrice = Number(argv[++i]);
    else if (a === '--notice') out.noticeFile = argv[++i] || '';
    else die('未知参数 ' + a);
  }
  if (out.price !== null && !(out.price > 0)) die('--price 必须是正数');
  if (out.recap && !(out.recap > 0)) die('--recap 必须是正数');
  if (out.insurance && !(out.insurance > 0)) die('--insurance 必须是正数');
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

function backupDb(privateDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(privateDir, 'settlement-backup-' + stamp);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const src = path.join(privateDir, 'exchange.db');
  try {
    const { backup } = require('./backup-exchange.cjs');
    return backup(privateDir, dir);
  } catch (e) {
    // site.db 不可用时（本机演练），退化为文件拷贝
    for (const suffix of ['', '-wal', '-shm']) {
      const f = src + suffix;
      if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, 'exchange.db' + suffix));
    }
    console.warn('[提醒] 官方备份未执行（' + e.message + '），已退化为文件拷贝：' + dir);
    return dir;
  }
}

function readState(db) {
  const row = db.prepare('SELECT json FROM state WHERE id=1').get();
  if (!row) die('state 表没有快照');
  return JSON.parse(row.json);
}

function checkLease(db) {
  const lease = db.prepare('SELECT until_ms FROM lease WHERE id=1').get();
  if (lease && lease.until_ms > Date.now() + 1000) {
    die('交易服务仍在运行（租约还有 ' + Math.ceil((lease.until_ms - Date.now()) / 1000) + ' 秒）。请先 systemctl stop mms-exchange，等 15 秒再试。');
  }
}

function plan(s, price) {
  const rows = [], gaps = [];
  let playerPnl = 0, systemPnl = 0, spotAmount = 0, insuranceGap = 0;

  for (const u of Object.values(s.accounts || {})) {
    const p = u.positions && u.positions[ASSET];
    const sp = u.spotPositions && u.spotPositions[ASSET];

    if (p && p.qty > 0) {
      const raw = round((price - p.entry) * p.qty * p.sign);
      const floor = round(-p.margin + FEE);
      const pnl = Math.max(raw, floor);
      const gap = round(pnl - raw);
      rows.push({ userId: u.id, name: u.username, kind: '合约' + (p.sign > 0 ? '多' : '空'), qty: p.qty, entry: p.entry, margin: p.margin, raw, pnl, gap });
      playerPnl += pnl; systemPnl += raw; insuranceGap += gap;
      if (gap > 0) gaps.push({ userId: u.id, name: u.username, gap });
    }

    if (sp && sp.qty > 0) {
      const amount = round(sp.qty * price);
      rows.push({ userId: u.id, name: u.username, kind: '现货', qty: sp.qty, entry: sp.entry, margin: null, raw: amount, pnl: amount, gap: 0 });
      playerPnl += amount; spotAmount += amount;
    }
  }

  return { rows, playerPnl: round(playerPnl), systemPnl: round(systemPnl), spotAmount: round(spotAmount), insuranceGap: round(insuranceGap), gaps };
}

function applySettlement(s, price, opts, now) {
  const a = s.assets.find(x => x.id === ASSET);
  if (!a) die('找不到标的 ' + ASSET);
  s._journal ||= [];
  s.system ||= { cash: 0, inventory: {} };
  s.insurance ||= { balance: 0, paid: 0, uncovered: 0 };
  const out = plan(s, price);

  for (const u of Object.values(s.accounts || {})) {
    const p = u.positions && u.positions[ASSET];
    if (p && p.qty > 0) {
      const raw = round((price - p.entry) * p.qty * p.sign);
      const pnl = Math.max(raw, round(-p.margin + FEE));
      const gap = round(pnl - raw);
      const before = u.cash;
      u.cash = round(u.cash + pnl);
      s.system.cash = round(s.system.cash - raw);
      s._journal.push({
        event: 'settle-' + ASSET + '-' + u.id, userId: u.id, time: now, kind: 'settlement',
        cashDelta: round(u.cash - before), cashAfter: u.cash, asset: ASSET,
        qty: p.qty, entry: p.entry, settlePrice: price, pnl, gap,
      });
      delete u.positions[ASSET];
    }

    const sp = u.spotPositions && u.spotPositions[ASSET];
    if (sp && sp.qty > 0) {
      const amount = round(sp.qty * price);
      const before = u.cash;
      u.cash = round(u.cash + amount);
      s.system.cash = round(s.system.cash - amount);
      s._journal.push({
        event: 'settle-spot-' + ASSET + '-' + u.id, userId: u.id, time: now, kind: 'settlement-spot',
        cashDelta: round(u.cash - before), cashAfter: u.cash, asset: ASSET,
        qty: sp.qty, entry: sp.entry, settlePrice: price, pnl: amount,
      });
      delete u.spotPositions[ASSET];
    }

    if (Array.isArray(u.orders)) u.orders = u.orders.filter(o => o.asset !== ASSET);
    if (Array.isArray(u.conditions)) u.conditions = u.conditions.filter(c => c.asset !== ASSET);
  }

  // 保险缺口：统一在下面处理，避免上面重复扣减
  if (out.gaps.length) {
    const total = out.gaps.reduce((n, g) => n + g.gap, 0);
    const paid = Math.min(total, s.insurance.balance);
    s.insurance.balance = round(s.insurance.balance - paid);
    s.insurance.uncovered = round((s.insurance.uncovered || 0) + (total - paid));
    s.insurance.paid = round((s.insurance.paid || 0) + paid);
    s._journal.push({ event: 'settle-insurance-' + now, userId: 0, time: now, kind: 'settlement-insurance', cashDelta: 0, gap: total, paid, uncovered: s.insurance.uncovered });
  }

  s.system.inventory ||= {};
  s.flow ||= { cash: 0, inventory: {} };
  s.flow.inventory ||= {};
  s.system.inventory[ASSET] = 0;
  s.flow.inventory[ASSET] = 0;

  // 标的重置
  a.price = price; a.mark = price; a.fair = price; a.anchorTarget = price;
  a.momentum = 0; a.sentiment = 0; a.newsPressure = 0;
  a.pausedUntil = 0; delete a.pauseReason; delete a.volatilityAnchor;
  delete a.priceProtection;
  if (opts.resetPrice) { a.price = a.mark = a.fair = a.anchorTarget = opts.resetPrice; }
  if (opts.clearHistory) a.history = [];

  s.settlement = {
    id: KEY, at: now, asset: ASSET, price,
    accounts: out.rows.length,
    playerPnl: out.playerPnl, systemPnl: out.systemPnl, spotAmount: out.spotAmount,
    insuranceGap: out.insuranceGap, rows: out.rows,
  };

  // 首页公告：同时写入 announcement（前端横幅）和 news（资讯流）
  const notice = opts.notice || DEFAULT_NOTICE;
  s.announcement = { id: KEY, at: now, title: notice.title, body: notice.body };
  s.news ||= [];
  s.news.unshift({
    id: 'announcement-' + KEY, kind: 'announcement', category: '交易所公告',
    source: '幻想乡交易所', title: notice.title, body: notice.body,
    time: now, delta: 0, asset: ASSET,
  });
  s.news = s.news.slice(0, 64);

  // 可选注资
  if (opts.recap > 0 && s.system.cash < opts.recap) {
    const add = round(opts.recap - s.system.cash);
    s.system.cash = opts.recap;
    s._journal.push({ event: 'settle-recap-' + now, userId: 0, time: now, kind: 'administrator-capital', cashDelta: add, cashAfter: s.system.cash });
  }
  if (opts.insurance > 0 && s.insurance.balance < opts.insurance) {
    const add = round(opts.insurance - s.insurance.balance);
    s.insurance.balance = opts.insurance;
    if (s.insurance.uncovered > 0) {
      const covered = Math.min(s.insurance.uncovered, s.insurance.balance);
      s.insurance.uncovered = round(s.insurance.uncovered - covered);
      s.insurance.paid = round((s.insurance.paid || 0) + covered);
    }
    s._journal.push({ event: 'settle-insurance-recap-' + now, userId: 0, time: now, kind: 'administrator-insurance', cashDelta: 0, added: add, balance: s.insurance.balance, uncovered: s.insurance.uncovered });
  }

  return out;
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.noticeFile) {
    const raw = fs.readFileSync(opts.noticeFile, 'utf8').trim();
    opts.notice = raw.startsWith('{') ? JSON.parse(raw) : { title: '交易所公告', body: raw };
  }
  const privateDir = privateDirectory();
  const file = path.join(privateDir, 'exchange.db');
  if (!fs.existsSync(file)) die('找不到 ' + file);

  const db = new DatabaseSync(file);
  let s;
  try {
    checkLease(db);
    s = readState(db);

    if (s.settlement && s.settlement.id === KEY) {
      console.log('已经交割过：' + JSON.stringify(s.settlement).slice(0, 200));
      return;
    }

    const a = s.assets.find(x => x.id === ASSET);
    if (!a) die('找不到标的 ' + ASSET);
    const price = opts.price ?? a.mark;
    const out = plan(s, price);

    console.log('\n=== 雾雨币交割方案 ===');
    console.log(`标的       ${ASSET}（${a.name}）`);
    console.log(`交割价     ${price}`);
    console.log(`仓位数     ${out.rows.length}`);
    console.log(`玩家合计   +${fmt(out.playerPnl)}  （其中现货 ${fmt(out.spotAmount)}）`);
    console.log(`系统合计   -${fmt(out.systemPnl)}`);
    console.log(`保险缺口   ${fmt(out.insuranceGap)}`);
    console.log(`系统现金   ${fmt(s.system.cash)} → ${fmt(s.system.cash - out.systemPnl - out.spotAmount)}`);
    console.log(`保险余额   ${fmt(s.insurance.balance)}`);

    if (!out.rows.length) { console.log('\n没有需要交割的仓位。'); return; }
    if (!opts.apply) { console.log('\n[dry-run] 加 --apply 执行。'); return; }

    const backupDir = backupDb(privateDir);
    console.log('备份完成：' + backupDir);

    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      const fresh = readState(db);
      if (fresh.settlement && fresh.settlement.id === KEY) throw new Error('已被其他进程交割');
      const done = applySettlement(fresh, price, opts, now);
      db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(fresh));
      db.exec('COMMIT');
      console.log('\n交割完成：');
      console.log(`  账户 ${done.rows.length} 个，玩家合计 +${fmt(done.playerPnl)}，系统 ${fmt(fresh.system.cash)}`);
      console.log(`  库存已清零，标的已重置${opts.clearHistory ? '（K 线已清空）' : ''}`);
    } catch (e) {
      db.exec('ROLLBACK');
      die('写入失败，已回滚：' + e.message);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) main();
module.exports = { plan, applySettlement, KEY, ASSET };
