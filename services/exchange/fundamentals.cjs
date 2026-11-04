'use strict';
// Daily fundamentals pack: one JSON file per business day, applied once.
// Files live outside the web root: <MMS_PRIVATE_DIR>/fundamentals/YYYY-MM-DD.json
const fs = require('node:fs');
const path = require('node:path');

function folder(dir) { return path.join(dir, 'fundamentals'); }

function valid(d) {
  return d && Number.isSafeInteger(d.version) && Number.isFinite(d.effectiveAt) &&
    Array.isArray(d.reports) && d.reports.length > 0 &&
    d.reports.every(r => r && typeof r.asset === 'string' && Number(r.eps) > 0);
}

function due(dir, s, now) {
  const f = folder(dir);
  if (!fs.existsSync(f)) return null;
  let files;
  try { files = fs.readdirSync(f).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse(); }
  catch (e) { return null; }
  for (const name of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(f, name), 'utf8')); }
    catch (e) { continue; }
    if (!valid(d)) continue;
    if (now < d.effectiveAt) continue;
    if (s.fundamentalsVersion && d.version <= s.fundamentalsVersion) continue;
    return d;
  }
  return null;
}

module.exports = { due, folder, valid };
