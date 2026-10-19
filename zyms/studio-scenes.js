// Original procedural scenes and preset values.
const PRESETS = {
        // --- 梦核 Dreamcore ---
        y2k: {
          label: ' 千禧午后 (Y2K Sunny)',
          bloom: 72, ghost: 8, brightness: 12, contrast: 6, saturation: 42, warmth: 24, tint: 6,
          vignette: 32, vignetteWhite: false, rgbShift: 4, pixelate: 1, horrorCrush: 0, scanlines: 15, noise: 14, vhsTear: 0,
          showTimestamp: true, timestampText: '1999.08.14  15:42', timestampPos: 'br', timestampScale: 100,
          showVhsOsd: false, osdScale: 100, showWeirdTag: false, weirdScale: 100, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false,
          frameStyle: 'none', frameScale: 100
        },
        liminal: {
          label: ' 阈限走廊 (Liminal Space)',
          bloom: 45, ghost: 4, brightness: -6, contrast: 22, saturation: -28, warmth: 16, tint: -28,
          vignette: 68, vignetteWhite: false, rgbShift: 3, pixelate: 2, horrorCrush: 0, scanlines: 25, noise: 45, vhsTear: 12,
          showTimestamp: true, timestampText: '2003.11.02  03:17', timestampPos: 'br', timestampScale: 100,
          showVhsOsd: false, osdScale: 100, showWeirdTag: true, weirdText: '你来过这里吗？ / LEVEL 0', weirdStyle: 'whitebox',
          weirdScale: 105, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false, frameStyle: 'crt', frameScale: 100
        },
        vapor: {
          label: ' 深海残梦 (Vapor Haze)',
          bloom: 85, ghost: 16, brightness: 8, contrast: -12, saturation: 30, warmth: -38, tint: 36,
          vignette: 55, vignetteWhite: true, rgbShift: 6, pixelate: 1, horrorCrush: 0, scanlines: 22, noise: 16, vhsTear: 8,
          showTimestamp: true, timestampText: '2001.07.29  22:08', timestampPos: 'br', timestampScale: 100,
          showVhsOsd: false, osdScale: 100, showWeirdTag: true, weirdText: 'IT FEELS SO FAMILIAR...', weirdStyle: 'yellowglitch',
          weirdScale: 110, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false, frameStyle: 'polaroid', frameScale: 100
        },
        carousel: {
          label: ' 游乐园残影 (Carousel Fever)',
          bloom: 88, ghost: 22, brightness: 16, contrast: -8, saturation: 55, warmth: 18, tint: 32,
          vignette: 48, vignetteWhite: true, rgbShift: 5, pixelate: 1, horrorCrush: 0, scanlines: 10, noise: 20, vhsTear: 0,
          showTimestamp: true, timestampText: '2000.06.01  16:10', timestampPos: 'bl', timestampScale: 110,
          showVhsOsd: false, osdScale: 100, showWeirdTag: true, weirdText: '童年还没有结束', weirdStyle: 'yellowglitch',
          weirdScale: 105, weirdRotate: -3, weirdFlipX: false, weirdFlipY: false, frameStyle: 'polaroid', frameScale: 100
        },

        // --- 旧核 Oldcore ---
        old_ccd: {
          label: ' 千禧数码机 (2002 CCD)',
          bloom: 38, ghost: 2, brightness: 6, contrast: 16, saturation: -8, warmth: 28, tint: -10,
          vignette: 42, vignetteWhite: false, rgbShift: 3, pixelate: 3, horrorCrush: 0, scanlines: 8, noise: 32, vhsTear: 0,
          showTimestamp: true, timestampText: "'02 09 15  17:28", timestampPos: 'br', timestampScale: 125,
          showVhsOsd: false, osdScale: 100, showWeirdTag: false, weirdScale: 100, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false,
          frameStyle: 'none', frameScale: 100
        },
        old_crt: {
          label: ' 90s 显像管电视 (CRT TV)',
          bloom: 50, ghost: 5, brightness: -4, contrast: 20, saturation: -18, warmth: -12, tint: -8,
          vignette: 62, vignetteWhite: false, rgbShift: 5, pixelate: 2, horrorCrush: 0, scanlines: 78, noise: 28, vhsTear: 15,
          showTimestamp: true, timestampText: 'CH-03  1996', timestampPos: 'tr', timestampScale: 115,
          showVhsOsd: true, osdScale: 115, showWeirdTag: false, weirdScale: 100, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false,
          frameStyle: 'crt', frameScale: 120
        },
        vhs: {
          label: ' 损坏磁带 (Corrupted VHS)',
          bloom: 55, ghost: 12, brightness: 4, contrast: 18, saturation: 15, warmth: -8, tint: 18,
          vignette: 52, vignetteWhite: false, rgbShift: 12, pixelate: 2, horrorCrush: 0, scanlines: 65, noise: 38, vhsTear: 62,
          showTimestamp: true, timestampText: 'AUG 19 1997', timestampPos: 'bl', timestampScale: 110,
          showVhsOsd: true, osdScale: 105, showWeirdTag: false, weirdScale: 100, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false,
          frameStyle: 'crt', frameScale: 100
        },
        old_album: {
          label: ' 泛黄旧相册 (Faded Album)',
          bloom: 62, ghost: 4, brightness: 10, contrast: -14, saturation: -38, warmth: 46, tint: 8,
          vignette: 50, vignetteWhite: false, rgbShift: 2, pixelate: 1, horrorCrush: 0, scanlines: 0, noise: 26, vhsTear: 0,
          showTimestamp: true, timestampText: '1995.05.20', timestampPos: 'br', timestampScale: 95,
          showVhsOsd: false, osdScale: 100, showWeirdTag: false, weirdScale: 100, weirdRotate: 0, weirdFlipX: false, weirdFlipY: false,
          frameStyle: 'polaroid', frameScale: 115
        },

        // --- 怪核 & 重度恐怖 Weirdcore & Analog Horror ---
        weirdcore: {
          label: ' 怪核凝视 (Weirdcore Glitch)',
          bloom: 35, ghost: 3, brightness: -4, contrast: 45, saturation: -15, warmth: -5, tint: 12,
          vignette: 58, vignetteWhite: false, rgbShift: 7, pixelate: 4, horrorCrush: 18, scanlines: 30, noise: 35, vhsTear: 25,
          showTimestamp: true, timestampText: 'ERR // 99.99.99', timestampPos: 'br', timestampScale: 110,
          showVhsOsd: false, osdScale: 100, showWeirdTag: true, weirdText: "DON'T WAKE UP // 别回头", weirdStyle: 'blackred',
          weirdScale: 115, weirdRotate: -4, weirdFlipX: false, weirdFlipY: false, frameStyle: 'none', frameScale: 100
        },
        horror_analog: {
          label: ' 模拟恐怖档案 (Analog Horror)',
          bloom: 20, ghost: 6, brightness: -24, contrast: 72, saturation: -65, warmth: 38, tint: 45,
          vignette: 88, vignetteWhite: false, rgbShift: 15, pixelate: 3, horrorCrush: 68, scanlines: 82, noise: 62, vhsTear: 75,
          showTimestamp: true, timestampText: 'TAPE #04 // 03:33:33', timestampPos: 'bl', timestampScale: 120,
          showVhsOsd: true, osdScale: 115, showWeirdTag: true, weirdText: 'DO NOT LOOK BEHIND YOU', weirdStyle: 'blackred',
          weirdScale: 130, weirdRotate: 5, weirdFlipX: false, weirdFlipY: false, frameStyle: 'crt', frameScale: 135
        },
        horror_abyss: {
          label: ' 深渊精神污染 (Abyssal Corruption)',
          bloom: 15, ghost: 14, brightness: -30, contrast: 82, saturation: -45, warmth: -35, tint: 55,
          vignette: 94, vignetteWhite: false, rgbShift: 22, pixelate: 6, horrorCrush: 88, scanlines: 70, noise: 75, vhsTear: 88,
          showTimestamp: true, timestampText: 'NULL // 00.00.00', timestampPos: 'tl', timestampScale: 135,
          showVhsOsd: false, osdScale: 100, showWeirdTag: true, weirdText: '███ 祂在看着你 ███', weirdStyle: 'censorbar',
          weirdScale: 145, weirdRotate: -12, weirdFlipX: true, weirdFlipY: false, frameStyle: 'crt', frameScale: 140
        },
        horror_eas: {
          label: ' 午夜紧急广播 (EAS Alert 1998)',
          bloom: 42, ghost: 10, brightness: -16, contrast: 65, saturation: 35, warmth: 52, tint: 58,
          vignette: 82, vignetteWhite: false, rgbShift: 18, pixelate: 3, horrorCrush: 58, scanlines: 90, noise: 54, vhsTear: 68,
          showTimestamp: true, timestampText: 'EAS-ALERT // LOCK DOORS', timestampPos: 'br', timestampScale: 120,
          showVhsOsd: true, osdScale: 125, showWeirdTag: true, weirdText: 'FATAL: REALITY_CORRUPTED', weirdStyle: 'win98',
          weirdScale: 125, weirdRotate: 3, weirdFlipX: false, weirdFlipY: false, frameStyle: 'crt', frameScale: 120
        }
      };


function generateProceduralScene(sceneName) {
        const w = 800;
        const h = 600;
        sourceCanvas.width = w;
        sourceCanvas.height = h;
        mainCanvas.width = w;
        mainCanvas.height = h;
        canvasResolutionBadge.textContent = w + ' × ' + h;

        const c = sourceCtx;
        c.save();

        if (sceneName === 'corridor') {
          const ceilGrad = c.createLinearGradient(0, 0, 0, h * 0.45);
          ceilGrad.addColorStop(0, '#a39660');
          ceilGrad.addColorStop(1, '#6f6538');
          c.fillStyle = ceilGrad;
          c.fillRect(0, 0, w, h * 0.5);

          const floorGrad = c.createLinearGradient(0, h * 0.5, 0, h);
          floorGrad.addColorStop(0, '#5e522d');
          floorGrad.addColorStop(1, '#9c8b52');
          c.fillStyle = floorGrad;
          c.fillRect(0, h * 0.5, w, h * 0.5);

          c.fillStyle = '#c9b871';
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(310, 210);
          c.lineTo(310, 390);
          c.lineTo(0, h);
          c.closePath();
          c.fill();

          c.fillStyle = '#bca963';
          c.beginPath();
          c.moveTo(w, 0);
          c.lineTo(490, 210);
          c.lineTo(490, 390);
          c.lineTo(w, h);
          c.closePath();
          c.fill();

          c.strokeStyle = 'rgba(110, 95, 45, 0.25)';
          c.lineWidth = 2;
          for (let i = 20; i < 305; i += 22) {
            const topY = (i / 310) * 210;
            const botY = h - (i / 310) * (h - 390);
            c.beginPath();
            c.moveTo(i, topY);
            c.lineTo(i, botY);
            c.stroke();

            const rx = w - i;
            c.beginPath();
            c.moveTo(rx, topY);
            c.lineTo(rx, botY);
            c.stroke();
          }

          c.fillStyle = '#2d2712';
          c.fillRect(310, 210, 180, 180);
          c.fillStyle = '#120f06';
          c.fillRect(355, 240, 90, 120);

          c.fillStyle = '#5c3c20';
          c.beginPath();
          c.moveTo(110, 130);
          c.lineTo(185, 168);
          c.lineTo(185, 462);
          c.lineTo(110, 515);
          c.closePath();
          c.fill();

          c.fillStyle = '#4e3119';
          c.beginPath();
          c.moveTo(690, 130);
          c.lineTo(615, 168);
          c.lineTo(615, 462);
          c.lineTo(690, 515);
          c.closePath();
          c.fill();

          const lights = [
            { y1: 30, y2: 75, w1: 220, w2: 170 },
            { y1: 115, y2: 145, w1: 130, w2: 100 },
            { y1: 170, y2: 190, w1: 75, w2: 58 }
          ];
          lights.forEach(l => {
            c.fillStyle = '#fffde8';
            c.beginPath();
            c.moveTo(w / 2 - l.w1 / 2, l.y1);
            c.lineTo(w / 2 + l.w1 / 2, l.y1);
            c.lineTo(w / 2 + l.w2 / 2, l.y2);
            c.lineTo(w / 2 - l.w2 / 2, l.y2);
            c.closePath();
            c.fill();
          });

          c.fillStyle = '#ff2a2a';
          c.fillRect(378, 216, 44, 16);
          c.fillStyle = '#ffffff';
          c.font = 'bold 11px monospace';
          c.textAlign = 'center';
          c.fillText('EXIT', 400, 228);

        } else if (sceneName === 'meadow') {
          const skyGrad = c.createLinearGradient(0, 0, 0, h * 0.58);
          skyGrad.addColorStop(0, '#0051ff');
          skyGrad.addColorStop(0.55, '#38bdf8');
          skyGrad.addColorStop(1, '#bae6fd');
          c.fillStyle = skyGrad;
          c.fillRect(0, 0, w, h * 0.6);

          const sunGrad = c.createRadialGradient(640, 110, 10, 640, 110, 110);
          sunGrad.addColorStop(0, '#ffffff');
          sunGrad.addColorStop(0.3, '#fef08a');
          sunGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
          c.fillStyle = sunGrad;
          c.beginPath();
          c.arc(640, 110, 110, 0, Math.PI * 2);
          c.fill();

          c.fillStyle = 'rgba(255, 255, 255, 0.92)';
          const drawCloud = (cx, cy, s) => {
            c.beginPath();
            c.arc(cx, cy, 32 * s, 0, Math.PI * 2);
            c.arc(cx + 28 * s, cy - 10 * s, 26 * s, 0, Math.PI * 2);
            c.arc(cx + 56 * s, cy, 30 * s, 0, Math.PI * 2);
            c.arc(cx - 26 * s, cy + 4 * s, 22 * s, 0, Math.PI * 2);
            c.fill();
          };
          drawCloud(150, 120, 1.2);
          drawCloud(420, 165, 0.95);
          drawCloud(260, 230, 0.75);

          const hillGrad1 = c.createLinearGradient(0, h * 0.48, 0, h);
          hillGrad1.addColorStop(0, '#65a30d');
          hillGrad1.addColorStop(1, '#15803d');
          c.fillStyle = hillGrad1;
          c.beginPath();
          c.moveTo(0, 340);
          c.quadraticCurveTo(220, 265, 480, 345);
          c.quadraticCurveTo(660, 390, w, 320);
          c.lineTo(w, h);
          c.lineTo(0, h);
          c.closePath();
          c.fill();

          const hillGrad2 = c.createLinearGradient(0, h * 0.56, 0, h);
          hillGrad2.addColorStop(0, '#84cc16');
          hillGrad2.addColorStop(1, '#3f6212');
          c.fillStyle = hillGrad2;
          c.beginPath();
          c.moveTo(0, 390);
          c.quadraticCurveTo(380, 320, w, 400);
          c.lineTo(w, h);
          c.lineTo(0, h);
          c.closePath();
          c.fill();

          const horizonY = 355;
          const rows = 10;
          const cols = 6;
          for (let r = 0; r < rows; r++) {
            const t1 = Math.pow(r / rows, 1.6);
            const t2 = Math.pow((r + 1) / rows, 1.6);
            const y1 = horizonY + t1 * (h - horizonY);
            const y2 = horizonY + t2 * (h - horizonY);
            const span1 = 36 + t1 * 340;
            const span2 = 36 + t2 * 340;
            for (let col = 0; col < cols; col++) {
              const x1a = w / 2 - span1 / 2 + (col / cols) * span1;
              const x1b = w / 2 - span1 / 2 + ((col + 1) / cols) * span1;
              const x2a = w / 2 - span2 / 2 + (col / cols) * span2;
              const x2b = w / 2 - span2 / 2 + ((col + 1) / cols) * span2;
              c.fillStyle = (r + col) % 2 === 0 ? '#f8fafc' : '#9333ea';
              c.beginPath();
              c.moveTo(x1a, y1);
              c.lineTo(x1b, y1);
              c.lineTo(x2b, y2);
              c.lineTo(x2a, y2);
              c.closePath();
              c.fill();
            }
          }

          c.fillStyle = '#ffffff';
          c.beginPath();
          c.ellipse(400, 175, 58, 32, 0, 0, Math.PI * 2);
          c.fill();
          c.lineWidth = 3;
          c.strokeStyle = '#1e1b4b';
          c.stroke();

          c.fillStyle = '#3b82f6';
          c.beginPath();
          c.arc(400, 175, 22, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#09090b';
          c.beginPath();
          c.arc(400, 175, 10, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ffffff';
          c.beginPath();
          c.arc(394, 169, 4, 0, Math.PI * 2);
          c.fill();

        } else if (sceneName === 'poolrooms') {
          const wallGrad = c.createLinearGradient(0, 0, w, h * 0.65);
          wallGrad.addColorStop(0, '#cffafe');
          wallGrad.addColorStop(0.5, '#67e8f9');
          wallGrad.addColorStop(1, '#0891b2');
          c.fillStyle = wallGrad;
          c.fillRect(0, 0, w, h * 0.65);

          c.strokeStyle = 'rgba(14, 116, 144, 0.35)';
          c.lineWidth = 1.5;
          for (let x = 0; x <= w; x += 32) {
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, h * 0.65);
            c.stroke();
          }
          for (let y = 0; y <= h * 0.65; y += 32) {
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(w, y);
            c.stroke();
          }

          const drawArch = (ax, ay, aw, ah) => {
            c.fillStyle = '#042f2e';
            c.beginPath();
            c.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0, false);
            c.lineTo(ax + aw, ay + ah);
            c.lineTo(ax, ay + ah);
            c.closePath();
            c.fill();
          };
          drawArch(170, 170, 110, 220);
          drawArch(520, 170, 110, 220);

          c.fillStyle = '#e0f2fe';
          c.fillRect(60, 0, 74, 390);
          c.fillRect(363, 0, 74, 390);
          c.fillRect(666, 0, 74, 390);

          const waterGrad = c.createLinearGradient(0, h * 0.65, 0, h);
          waterGrad.addColorStop(0, '#06b6d4');
          waterGrad.addColorStop(0.5, '#22d3ee');
          waterGrad.addColorStop(1, '#0e7490');
          c.fillStyle = waterGrad;
          c.fillRect(0, h * 0.65, w, h * 0.35);

          c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          c.lineWidth = 2;
          for (let r = 0; r < 24; r++) {
            const ry = h * 0.67 + (r / 24) * (h * 0.32);
            c.beginPath();
            for (let x = 0; x <= w; x += 20) {
              const wy = ry + Math.sin(x * 0.04 + r * 1.3) * 4;
              if (x === 0) c.moveTo(x, wy);
              else c.lineTo(x, wy);
            }
            c.stroke();
          }

        } else if (sceneName === 'arcade') {
          const nightGrad = c.createLinearGradient(0, 0, 0, h);
          nightGrad.addColorStop(0, '#090514');
          nightGrad.addColorStop(0.65, '#1e1035');
          nightGrad.addColorStop(1, '#120d1d');
          c.fillStyle = nightGrad;
          c.fillRect(0, 0, w, h);

          const fx = 560, fy = 250, fr = 120;
          c.strokeStyle = '#f472b6';
          c.lineWidth = 3;
          c.beginPath();
          c.arc(fx, fy, fr, 0, Math.PI * 2);
          c.stroke();
          c.strokeStyle = '#38bdf8';
          c.beginPath();
          c.arc(fx, fy, fr * 0.7, 0, Math.PI * 2);
          c.stroke();

          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * Math.PI * 2;
            const gx = fx + Math.cos(ang) * fr;
            const gy = fy + Math.sin(ang) * fr;
            c.strokeStyle = 'rgba(244, 114, 182, 0.5)';
            c.beginPath();
            c.moveTo(fx, fy);
            c.lineTo(gx, gy);
            c.stroke();
            c.fillStyle = a % 2 === 0 ? '#fde047' : '#c084fc';
            c.beginPath();
            c.arc(gx, gy, 6, 0, Math.PI * 2);
            c.fill();
          }

          c.fillStyle = '#1f2937';
          c.fillRect(210, 150, 8, 330);
          const lampGlow = c.createRadialGradient(230, 150, 5, 230, 150, 140);
          lampGlow.addColorStop(0, '#ffffff');
          lampGlow.addColorStop(0.25, '#fde047');
          lampGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
          c.fillStyle = lampGlow;
          c.beginPath();
          c.arc(230, 150, 140, 0, Math.PI * 2);
          c.fill();

          c.fillStyle = '#0d0914';
          c.fillRect(0, 450, w, 150);
          c.fillStyle = 'rgba(253, 224, 71, 0.22)';
          c.beginPath();
          c.ellipse(230, 510, 65, 18, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(244, 114, 182, 0.2)';
          c.beginPath();
          c.ellipse(560, 520, 95, 24, 0, 0, Math.PI * 2);
          c.fill();
        }

        c.restore();
        requestRender();
      }
