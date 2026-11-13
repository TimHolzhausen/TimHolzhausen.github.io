// Drucklayout für Thermodrucker (Peripage): Text, Zeichnungen und Bilder auf den Papierstreifen setzen.
// Angelehnt an die Druckeinstellungen von MysterSmith (Ausrichtung, Schrift min/max, Ränder, Zeilenhöhe,
// Neigung, Etikettenlänge, Vorschub). 203 dpi → 8 Pixel pro Millimeter.

export const PX_PER_MM = 8;

export const FONTS = {
  sans: { label: 'Klar (Sans)', css: '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif' },
  serif: { label: 'Klassisch (Serif)', css: 'Georgia, "Times New Roman", serif' },
  hand: { label: 'Handschrift', css: '"Caveat", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
  marker: { label: 'Filzstift', css: '"Permanent Marker", "Segoe Print", "Marker Felt", cursive' },
  mono: { label: 'Schreibmaschine', css: '"Courier New", Courier, monospace' },
};

export const ORIENTATIONS = {
  landscapeRight: 'Quer (nach rechts gedreht)',
  landscapeLeft: 'Quer (nach links gedreht)',
  portrait: 'Hochkant (wie ein Kassenbon)',
};

export const DEFAULT_LAYOUT = {
  orientation: 'landscapeRight',
  length: 0,        // mm; 0 = automatisch passend zum Inhalt
  font: 'sans',
  bold: true,
  minFont: 4,       // mm Versalhöhe (ungefähr)
  maxFont: 30,
  hAlign: 'center', // left | center | right
  vAlign: 'center', // top | center | bottom
  padding: 3,       // mm innen
  lineHeight: 110,  // %
  tilt: 0,          // Grad
  invert: false,
  border: false,
  dither: true,     // Fotos gerastert
  feedBefore: 0,    // mm Vorschub vorher
  feedAfter: 10,    // mm Vorschub nachher
  copies: 1,
};

export function normalizeLayout(l = {}) {
  const out = { ...DEFAULT_LAYOUT, ...l };
  if (!ORIENTATIONS[out.orientation]) out.orientation = DEFAULT_LAYOUT.orientation;
  if (!FONTS[out.font]) out.font = DEFAULT_LAYOUT.font;
  for (const k of ['length', 'minFont', 'maxFont', 'padding', 'lineHeight', 'tilt', 'feedBefore', 'feedAfter', 'copies']) {
    out[k] = Number(out[k]);
    if (!Number.isFinite(out[k])) out[k] = DEFAULT_LAYOUT[k];
  }
  out.minFont = Math.max(2, Math.min(out.minFont, out.maxFont));
  out.copies = Math.max(1, Math.min(10, Math.round(out.copies)));
  return out;
}

/** Schriftarten aus Google Fonts (Handschrift/Filzstift) vor dem Zeichnen laden – ohne Internet greift der Ersatz. */
export async function ensureFont(fontKey) {
  if (!document.fonts?.load) return;
  const fam = { hand: 'Caveat', marker: 'Permanent Marker' }[fontKey];
  if (!fam) return;
  try { await Promise.race([document.fonts.load('700 40px "' + fam + '"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* Ersatzschrift */ }
}

/**
 * Baut das Druckbild.
 * @param {{kind:'text'|'image', text?, strokes?, canvas?}} content
 * @param {object} layout  siehe DEFAULT_LAYOUT
 * @param {number} paperPx Druckbreite in Pixeln (384 bei P21)
 * @returns {{ page: HTMLCanvasElement, print: HTMLCanvasElement }} page = Leseansicht, print = gedreht für den Drucker
 */
export function buildPrint(content, layout, paperPx = 384) {
  const L = normalizeLayout(layout);
  const landscape = L.orientation !== 'portrait';
  const pad = Math.round(L.padding * PX_PER_MM);
  const fixedLen = L.length > 0 ? Math.round(L.length * PX_PER_MM) : 0;
  // „Kreuzmaß“ = die durch die Papierbreite vorgegebene Seite der Leseansicht
  let pageW, pageH;

  const fg = L.invert ? '#fff' : '#000';
  const bg = L.invert ? '#000' : '#fff';
  let drawContent;

  if (content.kind === 'text' || (content.kind === 'image' && !content.strokes && !content.canvas)) {
    const text = String(content.text ?? '');
    const fontCss = FONTS[L.font].css;
    const weight = L.bold ? 700 : 400;
    const capRatio = 0.72; // Versalhöhe ≈ 0,72 × Schriftgröße
    const minPx = Math.max(8, Math.round(L.minFont * PX_PER_MM / capRatio));
    const maxPx = Math.max(minPx, Math.round(L.maxFont * PX_PER_MM / capRatio));
    const meas = document.createElement('canvas').getContext('2d');
    const lh = L.lineHeight / 100;

    let box; // { size, lines, w, h }
    if (landscape && !fixedLen) {
      // Höhe fix (Papierbreite), Länge wächst mit dem Text; nur echte Zeilenumbrüche.
      pageH = paperPx;
      const lines = text.split('\n');
      const availH = pageH - pad * 2;
      let size = Math.min(maxPx, Math.floor(availH / (lines.length * lh)));
      size = Math.max(minPx, size);
      meas.font = weight + ' ' + size + 'px ' + fontCss;
      const w = Math.max(...lines.map((l) => meas.measureText(l).width), 1);
      pageW = Math.ceil(w + pad * 2);
      box = { size, lines };
    } else if (!landscape && !fixedLen) {
      // Breite fix, Höhe wächst: größte Schrift ≤ max, die ohne Wortbruch in die Breite passt.
      pageW = paperPx;
      const availW = pageW - pad * 2;
      let chosen = null;
      for (let size = maxPx; size >= minPx; size -= 2) {
        meas.font = weight + ' ' + size + 'px ' + fontCss;
        const lines = wrapAll(meas, text, availW);
        if (lines) { chosen = { size, lines }; break; }
      }
      if (!chosen) { meas.font = weight + ' ' + minPx + 'px ' + fontCss; chosen = { size: minPx, lines: wrapAll(meas, text, availW, true) }; }
      pageH = Math.ceil(chosen.lines.length * chosen.size * lh + pad * 2);
      box = chosen;
    } else {
      // Feste Etikettenlänge: Text in das Rechteck einpassen (min..max).
      pageW = landscape ? fixedLen : paperPx;
      pageH = landscape ? paperPx : fixedLen;
      const availW = pageW - pad * 2; const availH = pageH - pad * 2;
      let chosen = null;
      for (let size = maxPx; size >= minPx; size -= 2) {
        meas.font = weight + ' ' + size + 'px ' + fontCss;
        const lines = wrapAll(meas, text, availW);
        if (lines && lines.length * size * lh <= availH) { chosen = { size, lines }; break; }
      }
      if (!chosen) { meas.font = weight + ' ' + minPx + 'px ' + fontCss; chosen = { size: minPx, lines: wrapAll(meas, text, availW, true) }; }
      box = chosen;
    }

    drawContent = (ctx) => {
      ctx.fillStyle = fg;
      ctx.font = weight + ' ' + box.size + 'px ' + fontCss;
      ctx.textBaseline = 'middle';
      ctx.textAlign = L.hAlign;
      const lineH = box.size * lh;
      const total = box.lines.length * lineH;
      const top = L.vAlign === 'top' ? pad : L.vAlign === 'bottom' ? pageH - pad - total : (pageH - total) / 2;
      const x = L.hAlign === 'left' ? pad : L.hAlign === 'right' ? pageW - pad : pageW / 2;
      box.lines.forEach((line, i) => ctx.fillText(line, x, top + lineH * (i + 0.5)));
    };
  } else {
    // Zeichnung (Striche) oder Bild
    let srcW, srcH;
    if (content.strokes?.length) {
      const b = bounds(content.strokes);
      srcW = Math.max(1, b.maxX - b.minX); srcH = Math.max(1, b.maxY - b.minY);
    } else {
      srcW = content.canvas.width; srcH = content.canvas.height;
    }
    const aspect = srcH / srcW;
    if (landscape) {
      pageH = paperPx;
      pageW = fixedLen || Math.round((pageH - pad * 2) / aspect + pad * 2);
    } else {
      pageW = paperPx;
      pageH = fixedLen || Math.round((pageW - pad * 2) * aspect + pad * 2);
    }
    pageW = Math.max(pageW, 16); pageH = Math.max(pageH, 16);
    drawContent = (ctx) => {
      const availW = pageW - pad * 2; const availH = pageH - pad * 2;
      const s = Math.min(availW / srcW, availH / srcH);
      const w = srcW * s; const hgt = srcH * s;
      const ox = L.hAlign === 'left' ? pad : L.hAlign === 'right' ? pageW - pad - w : (pageW - w) / 2;
      const oy = L.vAlign === 'top' ? pad : L.vAlign === 'bottom' ? pageH - pad - hgt : (pageH - hgt) / 2;
      if (content.strokes?.length) {
        const b = bounds(content.strokes);
        ctx.strokeStyle = fg;
        ctx.lineWidth = Math.max(3, Math.min(availW, availH) / 55);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const st of content.strokes) {
          if (!st.length) continue;
          ctx.beginPath();
          st.forEach((p, i) => {
            const x = ox + (p.x - b.minX) * s; const y = oy + (p.y - b.minY) * s;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          });
          if (st.length === 1) ctx.lineTo(ox + (st[0].x - b.minX) * s + 0.5, oy + (st[0].y - b.minY) * s);
          ctx.stroke();
        }
      } else {
        if (L.invert) ctx.filter = 'invert(1)';
        ctx.drawImage(content.canvas, ox, oy, w, hgt);
        ctx.filter = 'none';
      }
    };
  }

  // Leseansicht zeichnen
  const page = document.createElement('canvas');
  page.width = pageW; page.height = pageH;
  const ctx = page.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, pageW, pageH);
  if (L.tilt) {
    ctx.save();
    ctx.translate(pageW / 2, pageH / 2);
    ctx.rotate(L.tilt * Math.PI / 180);
    ctx.translate(-pageW / 2, -pageH / 2);
  }
  drawContent(ctx);
  if (L.tilt) ctx.restore();
  if (L.border) {
    ctx.strokeStyle = fg;
    ctx.lineWidth = 3;
    ctx.strokeRect(Math.max(2, pad / 2), Math.max(2, pad / 2), pageW - Math.max(4, pad), pageH - Math.max(4, pad));
  }

  // Für den Drucker drehen: Druckbreite = paperPx, Länge = Laufrichtung
  let print = page;
  if (landscape) {
    print = document.createElement('canvas');
    print.width = pageH; print.height = pageW;
    const p = print.getContext('2d');
    if (L.orientation === 'landscapeRight') { p.translate(pageH, 0); p.rotate(Math.PI / 2); }
    else { p.translate(0, pageW); p.rotate(-Math.PI / 2); }
    p.drawImage(page, 0, 0);
  }
  return { page, print };
}

function bounds(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

/** Zeilenumbruch über alle Absätze. force=true bricht zu lange Wörter hart um statt null zu liefern. */
function wrapAll(ctx, text, maxW, force = false) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let word of words) {
      if (ctx.measureText(word).width > maxW) {
        if (!force) return null;
        // hart umbrechen
        if (line) { out.push(line); line = ''; }
        let part = '';
        for (const ch of word) {
          if (ctx.measureText(part + ch).width > maxW && part) { out.push(part); part = ch; } else part += ch;
        }
        word = part;
      }
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}
