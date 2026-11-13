// KI-Erkennung von Stift-Zeichnungen mit wählbarem Anbieter und eigenem API-Key.
// Alle Aufrufe gehen direkt vom Browser an den jeweiligen Anbieter; Keys liegen nur im localStorage dieses Geräts.
// Wer Zugriff auf Gerät/Browser hat, kann Keys auslesen → eigene Keys mit Ausgabenlimit verwenden.
//
// Status: Claude nach aktueller API-Referenz gebaut; OpenAI, Gemini, Google Vision und lokale KI nach
// öffentlicher Doku – alles noch NICHT mit echten Keys getestet. Lokale KI ist experimentell (Chrome-Funktionen).

export const AI_TASKS = {
  handwriting: {
    label: 'Handschrift → Text',
    prompt: 'Auf dem Bild steht etwas Handgeschriebenes (Wort, Name, Zahl oder Spielkarte). ' +
      'Antworte ausschließlich mit dem erkannten Text, ohne Anführungszeichen und ohne Erklärung. ' +
      'Spielkarten im Format „Herz Dame“. Ist nichts lesbar, antworte mit „?“.',
  },
  drawing: {
    label: 'Zeichnung → Begriff',
    prompt: 'Auf dem Bild ist eine schnelle Strichzeichnung. Antworte ausschließlich mit dem gezeichneten Begriff ' +
      'als ein bis zwei deutsche Wörter, ohne Erklärung. Ist nichts erkennbar, antworte mit „?“.',
  },
};

export const PROVIDERS = {
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
    note: 'Key bei aistudio.google.com. Modellname bei Bedarf anpassen.',
  },
  gvision: {
    label: 'Google Cloud Vision',
    needsKey: true,
    keyHint: 'AIza…',
    note: 'Reine Texterkennung (OCR), sehr gut für Handschrift. „Zeichnung → Begriff“ liefert englische Labels. Key in der Google Cloud Console mit aktivierter Vision API.',
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
    this.provider = 'claude';
    this.keys = {}; // provider → key
    this.models = {}; // provider → Modellname
    this.task = 'handwriting';
    this.auto = true;
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

  /** @param {HTMLCanvasElement} canvas  weißer Hintergrund, dunkle Striche */
  async recognize(canvas) {
    if (!this.ready) throw new Error('Bitte zuerst einen API-Key für ' + PROVIDERS[this.provider].label + ' eintragen.');
    if (this.busy) throw new Error('Erkennung läuft bereits');
    this.busy = true;
    this._set('connecting', 'Erkenne …');
    try {
      const b64 = canvas.toDataURL('image/png').split(',')[1];
      const prompt = AI_TASKS[this.task].prompt;
      const run = { claude, openai, gemini, gvision, local }[this.provider];
      const text = clean(await run({ key: this.key, model: this.model, b64, canvas, prompt, task: this.task }));
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
