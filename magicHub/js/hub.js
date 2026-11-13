// Hub: Quellen veröffentlichen Ereignisse, Kombinationen leiten sie an Ziele weiter.
//
// Ereignis (payload):
//   { kind: 'text',    text }                      z. B. Würfelsumme, Inject-Wort, KI-Ergebnis
//   { kind: 'image',   canvas, text? }             z. B. Stift-Zeichnung
//   { kind: 'trigger', text }                      z. B. Taste am PeekSmith → letzten Inhalt erneut ausgeben
//
// Kombination: { id, source, targets: [targetId…], template: '{text}', enabled }

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

export const PRESETS = [
  { name: 'Würfelsumme aufs PeekSmith', source: 'godice', targets: ['peeksmith'], template: '{text}' },
  { name: 'Stift-Zeichnung auf den Selfie Screen', source: 'pen', targets: ['selfie'], template: '{text}' },
  { name: 'Handschrift (KI) aufs PeekSmith', source: 'ai', targets: ['peeksmith'], template: '{text}' },
  { name: 'Inject-Wort aufs PeekSmith', source: 'inject', targets: ['peeksmith'], template: '{text}' },
  { name: 'Palette-Farbe ansagen & anzeigen', source: 'davinci', targets: ['peeksmith', 'speech'], template: '{text}' },
  { name: 'Selfie-Auslöser druckt letzten Inhalt', source: 'selfie-buttons', targets: ['printer'], template: '{text}' },
];

export class Hub extends EventTarget {
  constructor() {
    super();
    this.sources = new Map();
    this.targets = new Map();
    this.combos = Array.isArray(loadStore().combos) ? loadStore().combos : [];
    this.last = null; // letzter Text/Bild-Inhalt (für Trigger)
  }

  registerSource(def) { this.sources.set(def.id, def); }
  registerTarget(def) { this.targets.set(def.id, def); }

  _save() { saveStore({ combos: this.combos }); this.dispatchEvent(new CustomEvent('combos')); }

  addCombo(c) {
    this.combos.push({ id: 'c' + Date.now().toString(36), enabled: true, template: '{text}', ...c });
    this._save();
  }

  updateCombo(id, patch) {
    const c = this.combos.find((x) => x.id === id);
    if (c) { Object.assign(c, patch); this._save(); }
  }

  removeCombo(id) {
    this.combos = this.combos.filter((x) => x.id !== id);
    this._save();
  }

  /** Kann Ziel t diese Art von Inhalt darstellen? */
  compatible(sourceId, targetId) {
    const s = this.sources.get(sourceId); const t = this.targets.get(targetId);
    if (!s || !t) return false;
    if (s.kind === 'trigger') return true;
    if (s.kind === 'image') return t.accepts.includes('image') || t.accepts.includes('text');
    return t.accepts.includes('text');
  }

  publish(sourceId, payload) {
    const src = this.sources.get(sourceId);
    if (payload.kind !== 'trigger') this.last = { ...payload, source: sourceId };
    this._activity({ dir: 'in', source: sourceId, label: src?.label || sourceId, payload });
    const combos = this.combos.filter((c) => c.enabled && c.source === sourceId);
    for (const combo of combos) {
      const content = payload.kind === 'trigger' ? this.last : payload;
      if (!content) continue;
      for (const tid of combo.targets) this.deliver(tid, content, combo);
    }
    if (!combos.length) this.dispatchEvent(new CustomEvent('unrouted', { detail: { source: sourceId } }));
  }

  async deliver(targetId, content, combo = null) {
    const t = this.targets.get(targetId);
    if (!t) return;
    let out = content;
    if (content.kind === 'text' || (content.kind === 'image' && content.text != null)) {
      const tpl = combo?.template || '{text}';
      const srcLabel = this.sources.get(content.source)?.label || '';
      out = { ...content, text: tpl.replaceAll('{text}', content.text ?? '').replaceAll('{quelle}', srcLabel) };
    }
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

  _activity(detail) {
    this.dispatchEvent(new CustomEvent('activity', { detail: { ...detail, time: new Date() } }));
  }
}
