'use strict';
// Development-only account shim: replaces the PHP auth endpoints when PHP is not running.
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function sha(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function create(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT, password_hash TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expire INTEGER NOT NULL, created_at INTEGER NOT NULL);`);
  const q = {
    byName: db.prepare('SELECT id FROM users WHERE username=?'),
    insertUser: db.prepare('INSERT INTO users(username,email,password_hash,created_at) VALUES(?,?,?,?)'),
    insertSession: db.prepare('INSERT INTO sessions(token,user_id,expire,created_at) VALUES(?,?,?,?)'),
    bySession: db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expire>?'),
  };
  function guest() {
    let name;
    do { name = '游客' + String(100000 + Math.floor(Math.random() * 900000)); } while (q.byName.get(name));
    const now = Date.now();
    const uid = Number(q.insertUser.run(name, null, null, now).lastInsertRowid);
    const token = crypto.randomBytes(32).toString('hex');
    q.insertSession.run(sha(token), uid, Math.floor(now / 1000) + 30 * 86400, now);
    return { user: { id: uid, username: name, email: null, is_guest: 1 }, token };
  }
  function me(token) {
    if (!/^[a-f0-9]{64}$/i.test(token || '')) return null;
    return q.bySession.get(sha(token), Math.floor(Date.now() / 1000)) || null;
  }
  return { guest, me, close() { try { db.close(); } catch (e) {} } };
}

module.exports = { create, sha };
