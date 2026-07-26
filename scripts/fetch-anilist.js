// =============================================
//  AniList 角色爬虫
//  获取热门角色 500 个 (按收藏数排序)
//  输出: data/anilist-characters.json
// =============================================

const fs = require('fs');
const path = require('path');

const ANILIST_API = 'https://graphql.anilist.co';
const PER_PAGE = 50;
const TOTAL_PAGES = 25; // 50 × 25 = 1250 characters, filter to ~500 female
const OUTPUT = path.join(__dirname, '..', 'data', 'anilist-characters.json');

const QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
    }
    characters(sort: FAVOURITES_DESC) {
      id
      name {
        full
        native
      }
      image {
        large
      }
      description(asHtml: false)
      gender
      age
      favourites
      media(sort: POPULARITY_DESC, perPage: 3) {
        nodes {
          title {
            romaji
            english
            native
          }
          type
          popularity
          format
        }
      }
    }
  }
}
`;

async function fetchPage(page) {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { page, perPage: PER_PAGE } })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.errors) {
    console.warn('  GraphQL errors:', json.errors.map(e => e.message).join(', '));
  }
  return json.data;
}

function cleanCharacter(raw) {
  // 提取主要作品名（取第一个 ANIME 类型）
  const mediaNodes = (raw.media?.nodes || []);
  const anime = mediaNodes.find(m => m.type === 'ANIME') || mediaNodes[0] || null;

  return {
    id: raw.id,
    name: raw.name?.full || '',
    name_native: raw.name?.native || '',
    image: raw.image?.large || '',
    description: (raw.description || '').replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
    gender: raw.gender || '',
    age: raw.age || null,
    favourites: raw.favourites || 0,
    source_anime: anime ? (anime.title?.romaji || anime.title?.english || anime.title?.native || '') : '',
    source_type: anime?.type || '',
    // 标签字段预留
    tags: {}
  };
}

async function main() {
  console.log('🔍 AniList Character Scraper');
  console.log(`   Target: ${TOTAL_PAGES} pages × ${PER_PAGE} = ${TOTAL_PAGES * PER_PAGE} characters\n`);

  let all = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    process.stdout.write(`   Fetching page ${p}/${TOTAL_PAGES}... `);
    try {
      const data = await fetchPage(p);
      const chars = (data.Page?.characters || []).map(cleanCharacter);
      all = all.concat(chars);
      console.log(`got ${chars.length} (total: ${all.length})`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
    // 尊重 API 限流: ~90 requests/min → 每页间隔 800ms
    if (p < TOTAL_PAGES) await new Promise(r => setTimeout(r, 800));
  }

  // 去重 + 过滤女性
  const seen = new Set();
  let femaleChars = [];
  for (const c of all) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (c.gender !== 'Female') continue;
    femaleChars.push(c);
  }
  all = femaleChars.slice(0, 500); // 只取 500

  // 写入文件
  fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2), 'utf-8');
  console.log(`\n✅ Done. ${all.length} characters saved to ${OUTPUT}`);
  console.log(`   File size: ${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
