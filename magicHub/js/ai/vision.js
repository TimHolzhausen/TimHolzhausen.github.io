// KI-Erkennung von Stift-Zeichnungen mit wählbarem Anbieter und eigenem API-Key.
// Alle Aufrufe gehen direkt vom Browser an den jeweiligen Anbieter; Keys liegen nur im localStorage dieses Geräts.
// Wer Zugriff auf Gerät/Browser hat, kann Keys auslesen → eigene Keys mit Ausgabenlimit verwenden.
//
// Status: Claude nach aktueller API-Referenz gebaut; OpenAI, Gemini, Google Vision und lokale KI nach
// öffentlicher Doku – alles noch NICHT mit echten Keys getestet. Lokale KI ist experimentell (Chrome-Funktionen).

import { parseCard, cardName, normalizeSuitSymbols } from '../stacks.js';
import { rotateStrokes } from '../pen-rotate.js';

// Hinweis für KI-Modelle: Das Blatt kann beim Schreiben quer oder verkehrt herum gelegen haben.
const ROT_HINT = ' Die Zeichnung kann gedreht sein (um 90° seitlich oder auf dem Kopf) – lies sie in der Lage, in der sie Sinn ergibt.';

export const AI_TASKS = {
  handwriting: {
    label: 'Handschrift → Text',
    prompt: 'Auf dem Bild steht etwas Handgeschriebenes (Wort, Name, Zahl oder Spielkarte). ' +
      'Antworte ausschließlich mit dem erkannten Text, ohne Anführungszeichen und ohne Erklärung. ' +
      'Spielkarten im Format „Herz Dame“. Ist nichts lesbar, antworte mit „?“.' + ROT_HINT,
  },
  card: {
    label: 'Spielkarte → Karte',
    prompt: 'Auf dem Bild ist eine handgeschriebene Spielkarte (z. B. „QH“, „HD“, „10♥“, „Herz Dame“). ' +
      'Antworte ausschließlich mit der Karte im Format „Herz Dame“ (Farben Kreuz, Pik, Herz, Karo; Werte Ass, 2–10, Bube, Dame, König), ohne Erklärung. ' +
      'Ist nichts lesbar, antworte mit „?“.' + ROT_HINT,
  },
  drawing: {
    label: 'Zeichnung → Begriff',
    prompt: 'Auf dem Bild ist eine schnelle Strichzeichnung. Antworte ausschließlich mit dem gezeichneten Begriff ' +
      'als ein bis zwei deutsche Wörter, ohne Erklärung. Ist nichts erkennbar, antworte mit „?“.' + ROT_HINT,
  },
};

export const PROVIDERS = {
  ghand: {
    label: 'Google Handschrift (kostenlos)',
    needsKey: false,
    free: true,
    note: 'Kostenlos, ohne Key. Nutzt die Stift-Striche direkt (wie die Google-Tastatur) – sehr gut für Wörter, Zahlen und Namen. ' +
      'Inoffizielle Schnittstelle von Google: kann sich ohne Ankündigung ändern. „Zeichnung → Begriff“ funktioniert auch (häufige Begriffe auf Deutsch, sonst englisch).',
  },
  tesseract: {
    label: 'Tesseract (kostenlos, offline)',
    needsKey: false,
    free: true,
    note: 'Kostenlose Texterkennung direkt im Browser. Lädt einmalig ca. 5–10 MB, danach offline. ' +
      'Gut für Druckbuchstaben, schwach bei Schreibschrift. Nur „Handschrift → Text“.',
  },
  claude: {
    label: 'Claude (Anthropic)',
    needsKey: true,
    keyHint: 'sk-ant-…',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    defaultModel: 'claude-opus-5-5',
    note: 'Key bei console.anthropic.com anlegen.',
  },
  openai: {
    label: 'OpenAI',
    needsKey: true,
    keyHint: 'sk-…',
    defaultModel: 'gpt-4o-mini',
    freeModel: true,
    note: 'Key bei platform.openai.com. Modellname bei Bedarf anpassen.',
  },
  gemini: {
    label: 'Google Gemini',
    needsKey: true,
    keyHint: 'AIza…',
    defaultModel: 'gemini-2.5-flash',
    freeModel: true,
    note: 'Key bei aistudio.google.com – dort gibt es meist eine kostenlose Stufe mit Tageslimit. Modellname bei Bedarf anpassen.',
  },
  gvision: {
    label: 'Google Cloud Vision',
    needsKey: true,
    keyHint: 'AIza…',
    note: 'Reine Texterkennung (OCR), sehr gut für Handschrift. Die ersten 1000 Bilder pro Monat sind kostenlos. „Zeichnung → Begriff“ liefert englische Labels. Key in der Google Cloud Console mit aktivierter Vision API.',
  },
  local: {
    label: 'Lokal auf dem Gerät (experimentell)',
    needsKey: false,
    note: 'Nutzt eingebaute Browser-KI (Chrome Prompt-API bzw. Text-Erkennung), falls vorhanden. Keine Daten verlassen das Gerät. Auf den meisten Handys noch nicht verfügbar.',
  },
};

export class AiVision extends EventTarget {
  constructor() {
    super();
    this.id = 'ai';
    this.label = 'KI';
    this.provider = 'ghand';
    this.keys = {}; // provider → key
    this.models = {}; // provider → Modellname
    this.task = 'handwriting';
    this.auto = true;
    // Gedrehte Zeichnungen: Google Handschrift (nur Spielkarte) und Tesseract probieren alle vier Lagen.
    this.tryRotations = true;
    this.lastRotation = 0;
    this.status = 'idle';
    this.statusMessage = 'Nicht eingerichtet';
    this.busy = false;
  }

  get key() { return (this.keys[this.provider] || '').trim(); }
  get model() { return (this.models[this.provider] || PROVIDERS[this.provider].defaultModel || '').trim(); }
  get ready() { return !PROVIDERS[this.provider].needsKey || !!this.key; }
  get connected() { return this.ready; }

  refreshStatus() {
    const p = PROVIDERS[this.provider];
    this._set(this.ready ? 'connected' : 'idle', this.ready ? p.label.replace(/ \(.*\)/, '') + ' · ' + AI_TASKS[this.task].label : 'Kein API-Key');
  }

  _set(status, message) {
    this.status = status; this.statusMessage = message;
    this.dispatchEvent(new CustomEvent('status', { detail: { status, message } }));
  }

  /**
   * @param {HTMLCanvasElement} canvas  weißer Hintergrund, dunkle Striche
   * @param {Array<Array<{x,y}>>} [strokes]  Original-Striche (für Google Handschrift)
   */
  async recognize(canvas, strokes = null) {
    if (!this.ready) throw new Error('Bitte zuerst einen API-Key für ' + PROVIDERS[this.provider].label + ' eintragen.');
    if (this.busy) throw new Error('Erkennung läuft bereits');
    this.busy = true;
    this._set('connecting', 'Erkenne …');
    try {
      const b64 = canvas.toDataURL('image/png').split(',')[1];
      const prompt = AI_TASKS[this.task].prompt;
      const run = { ghand, tesseract, claude, openai, gemini, gvision, local }[this.provider];
      const args = { key: this.key, model: this.model, b64, canvas, prompt, task: this.task, strokes };
      this.lastRotation = 0;
      let raw;
      if (this.tryRotations && this.provider === 'ghand' && this.task === 'card' && strokes?.length) {
        // Alle vier Lagen gleichzeitig. Gewinnt die Lage, in der eine gültige Karte am weitesten VORNE in der
        // Vorschlagsliste steht (Google liefert keine Sicherheitswerte). Beispiel „QH“ auf dem Kopf (Test 14.11.2026):
        // richtige Lage „QH“ an Platz 1, falsche Lage „H10“ erst an Platz 5. Gleichstand → bisherige Lage zuerst.
        const order = [0, 2, 1, 3];
        const all = await Promise.all(order.map((r) => ghandCandidates({ ...args, strokes: rotateStrokes(strokes, r) }).catch(() => [])));
        let best = -1, bestRank = Infinity;
        all.forEach((cands, i) => { const rank = cands.findIndex((c) => parseCard(c)); if (rank >= 0 && rank < bestRank) { best = i; bestRank = rank; } });
        if (best >= 0) { this.lastRotation = order[best]; raw = cardName(parseCard(all[best][bestRank])); } else raw = all[0][0] || '';
      } else if (this.tryRotations && this.provider === 'tesseract') {
        // Tesseract liefert eine Sicherheit → sicherste der vier Lagen.
        let best = null;
        for (const r of [0, 2, 1, 3]) {
          const res = await tesseractRaw(rotateCanvas(canvas, r), this.task);
          if (!best || res.confidence > best.confidence) best = { ...res, r };
        }
        this.lastRotation = best.r; raw = best.text;
      } else raw = await run(args);
      let text = clean(raw);
      if (this.task !== 'drawing') {
        // Gezeichnete Farbsymbole vereinheitlichen; eindeutige Karte mit Symbol → „Herz Dame“
        text = normalizeSuitSymbols(text);
        const code = parseCard(text);
        if (code && (this.task === 'card' || /[♥♦♠♣]/.test(text))) text = cardName(code);
      }
      this.refreshStatus();
      return text || '?';
    } catch (err) {
      const msg = err instanceof TypeError && /fetch/i.test(err.message) ? 'Keine Verbindung zum KI-Anbieter' : err.message;
      this._set('error', msg);
      throw new Error(msg);
    } finally {
      this.busy = false;
    }
  }
}

function clean(t) {
  return String(t || '').replace(/^["„“'\s]+|["“”'\s.]+$/g, '').trim();
}

async function postJson(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error?.message ? ' (' + json.error.message + ')' : '';
    if (res.status === 401 || res.status === 403) throw new Error('API-Key ungültig oder ohne Berechtigung' + detail);
    if (res.status === 429) throw new Error('Limit erreicht – kurz warten' + detail);
    if (res.status >= 500) throw new Error('Anbieter gerade überlastet' + detail);
    throw new Error('Fehler ' + res.status + detail);
  }
  return json;
}

// --- Claude (Anthropic Messages API, direkter Browser-Zugriff) ---
async function claude({ key, model, b64, prompt }) {
  const json = await postJson('https://api.anthropic.com/v1/messages', {
    'x-api-key': key,
    'anthropic-version': '2026-10-21',
    'anthropic-beta': 'server-side-fallback-2026-07-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }, {
    model,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  if (json.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.');
  return (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
}

// --- OpenAI (Chat Completions mit Bild) ---
async function openai({ key, model, b64, prompt }) {
  const json = await postJson('https://api.openai.com/v1/chat/completions', { authorization: 'Bearer ' + key }, {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
      ],
    }],
  });
  return json.choices?.[0]?.message?.content || '';
}

// --- Google Gemini (generateContent) ---
async function gemini({ key, model, b64, prompt }) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const json = await postJson(url, { 'x-goog-api-key': key }, {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: b64 } }] }],
  });
  return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ');
}

// --- Google Cloud Vision (OCR bzw. Labels) ---
async function gvision({ key, b64, task }) {
  const feature = task === 'handwriting' ? 'DOCUMENT_TEXT_DETECTION' : 'LABEL_DETECTION';
  const json = await postJson('https://vision.googleapis.com/v1/images:annotate', { 'x-goog-api-key': key }, {
    requests: [{ image: { content: b64 }, features: [{ type: feature, maxResults: 3 }], imageContext: { languageHints: ['de', 'en'] } }],
  });
  const r = json.responses?.[0] || {};
  if (r.error) throw new Error(r.error.message);
  if (task === 'handwriting') return (r.fullTextAnnotation?.text || '').replace(/\s+/g, ' ');
  return r.labelAnnotations?.[0]?.description || '';
}

// --- Lokal: Chrome Prompt-API (multimodal) oder Shape-Detection-TextDetector ---
export async function localAvailability() {
  try {
    if (typeof LanguageModel !== 'undefined') {
      const a = await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] });
      if (a && a !== 'unavailable') return 'Prompt-API (' + a + ')';
    }
  } catch { /* nicht verfügbar */ }
  if (typeof TextDetector !== 'undefined') return 'Text-Erkennung';
  return '';
}

async function local({ canvas, prompt, task }) {
  if (typeof LanguageModel !== 'undefined') {
    try {
      const a = await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] });
      if (a && a !== 'unavailable') {
        const session = await LanguageModel.create({ expectedInputs: [{ type: 'image' }] });
        try {
          return await session.prompt([{ role: 'user', content: [{ type: 'text', value: prompt }, { type: 'image', value: canvas }] }]);
        } finally { session.destroy?.(); }
      }
    } catch (err) { console.warn('[ai] Prompt-API:', err); }
  }
  if (task === 'handwriting' && typeof TextDetector !== 'undefined') {
    const found = await new TextDetector().detect(canvas);
    return found.map((f) => f.rawValue).join(' ');
  }
  throw new Error('Auf diesem Gerät/Browser ist keine lokale KI verfügbar.');
}

// --- Google Handschrift (inoffizielle Input-Tools-Schnittstelle, wie Google-Tastatur / AutoDraw) ---
// Erwartet Striche als [[xs], [ys], [ts]]. Antwort: ["SUCCESS", [[id, [Kandidaten…], …]]].
async function ghand(args) {
  const cands = await ghandCandidates(args);
  if (args.task === 'card') { const hit = cands.find((c) => parseCard(c)); return hit ? cardName(parseCard(hit)) : cands[0] || ''; }
  if (args.task === 'drawing') return DRAW_DE[String(cands[0] || '').toLowerCase()] || cands[0] || '';
  return cands[0] || '';
}

/** Kanvas um r × 90° im Uhrzeigersinn drehen (passend zu rotateStrokes). */
function rotateCanvas(src, r) {
  if (!r) return src;
  const c = document.createElement('canvas');
  c.width = r % 2 ? src.height : src.width;
  c.height = r % 2 ? src.width : src.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-r * Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Google Handschrift: alle Vorschläge (ohne Sicherheitswerte – die liefert die Schnittstelle nicht). */
async function ghandCandidates({ strokes, canvas, task }) {
  if (!strokes?.length) strokes = strokesFromCanvas(canvas);
  if (!strokes.length) throw new Error('Keine Striche zum Erkennen.');
  let maxX = 1, maxY = 1;
  for (const s of strokes) for (const p of s) { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  // Auf 0..1000 skalieren und lange Strecken mit Zwischenpunkten füllen (wie echte Stift-Abtastung).
  let minX = Infinity, minY = Infinity;
  for (const s of strokes) for (const p of s) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
  const scale = 1000 / Math.max(maxX - minX, maxY - minY, 1);
  const ink = strokes.filter((s) => s.length).map((s) => {
    const xs = [], ys = [], ts = [];
    let t = 0;
    s.forEach((p, i) => {
      const x = (p.x - minX) * scale, y = (p.y - minY) * scale;
      if (i) {
        const px = xs[xs.length - 1], py = ys[ys.length - 1];
        const steps = Math.floor(Math.hypot(x - px, y - py) / 15);
        for (let k = 1; k < steps; k++) { xs.push(Math.round(px + (x - px) * k / steps)); ys.push(Math.round(py + (y - py) * k / steps)); ts.push(t += 10); }
      }
      xs.push(Math.round(x)); ys.push(Math.round(y)); ts.push(t += 10);
    });
    return [xs, ys, ts];
  });
  maxX = maxY = 1000;
  const drawing = task === 'drawing';
  const url = 'https://inputtools.google.com/request?ime=handwriting&app=' + (drawing ? 'autodraw' : 'mobilesearch') + '&cs=1&oe=UTF-8';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      options: 'enable_pre_space',
      requests: [{ writing_guide: { writing_area_width: Math.round(maxX * 1.1), writing_area_height: Math.round(maxY * 1.1) }, ink, language: drawing ? 'quickdraw' : 'de' }],
    }),
  });
  if (!res.ok) throw new Error('Google Handschrift: Fehler ' + res.status);
  const json = await res.json();
  if (json?.[0] !== 'SUCCESS') throw new Error('Google Handschrift hat nichts erkannt.');
  return json[1]?.[0]?.[1] || [];
}

// Häufige Zeichen-Begriffe (Quick-Draw-Kategorien) auf Deutsch; Rest bleibt englisch.
const DRAW_DE = {
  house: 'Haus', heart: 'Herz', star: 'Stern', sun: 'Sonne', moon: 'Mond', tree: 'Baum', flower: 'Blume', car: 'Auto',
  cat: 'Katze', dog: 'Hund', fish: 'Fisch', bird: 'Vogel', apple: 'Apfel', banana: 'Banane', cloud: 'Wolke', key: 'Schlüssel',
  clock: 'Uhr', umbrella: 'Regenschirm', cup: 'Tasse', 'coffee cup': 'Kaffeetasse', glasses: 'Brille', eye: 'Auge', hat: 'Hut',
  book: 'Buch', boat: 'Boot', airplane: 'Flugzeug', bicycle: 'Fahrrad', guitar: 'Gitarre', bell: 'Glocke', candle: 'Kerze',
  crown: 'Krone', diamond: 'Diamant', door: 'Tür', duck: 'Ente', face: 'Gesicht', 'smiley face': 'Smiley', snowman: 'Schneemann',
  spider: 'Spinne', snake: 'Schlange', square: 'Quadrat', circle: 'Kreis', triangle: 'Dreieck', hexagon: 'Sechseck',
  'light bulb': 'Glühbirne', lightning: 'Blitz', mountain: 'Berg', pencil: 'Bleistift', scissors: 'Schere', sword: 'Schwert',
  television: 'Fernseher', 'wine glass': 'Weinglas', church: 'Kirche', castle: 'Burg', rainbow: 'Regenbogen', cake: 'Kuchen',
  'birthday cake': 'Geburtstagstorte', 'ice cream': 'Eis', pizza: 'Pizza', mushroom: 'Pilz', butterfly: 'Schmetterling',
  rabbit: 'Hase', horse: 'Pferd', pig: 'Schwein', cow: 'Kuh', elephant: 'Elefant', lion: 'Löwe', owl: 'Eule', hand: 'Hand',
  envelope: 'Briefumschlag', 'hot air balloon': 'Heißluftballon', 'the eiffel tower': 'Eiffelturm', anchor: 'Anker', arrow: 'Pfeil',
};

/** Notbehelf ohne Striche (z. B. Foto): keine Erkennung möglich. */
function strokesFromCanvas() { return []; }

// --- Tesseract.js (lokal im Browser, lädt Bibliothek + Sprachdaten von jsDelivr) ---
let tessWorker = null;
async function tesseract({ canvas, task }) {
  return (await tesseractRaw(canvas, task)).text;
}

async function tesseractRaw(canvas, task) {
  if (task === 'drawing') throw new Error('Tesseract kann nur Text erkennen, keine Zeichnungen.');
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Tesseract konnte nicht geladen werden (Internet?).'));
      document.head.append(s);
    });
  }
  if (!tessWorker) tessWorker = await window.Tesseract.createWorker(['deu', 'eng']);
  const { data } = await tessWorker.recognize(canvas);
  return { text: (data?.text || '').replace(/\s+/g, ' '), confidence: Number(data?.confidence) || 0 };
}
