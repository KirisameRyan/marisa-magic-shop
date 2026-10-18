import { makeRng, roundRectPath } from './utils.js';

const FONT_SANS = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
const FONT_MONO = '"Cascadia Mono","SFMono-Regular",Consolas,monospace';

const PALETTES = [
  { core: '#fff7dd', mid: '#f0c060', edge: '#8a5c20', glow: 'rgba(240,192,96,' },
  { core: '#f4ecff', mid: '#b89fff', edge: '#5b3f8a', glow: 'rgba(184,159,255,' },
  { core: '#e9fbff', mid: '#8fd8ff', edge: '#2d5b78', glow: 'rgba(143,216,255,' }
];

function tracePath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.closePath();
}

function tracePolyline(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
}

export class Renderer {
  constructor(canvas, board, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.board = board;
    this.layout = board.layout;
    this.config = config;
    this.width = config.canvas.width;
    this.height = config.canvas.height;
    this.dpr = 0;
    this.staticCanvas = document.createElement('canvas');
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.sprites = PALETTES.map((palette) => this.createMarbleSprite(palette));
    this.reducedEffects = false;
    this.debug = false;
    this.pegFlash = new Float64Array(this.layout.pegs.length).fill(-1e9);
    this.bumperFlash = new Float64Array(this.layout.bumpers.length).fill(-1e9);
    this.slotFlash = new Float64Array(this.layout.slots.length).fill(-1e9);
    this.floats = [];
    this.gateFlashAt = -1e9;
    this.pegFloatCounter = 0;
    this.maxFloating = config.ui.maxFloating;
    this.resize();
  }

  createMarbleSprite(palette) {
    const size = 64;
    const center = size / 2;
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const ctx = sprite.getContext('2d');
    const glow = ctx.createRadialGradient(center, center, 2, center, center, center);
    glow.addColorStop(0, `${palette.glow}0.42)`);
    glow.addColorStop(0.55, `${palette.glow}0.16)`);
    glow.addColorStop(1, `${palette.glow}0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();

    const ball = ctx.createRadialGradient(center - 6, center - 7, 1, center, center, 19);
    ball.addColorStop(0, palette.core);
    ball.addColorStop(0.38, palette.mid);
    ball.addColorStop(1, palette.edge);
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(center, center, 19, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(center, center, 16.5, Math.PI * 1.05, Math.PI * 1.62);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(center - 7, center - 8, 2.6, 0, Math.PI * 2);
    ctx.fill();
    return sprite;
  }

  setBoard(board) {
    this.board = board;
    this.layout = board.layout;
    this.pegFlash = new Float64Array(this.layout.pegs.length).fill(-1e9);
    this.bumperFlash = new Float64Array(this.layout.bumpers.length).fill(-1e9);
    this.slotFlash = new Float64Array(this.layout.slots.length).fill(-1e9);
    this.floats.length = 0;
    this.buildStaticLayer();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.canvas.maxDpr);
    if (dpr === this.dpr && this.canvas.width === Math.round(this.width * dpr)) return;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.aspectRatio = `${this.width} / ${this.height}`;
    this.staticCanvas.width = this.canvas.width;
    this.staticCanvas.height = this.canvas.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buildStaticLayer();
  }

  buildStaticLayer() {
    const ctx = this.staticCtx;
    const width = this.width;
    const height = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this.drawBackdrop(ctx);
    this.drawOuterCabinet(ctx);
    this.drawSideCabinets(ctx);
    this.drawTopMarquee(ctx);
    this.drawField(ctx);
    this.drawSlotBank(ctx);
    this.drawGuides(ctx);
    this.drawPegs(ctx);
    this.drawBumpers(ctx);
    this.drawFeed(ctx);
    this.drawInnerFrame(ctx);
    this.drawGlass(ctx);
    this.drawBottomTray(ctx);
    this.drawScrews(ctx);
    this.drawVignette(ctx);
  }

  drawBackdrop(ctx) {
    const width = this.width;
    const height = this.height;
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, '#09060e');
    base.addColorStop(0.5, '#0e0814');
    base.addColorStop(1, '#08060c');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const glowTop = ctx.createRadialGradient(300, 80, 10, 300, 80, 360);
    glowTop.addColorStop(0, 'rgba(184,159,255,0.09)');
    glowTop.addColorStop(1, 'rgba(184,159,255,0)');
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, width, height);

    const glowBottom = ctx.createRadialGradient(300, 760, 10, 300, 760, 340);
    glowBottom.addColorStop(0, 'rgba(240,192,96,0.075)');
    glowBottom.addColorStop(1, 'rgba(240,192,96,0)');
    ctx.fillStyle = glowBottom;
    ctx.fillRect(0, 0, width, height);

    const rng = makeRng(this.config.seed ^ 0x51ed270b);
    ctx.strokeStyle = 'rgba(255,240,210,0.045)';
    ctx.lineWidth = 0.7;
    for (let index = 0; index < 26; index += 1) {
      const x = rng.range(20, width - 20);
      const y = rng.range(20, height - 20);
      const length = rng.range(4, 18);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y + rng.range(-2, 2));
      ctx.stroke();
    }
  }

  drawOuterCabinet(ctx) {
    const frame = this.layout.outerFrame;
    roundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
    const body = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.width, frame.y + frame.height);
    body.addColorStop(0, '#231a2b');
    body.addColorStop(0.28, '#120d18');
    body.addColorStop(0.62, '#0d0912');
    body.addColorStop(1, '#241829');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.58)';
    ctx.lineWidth = 2;
    ctx.stroke();

    roundRectPath(ctx, frame.x + 6, frame.y + 6, frame.width - 12, frame.height - 12, frame.radius - 4);
    ctx.strokeStyle = 'rgba(255,244,215,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    roundRectPath(ctx, frame.x + 14, frame.y + 14, frame.width - 28, frame.height - 28, frame.radius - 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    roundRectPath(ctx, 18, 82, 564, 18, 9);
    const crossbar = ctx.createLinearGradient(18, 82, 582, 100);
    crossbar.addColorStop(0, '#1a121f');
    crossbar.addColorStop(0.5, '#302238');
    crossbar.addColorStop(1, '#1a121f');
    ctx.fillStyle = crossbar;
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawSideCabinets(ctx) {
    this.drawSideCabinet(ctx, this.layout.sideCabinetLeft, 'left');
    this.drawSideCabinet(ctx, this.layout.sideCabinetRight, 'right');
  }

  drawSideCabinet(ctx, rect, side) {
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 18);
    const metal = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    if (side === 'left') {
      metal.addColorStop(0, '#2d2233');
      metal.addColorStop(0.46, '#14101b');
      metal.addColorStop(1, '#302238');
    } else {
      metal.addColorStop(0, '#302238');
      metal.addColorStop(0.54, '#14101b');
      metal.addColorStop(1, '#2d2233');
    }
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.34)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    roundRectPath(ctx, rect.x + 7, rect.y + 8, rect.width - 14, rect.height - 16, 13);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const centerX = rect.x + rect.width / 2;
    const rail = ctx.createLinearGradient(centerX - 8, 0, centerX + 8, 0);
    rail.addColorStop(0, 'rgba(80,58,42,0.5)');
    rail.addColorStop(0.5, 'rgba(255,232,176,0.42)');
    rail.addColorStop(1, 'rgba(68,48,38,0.5)');
    ctx.fillStyle = rail;
    ctx.fillRect(centerX - 1, rect.y + 22, 2, rect.height - 112);

    ctx.save();
    ctx.strokeStyle = 'rgba(240,192,96,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, rect.y + 54, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(184,159,255,0.18)';
    ctx.beginPath();
    ctx.arc(centerX, rect.y + 54, 28, 0.2, Math.PI * 1.7);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(centerX, rect.y + 54, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,192,96,0.58)';
    ctx.beginPath();
    ctx.arc(centerX, rect.y + 54, 3.5, 0, Math.PI * 2);
    ctx.fill();

    const grilleY = rect.y + rect.height - 154;
    ctx.fillStyle = 'rgba(7,5,10,0.7)';
    roundRectPath(ctx, rect.x + 13, grilleY, rect.width - 26, 82, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        ctx.fillStyle = `rgba(240,192,96,${0.12 + (row % 2) * 0.04})`;
        ctx.beginPath();
        ctx.arc(rect.x + 26 + col * 11, grilleY + 14 + row * 10, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(240,192,96,0.42)';
    ctx.font = `bold 7px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(side === 'left' ? 'SIGNAL' : 'CREDIT', centerX, rect.y + rect.height - 40);
    ctx.fillStyle = 'rgba(224,216,236,0.28)';
    ctx.font = `6px ${FONT_MONO}`;
    ctx.fillText(side === 'left' ? 'MAGIC / 01' : 'COIN / 02', centerX, rect.y + rect.height - 28);

    for (const y of [rect.y + 16, rect.y + rect.height - 16]) {
      this.drawScrew(ctx, centerX, y, 2.6);
    }
  }

  drawTopMarquee(ctx) {
    const marquee = this.layout.marquee;
    roundRectPath(ctx, marquee.x, marquee.y, marquee.width, marquee.height, marquee.radius);
    const metal = ctx.createLinearGradient(marquee.x, 0, marquee.x + marquee.width, marquee.y);
    metal.addColorStop(0, '#2c2235');
    metal.addColorStop(0.45, '#17111e');
    metal.addColorStop(1, '#2c2235');
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,192,96,0.9)';
    ctx.font = `bold 13px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('雾 雨 魔 法 店', 300, 34);
    const led = this.layout.marqueeLed;
    roundRectPath(ctx, led.x, led.y, led.width, led.height, 5);
    ctx.fillStyle = 'rgba(4,6,8,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(111,207,151,0.62)';
    ctx.beginPath();
    ctx.arc(led.x + 8, led.y + 7, 2.2, 0, Math.PI * 2);
    ctx.fill();

    for (const x of [42, 558]) {
      const lamp = ctx.createRadialGradient(x - 2, 42, 1, x, 44, 11);
      lamp.addColorStop(0, 'rgba(255,244,210,0.94)');
      lamp.addColorStop(0.42, 'rgba(240,192,96,0.42)');
      lamp.addColorStop(1, 'rgba(240,192,96,0)');
      ctx.fillStyle = lamp;
      ctx.beginPath();
      ctx.arc(x, 44, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,192,96,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, 44, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawField(ctx) {
    const layout = this.layout;
    tracePath(ctx, layout.playfieldPolygon);
    const field = ctx.createLinearGradient(0, layout.playTop, 0, layout.playBottom);
    field.addColorStop(0, '#17101f');
    field.addColorStop(0.45, '#0d0914');
    field.addColorStop(1, '#120b19');
    ctx.fillStyle = field;
    ctx.fill();
    ctx.save();
    ctx.clip();

    ctx.strokeStyle = 'rgba(255,240,210,0.025)';
    ctx.lineWidth = 1;
    for (let x = layout.playLeft + 12; x < layout.playRight; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, layout.playTop);
      ctx.lineTo(x, layout.playBottom);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(300, 390, 20, 300, 390, 260);
    glow.addColorStop(0, 'rgba(132,95,180,0.12)');
    glow.addColorStop(0.55, 'rgba(95,58,122,0.06)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(layout.playLeft, layout.playTop, layout.playRight - layout.playLeft, layout.playBottom - layout.playTop);

    this.drawMagicCircle(ctx, 300, 404, 202);
    this.drawLaneLines(ctx);
    ctx.restore();

    ctx.strokeStyle = 'rgba(240,192,96,0.22)';
    ctx.lineWidth = 1;
    tracePath(ctx, layout.playfieldPolygon);
    ctx.stroke();
  }

  drawMagicCircle(ctx, x, y, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(184,159,255,0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,192,96,0.075)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.56, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(184,159,255,0.09)';
    for (let index = 0; index < 16; index += 1) {
      const angle = (Math.PI * 2 * index) / 16;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.81, Math.sin(angle) * radius * 0.81);
      ctx.lineTo(Math.cos(angle) * radius * 0.9, Math.sin(angle) * radius * 0.9);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(240,192,96,0.06)';
    ctx.beginPath();
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
      const px = Math.cos(angle) * radius * 0.72;
      const py = Math.sin(angle) * radius * 0.72;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  drawLaneLines(ctx) {
    const layout = this.layout;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,192,96,0.08)';
    ctx.lineWidth = 1;
    for (const direction of [-1, 1]) {
      for (let offset = 42; offset <= 143; offset += 34) {
        ctx.beginPath();
        ctx.moveTo(layout.centerX + direction * 22, layout.playTop + 26);
        ctx.bezierCurveTo(
          layout.centerX + direction * offset,
          layout.playTop + 120,
          layout.centerX + direction * offset,
          layout.playBottom - 170,
          layout.centerX + direction * (offset + 18),
          layout.slotTop - 18
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawTopGuideRails(ctx) {
    const layout = this.layout;
    for (const side of ['left', 'right']) {
      const points = side === 'left'
        ? this.config.board.topGuidePaths.left
        : this.config.board.topGuidePaths.right;
      const path = points.map(([x, y]) => ({ x, y }));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      tracePolyline(ctx, path);
      ctx.strokeStyle = 'rgba(8,5,12,0.92)';
      ctx.lineWidth = 10;
      ctx.stroke();
      tracePolyline(ctx, path);
      const chrome = ctx.createLinearGradient(0, 120, 0, 200);
      chrome.addColorStop(0, 'rgba(255,232,176,0.9)');
      chrome.addColorStop(0.55, 'rgba(137,105,72,0.9)');
      chrome.addColorStop(1, 'rgba(240,192,96,0.7)');
      ctx.strokeStyle = chrome;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    }

    const splitter = layout.splitter;
    ctx.save();
    ctx.translate(splitter.x, splitter.y);
    ctx.rotate(Math.PI / 4);
    const diamond = ctx.createLinearGradient(-8, -8, 8, 8);
    diamond.addColorStop(0, '#fff4d2');
    diamond.addColorStop(0.34, '#f0c060');
    diamond.addColorStop(1, '#6f4a25');
    ctx.shadowColor = 'rgba(240,192,96,0.48)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = diamond;
    ctx.fillRect(-6.5, -6.5, 13, 13);
    ctx.strokeStyle = 'rgba(255,244,215,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-6.5, -6.5, 13, 13);
    ctx.restore();
    void layout;
  }

  drawGuides(ctx) {
    this.drawTopGuideRails(ctx);
  }

  drawPegs(ctx) {
    const pegs = this.layout.pegs;
    for (let index = 0; index < pegs.length; index += 1) {
      const peg = pegs[index];
      const radius = peg.radius;
      if (peg.kind === 'guide') {
        ctx.fillStyle = 'rgba(8,6,12,0.9)';
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, radius + 2.2, 0, Math.PI * 2);
        ctx.fill();
        const steel = ctx.createRadialGradient(peg.x - 1.5, peg.y - 1.5, 0.5, peg.x, peg.y, radius);
        steel.addColorStop(0, '#f4f1e8');
        steel.addColorStop(0.45, '#9d8d7c');
        steel.addColorStop(1, '#3b3036');
        ctx.fillStyle = steel;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (peg.rare) {
        ctx.save();
        ctx.shadowColor = 'rgba(184,159,255,0.7)';
        ctx.shadowBlur = 12;
        const gem = ctx.createRadialGradient(
          peg.x - radius * 0.35, peg.y - radius * 0.4, 1,
          peg.x, peg.y, radius
        );
        gem.addColorStop(0, '#fbf7ff');
        gem.addColorStop(0.32, '#d8c6ff');
        gem.addColorStop(0.72, '#8f6bd6');
        gem.addColorStop(1, '#4b2e76');
        ctx.fillStyle = gem;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(peg.x, peg.y - 4.2);
        ctx.lineTo(peg.x + 2, peg.y);
        ctx.lineTo(peg.x, peg.y + 4.2);
        ctx.lineTo(peg.x - 2, peg.y);
        ctx.closePath();
        ctx.stroke();
        continue;
      }

      ctx.fillStyle = 'rgba(5,3,8,0.62)';
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, radius + 1.8, 0, Math.PI * 2);
      ctx.fill();

      const copper = ctx.createRadialGradient(
        peg.x - radius * 0.38,
        peg.y - radius * 0.42,
        0.7,
        peg.x,
        peg.y,
        radius
      );
      copper.addColorStop(0, '#fff0c8');
      copper.addColorStop(0.22, '#d9a65e');
      copper.addColorStop(0.65, '#a96736');
      copper.addColorStop(1, '#563520');
      ctx.fillStyle = copper;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,236,190,0.34)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, radius - 1.6, Math.PI * 1.08, Math.PI * 1.72);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,250,230,0.68)';
      ctx.beginPath();
      ctx.arc(peg.x - 2.1, peg.y - 2.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBumpers(ctx) {
    const bumpers = this.layout.bumpers;
    for (let index = 0; index < bumpers.length; index += 1) {
      const bumper = bumpers[index];
      const r = bumper.radius;
      ctx.save();
      ctx.shadowColor = 'rgba(240,192,96,0.28)';
      ctx.shadowBlur = 10;
      const outer = ctx.createRadialGradient(
        bumper.x - r * 0.5,
        bumper.y - r * 0.5,
        1,
        bumper.x,
        bumper.y,
        r
      );
      outer.addColorStop(0, '#3b3235');
      outer.addColorStop(0.68, '#171017');
      outer.addColorStop(1, '#09070b');
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(240,192,96,0.74)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, r - 2.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(184,159,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, r - 5.3, 0, Math.PI * 2);
      ctx.stroke();

      const center = ctx.createRadialGradient(bumper.x - 2, bumper.y - 2, 0.5, bumper.x, bumper.y, 4.6);
      center.addColorStop(0, '#fff7dd');
      center.addColorStop(0.5, '#f0c060');
      center.addColorStop(1, '#8a5c20');
      ctx.fillStyle = center;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, 4.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFeed(ctx) {
    const feed = this.layout.feed;
    const x = feed.entryX;
    const left = x - feed.throatHalfWidth - 6;
    const right = x + feed.throatHalfWidth + 6;
    const top = 66;
    const bottom = feed.entryY + 4;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 28, top);
    ctx.lineTo(x + 28, top);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    const glass = ctx.createLinearGradient(left, top, right, bottom);
    glass.addColorStop(0, 'rgba(38,28,48,0.95)');
    glass.addColorStop(0.48, 'rgba(8,6,12,0.94)');
    glass.addColorStop(1, 'rgba(25,18,34,0.95)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.55)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,192,96,0.18)';
    ctx.fillRect(left + 3, bottom - 4, right - left - 6, 2);

    ctx.strokeStyle = 'rgba(240,192,96,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, feed.entryY, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(8,5,12,0.82)';
    ctx.beginPath();
    ctx.arc(x, feed.entryY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(184,159,255,0.75)';
    ctx.beginPath();
    ctx.arc(x, feed.entryY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawInnerFrame(ctx) {
    const frame = this.layout.innerFrame;
    roundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 5;
    ctx.stroke();
    roundRectPath(ctx, frame.x + 2.5, frame.y + 2.5, frame.width - 5, frame.height - 5, frame.radius - 2);
    const brass = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.width, frame.y + frame.height);
    brass.addColorStop(0, 'rgba(240,192,96,0.75)');
    brass.addColorStop(0.36, 'rgba(95,69,48,0.66)');
    brass.addColorStop(0.68, 'rgba(184,159,255,0.46)');
    brass.addColorStop(1, 'rgba(240,192,96,0.6)');
    ctx.strokeStyle = brass;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    roundRectPath(ctx, frame.x + 7, frame.y + 7, frame.width - 14, frame.height - 14, frame.radius - 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const layout = this.layout;
    ctx.strokeStyle = 'rgba(240,192,96,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.playLeft + 2, layout.shoulderY);
    ctx.lineTo(layout.playLeft + 2, layout.slotTop);
    ctx.moveTo(layout.playRight - 2, layout.shoulderY);
    ctx.lineTo(layout.playRight - 2, layout.slotTop);
    ctx.stroke();

    for (const x of [layout.playLeft + 9, layout.playRight - 9]) {
      const rail = ctx.createLinearGradient(x, layout.shoulderY, x, layout.slotTop);
      rail.addColorStop(0, 'rgba(255,232,176,0.5)');
      rail.addColorStop(0.48, 'rgba(83,61,48,0.7)');
      rail.addColorStop(1, 'rgba(240,192,96,0.42)');
      ctx.strokeStyle = rail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, layout.shoulderY + 10);
      ctx.lineTo(x, layout.slotTop - 12);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,232,176,0.55)';
      for (const y of [layout.shoulderY + 34, (layout.shoulderY + layout.slotTop) / 2, layout.slotTop - 34]) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawSlotBank(ctx) {
    const layout = this.layout;
    const top = layout.slotTop;
    const bottom = layout.playBottom;
    const bay = ctx.createLinearGradient(0, top, 0, bottom);
    bay.addColorStop(0, '#100a16');
    bay.addColorStop(0.58, '#08060c');
    bay.addColorStop(1, '#181020');
    ctx.fillStyle = bay;
    ctx.fillRect(layout.playLeft, top, layout.playRight - layout.playLeft, bottom - top);

    ctx.strokeStyle = 'rgba(240,192,96,0.34)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(layout.playLeft, top);
    ctx.lineTo(layout.playRight, top);
    ctx.stroke();

    for (let index = 0; index < layout.slots.length; index += 1) {
      const slot = layout.slots[index];
      const isJackpot = slot.jackpot;
      const isEdge = index === 0 || index === layout.slots.length - 1;
      const pocket = ctx.createLinearGradient(0, top + 4, 0, bottom);
      if (isJackpot) {
        pocket.addColorStop(0, 'rgba(77,55,38,0.9)');
        pocket.addColorStop(0.55, 'rgba(22,13,28,0.95)');
      } else if (isEdge) {
        pocket.addColorStop(0, 'rgba(30,24,34,0.94)');
        pocket.addColorStop(1, 'rgba(9,7,12,0.98)');
      } else {
        pocket.addColorStop(0, 'rgba(42,32,48,0.94)');
        pocket.addColorStop(1, 'rgba(10,7,15,0.98)');
      }
      roundRectPath(ctx, slot.left + 3, top + 5, slot.width - 6, bottom - top - 12, 7);
      ctx.fillStyle = pocket;
      ctx.fill();
      ctx.strokeStyle = isJackpot ? 'rgba(240,192,96,0.6)' : 'rgba(240,192,96,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isJackpot ? '#ffe8b0' : 'rgba(224,216,236,0.72)';
      ctx.font = `${isJackpot ? 'bold ' : ''}10px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(slot.name, slot.x, top + 27);

      ctx.fillStyle = isJackpot ? '#ffe8b0' : '#f0c060';
      ctx.font = `${isJackpot ? 'bold 16px' : 'bold 12px'} ${FONT_SANS}`;
      ctx.fillText(`+${slot.value}`, slot.x, top + 47);

      ctx.strokeStyle = isJackpot ? 'rgba(240,192,96,0.28)' : 'rgba(184,159,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(slot.left + 7, slot.sensorTop);
      ctx.lineTo(slot.right - 7, slot.sensorTop);
      ctx.stroke();
    }

    for (const divider of layout.dividers) {
      const gradient = ctx.createLinearGradient(divider.x, divider.top, divider.x, divider.bottom);
      gradient.addColorStop(0, 'rgba(255,232,176,0.82)');
      gradient.addColorStop(0.32, 'rgba(126,88,53,0.85)');
      gradient.addColorStop(1, 'rgba(42,31,44,0.95)');
      ctx.fillStyle = gradient;
      ctx.fillRect(divider.x - divider.width / 2, divider.top, divider.width, divider.bottom - divider.top);
      ctx.fillStyle = 'rgba(255,232,176,0.82)';
      ctx.beginPath();
      ctx.arc(divider.x, divider.top, divider.capRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(240,192,96,0.38)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(layout.playLeft, bottom);
    ctx.lineTo(layout.playRight, bottom);
    ctx.stroke();
  }

  drawGlass(ctx) {
    const layout = this.layout;
    ctx.save();
    tracePath(ctx, layout.playfieldPolygon);
    ctx.clip();
    const sheen = ctx.createLinearGradient(100, 110, 500, 700);
    sheen.addColorStop(0, 'rgba(220,235,255,0.055)');
    sheen.addColorStop(0.32, 'rgba(220,235,255,0.012)');
    sheen.addColorStop(0.7, 'rgba(220,235,255,0)');
    sheen.addColorStop(1, 'rgba(184,159,255,0.018)');
    ctx.fillStyle = sheen;
    ctx.fillRect(layout.playLeft, layout.playTop, layout.playRight - layout.playLeft, layout.playBottom - layout.playTop);

    ctx.strokeStyle = 'rgba(255,255,255,0.065)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(158, layout.playTop + 10);
    ctx.lineTo(112, layout.shoulderY + 120);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.beginPath();
    ctx.moveTo(420, layout.playTop + 60);
    ctx.lineTo(480, layout.shoulderY + 180);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(184,159,255,0.22)';
    ctx.lineWidth = 1;
    tracePath(ctx, layout.playfieldPolygon);
    ctx.stroke();
  }

  drawBottomTray(ctx) {
    const tray = this.layout.bottomTray;
    roundRectPath(ctx, tray.x, tray.y, tray.width, tray.height, tray.radius);
    const metal = ctx.createLinearGradient(tray.x, tray.y, tray.x, tray.y + tray.height);
    metal.addColorStop(0, '#2f2436');
    metal.addColorStop(0.42, '#15101a');
    metal.addColorStop(1, '#24182c');
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,192,96,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    roundRectPath(ctx, tray.x + 10, tray.y + 9, tray.width - 20, tray.height - 18, tray.radius - 7);
    const glass = ctx.createLinearGradient(0, tray.y + 10, 0, tray.y + tray.height - 10);
    glass.addColorStop(0, 'rgba(58,44,62,0.5)');
    glass.addColorStop(0.5, 'rgba(7,5,11,0.8)');
    glass.addColorStop(1, 'rgba(23,16,28,0.86)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.stroke();

    const ballY = tray.y + 42;
    const firstBallX = tray.x + (tray.width - 8 * 27) / 2;
    for (let index = 0; index < 9; index += 1) {
      const x = firstBallX + index * 27;
      const ball = ctx.createRadialGradient(x - 2, ballY - 2, 0.5, x, ballY, 5);
      ball.addColorStop(0, '#fff7dd');
      ball.addColorStop(0.48, '#f0c060');
      ball.addColorStop(1, '#6a4724');
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(x, ballY, 4.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(224,216,236,0.34)';
    ctx.font = `7px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('出球托盘 / BALL RETURN', 300, tray.y + 20);
    ctx.fillStyle = 'rgba(240,192,96,0.48)';
    ctx.font = `6px ${FONT_MONO}`;
    ctx.fillText('雾雨魔法店 · 弹珠台 01', 300, tray.y + tray.height - 12);
  }

  drawScrews(ctx) {
    const screws = [
      [24, 24], [576, 24], [24, 796], [576, 796],
      [102, 102], [498, 102], [102, 704], [498, 704]
    ];
    for (const [x, y] of screws) this.drawScrew(ctx, x, y, 3.2);
  }

  drawScrew(ctx, x, y, radius) {
    const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, radius + 2);
    g.addColorStop(0, 'rgba(255,238,190,0.9)');
    g.addColorStop(0.55, 'rgba(117,84,52,0.95)');
    g.addColorStop(1, 'rgba(32,22,28,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,5,10,0.8)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,246,220,0.5)';
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.55, y);
    ctx.lineTo(x + radius * 0.55, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.55);
    ctx.lineTo(x, y + radius * 0.55);
    ctx.stroke();
  }

  drawVignette(ctx) {
    const width = this.width;
    const height = this.height;
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.24,
      width / 2,
      height / 2,
      height * 0.72
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.44)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  drawTopLed(ctx, sim, now) {
    const led = this.layout.marqueeLed;
    const feed = sim.getFeedSnapshot();
    ctx.save();
    ctx.fillStyle = 'rgba(240,192,96,0.94)';
    ctx.font = `bold 11px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    const total = feed.total || 0;
    const fed = feed.fed || 0;
    const text = total > 0 ? `已发射 ${fed} / ${total}` : '等待供球';
    ctx.fillText(text, led.x + led.width / 2, led.y + 18);
    ctx.restore();

    const pulse = 0.5 + Math.sin(now * 0.005) * 0.18;
    ctx.fillStyle = `rgba(111,207,151,${pulse})`;
    ctx.beginPath();
    ctx.arc(led.x + 8, led.y + 7, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  flashPeg(index) {
    if (index >= 0 && index < this.pegFlash.length) {
      this.pegFlash[index] = performance.now();
    }
  }

  flashBumper(index) {
    if (index >= 0 && index < this.bumperFlash.length) {
      this.bumperFlash[index] = performance.now();
    }
  }

  flashSlot(index) {
    if (index >= 0 && index < this.slotFlash.length) {
      this.slotFlash[index] = performance.now();
    }
  }

  flashGate() {
    this.gateFlashAt = performance.now();
  }

  addPegFx(x, y, value, rare) {
    if (this.reducedEffects) return;
    if (!rare && value <= 0) return;
    this.pegFloatCounter += 1;
    if (!rare && this.pegFloatCounter % 4 !== 0) return;
    if (this.floats.length >= this.maxFloating) return;
    this.floats.push({
      x,
      y: y - 8,
      text: `+${value}`,
      color: rare ? '#d8c6ff' : '#f0c060',
      size: rare ? 12 : 10,
      life: 680,
      born: performance.now()
    });
  }

  addSettleFx(x, y, value, slotId) {
    this.flashSlot(slotId);
    if (this.reducedEffects) return;
    const slot = this.layout.slots[slotId];
    if (this.floats.length >= this.maxFloating) this.floats.shift();
    this.floats.push({
      x,
      y: y - 12,
      text: `${slot ? slot.name : '槽位'} +${value}`,
      color: '#ffe8b0',
      size: 14,
      life: 1150,
      born: performance.now()
    });
  }

  addLostFx(x, y, reason) {
    if (this.reducedEffects) return;
    if (this.floats.length >= this.maxFloating) return;
    this.floats.push({
      x,
      y: y - 10,
      text: reason === 'stuck' ? '卡球回收' : '超时回收',
      color: '#8a7e9a',
      size: 10,
      life: 900,
      born: performance.now()
    });
  }

  setReducedEffects(value) {
    this.reducedEffects = !!value;
  }

  setDebug(value) {
    this.debug = !!value;
  }

  clearEffects() {
    this.pegFlash.fill(-1e9);
    this.bumperFlash.fill(-1e9);
    this.slotFlash.fill(-1e9);
    this.floats.length = 0;
    this.gateFlashAt = -1e9;
  }

  draw(sim, now, options = {}) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.staticCanvas,
      0,
      0,
      this.staticCanvas.width,
      this.staticCanvas.height,
      0,
      0,
      this.width,
      this.height
    );

    this.drawTopLed(ctx, sim, now);
    this.drawGateFlash(ctx, now);
    this.drawSlotFlashes(ctx, now);
    this.drawBumperFlashes(ctx, now);
    this.drawPegFlashes(ctx, now);
    this.drawMarbles(ctx, sim);
    this.drawFloats(ctx, now);
    if (this.debug) this.drawDebug(ctx, sim);

    if (options.paused) {
      ctx.save();
      tracePath(ctx, this.layout.playfieldPolygon);
      ctx.fillStyle = 'rgba(10,6,18,0.22)';
      ctx.fill();
      ctx.restore();
    }
  }

  drawGateFlash(ctx, now) {
    const age = now - this.gateFlashAt;
    if (age < 0 || age > 320) return;
    const alpha = (1 - age / 320) * 0.8;
    const feed = this.layout.feed;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffe8b0';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#f0c060';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(feed.entryX, feed.entryY, 11 + age * 0.03, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawSlotFlashes(ctx, now) {
    for (let index = 0; index < this.layout.slots.length; index += 1) {
      const age = now - this.slotFlash[index];
      if (age < 0 || age > 300) continue;
      const slot = this.layout.slots[index];
      const alpha = (1 - age / 300) * 0.32;
      const beam = ctx.createLinearGradient(0, slot.sensorTop - 30, 0, slot.floorY);
      beam.addColorStop(0, 'rgba(240,192,96,0)');
      beam.addColorStop(0.55, `rgba(240,192,96,${alpha})`);
      beam.addColorStop(1, `rgba(255,232,176,${alpha * 1.8})`);
      ctx.fillStyle = beam;
      ctx.fillRect(slot.left + 4, slot.sensorTop - 30, slot.width - 8, slot.floorY - slot.sensorTop + 30);
    }
  }

  drawBumperFlashes(ctx, now) {
    for (let index = 0; index < this.layout.bumpers.length; index += 1) {
      const age = now - this.bumperFlash[index];
      if (age < 0 || age > 240) continue;
      const bumper = this.layout.bumpers[index];
      const progress = age / 240;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.8;
      ctx.strokeStyle = '#d8c6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, bumper.radius + 3 + progress * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPegFlashes(ctx, now) {
    for (let index = 0; index < this.layout.pegs.length; index += 1) {
      const age = now - this.pegFlash[index];
      if (age < 0 || age > 190) continue;
      const peg = this.layout.pegs[index];
      const progress = age / 190;
      const radius = peg.radius + 3 + progress * 7;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.75;
      ctx.strokeStyle = peg.rare ? '#d8c6ff' : '#ffe8b0';
      ctx.lineWidth = peg.rare ? 2 : 1;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMarbles(ctx, sim) {
    const marbles = sim.getMarbles();
    const size = 28;
    for (let index = 0; index < marbles.length; index += 1) {
      const record = marbles[index];
      if (!record.body) continue;
      const position = record.body.position;
      const sprite = this.sprites[record.index % this.sprites.length];
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate(record.body.angle);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  drawFloats(ctx, now) {
    let writeIndex = 0;
    for (let index = 0; index < this.floats.length; index += 1) {
      const item = this.floats[index];
      const progress = (now - item.born) / item.life;
      if (progress < 0 || progress >= 1) continue;
      this.floats[writeIndex] = item;
      writeIndex += 1;
      ctx.save();
      ctx.globalAlpha = 1 - progress * progress;
      ctx.fillStyle = item.color;
      ctx.textAlign = 'center';
      ctx.font = `bold ${item.size}px ${FONT_SANS}`;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 3;
      ctx.fillText(item.text, item.x, item.y - progress * 22);
      ctx.restore();
    }
    this.floats.length = writeIndex;
  }

  drawDebug(ctx, sim) {
    const layout = this.layout;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    for (const peg of layout.pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(240,192,96,0.55)';
    for (const bumper of layout.bumpers) {
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,90,90,0.75)';
    ctx.setLineDash([4, 3]);
    for (const slot of layout.slots) {
      ctx.strokeRect(slot.left + 5, slot.sensorTop, slot.width - 10, slot.sensorBottom - slot.sensorTop);
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(184,159,255,0.6)';
    tracePath(ctx, layout.playfieldPolygon);
    ctx.stroke();
    const marbles = sim.getMarbles();
    ctx.strokeStyle = 'rgba(143,216,255,0.9)';
    ctx.fillStyle = 'rgba(143,216,255,0.9)';
    for (const record of marbles) {
      if (!record.body) continue;
      const body = record.body;
      ctx.beginPath();
      ctx.arc(body.position.x, body.position.y, this.config.physics.marble.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(body.position.x, body.position.y);
      ctx.lineTo(body.position.x + body.velocity.x * 4, body.position.y + body.velocity.y * 4);
      ctx.stroke();
    }
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.textAlign = 'left';
    const snapshot = sim.getSnapshot();
    ctx.fillText(`sim ${snapshot.simTime.toFixed(0)}ms`, 20, 748);
    ctx.fillText(`active ${snapshot.active}  bodies ${snapshot.worldMarbles}`, 20, 762);
    ctx.restore();
  }
}
