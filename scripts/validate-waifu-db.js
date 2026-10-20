// =============================================
//  校验 v2 角色数据库并生成报告
//  输出: data/waifu-db-report.md
// =============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TAXONOMY_FILE = path.join(DATA, 'waifu-tags-v2.json');
const REPORT_FILE = path.join(DATA, 'waifu-db-report.md');

const FILES = {
  female: {
    json: path.join(DATA, 'waifu-db-zh.json'),
    js: path.join(DATA, 'waifu-db-zh.js'),
    global: 'WAIFU_DB',
    expected: 612
  },
  male: {
    json: path.join(DATA, 'waifu-db-male-zh.json'),
    js: path.join(DATA, 'waifu-db-male-zh.js'),
    global: 'WAIFU_DB_MALE',
    expected: 386
  },
  all: {
    json: path.join(DATA, 'waifu-db-all-zh.json'),
    js: path.join(DATA, 'waifu-db-all-zh.js'),
    global: 'WAIFU_DB_ALL',
    expected: 998
  }
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''));
}

function tagLabel(tax, dim, id) {
  const d = tax.byDim[dim];
  return d && d.names.get(id) || id;
}

function countTags(entry) {
  return Object.values(entry.tags || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
}

function validateDb(entries, label, tax, errors) {
  const seenIds = new Set();
  const tagFreq = {};
  const coverage = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: non-object entry`);
      continue;
    }
    if (seenIds.has(entry.id)) errors.push(`${label}: duplicate id ${entry.id}`);
    seenIds.add(entry.id);
    if (!entry.name) errors.push(`${label}: ${entry.id} missing name`);
    if (!entry.gender) errors.push(`${label}: ${entry.id} missing gender`);
    if (entry.pool !== label && label !== 'all') errors.push(`${label}: ${entry.id} pool=${entry.pool}`);
    if (!entry.image) errors.push(`${label}: ${entry.id} missing image`);
    if (!entry.description) errors.push(`${label}: ${entry.id} missing description`);
    if (!entry.tags || typeof entry.tags !== 'object') {
      errors.push(`${label}: ${entry.id} missing tags`);
      continue;
    }

    const total = countTags(entry);
    coverage.push(total);
    if (entry.tag_meta && entry.tag_meta.tag_count !== total) {
      errors.push(`${label}: ${entry.id} tag_count mismatch ${entry.tag_meta.tag_count} vs ${total}`);
    }

    const seenTags = new Set();
    for (const [dim, arr] of Object.entries(entry.tags)) {
      if (!tax.byDim[dim]) {
        errors.push(`${label}: ${entry.id} unknown dimension ${dim}`);
        continue;
      }
      if (!Array.isArray(arr)) {
        errors.push(`${label}: ${entry.id} dimension ${dim} is not array`);
        continue;
      }
      for (const item of arr) {
        const tagId = typeof item === 'string' ? item : item && item.id;
        if (!tagId || !tax.byDim[dim].ids.has(tagId)) {
          errors.push(`${label}: ${entry.id} unknown tag ${dim}/${tagId}`);
          continue;
        }
        if (seenTags.has(`${dim}/${tagId}`)) {
          errors.push(`${label}: ${entry.id} duplicate tag ${dim}/${tagId}`);
        }
        seenTags.add(`${dim}/${tagId}`);
        tagFreq[dim] = tagFreq[dim] || {};
        tagFreq[dim][tagId] = (tagFreq[dim][tagId] || 0) + 1;
      }
    }
  }

  coverage.sort((a, b) => a - b);
  const avg = coverage.reduce((a, b) => a + b, 0) / Math.max(1, coverage.length);
  return {
    count: entries.length,
    unique: seenIds.size,
    avg,
    min: coverage[0] || 0,
    max: coverage[coverage.length - 1] || 0,
    low: entries.filter(e => countTags(e) < 12),
    noCjkName: entries.filter(e => !hasCjk(e.name)),
    noCjkDesc: entries.filter(e => !hasCjk(e.description)),
    needsReview: entries.filter(e => e.tag_meta && e.tag_meta.needs_review),
    tagFreq,
    coverage
  };
}

function checkJs(file, globalName, expectedCount, errors) {
  if (!fs.existsSync(file)) {
    errors.push(`missing JS ${file}`);
    return;
  }
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(code, sandbox, { timeout: 5000 });
    const value = sandbox.window[globalName];
    if (!Array.isArray(value)) {
      errors.push(`${path.basename(file)}: ${globalName} is not an array`);
    } else if (value.length !== expectedCount) {
      errors.push(`${path.basename(file)}: ${globalName} length ${value.length}, expected ${expectedCount}`);
    }
  } catch (error) {
    errors.push(`${path.basename(file)}: JS parse failed: ${error.message}`);
  }
}

function formatTagList(entry, tax, dims, limit = 4) {
  const parts = [];
  for (const dim of dims) {
    const arr = (entry.tags && entry.tags[dim]) || [];
    const names = arr.map(x => tagLabel(tax, dim, x.id)).slice(0, limit);
    if (names.length) parts.push(`${dim}:${names.join('/')}`);
  }
  return parts.join('; ');
}

function main() {
  const taxonomy = readJson(TAXONOMY_FILE);
  const tax = { raw: taxonomy, byDim: {} };
  for (const dim of taxonomy.dimensions) {
    tax.byDim[dim.id] = {
      dim,
      ids: new Set(dim.tags.map(t => t.id)),
      names: new Map(dim.tags.map(t => [t.id, t.name]))
    };
  }

  const errors = [];
  const results = {};
  for (const [label, info] of Object.entries(FILES)) {
    const entries = readJson(info.json);
    results[label] = validateDb(entries, label, tax, errors);
    checkJs(info.js, info.global, info.expected, errors);
    if (entries.length !== info.expected) {
      errors.push(`${label}: count ${entries.length}, expected ${info.expected}`);
    }
  }

  const allEntries = [
    ...readJson(FILES.female.json),
    ...readJson(FILES.male.json)
  ];
  const idSet = new Set(allEntries.map(e => e.id));
  if (idSet.size !== allEntries.length) {
    errors.push(`duplicate ids across female+male: ${allEntries.length - idSet.size}`);
  }

  const totalTags = allEntries.reduce((sum, e) => sum + countTags(e), 0);
  const topPersonality = Object.entries(results.all.tagFreq.personality || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const lines = [];
  lines.push('# 二次元角色数据库 v2 校验报告');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 库 | 人数 | 唯一 ID | 平均标签 | 最少 | 最多 | 需复核 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const [label, r] of Object.entries(results)) {
    lines.push(`| ${label} | ${r.count} | ${r.unique} | ${r.avg.toFixed(2)} | ${r.min} | ${r.max} | ${r.needsReview.length} |`);
  }
  lines.push('');
  lines.push(`全部角色标签总数：${totalTags}`);
  lines.push(`交叉重复 ID：${allEntries.length - idSet.size}`);
  lines.push(`校验错误：${errors.length}`);
  lines.push('');

  if (errors.length) {
    lines.push('## 错误');
    lines.push('');
    for (const error of errors.slice(0, 100)) lines.push(`- ${error}`);
    if (errors.length > 100) lines.push(`- ... 还有 ${errors.length - 100} 条`);
    lines.push('');
  }

  lines.push('## 标签覆盖');
  lines.push('');
  for (const [label, r] of Object.entries(results)) {
    lines.push(`### ${label}`);
    lines.push('');
    lines.push(`- 平均 ${r.avg.toFixed(2)} 个标签，最少 ${r.min}，最多 ${r.max}`);
    lines.push(`- 少于 12 个标签：${r.low.length} 人`);
    lines.push(`- 无中文名：${r.noCjkName.length} 人`);
    lines.push(`- 无中文简介：${r.noCjkDesc.length} 人`);
    lines.push(`- 需复核：${r.needsReview.length} 人`);
    lines.push('');
  }

  lines.push('## 性格标签 Top 20');
  lines.push('');
  lines.push('| 标签 | 人数 |');
  lines.push('|---|---:|');
  for (const [id, count] of topPersonality) {
    lines.push(`| ${id} ${tagLabel(tax, 'personality', id)} | ${count} |`);
  }
  lines.push('');

  lines.push('## 低标签角色（少于 12 个）');
  lines.push('');
  const low = allEntries
    .filter(e => countTags(e) < 12)
    .sort((a, b) => countTags(a) - countTags(b))
    .slice(0, 30);
  if (!low.length) {
    lines.push('无。');
  } else {
    lines.push('| 角色 | 人数 | 标签 |');
    lines.push('|---|---:|---|');
    for (const entry of low) {
      lines.push(`| ${entry.name} (${entry.id}) | ${countTags(entry)} | ${formatTagList(entry, tax, ['personality', 'role', 'hair_color', 'eye_color'])} |`);
    }
  }
  lines.push('');

  lines.push('## 待复核角色（前 30）');
  lines.push('');
  const review = allEntries
    .filter(e => e.tag_meta && e.tag_meta.needs_review)
    .sort((a, b) => countTags(a) - countTags(b))
    .slice(0, 30);
  if (!review.length) {
    lines.push('无。');
  } else {
    lines.push('| 角色 | 标签数 | 简介来源 | Bangumi |');
    lines.push('|---|---:|---|---|');
    for (const entry of review) {
      lines.push(`| ${entry.name} (${entry.id}) | ${entry.tag_meta.tag_count} | ${entry.description_source} | ${entry.bangumi_id || '-'} |`);
    }
  }
  lines.push('');

  lines.push('## 样本');
  lines.push('');
  for (const [label, pool] of [['female', 'female'], ['male', 'male']]) {
    lines.push(`### ${label} Top 10`);
    lines.push('');
    const entries = readJson(FILES[label].json).slice(0, 10);
    lines.push('| 角色 | 标签数 | 主要标签 |');
    lines.push('|---|---:|---|');
    for (const entry of entries) {
      lines.push(`| ${entry.name} (${entry.id}) | ${entry.tag_meta.tag_count} | ${formatTagList(entry, tax, ['personality', 'role', 'hair_color', 'eye_color', 'special'])} |`);
    }
    lines.push('');
  }

  fs.writeFileSync(REPORT_FILE, lines.join('\n'), 'utf8');
  console.log(`Validation complete. errors=${errors.length}`);
  for (const [label, r] of Object.entries(results)) {
    console.log(`${label}: ${r.count} chars, avg ${r.avg.toFixed(2)}, min ${r.min}, low ${r.low.length}, review ${r.needsReview.length}, noCjkName ${r.noCjkName.length}, noCjkDesc ${r.noCjkDesc.length}`);
  }
  if (errors.length) {
    console.log('First errors:');
    for (const error of errors.slice(0, 20)) console.log(' -', error);
  }
  console.log('Report:', path.relative(ROOT, REPORT_FILE));
}

main();
