/* Lotería iO.GENIX · Generador del décimo (canvas)
   renderDecimo({number, orderRef}) -> canvas 1800x972
   renderStories(decimoCanvas, number) -> canvas 1080x1920 */
(function () {
  'use strict';
  const W = 1800, H = 972;
  let assetsPromise = null;

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar ' + src.slice(0, 60)));
      img.src = src;
    });
  }

  function loadAssets() {
    if (assetsPromise) return assetsPromise;
    assetsPromise = (async () => {
      const svg = await (await fetch('assets/logo.svg')).text();
      const tint = (c) => loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/#C1A03F/gi, c)));
      const [logoGold, logoDark, logoWm, bote] = await Promise.all([
        tint('#C1A03F'), tint('#1d1a14'), tint('#d9d2c2'), loadImg('assets/bote.jpg')
      ]);
      try {
        await Promise.all([
          '200px "Archivo Black"', 'italic 700 44px "Barlow Condensed"',
          '800 40px Montserrat', '700 40px Montserrat', '600 30px Montserrat'
        ].map((f) => document.fonts.load(f)));
      } catch (e) { /* fuentes del sistema como respaldo */ }
      return { logoGold, logoDark, logoWm, bote };
    })();
    return assetsPromise;
  }

  function gold(ctx, x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#7a5a17');
    g.addColorStop(0.22, '#d6b058');
    g.addColorStop(0.48, '#fbeab0');
    g.addColorStop(0.72, '#c4973a');
    g.addColorStop(1, '#7a5a17');
    return g;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function spaced(ctx, px) { try { ctx.letterSpacing = px + 'px'; } catch (e) { } }

  function fitText(ctx, text, maxW, font, startSize) {
    let size = startSize;
    do { ctx.font = font.replace('{s}', size); size -= 2; } while (ctx.measureText(text).width > maxW && size > 10);
  }

  function drawLogo(ctx, img, cx, cy, w) {
    const h = w * img.naturalHeight / img.naturalWidth;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return h;
  }

  function snowflake(ctx, x, y, r, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = fill;
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -r);
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.28, -r * 0.8);
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.28, -r * 0.8);
      ctx.moveTo(0, -r * 0.25); ctx.lineTo(-r * 0.2, -r * 0.42);
      ctx.moveTo(0, -r * 0.25); ctx.lineTo(r * 0.2, -r * 0.42);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawQR(ctx, x, y, size, logo) {
    const rows = window.LOT_QR || [];
    const n = rows.length;
    if (!n) return;
    const pad = size * 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2);
    const m = size / n;
    ctx.fillStyle = '#111111';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (rows[r][c] === '1') ctx.fillRect(Math.floor(x + c * m), Math.floor(y + r * m), Math.ceil(m), Math.ceil(m));
      }
    }
    // Hueco central con el logo (el QR usa corrección de errores alta)
    const bw = size * 0.36, bh = size * 0.13;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + size / 2 - bw / 2, y + size / 2 - bh / 2, bw, bh);
    drawLogo(ctx, logo, x + size / 2, y + size / 2, bw * 0.86);
  }

  async function renderDecimo(opts) {
    const a = await loadAssets();
    const number = String(opts.number).padStart(5, '0');
    const orderRef = String(opts.orderRef || '');
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Fondo papel
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#fdfbf6'); bg.addColorStop(1, '#f6f0e2');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Marca de agua con el logo en la zona central
    ctx.save();
    ctx.globalAlpha = 0.38;
    const tw = 150, th = tw * a.logoWm.naturalHeight / a.logoWm.naturalWidth;
    ctx.beginPath(); ctx.rect(585, 150, 800, 790); ctx.clip();
    for (let row = 0, y = 160; y < 950; row++, y += th + 24) {
      for (let x = 585 + (row % 2 ? -60 : 0); x < 1400; x += tw + 30) ctx.drawImage(a.logoWm, x, y, tw, th);
    }
    ctx.restore();

    // Filete exterior
    ctx.strokeStyle = gold(ctx, 0, 0, W, H); ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, W - 24, H - 24);

    // ----- Panel izquierdo: marco dorado + bote -----
    const px = 40, py = 40, pw = 500, ph = 810;
    ctx.fillStyle = gold(ctx, px, py, px + pw, py + ph);
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#3a2a0b'; ctx.fillRect(px + 18, py + 18, pw - 36, ph - 36);
    ctx.fillStyle = gold(ctx, px + pw, py, px, py + ph); ctx.fillRect(px + 22, py + 22, pw - 44, ph - 44);
    ctx.fillStyle = '#050505'; ctx.fillRect(px + 30, py + 30, pw - 60, ph - 60);
    // Esquinas
    [[px + 9, py + 9], [px + pw - 9, py + 9], [px + 9, py + ph - 9], [px + pw - 9, py + ph - 9]].forEach(([x, y]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(-7, -7, 14, 14); ctx.restore();
    });
    drawLogo(ctx, a.logoGold, px + pw / 2, py + 100, 330);
    const bw = pw - 70, bh = bw * a.bote.naturalHeight / a.bote.naturalWidth;
    const boteY = py + 160;
    const visibleH = Math.min(bh, ph - 30 - (boteY - py));
    ctx.drawImage(a.bote, 0, 0, a.bote.naturalWidth, a.bote.naturalHeight * visibleH / bh, px + 35, boteY, bw, visibleH);
    ctx.fillStyle = '#1b1812'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '600 34px Montserrat'; spaced(ctx, 3);
    ctx.fillText('BORN IN LABORATORY', px + pw / 2, 912);
    spaced(ctx, 0);

    // ----- Centro -----
    const cx = 990;
    ctx.fillStyle = '#2a2620';
    spaced(ctx, 1);
    fitText(ctx, 'LOTERÍAS Y APUESTAS DE LA NUTRICIÓN DEPORTIVA', 770, 'italic 700 {s}px "Barlow Condensed"', 46);
    ctx.fillText('LOTERÍAS Y APUESTAS DE LA NUTRICIÓN DEPORTIVA', cx, 100);
    spaced(ctx, 22);
    fitText(ctx, number, 800, '{s}px "Archivo Black"', 210);
    ctx.fillStyle = '#111111';
    ctx.fillText(number, cx + 11, 330);
    spaced(ctx, 0);

    ctx.strokeStyle = gold(ctx, cx - 380, 0, cx + 380, 0); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - 380, 378); ctx.lineTo(cx + 380, 378); ctx.stroke();
    ctx.fillStyle = '#111111';
    fitText(ctx, 'LOTERÍA iO.GENIX', 760, '800 {s}px Montserrat', 88);
    ctx.fillText('LOTERÍA iO.GENIX', cx, 465);
    ctx.font = '600 50px Montserrat';
    ctx.fillText('22 DE DICIEMBRE DE 2026', cx, 535);

    drawQR(ctx, cx - 120, 590, 240, a.logoDark);

    // Copos
    for (let i = 0; i < 8; i++) {
      snowflake(ctx, cx - 280 + i * 80, 905, 24, i % 2 ? '#2b2414' : gold(ctx, cx - 300, 880, cx + 300, 930));
    }

    // Perforado
    ctx.strokeStyle = '#cdbb8d'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
    ctx.beginPath(); ctx.moveTo(1405, 28); ctx.lineTo(1405, H - 28); ctx.stroke();
    ctx.setLineDash([]);

    // ----- Matriz derecha -----
    const sx = 1432, sy = 40, sw = 330, sh = 892, scx = sx + sw / 2;
    rr(ctx, sx, sy, sw, sh, 28); ctx.fillStyle = '#f3e7c8'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = gold(ctx, sx, sy, sx + sw, sy + sh); ctx.stroke();
    rr(ctx, sx + 12, sy + 12, sw - 24, sh - 24, 20); ctx.lineWidth = 2; ctx.strokeStyle = '#b8954a'; ctx.stroke();
    // Festón superior e inferior
    ctx.fillStyle = '#e6d3a3';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.arc(sx + 37 + i * 32, sy + 12, 9, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 37 + i * 32, sy + sh - 12, 9, Math.PI, 0); ctx.fill();
    }

    // Caja con la referencia del pedido
    rr(ctx, sx + 34, sy + 44, sw - 68, 112, 18); ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#b8954a'; ctx.stroke();
    ctx.fillStyle = '#6b5a33'; ctx.font = '700 22px Montserrat'; spaced(ctx, 2);
    ctx.fillText('PEDIDO', scx, sy + 84);
    spaced(ctx, 1); ctx.fillStyle = '#1d1a14';
    fitText(ctx, orderRef, sw - 100, '{s}px "Archivo Black"', 38);
    ctx.fillText(orderRef, scx, sy + 132);
    spaced(ctx, 0);

    // Medallón con el logo
    const mcy = sy + 300;
    ctx.beginPath(); ctx.arc(scx, mcy, 112, 0, Math.PI * 2);
    ctx.fillStyle = gold(ctx, scx - 112, mcy - 112, scx + 112, mcy + 112); ctx.fill();
    ctx.beginPath(); ctx.arc(scx, mcy, 100, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.beginPath(); ctx.arc(scx, mcy, 92, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#b8954a'; ctx.stroke();
    drawLogo(ctx, a.logoDark, scx, mcy - 12, 150);
    ctx.fillStyle = '#6b5a33'; ctx.font = '700 16px Montserrat'; spaced(ctx, 2);
    ctx.fillText('NAVIDAD 2026', scx, mcy + 34);
    spaced(ctx, 0);

    // Textos
    ctx.fillStyle = '#1d1a14'; ctx.font = '800 30px Montserrat';
    ctx.fillText('SORTEO DE', scx, sy + 480);
    ctx.fillText('NAVIDAD', scx, sy + 516);
    ctx.fillStyle = '#6b5a33'; ctx.font = '600 26px Montserrat';
    ctx.fillText('22 · 12 · 2026', scx, sy + 556);
    snowflake(ctx, scx, sy + 604, 16, '#b8954a');

    // Sello de precio
    const pcy = sy + 740;
    ctx.beginPath(); ctx.arc(scx, pcy, 118, 0, Math.PI * 2);
    ctx.fillStyle = gold(ctx, scx - 118, pcy - 118, scx + 118, pcy + 118); ctx.fill();
    ctx.beginPath(); ctx.arc(scx, pcy, 106, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.fillStyle = '#1d1a14';
    ctx.font = '600 28px Montserrat'; ctx.fillText('PRECIO', scx, pcy - 50);
    ctx.font = '110px "Archivo Black"'; ctx.fillText('0', scx, pcy + 42);
    ctx.font = '600 28px Montserrat'; ctx.fillText('EUROS', scx, pcy + 84);

    return cv;
  }

  // Generador pseudoaleatorio con semilla (para que el fondo sea estable)
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  async function renderStories(decimo, numberIn) {
    const a = await loadAssets();
    const number = String(numberIn).padStart(5, '0');
    const SW = 1080, SH = 1920;
    const cv = document.createElement('canvas');
    cv.width = SW; cv.height = SH;
    const ctx = cv.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, SH);
    bg.addColorStop(0, '#0d0b07'); bg.addColorStop(0.5, '#15110a'); bg.addColorStop(1, '#050505');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, SW, SH);
    const glow = ctx.createRadialGradient(SW / 2, 820, 50, SW / 2, 820, 900);
    glow.addColorStop(0, 'rgba(214,176,88,0.28)'); glow.addColorStop(1, 'rgba(214,176,88,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, SW, SH);

    const rand = rng(parseInt(number, 10) + 7);
    for (let i = 0; i < 140; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.6;
      ctx.fillStyle = rand() > 0.5 ? '#f5dc8f' : '#ffffff';
      ctx.beginPath(); ctx.arc(rand() * SW, rand() * SH, 1 + rand() * 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawLogo(ctx, a.logoGold, SW / 2, 190, 560);

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    fitText(ctx, '¡YA TENGO MI DÉCIMO!', 960, '800 {s}px Montserrat', 80);
    ctx.fillText('¡YA TENGO MI DÉCIMO!', SW / 2, 420);
    ctx.fillStyle = '#e3c578';
    ctx.font = 'italic 700 50px "Barlow Condensed"';
    ctx.fillText('Lotería iO.GENIX · Sorteo de Navidad', SW / 2, 492);

    // Décimo inclinado con sombra
    ctx.save();
    ctx.translate(SW / 2, 880);
    ctx.rotate(-3.5 * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
    const dw = 1000, dh = dw * decimo.height / decimo.width;
    ctx.drawImage(decimo, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    ctx.fillStyle = '#b9ad93'; ctx.font = '700 34px Montserrat'; spaced(ctx, 8);
    ctx.fillText('MI NÚMERO', SW / 2, 1290);
    spaced(ctx, 20);
    ctx.font = '200px "Archivo Black"';
    ctx.fillStyle = gold(ctx, 200, 1300, 880, 1480);
    ctx.fillText(number, SW / 2 + 10, 1490);
    spaced(ctx, 0);
    ctx.fillStyle = '#ffffff'; ctx.font = '600 52px Montserrat';
    ctx.fillText('22 · 12 · 2026', SW / 2, 1590);

    ctx.fillStyle = '#b9ad93'; ctx.font = '500 32px Montserrat';
    ctx.fillText('Cada pedido en la web lleva su décimo', SW / 2, 1735);
    ctx.fillStyle = '#e3c578'; ctx.font = '700 34px Montserrat';
    ctx.fillText('tienda.iogenixnutrition.com', SW / 2, 1785);
    for (let i = 0; i < 7; i++) snowflake(ctx, SW / 2 - 300 + i * 100, 1860, 18, i % 2 ? '#6b5a33' : '#d6b058');
    return cv;
  }

  function toBlob(canvas, type, q) {
    return new Promise((res) => canvas.toBlob(res, type || 'image/png', q));
  }

  window.LotDecimo = { loadAssets, renderDecimo, renderStories, toBlob };
})();
