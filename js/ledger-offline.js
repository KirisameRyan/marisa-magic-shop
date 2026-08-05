// =============================================
//  霧雨魔法店 · 账本离线层 (IndexedDB)
//  - 镜像表 tx:     服务器记录镜像(在线全量同步)
//  - 队列表 pending: 离线写操作(新增/修改/删除), 联网后推送
//  - meta:          最后同步时间
//  依赖: API_BASE(api-config.js) + Auth(可选)
// =============================================
window.LedgerOffline = (function() {
  var DB_NAME = 'mms_ledger';
  var DB_VER = 1;
  var db = null;

  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('tx')) {
          d.createObjectStore('tx', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('pending')) {
          d.createObjectStore('pending', { keyPath: 'local_id', autoIncrement: true });
        }
        if (!d.objectStoreNames.contains('meta')) {
          d.createObjectStore('meta');
        }
      };
      req.onsuccess = function(e) { db = e.target.result; resolve(db); };
      req.onerror = function() { reject(req.error); };
    });
  }

  function txDone(store, mode, fn) {
    return new Promise(function(resolve, reject) {
      open().then(function(d) {
        var tx = d.transaction(store, mode);
        var s = tx.objectStore(store);
        var out = fn(s);
        tx.oncomplete = function() { resolve(out); };
        tx.onerror = function() { reject(tx.error); };
      }).catch(reject);
    });
  }

  function all(storeName) {
    return new Promise(function(resolve, reject) {
      open().then(function(d) {
        var tx = d.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function getMeta(key) {
    return new Promise(function(resolve, reject) {
      open().then(function(d) {
        var tx = d.transaction('meta', 'readonly');
        var req = tx.objectStore('meta').get(key);
        req.onsuccess = function() { resolve(req.result === undefined ? null : req.result); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function setMeta(key, val) {
    return txDone('meta', 'readwrite', function(s) { s.put(val, key); });
  }

  // ═══════ 镜像操作 ═══════
  function replaceTx(list) {
    return txDone('tx', 'readwrite', function(s) {
      s.clear();
      for (var i = 0; i < list.length; i++) s.put(list[i]);
    });
  }

  function putTx(rec) {
    return txDone('tx', 'readwrite', function(s) { s.put(rec); });
  }

  function delTx(id) {
    return txDone('tx', 'readwrite', function(s) { s.delete(id); });
  }

  // ═══════ 队列操作 ═══════
  function enqueue(op, payload) {
    return txDone('pending', 'readwrite', function(s) { s.add({ op: op, payload: payload, ts: Date.now() }); });
  }

  function clearPending() {
    return txDone('pending', 'readwrite', function(s) { s.clear(); });
  }

  function authToken() {
    return (window.Auth && Auth.token) ? Auth.token() : '';
  }

  // ═══════ 全量同步(在线时调用): 推送队列 → 拉增量 → 合并镜像 ═══════
  function sync() {
    if (!navigator.onLine) return Promise.resolve({ offline: true });
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var pushArr = [];
        var txr = d.transaction('pending', 'readonly');
        var req = txr.objectStore('pending').getAll();
        req.onsuccess = function() { pushArr = req.result || []; resolve(pushArr); };
        req.onerror = function() { reject(req.error); };
      });
    }).then(function(pushArr) {
      var form = new FormData();
      form.append('action', 'sync');
      form.append('since', '1970-01-01 00:00:00');
      if (pushArr.length) {
        var mapped = pushArr.map(function(p) {
          var pl = p.payload || {};
          return {
            local_id: p.local_id,
            id: pl.id || undefined,
            deleted: !!pl.deleted,
            type: pl.type, amount_cents: pl.amount_cents, category_id: pl.category_id,
            merchant: pl.merchant, note: pl.note, happened_at: pl.happened_at, source: pl.source
          };
        });
        form.append('push', JSON.stringify(mapped));
      }
      return fetch(API_BASE + 'api/ledger.php', {
        method: 'POST', body: form,
        headers: { 'Authorization': 'Bearer ' + authToken() }
      }).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.ok) return res;
        // 应用推送结果到镜像(本地临时 id 换成服务器 id)
        var pushMap = {};
        (res.push_results || []).forEach(function(pr) {
          if (pr.local_id != null) pushMap['local_' + pr.local_id] = pr.id;
          if (pr.deleted && pr.id) pushMap['del_' + pr.id] = true;
        });
        return open().then(function(d) {
          return new Promise(function(ok, fail) {
            var tx = d.transaction(['tx', 'pending'], 'readwrite');
            var ts = tx.objectStore('tx');
            var ps = tx.objectStore('pending');
            ps.clear();
            var upd = res.updated || [];
            // 服务器增量直接覆盖镜像
            upd.forEach(function(u) { ts.put(u); });
            tx.oncomplete = function() { ok(res); };
            tx.onerror = function() { fail(tx.error); };
          });
        }).then(function() { return res; });
      });
    }).catch(function(e) { return { ok: false, error: e.message || '同步失败' }; });
  }

  // ═══════ 在线直连操作(带离线排队降级) ═══════
  function api(action, body) {
    return fetch(API_BASE + 'api/ledger.php', {
      method: 'POST', body: body,
      headers: { 'Authorization': 'Bearer ' + authToken() }
    }).then(function(r) { return r.json(); });
  }

  // 新增: 在线直接入库; 离线进队列
  function addRecords(records) {
    if (navigator.onLine) {
      var f = new FormData();
      f.append('action', 'add');
      f.append('records', JSON.stringify(records));
      return api('add', f).then(function(res) {
        if (res.ok) return sync(); // 顺便把镜像对齐
        return res;
      });
    }
    var q = Promise.resolve();
    records.forEach(function(r) { q = q.then(function() { return enqueue('add', r); }); });
    return q.then(function() { return { ok: true, offline: true }; });
  }

  function updateRecord(id, rec) {
    if (navigator.onLine) {
      var f = new FormData();
      f.append('action', 'update');
      f.append('id', String(id));
      f.append('record', JSON.stringify(rec));
      return api('update', f);
    }
    return enqueue('update', { id: id, type: rec.type, amount_cents: rec.amount_cents,
      category_id: rec.category_id, merchant: rec.merchant, note: rec.note,
      happened_at: rec.happened_at, source: rec.source }).then(function() { return { ok: true, offline: true }; });
  }

  function deleteRecord(id) {
    if (navigator.onLine) {
      var f = new FormData();
      f.append('action', 'delete');
      f.append('id', String(id));
      return api('delete', f);
    }
    return enqueue('delete', { id: id, deleted: true }).then(function() { return { ok: true, offline: true }; });
  }

  function listRecords() {
    return all('tx').then(function(rows) {
      rows.sort(function(a, b) { return (b.happened_at || '').localeCompare(a.happened_at || ''); });
      return rows;
    });
  }

  function pendingCount() {
    return all('pending').then(function(a) { return a.length; });
  }

  function getCategories() {
    return api('categories', (function() {
      var f = new FormData();
      f.append('action', 'categories');
      f.append('sub', 'list');
      return f;
    })()).then(function(res) { return res.categories || []; });
  }

  // 前端聚合统计(从镜像算)
  function statsFrom(list, year, month) {
    var out = { income: 0, expense: 0, byCategory: {} };
    list.forEach(function(r) {
      var d = (r.happened_at || '').substring(0, 7);
      if (d !== year + '-' + String(month).padStart(2, '0')) return;
      var cents = r.amount_cents || 0;
      if (r.type === 'income') out.income += cents;
      else { out.expense += cents; out.byCategory[r.category_id || 0] = (out.byCategory[r.category_id || 0] || 0) + cents; }
    });
    out.balance = out.income - out.expense;
    return out;
  }

  return {
    open: open, sync: sync, addRecords: addRecords, updateRecord: updateRecord,
    deleteRecord: deleteRecord, listRecords: listRecords, pendingCount: pendingCount,
    getCategories: getCategories, statsFrom: statsFrom, getMeta: getMeta, setMeta: setMeta
  };
})();
