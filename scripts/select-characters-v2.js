// =============================================
//  选择 v2 角色池
//  女: 500 旧 AniList + 100 新 + 22 东方 = 622
//  男: 400 新
//  输出: data/selected-characters-v2.json
// =============================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ANILIST_FILE = path.join(ROOT, 'data', 'anilist-characters-v2.json');
const LEGACY_FILE = path.join(ROOT, 'data', 'waifu-db-zh.json');
const OUT = path.join(ROOT, 'data', 'selected-characters-v2.json');

const FEMALE_ANILIST_TARGET = 600;
const MALE_TARGET = 400;
const TOUHOU_ID_BASE = 900000;
const BLOCKED_SERIES = /Boku no Hero Academia|My Hero Academia|我的英雄学院|僕のヒーローアカデミア/i;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizeGender(value) {
  if (!value) return 'unknown';
  const text = String(value).toLowerCase();
  if (text === 'female' || text.includes('female') && !text.includes('male')) return 'female';
  if (text === 'male' || text.startsWith('male')) return 'male';
  if (text.includes('non-binary') || text.includes('androgynous')) return 'other';
  return 'unknown';
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function baseFromAnilist(char, pool, isNew) {
  const gender = normalizeGender(char.gender_raw);
  return {
    id: char.id,
    name: char.name || '',
    name_native: char.name_native || '',
    name_romaji: char.name || '',
    name_alternative: char.name_alternative || [],
    gender,
    gender_raw: char.gender_raw || 'Unknown',
    pool,
    source: 'anilist',
    is_new: isNew,
    anilist_missing: false,
    image: char.image || '',
    description_en: char.description_en || '',
    description_zh: '',
    source_anime: char.source_anime || '',
    source_anime_native: char.source_anime_native || '',
    source_type: char.source_type || '',
    source_genres: char.source_genres || [],
    source_tags: char.source_tags || [],
    favourites: char.favourites || 0,
    age: char.age || null,
    legacy_tags: null,
    legacy_description: '',
    legacy_name: '',
    legacy_source: '',
    needs_bangumi: isNew,
    needs_llm: true,
    search_names: uniqueStrings([
      char.name_native,
      char.name,
      ...(char.name_alternative || [])
    ]),
    bangumi_query: char.name_native || char.name || ''
  };
}

function baseFromLegacy(char, anilistById) {
  const isTouhou = char.id >= TOUHOU_ID_BASE;
  const fresh = anilistById.get(char.id) || null;
  return {
    id: char.id,
    name: char.name || '',
    name_native: char.name_native || '',
    name_romaji: fresh?.name || char.name_native || char.name || '',
    name_alternative: fresh?.name_alternative || [],
    gender: 'female',
    gender_raw: isTouhou ? 'Female' : (fresh?.gender_raw || 'Female'),
    pool: 'female',
    source: isTouhou ? 'touhou' : 'anilist',
    is_new: false,
    anilist_missing: !fresh && !isTouhou,
    image: char.image || fresh?.image || '',
    description_en: fresh?.description_en || '',
    description_zh: char.description || '',
    source_anime: char.source_anime || fresh?.source_anime || '',
    source_anime_native: fresh?.source_anime_native || '',
    source_type: char.source_type || fresh?.source_type || '',
    source_genres: fresh?.source_genres || [],
    source_tags: fresh?.source_tags || [],
    favourites: char.favourites || fresh?.favourites || 0,
    age: fresh?.age || null,
    legacy_tags: char.tags || null,
    legacy_description: char.description || '',
    legacy_name: char.name || '',
    legacy_source: char.source_anime || '',
    needs_bangumi: false,
    needs_llm: !isTouhou,
    search_names: uniqueStrings([
      char.name_native,
      fresh?.name,
      char.name,
      ...(fresh?.name_alternative || [])
    ]),
    bangumi_query: char.name_native || fresh?.name || char.name || ''
  };
}

function main() {
  const anilist = readJson(ANILIST_FILE);
  const legacy = readJson(LEGACY_FILE);
  const chars = (anilist.characters || []).filter(c => !BLOCKED_SERIES.test(c.source_anime || ''));

  const anilistById = new Map(chars.map(c => [c.id, c]));
  const legacyIds = new Set(legacy.map(c => c.id));

  const existingFemale = legacy.filter(c => c.id < TOUHOU_ID_BASE);
  const touhou = legacy.filter(c => c.id >= TOUHOU_ID_BASE);

  const freshFemale = chars
    .filter(c => normalizeGender(c.gender_raw) === 'female')
    .filter(c => !legacyIds.has(c.id))
    .filter(c => !c.adult_only)
    .sort((a, b) => (b.favourites || 0) - (a.favourites || 0));

  const freshMale = chars
    .filter(c => normalizeGender(c.gender_raw) === 'male')
    .filter(c => !c.adult_only)
    .sort((a, b) => (b.favourites || 0) - (a.favourites || 0));

  const neededFemale = Math.max(0, FEMALE_ANILIST_TARGET - existingFemale.length);
  const selectedFemaleNew = freshFemale.slice(0, neededFemale);
  const selectedMale = freshMale.slice(0, MALE_TARGET);

  const selected = [];

  for (const c of existingFemale) selected.push(baseFromLegacy(c, anilistById));
  for (const c of selectedFemaleNew) selected.push(baseFromAnilist(c, 'female', true));
  for (const c of selectedMale) selected.push(baseFromAnilist(c, 'male', true));
  for (const c of touhou) selected.push(baseFromLegacy(c, anilistById));

  const seen = new Set();
  const unique = selected.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const female = unique.filter(c => c.pool === 'female');
  const male = unique.filter(c => c.pool === 'male');
  const summary = {
    generated_at: new Date().toISOString(),
    female_total: female.length,
    female_anilist_legacy: existingFemale.length,
    female_anilist_new: selectedFemaleNew.length,
    female_touhou: touhou.length,
    male_total: male.length,
    anilist_missing_legacy: unique.filter(c => c.anilist_missing).length,
    needs_bangumi: unique.filter(c => c.needs_bangumi).length,
    needs_llm: unique.filter(c => c.needs_llm).length
  };

  fs.writeFileSync(OUT, JSON.stringify({ summary, characters: unique }, null, 2), 'utf8');

  console.log('Selected characters ->', OUT);
  console.log(summary);
  console.log('Top new female:', selectedFemaleNew.slice(0, 8).map(c => `${c.name}(${c.favourites})`).join(', '));
  console.log('Top male:', selectedMale.slice(0, 8).map(c => `${c.name}(${c.favourites})`).join(', '));
}

main();
