export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function formatHudCoins(value) {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (Math.abs(value) >= 1000000) return `${(value / 10000).toFixed(1)}万`;
  return formatInteger(value);
}

export function makeRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (min, max) => min + (max - min) * next();
  const int = (min, max) => Math.floor(range(min, max + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  return { next, range, int, pick };
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

export function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const numberFormatter = new Intl.NumberFormat('zh-CN');

export function formatInteger(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

export function formatMs(value) {
  const ms = Number(value) || 0;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatFps(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return '--';
  return fps.toFixed(1);
}
