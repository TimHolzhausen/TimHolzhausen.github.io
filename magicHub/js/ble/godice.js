// GoDice – nutzt die offizielle Particula-Bibliothek (vendor/godice.js, global `GoDice`).
// Mehrere Würfel gleichzeitig; liefert Einzelwerte und Summe.

import { hasWebBluetooth } from '../platform.js';
import { describeError } from './base.js';

const COLORS = ['Schwarz', 'Rot', 'Grün', 'Blau', 'Gelb', 'Orange'];
const COLOR_HEX = ['#3a3a3c', '#ff453a', '#30d158', '#0a84ff', '#ffd60a', '#ff9f0a'];

export class GoDiceSet extends EventTarget {
  constructor() {
    super();
    this.id = 'godice';
    this.label = 'GoDice';
    this.dice = new Map(); // id → { die, name, color, colorHex, value, battery, rolling, online }
    this.status = 'idle';
    this.statusMessage = 'Keine Würfel';
  }

  get connected() { return [...this.dice.values()].some((d) => d.online); }
  get sum() { return [...this.dice.values()].filter((d) => d.online && d.value).reduce((s, d) => s + d.value, 0); }

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
    if (typeof window.GoDice !== 'function') throw new Error('GoDice-Bibliothek fehlt');
    const die = new window.GoDice();
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
    const stable = (id, value) => {
      const d = this.dice.get(id);
      if (!d) return;
      d.rolling = false;
      d.value = value;
      this._changed();
      clearTimeout(this._settle);
      // Kurz warten, damit bei mehreren Würfeln alle liegen, bevor die Summe gemeldet wird.
      this._settle = setTimeout(() => {
        if ([...this.dice.values()].some((x) => x.online && x.rolling)) return;
        this._emit('roll', { id, value, color: d.color, sum: this.sum, values: this.values() });
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
    return [...this.dice.values()].filter((d) => d.online && d.value).map((d) => ({ color: d.color, value: d.value }));
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
