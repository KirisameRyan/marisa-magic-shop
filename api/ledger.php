<?php
// =============================================
//  霧雨魔法店 · 账本接口
//  全部需登录。action: add / list / update / delete
//           / categories / stats / sync
//  金额一律用"分"(整数)传输, 避免浮点误差
// =============================================

require __DIR__ . '/auth-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$user = mms_require_user();
$uid = (int)$user['id'];
$db = mms_db();

$action = strtolower(trim($_REQUEST['action'] ?? ''));

// ── 参数小工具 ──
function tx_in(string $key, $default = '') {
    return isset($_REQUEST[$key]) ? trim((string)$_REQUEST[$key]) : $default;
}

function tx_validate_record(array $r): array {
    $type = $r['type'] ?? 'expense';
    if ($type !== 'income' && $type !== 'expense') mms_json_error(400, '类型无效');
    $amount = isset($r['amount_cents']) ? (int)$r['amount_cents'] : 0;
    if ($amount <= 0 || $amount > 999999999) mms_json_error(400, '金额无效');
    $category_id = isset($r['category_id']) ? (int)$r['category_id'] : 0;
    $merchant = mb_substr((string)($r['merchant'] ?? ''), 0, 100);
    $note = mb_substr((string)($r['note'] ?? ''), 0, 500);
    $happened = (string)($r['happened_at'] ?? '');
    if ($happened === '') $happened = date('Y-m-d H:i:s');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $happened)) mms_json_error(400, '时间格式无效');
    if (strlen($happened) === 10) $happened .= ' 00:00:00';
    elseif (strlen($happened) === 16) $happened .= ':00';
    $source = (string)($r['source'] ?? 'manual');
    if (!in_array($source, ['manual', 'screenshot', 'csv'], true)) $source = 'manual';
    return [
        'type' => $type, 'amount_cents' => $amount, 'category_id' => $category_id,
        'merchant' => $merchant, 'note' => $note, 'happened_at' => $happened, 'source' => $source,
    ];
}

switch ($action) {

    /* ═══════ 新增(支持批量) ═══════ */
    case 'add': {
        $records = $_REQUEST['records'] ?? null;
        $raw = json_decode((string)$records, true);
        if (!is_array($raw) || count($raw) === 0) mms_json_error(400, '记录为空');
        if (count($raw) > 100) mms_json_error(400, '单次最多 100 条');
        $now = date('Y-m-d H:i:s');
        $st = $db->prepare(
            'INSERT INTO transactions (user_id, type, amount_cents, category_id, merchant, note, happened_at, source, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        );
        $ids = [];
        foreach ($raw as $r) {
            if (!is_array($r)) mms_json_error(400, '记录格式无效');
            $v = tx_validate_record($r);
            $st->execute([$uid, $v['type'], $v['amount_cents'], $v['category_id'], $v['merchant'], $v['note'], $v['happened_at'], $v['source'], $now, $now]);
            $ids[] = (int)$db->lastInsertId();
        }
        mms_json_ok(['ids' => $ids, 'count' => count($ids)]);
    }

    /* ═══════ 列表(按月分页) ═══════ */
    case 'list': {
        $year = (int)tx_in('year', date('Y'));
        $month = (int)tx_in('month', date('n'));
        $page = max(1, (int)tx_in('page', '1'));
        $size = min(200, max(1, (int)tx_in('page_size', '50')));
        if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) mms_json_error(400, '时间无效');
        $from = sprintf('%04d-%02d-01 00:00:00', $year, $month);
        $to = sprintf('%04d-%02d-01 00:00:00', $year + ($month === 12 ? 1 : 0), $month === 12 ? 1 : $month + 1);
        $stc = $db->prepare('SELECT COUNT(*) FROM transactions WHERE user_id=? AND happened_at>=? AND happened_at<?');
        $stc->execute([$uid, $from, $to]);
        $total = (int)$stc->fetchColumn();
        $st = $db->prepare(
            'SELECT id, type, amount_cents, category_id, merchant, note, happened_at, source, updated_at
             FROM transactions WHERE user_id=? AND happened_at>=? AND happened_at<?
             ORDER BY happened_at DESC, id DESC LIMIT ? OFFSET ?'
        );
        $st->execute([$uid, $from, $to, $size, ($page - 1) * $size]);
        $items = $st->fetchAll(PDO::FETCH_ASSOC);
        mms_json_ok(['items' => $items, 'total' => $total, 'page' => $page, 'has_more' => $page * $size < $total]);
    }

    /* ═══════ 修改 ═══════ */
    case 'update': {
        $id = (int)tx_in('id');
        $r = json_decode((string)($_REQUEST['record'] ?? 'null'), true);
        if ($id <= 0 || !is_array($r)) mms_json_error(400, '参数无效');
        $v = tx_validate_record($r);
        $st = $db->prepare(
            'UPDATE transactions SET type=?, amount_cents=?, category_id=?, merchant=?, note=?, happened_at=?, updated_at=? WHERE id=? AND user_id=?'
        );
        $st->execute([$v['type'], $v['amount_cents'], $v['category_id'], $v['merchant'], $v['note'], $v['happened_at'], date('Y-m-d H:i:s'), $id, $uid]);
        if ($st->rowCount() === 0) {
            // 区分"没这行"和"没变化"
            $chk = $db->prepare('SELECT id FROM transactions WHERE id=? AND user_id=?');
            $chk->execute([$id, $uid]);
            if (!$chk->fetch()) mms_json_error(404, '记录不存在');
        }
        mms_json_ok();
    }

    /* ═══════ 删除 ═══════ */
    case 'delete': {
        $id = (int)tx_in('id');
        if ($id <= 0) mms_json_error(400, '参数无效');
        $st = $db->prepare('DELETE FROM transactions WHERE id=? AND user_id=?');
        $st->execute([$id, $uid]);
        if ($st->rowCount() === 0) mms_json_error(404, '记录不存在');
        mms_json_ok();
    }

    /* ═══════ 分类管理 ═══════ */
    case 'categories': {
        $sub = tx_in('sub', 'list');
        if ($sub === 'list') {
            $st = $db->prepare('SELECT id, user_id, name, icon, kind, sort FROM categories WHERE user_id IN (0, ?) ORDER BY kind, sort, id');
            $st->execute([$uid]);
            $rows = $st->fetchAll(PDO::FETCH_ASSOC);
            $custom = array_filter($rows, function ($c) use ($uid) { return (int)$c['user_id'] === $uid; });
            foreach ($rows as &$c) {
                $c['custom'] = (int)$c['user_id'] === $uid;
                unset($c['user_id']);
            }
            mms_json_ok(['categories' => $rows, 'custom_count' => count($custom)]);
        }
        if ($sub === 'add') {
            $name = mb_substr(trim(tx_in('name')), 0, 12);
            $icon = mb_substr(trim(tx_in('icon', '📦')), 0, 8);
            $kind = tx_in('kind', 'expense');
            if ($name === '') mms_json_error(400, '分类名不能为空');
            if ($kind !== 'expense' && $kind !== 'income') mms_json_error(400, '类型无效');
            $stc = $db->prepare('SELECT COUNT(*) FROM categories WHERE user_id=?');
            $stc->execute([$uid]);
            $cnt = (int)$stc->fetchColumn();
            if ($cnt >= 30) mms_json_error(400, '自定义分类最多 30 个');
            $st = $db->prepare('INSERT INTO categories (user_id, name, icon, kind, sort) VALUES (?,?,?,?,100)');
            $st->execute([$uid, $name, $icon, $kind]);
            mms_json_ok(['id' => (int)$db->lastInsertId()]);
        }
        if ($sub === 'delete') {
            $id = (int)tx_in('id');
            $chk = $db->prepare('SELECT id FROM categories WHERE id=? AND user_id=?');
            $chk->execute([$id, $uid]);
            if (!$chk->fetch()) mms_json_error(404, '分类不存在或非自定义');
            // 被引用记录置为未分类
            $db->prepare('UPDATE transactions SET category_id=0, updated_at=? WHERE category_id=? AND user_id=?')
                ->execute([date('Y-m-d H:i:s'), $id, $uid]);
            $db->prepare('DELETE FROM categories WHERE id=? AND user_id=?')->execute([$id, $uid]);
            mms_json_ok();
        }
        mms_json_error(400, '未知子操作');
    }

    /* ═══════ 统计 ═══════ */
    case 'stats': {
        $year = (int)tx_in('year', date('Y'));
        $month = (int)tx_in('month', date('n'));
        if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) mms_json_error(400, '时间无效');

        // 本月收入/支出/结余 + 分类占比
        $from = sprintf('%04d-%02d-01 00:00:00', $year, $month);
        $to = sprintf('%04d-%02d-01 00:00:00', $year + ($month === 12 ? 1 : 0), $month === 12 ? 1 : $month + 1);
        $st = $db->prepare(
            'SELECT type, COALESCE(SUM(amount_cents),0) AS s FROM transactions
             WHERE user_id=? AND happened_at>=? AND happened_at<? GROUP BY type'
        );
        $st->execute([$uid, $from, $to]);
        $sum = ['income' => 0, 'expense' => 0];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) $sum[$row['type']] = (int)$row['s'];

        $st = $db->prepare(
            'SELECT category_id, COALESCE(SUM(amount_cents),0) AS s FROM transactions
             WHERE user_id=? AND type=\'expense\' AND happened_at>=? AND happened_at<? GROUP BY category_id ORDER BY s DESC'
        );
        $st->execute([$uid, $from, $to]);
        $catRows = $st->fetchAll(PDO::FETCH_ASSOC);
        $catIds = array_map(function ($r) { return (int)$r['category_id']; }, $catRows);
        $catNames = [];
        if ($catIds) {
            $q = 'SELECT id, name, icon FROM categories WHERE id IN (' . implode(',', array_fill(0, count($catIds), '?')) . ')';
            $st = $db->prepare($q);
            $st->execute($catIds);
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $c) $catNames[(int)$c['id']] = $c;
        }
        $byCategory = [];
        foreach ($catRows as $r) {
            $cid = (int)$r['category_id'];
            $byCategory[] = [
                'category_id' => $cid,
                'name' => $catNames[$cid]['name'] ?? '未分类',
                'icon' => $catNames[$cid]['icon'] ?? '📦',
                'amount_cents' => (int)$r['s'],
            ];
        }

        // 近 30 天趋势
        $st = $db->prepare(
            'SELECT substr(happened_at,1,10) AS d, type, COALESCE(SUM(amount_cents),0) AS s
             FROM transactions WHERE user_id=? AND happened_at>=?
             GROUP BY d, type ORDER BY d'
        );
        $st->execute([$uid, date('Y-m-d', strtotime('-29 days')) . ' 00:00:00']);
        $trendMap = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $trendMap[$row['d']][$row['type']] = (int)$row['s'];
        }
        $trend = [];
        for ($i = 29; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i days"));
            $trend[] = ['date' => $d, 'income' => $trendMap[$d]['income'] ?? 0, 'expense' => $trendMap[$d]['expense'] ?? 0];
        }

        // 近 6 月收支
        $st = $db->prepare(
            'SELECT substr(happened_at,1,7) AS m, type, COALESCE(SUM(amount_cents),0) AS s
             FROM transactions WHERE user_id=? AND happened_at>=?
             GROUP BY m, type ORDER BY m'
        );
        $st->execute([$uid, date('Y-m-01', strtotime('-5 months')) . ' 00:00:00']);
        $monthMap = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $monthMap[$row['m']][$row['type']] = (int)$row['s'];
        }
        $monthly = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = date('Y-m', strtotime("-$i months"));
            $monthly[] = ['month' => $m, 'income' => $monthMap[$m]['income'] ?? 0, 'expense' => $monthMap[$m]['expense'] ?? 0];
        }

        mms_json_ok([
            'income' => $sum['income'], 'expense' => $sum['expense'],
            'balance' => $sum['income'] - $sum['expense'],
            'by_category' => $byCategory, 'trend' => $trend, 'monthly' => $monthly,
        ]);
    }

    /* ═══════ 离线同步 ═══════ */
    case 'sync': {
        $since = tx_in('since', '1970-01-01 00:00:00');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $since)) mms_json_error(400, '时间无效');
        if (strlen($since) === 10) $since .= ' 00:00:00';

        // 推送本地改动(离线队列)
        $push = json_decode((string)($_REQUEST['push'] ?? '[]'), true);
        if (!is_array($push)) mms_json_error(400, '推送格式无效');
        if (count($push) > 200) mms_json_error(400, '单次最多 200 条');
        $results = [];
        $now = date('Y-m-d H:i:s');
        foreach ($push as $p) {
            if (!is_array($p)) continue;
            $pid = isset($p['id']) ? (int)$p['id'] : 0;
            if (!empty($p['deleted'])) {
                if ($pid > 0) {
                    $db->prepare('DELETE FROM transactions WHERE id=? AND user_id=?')->execute([$pid, $uid]);
                    $results[] = ['id' => $pid, 'deleted' => true];
                }
                continue;
            }
            $v = tx_validate_record($p);
            if ($pid > 0) {
                $db->prepare(
                    'UPDATE transactions SET type=?, amount_cents=?, category_id=?, merchant=?, note=?, happened_at=?, source=?, updated_at=? WHERE id=? AND user_id=?'
                )->execute([$v['type'], $v['amount_cents'], $v['category_id'], $v['merchant'], $v['note'], $v['happened_at'], $v['source'], $now, $pid, $uid]);
                $results[] = ['local_id' => $p['local_id'] ?? null, 'id' => $pid];
            } else {
                $db->prepare(
                    'INSERT INTO transactions (user_id, type, amount_cents, category_id, merchant, note, happened_at, source, created_at, updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?)'
                )->execute([$uid, $v['type'], $v['amount_cents'], $v['category_id'], $v['merchant'], $v['note'], $v['happened_at'], $v['source'], $now, $now]);
                $results[] = ['local_id' => $p['local_id'] ?? null, 'id' => (int)$db->lastInsertId()];
            }
        }

        // 拉取增量
        $st = $db->prepare(
            'SELECT id, type, amount_cents, category_id, merchant, note, happened_at, source, updated_at
             FROM transactions WHERE user_id=? AND updated_at > ? ORDER BY updated_at LIMIT 500'
        );
        $st->execute([$uid, $since]);
        $updated = $st->fetchAll(PDO::FETCH_ASSOC);

        // 删除增量(软删清单: 用 updated_at 追删太重, V1 依赖推送侧删除 + 全量 diff 由前端处理)
        mms_json_ok([
            'server_time' => $now,
            'updated' => $updated,
            'push_results' => $results,
        ]);
    }

    default:
        mms_json_error(400, '未知操作');
}
