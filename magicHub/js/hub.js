// Hub: Quellen veröffentlichen Ereignisse, Kombis (Regeln) entscheiden, was wann wohin geht.
//
// Ereignis (payload):
//   { kind: 'text',    text }                      z. B. Würfelsumme, Inject-Wort, KI-Ergebnis
//   { kind: 'image',   strokes?, canvas?, text? }  z. B. Stift-Zeichnung
//   { kind: 'trigger', text }                      z. B. Taste (text = Name der Taste)
//
// Kombi (Regel):
// {
//   id, name, enabled,
//   source,                                   Auslöser (Quellen-ID)
//   when: { type, value, min, max },          Bedingung: any | is | not | contains | range | even | odd
//   content: 'event' | 'last' | 'fixed',      was gesendet wird: Wert des Auslösers, letzter Inhalt, nur Vorlage
//   map: '1=Pik Ass\n2=Herz Dame\n*=?',       optionale Zuordnung Wert → Text (vor der Vorlage)
//   template: '{text}',                       Text-Vorlage
//   actions: [{ target, do: 'show'|'clear', delay, hideAfter }],   Sekunden
//   cooldown, onlyNew, once                   Sperrzeit (s), nur bei neuem Wert, nur einmal (dann aus)
// }

const STORE_KEY = 'magichub_v1';

export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}

export function saveStore(patch) {
  try {
    const cur = loadStore();
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch { /* privater Modus: nur für diese Sitzung */ }
}

export const CONDITIONS = {
  any: 'Immer',
  is: 'Wert ist genau …',
  not: 'Wert ist nicht …',
  contains: 'Wert enthält …',
  range: 'Zahl zwischen …',
  even: 'Zahl ist gerade',
  odd: 'Zahl ist ungerade',
};

export const CONTENTS = {
  event: 'Wert des Auslösers',
  last: 'Letzten Inhalt erneut senden',
  fixed: 'Nur eigenen Text (Vorlage)',
};

export const TEMPLATE_VARS = '{text} Wert · {quelle} Auslöser · {letzter} letzter Inhalt · {zähler} wie oft ausgelöst · {uhrzeit} · {datum}';

const act = (target, extra = {}) => ({ target, do: 'show', delay: 0, hideAfter: 0, ...extra });

export const PRESETS = [
  { name: 'Würfelsumme aufs PeekSmith', source: 'godice', actions: [act('peeksmith')] },
  { name: 'Würfel → Spielkarte (Zuordnung)', source: 'godice', map: '1=Pik Ass\n2=Herz Zwei\n3=Karo Drei\n4=Kreuz Vier\n5=Herz Fünf\n6=Pik Sechs', actions: [act('peeksmith', { hideAfter: 8 })] },
  { name: 'Stift-Zeichnung auf den Selfie Screen', source: 'pen', actions: [act('selfie')] },
  { name: 'Handschrift (KI) aufs PeekSmith', source: 'ai', actions: [act('peeksmith')] },
  { name: 'Inject-Wort aufs PeekSmith, nach 10 s weg', source: 'inject', actions: [act('peeksmith', { hideAfter: 10 })] },
  { name: 'Palette-Farbe ansagen & anzeigen', source: 'davinci', actions: [act('peeksmith'), act('speech')] },
  { name: 'Würfelsumme als Vibration zählen', source: 'godice', actions: [act('vibrate')] },
  { name: 'Selfie-Auslöser druckt letzten Inhalt', source: 'selfie-buttons', when: { type: 'is', value: 'Auslöser' }, content: 'last', actions: [act('printer')] },
  { name: 'PeekSmith-Taste rechts lang: Display leeren', source: 'peeksmith-buttons', when: { type: 'is', value: 'Rechts lang' }, actions: [act('peeksmith', { do: 'clear' })] },
];

/** Alte (v0.1) Kombis und unvollständige Daten in das aktuelle Format bringen. */
export function normalizeCombo(c, sources) {
  const out = {
    id: c.id || 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: c.name || '',
    enabled: c.enabled !== false,
    source: c.source,
    when: { type: 'any', value: '', min: '', max: '', ...(c.when || {}) },
    content: c.content || (sources?.get(c.source)?.kind === 'trigger' ? 'last' : 'event'),
    map: c.map || '',
    template: c.template || '{text}',
    actions: Array.isArray(c.actions) ? c.actions.map((a) => act(a.target, a)) : (c.targets || []).map((t) => act(t)),
    cooldown: Number(c.cooldown) || 0,
    onlyNew: !!c.onlyNew,
    once: !!c.once,
  };
  if (!CONDITIONS[out.when.type]) out.when.type = 'any';
  if (!CONTENTS[out.content]) out.content = 'event';
  return out;
}

export function parseMap(text) {
  const map = new Map();
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf('=');
    if (i < 1) continue;
    for (const key of line.slice(0, i).split(',')) {
      const k = key.trim().toLowerCase();
      if (k) map.set(k, line.slice(i + 1).trim());
    }
  }
  return map;
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Prüft die Bedingung einer Kombi gegen den Wert des Ereignisses. */
export function matches(when, value) {
  const v = String(value ?? '').trim().toLowerCase();
  const list = () => String(when.value || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  switch (when.type) {
    case 'is': return list().includes(v);
    case 'not': return !list().includes(v);
    case 'contains': return list().some((x) => v.includes(x));
    case 'range': {
      const n = num(v); const lo = num(when.min); const hi = num(when.max);
      return n != null && (lo == null || n >= lo) && (hi == null || n <= hi);
    }
    case 'even': { const n = num(v); return n != null && n % 2 === 0; }
    case 'odd': { const n = num(v); return n != null && Math.abs(n % 2) === 1; }
    default: return true;
  }
}

export class Hub extends EventTarget {
  constructor() {
    super();
    this.sources = new Map();
    this.targets = new Map();
    this._rawCombos = Array.isArray(loadStore().combos) ? loadStore().combos : [];
    this.combos = [];
    this.last = null; // letzter Text/Bild-Inhalt
    this._state = new Map(); // comboId → { count, lastValue, lastFire }
    this._timers = new Set();
  }

  /** Nach dem Registrieren der Quellen aufrufen (für die Migration alter Kombis). */
  init() {
    this.combos = this._rawCombos.filter((c) => c?.source).map((c) => normalizeCombo(c, this.sources));
    saveStore({ combos: this.combos });
  }

  registerSource(def) { this.sources.set(def.id, def); }
  registerTarget(def) { this.targets.set(def.id, def); }

  _save() { saveStore({ combos: this.combos }); this.dispatchEvent(new CustomEvent('combos')); }

  addCombo(c) {
    const combo = normalizeCombo({ ...c, id: undefined }, this.sources);
    this.combos.push(combo);
    this._save();
    return combo;
  }

  updateCombo(id, patch) {
    const i = this.combos.findIndex((x) => x.id === id);
    if (i >= 0) { this.combos[i] = normalizeCombo({ ...this.combos[i], ...patch, id }, this.sources); this._save(); }
  }

  removeCombo(id) {
    this.combos = this.combos.filter((x) => x.id !== id);
    this._state.delete(id);
    this._save();
  }

  moveCombo(id, dir) {
    const i = this.combos.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.combos.length) return;
    [this.combos[i], this.combos[j]] = [this.combos[j], this.combos[i]];
    this._save();
  }

  /** Kann Ziel t den Inhalt dieser Kombi darstellen? */
  compatible(sourceId, targetId, contentMode = 'event') {
    const s = this.sources.get(sourceId); const t = this.targets.get(targetId);
    if (!s || !t) return false;
    if (contentMode !== 'event' || s.kind === 'trigger') return true;
    if (s.kind === 'image') return t.accepts.includes('image') || t.accepts.includes('text');
    return t.accepts.includes('text');
  }

  publish(sourceId, payload) {
    const src = this.sources.get(sourceId);
    const event = { ...payload, source: sourceId };
    this._activity({ dir: 'in', source: sourceId, label: src?.label || sourceId, payload: event });
    const combos = this.combos.filter((c) => c.enabled && c.source === sourceId);
    let fired = 0;
    for (const combo of combos) if (this.fire(combo, event)) fired++;
    // Erst nach dem Auswerten merken, damit „letzter Inhalt“ wirklich der vorherige ist.
    if (payload.kind !== 'trigger') this.last = event;
    if (!combos.length) this.dispatchEvent(new CustomEvent('unrouted', { detail: { source: sourceId } }));
    return fired;
  }

  /** Eine Kombi mit einem Ereignis auswerten und ausführen. force = Bedingung/Sperren ignorieren (Testknopf). */
  fire(combo, event, { force = false } = {}) {
    const st = this._state.get(combo.id) || { count: 0, lastValue: undefined, lastFire: 0 };
    const value = event.text ?? '';
    if (!force) {
      if (!matches(combo.when, value)) return false;
      if (combo.cooldown > 0 && Date.now() - st.lastFire < combo.cooldown * 1000) {
        this._activity({ dir: 'skip', label: comboLabel(this, combo), message: 'Sperrzeit läuft' });
        return false;
      }
      if (combo.onlyNew && st.lastValue === value) return false;
    }
    st.count++; st.lastValue = value; st.lastFire = Date.now();
    this._state.set(combo.id, st);

    // Inhalt bestimmen
    let content;
    if (combo.content === 'last') content = this.last || { kind: 'text', text: '', source: event.source };
    else if (combo.content === 'fixed') content = { kind: 'text', text: '', source: event.source };
    else content = event;
    if (!content) return false;

    let text = content.text;
    if (text != null && combo.map.trim()) {
      const m = parseMap(combo.map);
      const key = String(text).trim().toLowerCase();
      if (m.has(key)) text = m.get(key);
      else if (m.has('*')) text = m.get('*');
    }
    const now = new Date();
    const vars = {
      text: text ?? '',
      quelle: this.sources.get(event.source)?.label || '',
      letzter: this.last?.text ?? '',
      zähler: String(st.count),
      zaehler: String(st.count),
      uhrzeit: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      datum: now.toLocaleDateString('de-DE'),
    };
    const tpl = combo.content === 'fixed' && combo.template === '{text}' ? '' : combo.template;
    const rendered = (tpl || '{text}').replace(/\{(text|quelle|letzter|zähler|zaehler|uhrzeit|datum)\}/g, (_, k) => vars[k]);
    const keepImage = content.kind === 'image' && (content.strokes || content.canvas);
    const out = keepImage
      ? { ...content, text: content.text != null ? rendered : undefined }
      : { kind: 'text', text: rendered, source: content.source };

    for (const a of combo.actions) {
      const run = () => (a.do === 'clear' ? this.clear(a.target) : this.deliver(a.target, out, combo));
      this._later(a.delay, run);
      if (a.do !== 'clear' && a.hideAfter > 0) this._later(Number(a.delay || 0) + Number(a.hideAfter), () => this.clear(a.target));
    }
    if (combo.once && !force) this.updateCombo(combo.id, { enabled: false });
    return true;
  }

  _later(seconds, fn) {
    const ms = Math.max(0, Number(seconds) || 0) * 1000;
    if (!ms) { fn(); return; }
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
  }

  /** Alle geplanten (verzögerten) Aktionen abbrechen. */
  cancelPending() {
    for (const t of this._timers) clearTimeout(t);
    const n = this._timers.size;
    this._timers.clear();
    return n;
  }

  async deliver(targetId, content) {
    const t = this.targets.get(targetId);
    if (!t) return;
    let out = content;
    if (out.kind === 'image' && !t.accepts.includes('image')) {
      if (out.text == null) return;
      out = { kind: 'text', text: out.text, source: out.source };
    }
    this._activity({ dir: 'out', target: targetId, label: t.label, payload: out });
    try {
      await t.deliver(out);
    } catch (err) {
      this._activity({ dir: 'error', target: targetId, label: t.label, message: err.message });
    }
  }

  async clear(targetId) {
    const t = this.targets.get(targetId);
    if (!t?.clear) return;
    this._activity({ dir: 'out', target: targetId, label: t.label, message: 'leeren' });
    try { await t.clear(); } catch (err) {
      this._activity({ dir: 'error', target: targetId, label: t.label, message: err.message });
    }
  }

  _activity(detail) {
    this.dispatchEvent(new CustomEvent('activity', { detail: { ...detail, time: new Date() } }));
  }
}

/** Kurzbeschreibung einer Kombi für Liste und Protokoll. */
export function comboLabel(hub, c) {
  if (c.name) return c.name;
  const s = hub.sources.get(c.source)?.label || c.source;
  return s + ' → ' + c.actions.map((a) => hub.targets.get(a.target)?.label || a.target).join(', ');
}

export function describeWhen(w) {
  switch (w.type) {
    case 'is': return '= ' + w.value;
    case 'not': return '≠ ' + w.value;
    case 'contains': return 'enthält ' + w.value;
    case 'range': return (w.min !== '' ? w.min : '…') + ' bis ' + (w.max !== '' ? w.max : '…');
    case 'even': return 'gerade';
    case 'odd': return 'ungerade';
    default: return '';
  }
}
