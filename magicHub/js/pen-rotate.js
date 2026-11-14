// Stift-Zeichnung automatisch drehen (Blatt liegt quer oder auf dem Kopf).
// Verfahren wie in der Peekbox-Firmware (peekbox_s3/src/pen.cpp, „Stift auto-drehen“):
//  - Schrift läuft von links nach rechts: Aufeinanderfolgende Striche derselben Zeile wandern in Schreibrichtung.
//    Jeder Schritt zwischen zwei Strich-Schwerpunkten stimmt für eine der vier Richtungen (+x, +y, −x, −y).
//  - Eine lange, gerade Linie gibt die Richtung direkt vor (in Zugrichtung); danach entscheidet nur eine klare Mehrheit.
//  - Hysterese: Gewechselt wird nur mit klarem Vorsprung, sonst bleibt die bisherige Drehung (Blatt liegt meist gleich).
// Drehung: 0 = normal, 1 = quer (Schrift läuft nach unten), 2 = auf dem Kopf, 3 = quer andersherum.
// Koordinaten in Stift-Einheiten × 256 (wie Ultra Sharpie-Treiber und Firmware).

export const ROT_NAMES = ['normal', 'quer (90°)', 'auf dem Kopf', 'quer (270°)'];
const LINE_MIN = 3200; // gerader Strich ab dieser Länge (~3 cm) = Schreibrichtung

/** @returns {{ rot: number, why: string }} */
export function detectRotation(strokes, prev = 0) {
  const list = [];
  for (const st of strokes || []) {
    if (!st || st.length < 2) continue;
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, sx = 0, sy = 0, path = 0;
    st.forEach((p, i) => {
      if (i) path += Math.hypot(p.x - st[i - 1].x, p.y - st[i - 1].y);
      mnX = Math.min(mnX, p.x); mxX = Math.max(mxX, p.x); mnY = Math.min(mnY, p.y); mxY = Math.max(mxY, p.y);
      sx += p.x; sy += p.y;
    });
    const a = st[0], b = st[st.length - 1];
    list.push({ cx: sx / st.length, cy: sy / st.length, sz: Math.max(mxX - mnX, mxY - mnY, 1), dx: b.x - a.x, dy: b.y - a.y, path });
  }
  if (!list.length) return { rot: prev, why: 'keine Striche' };
  const sizes = list.map((s) => s.sz).sort((x, y) => x - y);
  const charSz = sizes[Math.floor(sizes.length / 2)]; // typische Strichgröße

  let lineRot = -1, from = 1;
  list.forEach((s, i) => {
    const len = Math.hypot(s.dx, s.dy), ax = Math.abs(s.dx), ay = Math.abs(s.dy);
    if (len < LINE_MIN || len < s.path * 0.9) return;          // zu kurz / nicht gerade
    if (list.length >= 3 && len < charSz * 2.5) return;       // nur ein großer Buchstabe
    if (ax > ay * 2) lineRot = s.dx > 0 ? 0 : 2;
    else if (ay > ax * 2) lineRot = s.dy > 0 ? 1 : 3;
    else return;                                               // schräg
    from = i + 2;                                              // Schritte erst nach der Linie werten
  });

  const votes = [0, 0, 0, 0];
  for (let i = from; i < list.length; i++) {
    const dx = list[i].cx - list[i - 1].cx, dy = list[i].cy - list[i - 1].cy;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < charSz * 0.15) continue;  // i-Punkt, Überstreichen …
    if (Math.max(ax, ay) > charSz * 3) continue;     // Zeilenwechsel, Sprung übers Blatt
    if (ax > ay * 1.5) votes[dx > 0 ? 0 : 2]++;
    else if (ay > ax * 1.5) votes[dy > 0 ? 1 : 3]++;
  }
  let best = 0;
  for (let r = 1; r < 4; r++) if (votes[r] > votes[best]) best = r;
  const second = Math.max(...votes.filter((_, r) => r !== best));
  const why = 'Stimmen ' + votes.join('/');
  if (lineRot >= 0) {
    if (best !== lineRot && votes[best] >= 3 && votes[best] - second >= 3) return { rot: best, why };
    return { rot: lineRot, why: 'Linie' };
  }
  if (best !== prev && votes[best] >= 2 && votes[best] - second >= 2) return { rot: best, why };
  return { rot: prev, why: why + ' – bleibt' };
}

/** Striche so drehen, dass die Schreibrichtung nach rechts zeigt (Lage egal, Zeichnen normiert die Box). */
export function rotateStrokes(strokes, rot) {
  const r = ((rot % 4) + 4) % 4;
  if (!r) return strokes;
  const f = [null, (p) => ({ x: p.y, y: -p.x }), (p) => ({ x: -p.x, y: -p.y }), (p) => ({ x: -p.y, y: p.x })][r];
  return strokes.map((st) => st.map(f));
}
