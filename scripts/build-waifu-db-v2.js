// =============================================
//  构建 v2 角色数据库
//  合并 selected + Bangumi + LLM + 旧标签 + 人工校订
//  输出女/男/全三套 JSON 与 JS
// =============================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const SELECTED_FILE = path.join(DATA, 'selected-characters-v2.json');
const BANGUMI_FILE = path.join(DATA, 'bangumi-cache.json');
const LLM_FILE = path.join(DATA, 'llm-tag-cache.json');
const TAXONOMY_FILE = path.join(DATA, 'waifu-tags-v2.json');
const OVERRIDES_FILE = path.join(DATA, 'manual-tag-overrides.json');
const SOURCE_MAP_FILE = path.join(DATA, 'source-name-map.json');

const BLOCKED_SERIES = /Boku no Hero Academia|My Hero Academia|我的英雄学院|僕のヒーローアカデミア/i;

const OUT = {
  femaleJson: path.join(DATA, 'waifu-db-zh.json'),
  femaleJs: path.join(DATA, 'waifu-db-zh.js'),
  maleJson: path.join(DATA, 'waifu-db-male-zh.json'),
  maleJs: path.join(DATA, 'waifu-db-male-zh.js'),
  allJson: path.join(DATA, 'waifu-db-all-zh.json'),
  allJs: path.join(DATA, 'waifu-db-all-zh.js')
};

const LEGACY_HAIR_COLOR = new Set([
  'hair_black', 'hair_white', 'hair_blonde', 'hair_red', 'hair_blue',
  'hair_purple', 'hair_green', 'hair_brown', 'hair_gradient'
]);
const LEGACY_HAIR_LENGTH = {
  hair_long: 'hair_long',
  hair_short: 'hair_short',
  hair_mid: 'hair_medium',
  hair_bob: 'hair_bob'
};
const LEGACY_HAIR_STYLE = new Set([
  'hair_twintail', 'hair_ponytail', 'hair_braid', 'hair_bun', 'hair_curl'
]);
const LEGACY_EYE_COLOR = new Set([
  'eye_red', 'eye_blue', 'eye_green', 'eye_purple', 'eye_gold',
  'eye_brown', 'eye_black', 'eye_heterochromia'
]);
const LEGACY_EYE_SHAPE = new Set(['eye_sharp', 'eye_gentle', 'eye_empty', 'eye_round']);
const LEGACY_BODY = new Set([
  'body_petite', 'body_slim', 'body_average', 'body_muscular', 'body_broad',
  'body_busty', 'body_tall', 'body_chubby', 'body_loli_height'
]);
const LEGACY_SKIN = new Set(['skin_pale', 'skin_normal', 'skin_tanned', 'skin_ghostly']);

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, max = 300) {
  return String(value || '')
    .replace(/\r/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function addTag(out, dim, id, level) {
  if (!id) return;
  out[dim] = out[dim] || [];
  if (out[dim].some(x => x.id === id)) return;
  const item = { id };
  if (dim === 'personality' && level !== undefined) item.level = level;
  out[dim].push(item);
}

function legacyToV2(tags) {
  const out = {};
  if (!tags) return out;
  for (const [dim, entries] of Object.entries(tags)) {
    for (const entry of entries || []) {
      const id = typeof entry === 'string' ? entry : entry && entry.id;
      const level = entry && typeof entry === 'object' ? entry.level : undefined;
      if (!id) continue;
      if (dim === 'hair') {
        if (LEGACY_HAIR_COLOR.has(id)) addTag(out, 'hair_color', id);
        else if (id === 'hair_hime_cut') addTag(out, 'hair_style', 'hair_hime');
        else if (LEGACY_HAIR_LENGTH[id]) addTag(out, 'hair_length', LEGACY_HAIR_LENGTH[id]);
        else if (LEGACY_HAIR_STYLE.has(id)) addTag(out, 'hair_style', id);
        else if (id === 'hair_gradient') addTag(out, 'hair_color', 'hair_gradient');
      } else if (dim === 'eye') {
        if (LEGACY_EYE_COLOR.has(id)) addTag(out, 'eye_color', id);
        else if (LEGACY_EYE_SHAPE.has(id)) addTag(out, 'eye_shape', id);
      } else if (dim === 'body') {
        if (LEGACY_SKIN.has(id)) addTag(out, 'skin', id);
        else if (LEGACY_BODY.has(id)) addTag(out, 'body_type', id);
      } else {
        addTag(out, dim, id, level);
      }
    }
  }
  return out;
}

function buildTaxonomy(raw) {
  const byDim = {};
  const nameById = {};
  for (const dim of raw.dimensions) {
    byDim[dim.id] = {
      dim,
      ids: new Set(dim.tags.map(t => t.id)),
      names: new Map(dim.tags.map(t => [t.id, t.name]))
    };
    nameById[dim.id] = Object.fromEntries(dim.tags.map(t => [t.id, t.name]));
  }
  return { raw, byDim, nameById };
}

function normalizeTags(tags, tax) {
  const out = {};
  for (const dim of tax.raw.dimensions) {
    const entries = tags[dim.id];
    if (!Array.isArray(entries)) continue;
    const info = tax.byDim[dim.id];
    const seen = new Set();
    const cleaned = [];
    for (const entry of entries) {
      const id = typeof entry === 'string' ? entry : entry && entry.id;
      if (!id || !info.ids.has(id) || seen.has(id)) continue;
      seen.add(id);
      const item = { id };
      if (dim.id === 'personality') {
        const value = entry && typeof entry === 'object' ? Number(entry.level) : NaN;
        item.level = Number.isFinite(value) ? Math.max(0, Math.min(1, Math.round(value * 100) / 100)) : 0.8;
      }
      cleaned.push(item);
    }
    if (cleaned.length) out[dim.id] = cleaned;
  }
  return out;
}

function mergeTags(llmTags, legacyTags, isNew) {
  const llm = clone(llmTags || {});
  const legacy = clone(legacyTags || {});
  if (isNew) return llm;

  const singleValueDims = new Set(['hair_color', 'hair_length', 'eye_color', 'skin', 'age_visual']);
  const out = {};
  const dims = new Set([...Object.keys(legacy), ...Object.keys(llm)]);
  for (const dim of dims) {
    const l = legacy[dim] || [];
    const m = llm[dim] || [];
    if (singleValueDims.has(dim)) {
      out[dim] = l.length ? l : m;
      continue;
    }
    const merged = clone(l);
    for (const entry of m) {
      if (!merged.some(x => x.id === entry.id)) merged.push(clone(entry));
    }
    out[dim] = merged;
  }
  return out;
}

function applySafety(tags) {
  const ages = new Set((tags.age_visual || []).map(x => x.id));
  if (ages.has('age_v_loli') || ages.has('age_v_shota') || ages.has('age_v_teen')) {
    if (tags.body_type) {
      tags.body_type = tags.body_type.filter(x => x.id !== 'body_busty');
      if (!tags.body_type.length) delete tags.body_type;
    }
    if (tags.wardrobe) {
      tags.wardrobe = tags.wardrobe.filter(x => x.id !== 'cloth_sexy');
      if (!tags.wardrobe.length) delete tags.wardrobe;
    }
  }
  return tags;
}

function applyOverrides(tags, override, tax) {
  if (!override) return tags;
  for (const [dim, ids] of Object.entries(override.remove || {})) {
    if (!tags[dim]) continue;
    const removeIds = new Set(ids);
    tags[dim] = tags[dim].filter(x => !removeIds.has(x.id));
    if (!tags[dim].length) delete tags[dim];
  }
  for (const [dim, ids] of Object.entries(override.add || {})) {
    if (!tax.byDim[dim]) continue;
    tags[dim] = tags[dim] || [];
    for (const value of ids) {
      const id = typeof value === 'string' ? value : value && value.id;
      if (!id || !tax.byDim[dim].ids.has(id)) continue;
      if (!tags[dim].some(x => x.id === id)) {
        tags[dim].push({ id });
      }
    }
  }
  return tags;
}

function orderedTags(tags, tax) {
  const out = {};
  for (const dim of tax.raw.dimensions) {
    if (tags[dim.id] && tags[dim.id].length) out[dim.id] = tags[dim.id];
  }
  return out;
}

function countTags(tags) {
  return Object.values(tags).reduce((sum, entries) => sum + entries.length, 0);
}

function tagNames(tags, dim, tax, limit) {
  return (tags[dim] || [])
    .map(x => tax.nameById[dim] && tax.nameById[dim][x.id])
    .filter(Boolean)
    .slice(0, limit);
}

function generateDescription(char, tags, tax) {
  const name = char.name || char.name_romaji || '';
  const source = char.source_anime ? `出自《${char.source_anime}》` : '出处暂缺';
  const roles = tagNames(tags, 'role', tax, 3);
  const personalities = tagNames(tags, 'personality', tax, 3);
  const hair = [
    ...tagNames(tags, 'hair_color', tax, 1),
    ...tagNames(tags, 'hair_length', tax, 1)
  ];
  const eyes = tagNames(tags, 'eye_color', tax, 1);
  const special = tagNames(tags, 'special', tax, 2);
  const parts = [];
  if (roles.length) parts.push(`身份是${roles.join('、')}。`);
  if (personalities.length) parts.push(`性格偏向${personalities.join('、')}。`);
  if (hair.length || eyes.length || special.length) {
    parts.push(`外观特征：${[...hair, ...eyes, ...special].join('、')}。`);
  }
  if (!parts.length) {
    return { text: cleanText(char.description_en || '资料暂缺。', 300), source: 'anilist_en' };
  }
  return { text: cleanText(`${name}，${source}。${parts.join('')}`, 300), source: 'generated' };
}

function descriptionFor(char, tags, tax, bangumi) {
  if (!char.is_new && char.legacy_description) {
    return { text: cleanText(char.legacy_description, 300), source: 'legacy' };
  }
  const b = bangumi[String(char.id)];
  if (b && b.matched && b.summary_lang === 'zh' && b.summary_cn && b.summary_cn.length >= 20) {
    return { text: cleanText(b.summary_cn, 300), source: 'bangumi_zh' };
  }
  return generateDescription(char, tags, tax);
}

function translateSource(title, sourceMap) {
  if (!title) return '';
  if (sourceMap[title]) return sourceMap[title];
  const candidates = [
    title.replace(/\s+(Season\s*\d+|\d+(st|nd|rd|th)\s+Season|Final\s+Season|Part\s*\d+|\d+)$/i, '').trim(),
    title.replace(/\s*\((\d{4})\)\s*$/, '').trim(),
    title.replace(/\s*:\s*.*$/, '').trim()
  ];
  for (const candidate of candidates) {
    if (candidate && sourceMap[candidate]) return sourceMap[candidate];
  }
  return title;
}

function nameFor(char, bangumi, nameOverrides) {
  const manual = nameOverrides[String(char.id)];
  if (manual) return manual;
  if (!char.is_new) return char.name || char.name_romaji || char.name_native;
  const b = bangumi[String(char.id)];
  return (b && b.name_cn) || char.name_romaji || char.name_native || char.name || '';
}

function buildEntry(char, tax, llmCache, bangumi, overrides, nameOverrides, sourceMap) {
  const llmEntry = llmCache[String(char.id)];
  const llmTags = llmEntry && llmEntry.tags ? llmEntry.tags : {};
  const legacyTags = legacyToV2(char.legacy_tags);
  let tags = mergeTags(llmTags, legacyTags, !!char.is_new);
  const override = overrides[String(char.id)] || null;
  if (override) tags = applyOverrides(tags, override, tax);
  tags = applySafety(tags);
  tags = normalizeTags(tags, tax);
  tags = orderedTags(tags, tax);

  const name = nameFor(char, bangumi, nameOverrides);
  const sourceAnime = translateSource(char.source_anime || '', sourceMap);
  const description = descriptionFor({ ...char, name, source_anime: sourceAnime }, tags, tax, bangumi);
  const b = bangumi[String(char.id)];
  const tagCount = countTags(tags);
  const sourceFlags = [];
  if (char.source === 'touhou') sourceFlags.push('manual');
  else if (!char.is_new) sourceFlags.push('legacy');
  if (Object.keys(llmTags).length) sourceFlags.push('llm');
  if (override) sourceFlags.push('manual');
  if (!sourceFlags.length) sourceFlags.push('unknown');

  const needsReview = !!char.is_new && !override && (
    tagCount < 12 ||
    description.source === 'generated' ||
    !b || !b.matched
  );

  return {
    id: char.id,
    name,
    name_native: char.name_native || '',
    name_romaji: char.name_romaji || char.name || '',
    name_bangumi: b && b.bangumi_name ? b.bangumi_name : '',
    bangumi_id: b && b.matched ? b.bangumi_id : null,
    gender: char.gender,
    pool: char.pool,
    source: char.source,
    source_anime: sourceAnime,
    source_type: char.source_type || '',
    source_genres: char.source_genres || [],
    source_tags: char.source_tags || [],
    favourites: char.favourites || 0,
    age: char.age || null,
    image: char.image || '',
    description: description.text,
    description_source: description.source,
    is_new: !!char.is_new,
    tags,
    tag_meta: {
      source: sourceFlags.join('+'),
      confidence: override ? 0.9 : char.source === 'touhou' ? 1.0 : char.is_new ? 0.75 : 0.9,
      reviewed: !!(override || char.source === 'touhou' || !char.is_new),
      needs_review: needsReview,
      tag_count: tagCount
    }
  };
}

function stripForJs(entry) {
  return {
    id: entry.id,
    name: entry.name,
    name_native: entry.name_native,
    name_romaji: entry.name_romaji,
    image: entry.image,
    description: cleanText(entry.description, 220),
    source_anime: entry.source_anime,
    source_type: entry.source_type,
    favourites: entry.favourites,
    gender: entry.gender,
    pool: entry.pool,
    tags: entry.tags,
    tag_meta: entry.tag_meta
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeJs(file, globalName, entries) {
  const compact = entries.map(stripForJs);
  fs.writeFileSync(file, `window.${globalName} = ${JSON.stringify(compact)};\n`, 'utf8');
}

function summarize(entries, label) {
  const counts = entries.map(e => e.tag_meta.tag_count);
  const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  const missingName = entries.filter(e => !e.name).length;
  const missingDesc = entries.filter(e => !e.description).length;
  const needsReview = entries.filter(e => e.tag_meta.needs_review).length;
  console.log(`  ${label}: ${entries.length} chars, avg ${avg.toFixed(2)} tags, min ${Math.min(...counts)}, max ${Math.max(...counts)}, missingName ${missingName}, missingDesc ${missingDesc}, needsReview ${needsReview}`);
}

function main() {
  const selected = readJson(SELECTED_FILE);
  const bangumi = readJson(BANGUMI_FILE, {}) || {};
  const llmCache = readJson(LLM_FILE, {}) || {};
  const taxonomyRaw = readJson(TAXONOMY_FILE);
  const overridesRaw = readJson(OVERRIDES_FILE, { overrides: {} }) || { overrides: {} };
  const sourceMap = readJson(SOURCE_MAP_FILE, {}) || {};
  if (!selected || !taxonomyRaw) throw new Error('Missing selected characters or taxonomy');

  const tax = buildTaxonomy(taxonomyRaw);
  const overrides = overridesRaw.overrides || {};
  const nameOverrides = overridesRaw.names || {};
  const entries = (selected.characters || selected)
    .filter(char => !BLOCKED_SERIES.test(char.source_anime || ''))
    .map(char => buildEntry(char, tax, llmCache, bangumi, overrides, nameOverrides, sourceMap));

  const female = entries.filter(e => e.pool === 'female').sort((a, b) => b.favourites - a.favourites);
  const male = entries.filter(e => e.pool === 'male').sort((a, b) => b.favourites - a.favourites);
  const all = [...female, ...male];

  writeJson(OUT.femaleJson, female);
  writeJson(OUT.maleJson, male);
  writeJson(OUT.allJson, all);
  writeJs(OUT.femaleJs, 'WAIFU_DB', female);
  writeJs(OUT.maleJs, 'WAIFU_DB_MALE', male);
  writeJs(OUT.allJs, 'WAIFU_DB_ALL', all);

  console.log('Built v2 databases:');
  summarize(female, 'female');
  summarize(male, 'male');
  summarize(all, 'all');

  const dimTotals = {};
  for (const entry of entries) {
    for (const [dim, tags] of Object.entries(entry.tags)) {
      dimTotals[dim] = (dimTotals[dim] || 0) + tags.length;
    }
  }
  console.log('Dimension totals:', dimTotals);
  console.log('Outputs:', Object.values(OUT).map(f => path.relative(ROOT, f)).join(', '));
}

main();
