// GoDice – nutzt die offizielle Particula-Bibliothek (vendor/godice.js, global `GoDice`).
// Mehrere Würfel gleichzeitig; liefert Einzelwerte und Summe.

import { hasWebBluetooth } from '../platform.js';
import { describeError } from './base.js';

const COLORS = ['Schwarz', 'Rot', 'Grün', 'Blau', 'Gelb', 'Orange'];
const COLOR_HEX = ['#3a3a3c', '#ff453a', '#30d158', '#0a84ff', '#ffd60a', '#ff9f0a'];

/** Hüllen. Vorerst nur D6 und D20 (die Bibliothek kennt auch D10/D10X/D4/D8/D12). */
export const SHELLS = { auto: 'Automatisch', D6: 'D6 (ohne Hülle)', D20: 'D20-Hülle' };
// Wie in der Peekbox-Firmware (peekbox_s3, bewährt im Davinci-Empfänger): pro Wurf D6- gegen D20-Tabelle,
// der kleinere Abstand gewinnt (D6-Seiten liegen auf den Achsen, jede D20-Seite mind. 22 Einheiten daneben).
// Passt die Lage zu keiner Tabelle (schief angelehnt, in der Hand), bleibt die zuletzt erkannte Hülle.
// Gemessen (quadrierter Abstand): gute Lagen D6 ≤ 6, D20 ≤ 134; schief z. B. 851.
const SHELL_MAX_DIST2 = 400;

const getLib = () => window.GoDice || (typeof GoDice === 'function' ? GoDice : null); // eslint-disable-line no-undef

function nearest(table, xyz) {
  let key = null, dist2 = Infinity;
  for (const k in table) {
    const v = table[k];
    const d2 = (xyz[0] - v[0]) ** 2 + (xyz[1] - v[1]) ** 2 + (xyz[2] - v[2]) ** 2;
    if (d2 < dist2) { dist2 = d2; key = Number(k); } // for…in liefert Strings – deshalb Number()
  }
  return { key, dist2 };
}

export class GoDiceSet extends EventTarget {
  constructor() {
    super();
    this.id = 'godice';
    this.label = 'GoDice';
    this.dice = new Map(); // id → { die, name, color, colorHex, value, battery, rolling, online }
    this.status = 'idle';
    this.statusMessage = 'Keine Würfel';
    // Wird von main.js durch settings.godice ersetzt (gleiches Objekt → Änderungen sind gespeichert).
    this.config = { shells: {} };
  }

  shellOf(id) { return this.config.shells?.[id] || 'auto'; }

  /** Würfeltyp und Augenzahl aus dem Lagevektor bestimmen (Ergebnis immer als Zahl). */
  _evaluate(entry, id) {
    const L = getLib();
    const xyz = entry.xyz;
    if (!L || !xyz) return;
    const d6 = nearest(L.d6Vectors, xyz);
    const d20 = nearest(L.d20Vectors, xyz);
    const t = d20.dist2 < d6.dist2 ? 'D20' : 'D6';
    entry.clear = Math.min(d6.dist2, d20.dist2) <= SHELL_MAX_DIST2;
    if (entry.clear || !entry.detected) entry.detected = t;
    const set = this.shellOf(id);
    entry.type = set !== 'auto' ? set : entry.detected;
    entry.value = entry.type === 'D20' ? d20.key : d6.key;
  }

  /** Nach Änderung der Hülle den aktuellen Wert neu berechnen. */
  setShell(id, shell) {
    if (!this.config.shells) this.config.shells = {};
    if (shell === 'auto') delete this.config.shells[id]; else this.config.shells[id] = shell;
    this.reevaluate();
  }

  reevaluate() {
    for (const [id, d] of this.dice) this._evaluate(d, id);
    this._changed();
  }

  get connected() { return [...this.dice.values()].some((d) => d.online); }
  get sum() { return [...this.dice.values()].filter((d) => d.online && d.value != null).reduce((s, d) => s + Number(d.value), 0); }

  _emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _changed() {
    const n = [...this.dice.values()].filter((d) => d.online).length;
    this.status = n ? 'connected' : (this.dice.size ? 'lost' : 'idle');
    this.statusMessage = n ? n + (n === 1 ? ' Würfel' : ' Würfel') + ' verbunden' : (this.dice.size ? 'Würfel getrennt' : 'Keine Würfel');
    this._emit('status', { status: this.status, message: this.statusMessage });
    this._emit('dice', {});
  }

  /** Direkt aus Klick-Handler aufrufen. */
  async addDie() {
    if (!hasWebBluetooth()) throw new Error('Kein Web Bluetooth');
    const Lib = getLib();
    if (!Lib) throw new Error('GoDice-Bibliothek nicht geladen (vendor/godice.js)');
    const die = new Lib();
    die.onDiceConnected = (id) => {
      const entry = this.dice.get(id) || { die, name: die.bluetoothDevice?.name || 'GoDice', value: null };
      entry.online = true;
      this.dice.set(id, entry);
      try { die.getDiceColor(); die.getBatteryLevel(); } catch { /* egal */ }
      this._changed();
    };
    die.onDiceDisconnected = (id) => {
      const d = this.dice.get(id);
      if (d) { d.online = false; this._changed(); }
    };
    die.onDiceColor = (id, color) => {
      const d = this.dice.get(id);
      if (d) { d.color = COLORS[color] || 'Würfel'; d.colorHex = COLOR_HEX[color] || '#888'; this._changed(); }
    };
    die.onBatteryLevel = (id, level) => {
      const d = this.dice.get(id);
      if (d) { d.battery = level; this._changed(); }
    };
    die.onRollStart = (id) => {
      const d = this.dice.get(id);
      if (d) { d.rolling = true; this._emit('rolling', { id }); this._changed(); }
    };
    const stable = (id, value, xyz) => {
      const d = this.dice.get(id);
      if (!d) return;
      d.rolling = false;
      if (Array.isArray(xyz)) { d.xyz = xyz; this._evaluate(d, id); } else d.value = Number(value);
      this._changed();
      clearTimeout(this._settle);
      // Kurz warten, damit bei mehreren Würfeln alle liegen, bevor die Summe gemeldet wird.
      this._settle = setTimeout(() => {
        if ([...this.dice.values()].some((x) => x.online && x.rolling)) return;
        this._emit('roll', { id, value: d.value, color: d.color, type: d.type, sum: this.sum, values: this.values() });
      }, 450);
    };
    die.onStable = stable;
    die.onFakeStable = stable;
    die.onMoveStable = stable;
    try {
      await die.requestDevice();
    } catch (err) {
      const msg = describeError(err);
      if (!/abgebrochen/.test(msg)) this._emit('log', { level: 'error', message: msg });
      throw err;
    }
  }

  values() {
    return [...this.dice.values()].filter((d) => d.online && d.value != null).map((d) => ({ color: d.color, value: d.value, type: d.type }));
  }

  blink(id) {
    const d = this.dice.get(id);
    try { d?.die.pulseLed(3, 20, 20, [120, 80, 255]); } catch { /* egal */ }
  }

  remove(id) {
    const d = this.dice.get(id);
    if (!d) return;
    try { d.die.onDisconnectButtonClick(); } catch { /* egal */ }
    this.dice.delete(id);
    this._changed();
  }

  disconnect() { for (const id of [...this.dice.keys()]) this.remove(id); }

  /** Demo-Modus */
  simulate() {
    const values = this.dice.size ? [...this.dice.values()].map(() => 1 + Math.floor(Math.random() * 6)) : [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const sum = values.reduce((a, b) => a + b, 0);
    this._emit('roll', { id: 'demo', value: values[values.length - 1], sum, values: values.map((v, i) => ({ color: COLORS[(i + 1) % 6], value: v })), demo: true });
  }
}
