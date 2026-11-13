// Text und Zeichnungen in Canvas-Bilder verwandeln (für Selfie Screen, Drucker, KI).

const FONT = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';

/** Text möglichst groß und zentriert in w×h. */
export function textCanvas(text, w, h, { bg = '#000', fg = '#fff', weight = 700 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const pad = Math.round(Math.min(w, h) * 0.08);
  for (let size = Math.round(h * 0.6); size >= 10; size -= 2) {
    ctx.font = weight + ' ' + size + 'px ' + FONT;
    const lines = wrap(ctx, words, w - pad * 2);
    const lh = size * 1.15;
    if (lines && lines.length * lh <= h - pad * 2) {
      const top = h / 2 - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, top + i * lh));
      return c;
    }
  }
  ctx.font = weight + ' 10px ' + FONT;
  ctx.fillText(String(text).slice(0, 40), w / 2, h / 2);
  return c;
}

function wrap(ctx, words, maxW) {
  const lines = [];
  let line = '';
  for (const word of words) {
    if (ctx.measureText(word).width > maxW) return null;
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Druckstreifen: feste Breite, Höhe passend zum Text. */
export function printTextCanvas(text, width = 384) {
  const size = Math.round(width / 7);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '700 ' + size + 'px ' + FONT;
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    const l = wrap(ctx, para.split(/\s+/).filter(Boolean), width - 24) || [para];
    lines.push(...(l.length ? l : ['']));
  }
  c.width = width;
  c.height = Math.max(1, lines.length) * size * 1.2 + 32;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  ctx.font = '700 ' + size + 'px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, width / 2, 16 + i * size * 1.2));
  return c;
}

/** Strichliste [[{x,y}…]…] auf Bounding-Box normiert zeichnen. */
export function drawingCanvas(strokes, w, h, { bg = '#fff', fg = '#111', line = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const pts = strokes.flat();
  if (!pts.length) return c;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = Math.min(w, h) * 0.1;
  const s = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
  const ox = (w - (maxX - minX) * s) / 2; const oy = (h - (maxY - minY) * s) / 2;
  ctx.strokeStyle = fg;
  ctx.lineWidth = line || Math.max(2, Math.min(w, h) / 60);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of strokes) {
    if (!st.length) continue;
    ctx.beginPath();
    st.forEach((p, i) => {
      const x = ox + (p.x - minX) * s; const y = oy + (p.y - minY) * s;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    if (st.length === 1) ctx.lineTo(ox + (st[0].x - minX) * s + 0.1, oy + (st[0].y - minY) * s);
    ctx.stroke();
  }
  return c;
}

/** Canvas in Zielgröße einpassen (für Vorschau). */
export function fitInto(src, w, h, bg = '#000') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const s = Math.min(w / src.width, h / src.height);
  ctx.drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
  return c;
}

/** Demo-Zeichnung (Stern/Haus/Herz) in Stift-ähnlichen Einheiten. */
export function demoStrokes() {
  const shapes = [
    // Haus
    [[[0, 60], [0, 20], [30, 0], [60, 20], [60, 60], [0, 60]], [[22, 60], [22, 38], [38, 38], [38, 60]]],
    // Herz
    [[[30, 55], [5, 30], [2, 15], [10, 4], [22, 4], [30, 14], [38, 4], [50, 4], [58, 15], [55, 30], [30, 55]]],
    // Stern
    [[[30, 0], [38, 22], [60, 22], [42, 36], [50, 60], [30, 45], [10, 60], [18, 36], [0, 22], [22, 22], [30, 0]]],
  ];
  const pick = shapes[Math.floor(Math.random() * shapes.length)];
  return pick.map((s) => s.map(([x, y]) => ({ x: x * 100, y: y * 100 })));
}
