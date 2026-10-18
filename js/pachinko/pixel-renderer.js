import { Renderer } from './renderer.js';

const P = { ink: '#17182c', dark: '#24223c', purple: '#554273', light: '#a891cf', gold: '#f5cf7d', cream: '#fff0c1', mint: '#86d7bb', pink: '#e79bab' };
const FONT = '"Courier New","Microsoft YaHei",monospace';

// All art is drawn on a square pixel grid. Physics keeps its original coordinates.
function box(ctx, x, y, w, h, fill, edge = P.light) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = P.ink; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = edge; ctx.fillRect(x + 4, y, w - 8, h); ctx.fillRect(x, y + 4, w, h - 8);
  ctx.fillStyle = fill; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = '#ffffff18'; ctx.fillRect(x + 8, y + 4, w - 16, 4);
  ctx.fillStyle = '#00000038'; ctx.fillRect(x + 8, y + h - 8, w - 16, 4);
}
function star(ctx, x, y, color = P.gold, size = 3) {
  ctx.fillStyle = color;
  ctx.fillRect(x - size, y - size * 3, size * 2, size * 6);
  ctx.fillRect(x - size * 3, y - size, size * 6, size * 2);
}
function sprite(ctx, rows, x, y, scale, colors) {
  rows.forEach((row, j) => [...row].forEach((cell, i) => {
    if (colors[cell]) { ctx.fillStyle = colors[cell]; ctx.fillRect(x + i * scale, y + j * scale, scale, scale); }
  }));
}


export class PixelRenderer extends Renderer {
  createMarbleSprite(palette) {
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12;
    const ctx = canvas.getContext('2d');
    sprite(ctx, ['............','....eeee....','..eemmmmee..','..emccc mme..'.replace(' ', ''),'.emccmmmmme.','.emcmmmmmme.','.emmmmmmmme.','.emmmmddmme.','..emddddme..','..eemmmmee..','....eeee....','............'], 0, 0, 1,
      { e: P.ink, m: palette.mid, c: palette.core, d: palette.edge });
    return canvas;
  }

  buildStaticLayer() {
    const ctx = this.staticCtx; const l = this.layout;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, 600, 820);
    box(ctx, 8, 8, 584, 804, P.purple, P.light);
    box(ctx, 20, 20, 560, 780, P.dark, P.gold);
    for (const x of [34, 556]) {
      for (let y = 110; y < 700; y += 28) { ctx.fillStyle = y % 56 === 26 ? P.gold : P.light; ctx.fillRect(x, y, 10, 10); }
    }
    box(ctx, 160, 22, 280, 62, P.purple, P.gold);
    ctx.textAlign = 'center'; ctx.fillStyle = P.cream; ctx.font = `bold 14px ${FONT}`;
    ctx.fillText('霧 雨 魔 法 工 坊', 300, 43);
    box(ctx, 220, 48, 160, 28, P.ink, P.light);
    star(ctx, 88, 52, P.gold, 4); star(ctx, 512, 52, P.mint, 4);
    box(ctx, 94, 94, 412, 618, P.ink, P.light);
    ctx.save();
    ctx.beginPath(); l.playfieldPolygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#20243c'; ctx.fillRect(104, 110, 392, 590);
    for (let y = 112; y < 700; y += 16) for (let x = 104; x < 496; x += 16) {
      ctx.fillStyle = ((x + y) / 16) % 2 === 0 ? '#29283f' : '#25263d'; ctx.fillRect(x, y, 16, 16);
    }
    for (let i = 0; i < 26; i++) { ctx.fillStyle = '#84769f45'; ctx.fillRect(112 + (i * 73) % 376, 200 + (i * 89) % 365, 3, 3); }
    // Stepped moon behind the pins, deliberately low contrast.
    sprite(ctx, ['..mmmm..','.mmmmmm.','mmmmmm..','mmmmm...','mmmmm...','mmmmmm..','.mmmmmm.','..mmmm..'], 246, 320, 12, { m: '#39334e' });
    ctx.restore();
    for (const side of [l.sideCabinetLeft, l.sideCabinetRight]) {
      box(ctx, side.x + 4, side.y + 8, side.width - 8, side.height - 14, P.purple, '#6f5990');
      star(ctx, side.x + side.width / 2, 188, P.gold, 4);
      box(ctx, side.x + 13, 326, 48, 110, P.ink, P.light);
      ctx.save(); ctx.translate(side.x + 37, 381); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = P.gold; ctx.font = `bold 14px ${FONT}`; ctx.fillText('BONUS', 0, 0); ctx.restore();
      for (let k = 0; k < 3; k++) { ctx.fillStyle = k === 1 ? P.mint : P.gold; ctx.fillRect(side.x + 23 + k * 8, 460, 4, 12 + k * 4); }
      ctx.fillStyle = P.ink; ctx.fillRect(side.x + 16, 510, 42, 72);
      for (let j = 0; j < 5; j++) { ctx.fillStyle = P.light; ctx.fillRect(side.x + 22, 518 + j * 12, 30, 4); }
      ctx.fillStyle = P.gold; ctx.font = `bold 9px ${FONT}`; ctx.fillText('MAGIC', side.x + 37, 640);
      ctx.fillStyle = P.light; ctx.fillText('ARCADE', side.x + 37, 656);
    }
    // Draw the real guide paths; the pixel strokes follow the collision rails.
    for (const guide of l.guides) {
      const body = guide.body || guide;
      if (body.vertices) {
        const rail = body.plugin?.pachinko;
        ctx.beginPath(); body.vertices.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = P.light; ctx.fill();
        if (rail?.kind === 'side-return' && rail.elasticity > 0) {
          ctx.fillStyle = P.gold;
          for (let i = 1; i < 5; i++) ctx.fillRect(Math.round(guide.x1 + (guide.x2 - guide.x1) * i / 5) - 2, Math.round(guide.y1 + (guide.y2 - guide.y1) * i / 5) - 2, 4, 4);
        }
      }
    }
    const paths = this.config.board.topGuidePaths;
    for (const points of [paths.left, paths.right]) {
      for (let j = 1; j < points.length; j++) {
        const [ax, ay] = points[j - 1], [bx, by] = points[j]; const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
        for (let i = 0; i <= steps; i++) { ctx.fillStyle = P.light; ctx.fillRect(Math.round((ax + (bx - ax) * i / steps) / 4) * 4, Math.round((ay + (by - ay) * i / steps) / 4) * 4, 4, 4); }
      }
    }
    for (const peg of l.pegs) {
      const x = Math.round(peg.x), y = Math.round(peg.y), r = peg.radius || 7;
      if (peg.special) { box(ctx, x - 9, y - 9, 18, 18, '#275659', P.mint); }
      else if (peg.rare) { box(ctx, x - r - 3, y - r - 3, (r + 3) * 2, (r + 3) * 2, P.purple, P.pink); }
      else { ctx.fillStyle = '#111424'; ctx.fillRect(x - 6, y - 4, 14, 14); }
      if (peg.marked) box(ctx, x - 8, y - 8, 16, 16, '#674d3d', P.gold);
      ctx.fillStyle = peg.special ? P.mint : peg.rare ? P.pink : peg.marked ? P.gold : '#777d9b'; ctx.fillRect(x - 5, y - 5, 10, 10);
      if (peg.special) star(ctx, x, y, P.cream, 1);
      ctx.fillStyle = peg.rare || peg.marked ? P.cream : '#b1b6ca'; ctx.fillRect(x - 5, y - 5, 4, 4);
      ctx.fillStyle = peg.rare ? '#a35682' : peg.marked ? '#a57c4d' : '#505673'; ctx.fillRect(x + 1, y + 3, 4, 2);
    }
    for (const b of l.bumpers) { box(ctx, b.x - 13, b.y - 13, 26, 26, P.mint, '#e2f3c8'); ctx.fillStyle = P.ink; ctx.fillRect(b.x - 4, b.y - 4, 8, 8); }
    star(ctx, 300, 166, P.gold, 3);
    box(ctx, 284, 104, 32, 34, P.dark, P.gold);
    ctx.fillStyle = P.mint; ctx.fillRect(294, 114, 12, 12);
    for (let i = 0; i < l.slots.length; i++) {
      const slot = l.slots[i], jackpot = slot.jackpot, winning = slot.value > 0;
      const bonus = slot.value - slot.baseValue;
      box(ctx, slot.left + 2, 606, slot.width - 4, 88, jackpot ? '#796145' : winning ? P.purple : '#1b2034', jackpot || bonus > 0 ? P.gold : winning ? '#8873a3' : '#50556b');
      ctx.fillStyle = jackpot ? P.cream : winning ? '#ddd0ee' : '#78809a'; ctx.font = `bold 10px ${FONT}`;
      ctx.fillText(jackpot ? '★' : slot.name, slot.centerX ?? (slot.left + slot.width / 2), 635);
      ctx.font = `bold ${jackpot ? 18 : 13}px ${FONT}`;
      ctx.fillText(winning ? `+${slot.value}` : '×', slot.centerX ?? (slot.left + slot.width / 2), 660);
      if (bonus > 0) {
        ctx.fillStyle = P.mint; ctx.font = `bold 9px ${FONT}`;
        ctx.fillText(`↑${bonus}`, slot.x, 681);
      }
    }
    box(ctx, 94, 716, 412, 76, P.purple, P.gold);
    ctx.fillStyle = P.cream; ctx.font = `bold 11px ${FONT}`; ctx.fillText('★  MAGIC BONUS  ★', 300, 740);
    ctx.fillStyle = P.ink; ctx.fillRect(246, 750, 108, 24);
    ctx.fillStyle = P.gold; ctx.fillRect(260, 758, 80, 6);
    ctx.font = `bold 8px ${FONT}`; ctx.fillText('COIN SLOT', 300, 784);
    for (let i = 0; i < 13; i++) { if (i >= 4 && i <= 8) continue; ctx.fillStyle = i % 3 ? P.gold : P.mint; ctx.fillRect(144 + i * 24, 758, 12, 12); ctx.fillStyle = P.cream; ctx.fillRect(144 + i * 24, 758, 4, 4); }
    for (const x of [32, 568]) for (const y of [34, 786]) { ctx.fillStyle = P.light; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.fillStyle = P.ink; ctx.fillRect(x - 2, y - 1, 4, 2); }
  }

  drawTopLed(ctx, sim) {
    const feed = sim.getFeedSnapshot();
    ctx.fillStyle = P.mint; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(feed.total ? `${feed.fed} / ${feed.total}  BALLS` : 'INSERT MAGIC', 300, 67);
  }
  drawGateFlash(ctx, now) { if (now - this.gateFlashAt < 160) star(ctx, 300, 122, P.cream, 3); }
  drawPegFlashes(ctx, now) {
    this.layout.pegs.forEach((p, i) => { if (now - this.pegFlash[i] < 150) star(ctx, p.x, p.y, P.cream, 3); });
  }
  drawBumperFlashes(ctx, now) {
    this.layout.bumpers.forEach((p, i) => { if (now - this.bumperFlash[i] < 180) star(ctx, p.x, p.y, P.mint, 5); });
  }
  drawSlotFlashes(ctx, now) {
    this.layout.slots.forEach((s, i) => { if (s.value > 0 && now - this.slotFlash[i] < 240) { ctx.fillStyle = '#fff0c144'; ctx.fillRect(s.left + 4, 612, s.width - 8, 78); } });
  }
  drawMarbles(ctx, sim) {
    ctx.imageSmoothingEnabled = false;
    this.trails ||= new Map();
    const active = new Set();
    for (const record of sim.getMarbles()) {
      if (!record.body) continue;
      const p = record.body.position;
      active.add(record.id);
      const trail = this.trails.get(record.id) || [];
      if (!this.reducedEffects) trail.forEach((point, i) => { ctx.fillStyle = `rgba(134,215,187,${(i + 1) * .07})`; ctx.fillRect(point.x - 2, point.y - 2, 4, 4); });
      trail.push({ x: Math.round(p.x / 2) * 2, y: Math.round(p.y / 2) * 2 });
      if (trail.length > 5) trail.shift();
      this.trails.set(record.id, trail);
      ctx.drawImage(this.sprites[record.index % 3], Math.round(p.x) - 9, Math.round(p.y) - 9, 18, 18);
      if (record.railEnergy > 0 || record.elasticKicks > 0) {
        ctx.fillStyle = P.mint; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`${record.elasticKicks ? `弹${Math.max(0, 6 - record.elasticKicks)} ` : ''}◆${record.railEnergy || 0}`, Math.max(140, Math.min(460, p.x)), p.y - 14);
      }
    }
    for (const id of this.trails.keys()) if (!active.has(id)) this.trails.delete(id);
  }

  addPegFx(x, y, value, rare, special) {
    if (value > 0) this.addIncome(x, y - 14, value, special ? P.mint : rare ? P.pink : P.gold, 18, 'peg');
    this.sparkHitCount = (this.sparkHitCount || 0) + 1;
    if (rare || special || (this.sparkHitCount % 5 === 0)) this.burst(x, y, special ? P.mint : rare ? P.pink : P.gold, rare || special ? 5 : 2);
  }
  addRailFx(event) {
    if (!event.boosted && !event.energy) return;
    if (this.floats.length >= this.maxFloating) this.floats.shift();
    this.floats.push({ x: event.x, y: event.y - 15, text: `${event.boosted ? `强弹余${event.elasticRemaining}` : '蓄能'} ◆${event.energy}`, color: event.boosted ? P.gold : P.mint, size: 16, kind: 'rail', born: performance.now(), life: 950 });
    this.burst(event.x, event.y, P.mint, 5);
  }
  addSettleFx(x, y, value, slotId, energyPayout = 0) {
    if (this.layout.slots[slotId]?.value <= 0) return;
    this.flashSlot(slotId);
    if (value > 0) this.addIncome(x, y - 22, value, P.cream, 22, 'slot');
    if (energyPayout > 0) {
      if (this.floats.length >= this.maxFloating) this.floats.shift();
      this.floats.push({ x, y: y - 47, text: `动能 +${energyPayout}（已含）`, color: P.mint, size: 15, kind: 'energy', born: performance.now(), life: 1400 });
    }
    const jackpot = this.layout.slots[slotId]?.jackpot;
    this.burst(x, y, jackpot ? P.gold : P.mint, jackpot ? 14 : 4);
    if (jackpot) this.jackpotAt = performance.now();
  }
  addIncome(x, y, value, color, size, kind) {
    const born = performance.now();
    const previous = this.floats.find(item => item.kind === kind && Math.abs(item.x - x) < 8 && born - item.born < 100);
    if (previous) { previous.value += value; previous.text = `+${previous.value} 币`; previous.born = born; }
    else {
      if (this.floats.length >= this.maxFloating) this.floats.shift();
      this.floats.push({ x, y, value, text: `+${value} 币`, color, size, kind, life: kind === 'slot' ? 1200 : 850, born });
    }
    if (born - (this.lastShakeAt || 0) > 100) { this.lastShakeAt = born; this.shakeUntil = born + (kind === 'slot' ? 130 : 70); }
  }
  drawFloats(ctx, now) {
    const calm = this.reducedEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.floats = this.floats.filter(item => now - item.born < item.life);
    for (const item of this.floats) {
      const t = Math.max(0, (now - item.born) / item.life);
      ctx.save(); ctx.font = `bold ${item.size}px ${FONT}`; ctx.textAlign = 'center';
      const w = ctx.measureText(item.text).width + 10;
      const x = Math.max(this.layout.playLeft + w / 2, Math.min(this.layout.playRight - w / 2, item.x));
      const y = item.y - (calm ? 0 : t * 36);
      ctx.globalAlpha = t > .7 ? (1 - t) / .3 : 1;
      ctx.fillStyle = '#17182ce8'; ctx.fillRect(x - w / 2, y - item.size, w, item.size + 6);
      ctx.fillStyle = item.color; ctx.fillText(item.text, x, y); ctx.restore();
    }
  }
  burst(x, y, color, count) {
    if (this.reducedEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.sparks ||= [];
    const born = performance.now();
    for (let i = 0; i < count && this.sparks.length < 100; i++) {
      const angle = Math.PI * 2 * i / count;
      this.sparks.push({ x, y, vx: Math.cos(angle) * 34, vy: Math.sin(angle) * 34 - 20, color, born });
    }
  }
  draw(sim, now, options = {}) {
    super.draw(sim, now, options);
    const ctx = this.ctx;
    if (options.paused) { this.fxPausedAt ||= now; this.canvas.style.transform = ''; return; }
    if (this.fxPausedAt) {
      const elapsed = now - this.fxPausedAt;
      (this.sparks || []).forEach((spark) => spark.born += elapsed);
      this.fxPausedAt = null;
    }
    const calm = this.reducedEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canvas.style.transform = !calm && !options.paused && now < (this.shakeUntil || 0) ? `translateX(${Math.sin(now * .12) * 1.5}px)` : '';
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = !calm && (i + Math.floor(now / 220)) % 5 === 0 ? P.cream : (i % 2 ? P.purple : '#77608f');
      ctx.fillRect(i < 10 ? 34 : 556, 110 + (i % 10) * 56, 10, 10);
    }
    if (!calm && now - (this.jackpotAt || -1e9) < 650) {
      ctx.fillStyle = P.gold; ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('★ JACKPOT ★', 300, 182);
    }
    this.sparks = (this.sparks || []).filter((spark) => now - spark.born < 450);
    for (const spark of this.sparks) {
      const t = (now - spark.born) / 1000;
      ctx.fillStyle = spark.color;
      ctx.fillRect(Math.round((spark.x + spark.vx * t) / 4) * 4, Math.round((spark.y + spark.vy * t + 55 * t * t) / 4) * 4, 4, 4);
    }
  }
  clearEffects() {
    super.clearEffects(); this.sparks = []; this.trails = new Map(); this.jackpotAt = -1e9; this.shakeUntil = 0; this.canvas.style.transform = '';
  }
}
