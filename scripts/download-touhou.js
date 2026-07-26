// =============================================
//  从 Touhou Wiki 下载角色立绘 v2
//  使用 MediaWiki API + 浏览器 UA 绕过 Cloudflare
// =============================================
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://en.touhouwiki.net/api.php';
const OUT_DIR = path.join(__dirname, '..', 'images', 'touhou');
const DB = path.join(__dirname, '..', 'data', 'waifu-db-zh.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const chars = [
  { id: 900001, wiki: 'Reimu_Hakurei' },
  { id: 900002, wiki: 'Marisa_Kirisame' },
  { id: 900003, wiki: 'Sakuya_Izayoi' },
  { id: 900004, wiki: 'Remilia_Scarlet' },
  { id: 900005, wiki: 'Flandre_Scarlet' },
  { id: 900006, wiki: 'Patchouli_Knowledge' },
  { id: 900007, wiki: 'Alice_Margatroid' },
  { id: 900008, wiki: 'Cirno' },
  { id: 900009, wiki: 'Youmu_Konpaku' },
  { id: 900010, wiki: 'Yuyuko_Saigyouji' },
  { id: 900011, wiki: 'Yukari_Yakumo' },
  { id: 900012, wiki: 'Koishi_Komeiji' },
  { id: 900013, wiki: 'Satori_Komeiji' },
  { id: 900014, wiki: 'Reisen_Udongein_Inaba' },
  { id: 900015, wiki: 'Sanae_Kochiya' },
  { id: 900016, wiki: 'Aya_Shameimaru' },
  { id: 900017, wiki: 'Fujiwara_no_Mokou' },
  { id: 900018, wiki: 'Kaguya_Houraisan' },
  { id: 900019, wiki: 'Eirin_Yagokoro' },
  { id: 900020, wiki: 'Keine_Kamishirasawa' },
  { id: 900021, wiki: 'Hata_no_Kokoro' },
  { id: 900022, wiki: 'Suika_Ibuki' },
];

async function apiGet(params) {
  const qs = new URLSearchParams({ format: 'json', ...params });
  const url = `${API_BASE}?${qs}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  const text = await resp.text();
  // Cloudflare 拦截?
  if (text.includes('Cloudflare') || text.includes('cf-browser-verify') || text.startsWith('<!DOCTYPE')) {
    throw new Error('Cloudflare block');
  }
  try { return JSON.parse(text); } catch(e) {
    throw new Error('Invalid JSON: ' + text.slice(0, 80));
  }
}

async function getImage(wikiName) {
  const json = await apiGet({ action: 'query', prop: 'pageimages', pithumbsize: 500, titles: wikiName });
  const pages = json.query?.pages || {};
  for (const key in pages) {
    const thumb = pages[key].thumbnail;
    if (thumb) return thumb.source;
  }
  return null;
}

async function download(url, filepath) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filepath, buf);
  return buf.length;
}

async function main() {
  const db = JSON.parse(fs.readFileSync(DB, 'utf-8').replace(/^\uFEFF/, ''));
  let ok = 0, fail = 0;

  for (const char of chars) {
    const num = char.id - 900000;
    const file = path.join(OUT_DIR, `th${num}.png`);
    const name = db.find(c => c.id === char.id)?.name || char.wiki;
    process.stdout.write(`${name}: `);

    try {
      const imgUrl = await getImage(char.wiki);
      if (!imgUrl) {
        process.stdout.write(`no image on wiki\n`);
        fail++;
        continue;
      }
      const size = await download(imgUrl, file);
      process.stdout.write(`${(size/1024).toFixed(0)}KB OK\n`);
      ok++;
    } catch (e) {
      process.stdout.write(`FAIL: ${e.message}\n`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // 更新 DB
  for (const char of chars) {
    const c = db.find(c => c.id === char.id);
    if (!c) continue;
    const num = char.id - 900000;
    const file = path.join(OUT_DIR, `th${num}.png`);
    if (fs.existsSync(file)) {
      c.image = `images/touhou/th${num}.png`;
    }
  }
  fs.writeFileSync(DB, JSON.stringify(db, null, 2), 'utf-8');
  fs.writeFileSync(DB.replace('.json', '.js'), 'window.WAIFU_DB = ' + JSON.stringify(db) + ';', 'utf-8');
  console.log(`\n${ok} OK, ${fail} failed. DB updated.`);
}

main().catch(e => { console.error(e); process.exit(1); });
