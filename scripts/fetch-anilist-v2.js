// =============================================
//  AniList 角色抓取 v2
//  取收藏数前 1500 名，保留性别、简介、作品资料
//  输出: data/anilist-characters-v2.json
// =============================================

const fs = require('fs');
const path = require('path');

const API = 'https://graphql.anilist.co';
const OUT = path.join(__dirname, '..', 'data', 'anilist-characters-v2.json');
const CACHE_DIR = path.join(__dirname, '..', 'data', 'anilist-cache-v2');
const TOTAL_PAGES = 30;
const PER_PAGE = 50;
const DELAY_MS = 800;

const QUERY = `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    characters(sort: FAVOURITES_DESC) {
      id
      name { full native alternative }
      image { large medium }
      description(asHtml: false)
      gender
      age
      favourites
      media(perPage: 6) {
        nodes {
          title { romaji english native }
          type
          isAdult
          popularity
          genres
          tags { name rank isMediaSpoiler }
        }
      }
    }
  }
}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value) {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/~!([\s\S]*?)!~/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickSource(nodes) {
  const list = (nodes || []).filter(n => n && n.title);
  const safe = list.filter(n => !n.isAdult);
  const animeSafe = safe.filter(n => n.type === 'ANIME');
  const animeAny = list.filter(n => n.type === 'ANIME');
  const pool = animeSafe.length ? animeSafe
    : animeAny.length ? animeAny
    : safe.length ? safe
    : list;
  pool.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return pool[0] || null;
}

function cleanCharacter(raw) {
  const nodes = raw.media?.nodes || [];
  const src = pickSource(nodes);
  const adultOnly = nodes.length > 0 && nodes.every(n => n.isAdult);
  const tags = (src?.tags || [])
    .filter(t => !t.isMediaSpoiler && (t.rank || 0) >= 20)
    .sort((a, b) => (b.rank || 0) - (a.rank || 0))
    .slice(0, 20)
    .map(t => ({ name: t.name, rank: t.rank }));

  return {
    id: raw.id,
    name: raw.name?.full || '',
    name_native: raw.name?.native || '',
    name_alternative: (raw.name?.alternative || []).filter(Boolean),
    image: raw.image?.large || raw.image?.medium || '',
    description_en: cleanText(raw.description).slice(0, 1500),
    gender_raw: raw.gender || 'Unknown',
    age: raw.age || null,
    favourites: raw.favourites || 0,
    source_anime: src?.title?.romaji || src?.title?.english || src?.title?.native || '',
    source_anime_native: src?.title?.native || '',
    source_type: src?.type || '',
    source_is_adult: !!src?.isAdult,
    source_genres: src?.genres || [],
    source_tags: tags,
    adult_only: adultOnly
  };
}

async function fetchPage(page) {
  const cacheFile = path.join(CACHE_DIR, `page-${String(page).padStart(2, '0')}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { page, perPage: PER_PAGE } })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
      if (!json.data?.Page) throw new Error('No Page data');

      fs.writeFileSync(cacheFile, JSON.stringify(json.data.Page, null, 2), 'utf8');
      return json.data.Page;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(attempt * 2000);
    }
  }
  throw lastError;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('AniList v2 fetch');
  console.log(`  pages: ${TOTAL_PAGES} x ${PER_PAGE} = ${TOTAL_PAGES * PER_PAGE}`);

  const rawCharacters = [];
  let pagesFetched = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    process.stdout.write(`  page ${page}/${TOTAL_PAGES} ... `);
    try {
      const data = await fetchPage(page);
      const chars = data.characters || [];
      rawCharacters.push(...chars);
      pagesFetched++;
      console.log(`got ${chars.length} (raw ${rawCharacters.length})`);
      if (!data.pageInfo?.hasNextPage) break;
    } catch (error) {
      console.log(`ERROR: ${error.message}`);
      break;
    }
    if (page < TOTAL_PAGES) await sleep(DELAY_MS);
  }

  const seen = new Set();
  const characters = [];
  for (const raw of rawCharacters) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    characters.push(cleanCharacter(raw));
  }

  const genderCounts = {};
  for (const c of characters) genderCounts[c.gender_raw] = (genderCounts[c.gender_raw] || 0) + 1;

  const payload = {
    source: 'anilist',
    fetched_at: new Date().toISOString(),
    pages_fetched: pagesFetched,
    total: characters.length,
    gender_counts: genderCounts,
    characters
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nDone. ${characters.length} characters -> ${OUT}`);
  console.log('Gender:', genderCounts);
  console.log(`Adult-only: ${characters.filter(c => c.adult_only).length}`);
}

main().catch(error => {
  console.error('FATAL:', error);
  process.exit(1);
});
