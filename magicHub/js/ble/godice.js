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

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Wartet auf ein Funksignal; ohne watchAdvertisements nur eine Pause. */
async function waitForAdvertisement(device, attempt) {
  if (typeof device.watchAdvertisements !== 'function') { await sleep(attempt ? 3000 : 300); return; }
  const ctrl = new AbortController();
  try {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 60000); // spätestens nach 60 s trotzdem versuchen
      device.addEventListener('advertisementreceived', () => { clearTimeout(t); resolve(); }, { once: true });
      device.watchAdvertisements({ signal: ctrl.signal }).catch(() => { clearTimeout(t); setTimeout(resolve, 3000); });
    });
  } finally {
    ctrl.abort();
  }
}

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
    this.autoConnect = true;
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
    const waiting = [...this.dice.values()].some((d) => d.waiting);
    this.statusMessage = n ? n + ' Würfel verbunden' + (waiting ? ' · warte auf weitere' : '') : (waiting ? 'Warte auf Würfel (automatisch) …' : this.dice.size ? 'Würfel getrennt' : 'Keine Würfel');
    // Status nur bei echter Änderung melden (sonst bei jedem Wurf „GoDice verbunden“ und eine Protokollzeile).
    if (this.status !== this._lastStatus || this.statusMessage !== this._lastMessage) {
      this._lastStatus = this.status; this._lastMessage = this.statusMessage;
      this._emit('status', { status: this.status, message: this.statusMessage });
    }
    this._emit('dice', {});
  }

  /** Direkt aus Klick-Handler aufrufen. */
  async addDie() {
    if (!hasWebBluetooth()) throw new Error('Kein Web Bluetooth');
    const Lib = getLib();
    if (!Lib) throw new Error('GoDice-Bibliothek nicht geladen (vendor/godice.js)');
    const die = new Lib();
    this._wire(die);
    try {
      await die.requestDevice();
      this._rememberDie(die.bluetoothDevice);
    } catch (err) {
      const msg = describeError(err);
      if (!/abgebrochen/.test(msg)) this._emit('log', { level: 'error', message: msg });
      throw err;
    }
  }

  /** Ereignisse der Bibliothek mit diesem Würfel-Set verbinden. */
  _wire(die) {
    die.onDiceConnected = (id) => {
      const entry = this.dice.get(id) || { die, value: null };
      entry.die = die;
      entry.name = die.bluetoothDevice?.name || entry.name || 'GoDice';
      entry.online = true;
      entry.waiting = false;
      entry.removed = false;
      this.dice.set(id, entry);
      try { die.getDiceColor(); die.getBatteryLevel(); } catch { /* egal */ }
      this._changed();
    };
    die.onDiceDisconnected = (id) => {
      const d = this.dice.get(id);
      if (!d || !d.online) return; // Bibliothek meldet nach Wiederverbindungen mehrfach
      d.online = false;
      d.rolling = false;
      this._emit('log', { level: 'warn', message: (d.color || d.name) + ': Verbindung verloren' });
      this._changed();
      if (!d.removed && this.autoConnect) this._autoAttach(id, die, die.bluetoothDevice);
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
    // In einer Hülle liegt der Würfel schräg: Nach einem Wurf meldet er dann meist „TS“ (tilt stable) statt „S“
    // (wie in der Peekbox-Firmware). Achtung: Die Bibliothek übergibt hier (id, xyz, wert) – andere Reihenfolge.
    die.onTiltStable = (id, xyz, value) => stable(id, value, xyz);
  }

  // ---- Automatisch verbinden (bekannte Würfel; neue brauchen einmal das Auswahlfenster) ----

  _savedDice() {
    try { return JSON.parse(localStorage.getItem('magichub_godice') || '[]') || []; } catch { return []; }
  }

  _rememberDie(device) {
    if (!device?.id) return;
    const list = this._savedDice().filter((x) => x.id !== device.id);
    list.push({ id: device.id, name: device.name || '' });
    try { localStorage.setItem('magichub_godice', JSON.stringify(list)); } catch { /* egal */ }
  }

  _forgetDie(id) {
    try { localStorage.setItem('magichub_godice', JSON.stringify(this._savedDice().filter((x) => x.id !== id))); } catch { /* egal */ }
  }

  static get canQuickConnect() {
    return typeof navigator !== 'undefined' && typeof navigator.bluetooth?.getDevices === 'function';
  }

  get rememberedCount() { return this._savedDice().length; }

  /** Beim Start: alle gemerkten Würfel suchen und verbinden, sobald sie funken (nur mit getDevices()). */
  async autoStart() {
    if (!this.autoConnect || !GoDiceSet.canQuickConnect) return false;
    const saved = this._savedDice();
    if (!saved.length) return false;
    let devices = [];
    try { devices = await navigator.bluetooth.getDevices(); } catch { return false; }
    const Lib = getLib();
    if (!Lib) return false;
    let n = 0;
    for (const dv of devices) {
      if (!saved.some((x) => x.id === dv.id) || this.dice.has(dv.id)) continue;
      const die = new Lib();
      this._wire(die);
      this.dice.set(dv.id, { die, name: dv.name || 'GoDice', value: null, online: false, waiting: true });
      this._autoAttach(dv.id, die, dv);
      n++;
    }
    if (n) this._changed();
    return n > 0;
  }

  /** Wartet auf das Funksignal des Würfels und verbindet dann; wiederholt, bis verbunden oder entfernt. */
  async _autoAttach(id, die, device) {
    const d = this.dice.get(id);
    if (!d || !device || d.attaching) return;
    d.attaching = true;
    d.waiting = true;
    this._changed();
    try {
      for (let attempt = 0; ; attempt++) {
        const cur = this.dice.get(id);
        if (!cur || cur.removed || cur.online || !this.autoConnect) break;
        await waitForAdvertisement(device, attempt);
        const now = this.dice.get(id);
        if (!now || now.removed || now.online || !this.autoConnect) break;
        try {
          await die.attachDevice(device);
          break; // onDiceConnected setzt online
        } catch (err) {
          try { if (device.gatt?.connected) device.gatt.disconnect(); } catch { /* egal */ }
          if (attempt < 3) this._emit('log', { level: 'warn', message: (now.color || now.name) + ': automatisch verbinden fehlgeschlagen (' + (err.message || err.name) + ') – neuer Versuch' });
          await sleep(Math.min(20000, 2000 * (attempt + 1)));
        }
      }
    } finally {
      const end = this.dice.get(id);
      if (end) { end.attaching = false; end.waiting = !end.online && !end.removed && this.autoConnect; }
      this._changed();
    }
  }

  stopAuto() {
    for (const d of this.dice.values()) d.waiting = false;
    this._changed();
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
    d.removed = true;
    try { d.die.onDisconnectButtonClick(); } catch { /* egal */ }
    this._forgetDie(id);
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
