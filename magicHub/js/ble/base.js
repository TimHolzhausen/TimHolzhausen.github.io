// Gemeinsame Web-Bluetooth-Schicht für alle Gerätetreiber.
// - requestDevice() wird nur aus connect() aufgerufen, und connect() nur direkt aus einem Klick-Handler.
// - Automatisch verbinden (pro Gerät abschaltbar, seit 0.5.0 auf Wunsch des Nutzers):
//   * nach Verbindungsverlust: mit dem gemerkten Geräte-Objekt neu verbinden (geht ohne Nutzer-Tipp),
//   * beim App-Start: nur wenn der Browser getDevices() kann (Chrome mit Flag), sonst bleibt der Tipp nötig.
//   Gewartet wird auf Funksignale (watchAdvertisements), sonst mit wachsenden Pausen neu versucht.

import { hasWebBluetooth } from '../platform.js';

/** 16-Bit-UUID als vollständiger 128-Bit-String (Bluefy versteht Kurzformen nicht zuverlässig). */
export function uuid16(short) {
  return '0000' + short.toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(str) {
  const clean = str.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/** Schreibt ohne Antwort, wenn möglich – sonst mit. */
export async function writeChar(ch, data, preferNoResponse = true) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (preferNoResponse && typeof ch.writeValueWithoutResponse === 'function' && ch.properties?.writeWithoutResponse !== false) {
    return ch.writeValueWithoutResponse(buf);
  }
  if (typeof ch.writeValueWithResponse === 'function') return ch.writeValueWithResponse(buf);
  return ch.writeValue(buf);
}

/** Übersetzt Web-Bluetooth-Fehler in verständliche deutsche Meldungen. */
export function describeError(err) {
  const name = err?.name || '';
  const msg = String(err?.message || err || '');
  if (!hasWebBluetooth()) return 'Dieser Browser unterstützt kein Web Bluetooth.';
  if (name === 'NotFoundError') {
    if (/cancel/i.test(msg)) return 'Auswahl abgebrochen.';
    if (/adapter|Bluetooth.*(off|unavailable)/i.test(msg)) return 'Bluetooth ist ausgeschaltet oder nicht verfügbar.';
    return 'Kein Gerät gewählt oder gefunden. Ist es eingeschaltet und in der Nähe?';
  }
  if (name === 'SecurityError') return 'Bluetooth braucht HTTPS und einen direkten Tipp auf den Button.';
  if (name === 'NotAllowedError') return 'Bluetooth-Zugriff wurde nicht erlaubt (Browser- oder Systemberechtigung prüfen).';
  if (name === 'NetworkError') return 'Verbindung zum Gerät fehlgeschlagen oder abgebrochen. Gerät neu einschalten und erneut versuchen.';
  if (name === 'NotSupportedError') return 'Das Gerät bietet den erwarteten Bluetooth-Dienst nicht an.';
  if (name === 'InvalidStateError') return 'Das Gerät ist gerade beschäftigt. Kurz warten und erneut versuchen.';
  return msg || 'Unbekannter Fehler.';
}

/**
 * Basisklasse. Unterklassen setzen `requestOptions()` und `setup(server)`.
 * Events (über addEventListener):
 *   'status' → detail: { status, message }
 *   'log'    → detail: { level, message }
 */
export class BleDevice extends EventTarget {
  constructor(id, label) {
    super();
    this.id = id;
    this.label = label;
    this.device = null;
    this.server = null;
    this.status = 'idle'; // idle | connecting | connected | lost | error
    this.statusMessage = 'Nicht verbunden';
    this._onDisconnected = () => this._handleDisconnect();
    this.autoConnect = true;
    this._autoCtrl = null;
  }

  get autoWaiting() { return !!this._autoCtrl; }

  /** Automatisches Verbinden abbrechen (Nutzer verbindet selbst, trennt oder schaltet es ab). */
  stopAuto() {
    if (!this._autoCtrl) return;
    this._autoCtrl.abort();
    this._autoCtrl = null;
    if (this.status === 'lost' || this.status === 'idle') this._setStatus(this.status, this.status === 'lost' ? 'Verbindung verloren' : 'Nicht verbunden');
  }

  /** Beim Start: gemerktes Gerät suchen und verbinden, sobald es in Reichweite ist. */
  async autoStart() {
    if (!this.autoConnect || this.connected || this._autoCtrl) return false;
    const known = await this._knownDevice();
    if (!known) return false;
    this._attach(known);
    this._autoLoop('idle', 'Wartet auf ' + this.deviceName + ' (automatisch) …');
    return true;
  }

  async _autoLoop(waitStatus, waitMessage) {
    if (this._autoCtrl) return;
    const ctrl = new AbortController();
    this._autoCtrl = ctrl;
    const signal = ctrl.signal;
    try {
      for (let attempt = 0; !signal.aborted; attempt++) {
        this._setStatus(waitStatus, waitMessage);
        await this._waitNearby(signal, attempt);
        if (signal.aborted) break;
        try {
          await this._open();
          this.log('info', 'Automatisch verbunden');
          break;
        } catch (err) {
          if (signal.aborted) break;
          this.teardown();
          try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { /* egal */ }
          this.log('warn', 'Automatisch verbinden fehlgeschlagen (' + (err.message || err.name) + ') – neuer Versuch');
          await sleep(Math.min(30000, 2000 * (attempt + 1)));
        }
      }
    } finally {
      if (this._autoCtrl === ctrl) this._autoCtrl = null;
    }
  }

  /** Wartet auf ein Funksignal des Geräts; ohne watchAdvertisements nur eine Pause. */
  async _waitNearby(signal, attempt) {
    const dev = this.device;
    if (typeof dev?.watchAdvertisements !== 'function') { await sleep(attempt ? 3000 : 500); return; }
    const watch = new AbortController();
    const stop = () => watch.abort();
    signal.addEventListener('abort', stop, { once: true });
    try {
      await new Promise((resolve) => {
        dev.addEventListener('advertisementreceived', resolve, { once: true });
        signal.addEventListener('abort', resolve, { once: true });
        dev.watchAdvertisements({ signal: watch.signal }).catch(() => setTimeout(resolve, 3000));
      });
    } finally {
      signal.removeEventListener('abort', stop);
      watch.abort();
    }
  }

  get connected() { return this.status === 'connected'; }
  /** Echte GATT-Verbindung – auch während des Aufbaus (Status noch 'connecting') true. */
  get linked() { return !!this.device?.gatt?.connected; }
  get deviceName() { return this.device?.name || this.label; }

  requestOptions() { throw new Error('requestOptions() fehlt'); }
  async setup(_server) { /* von Unterklassen */ }
  teardown() { /* von Unterklassen: Timer stoppen usw. */ }

  /**
   * Muss direkt aus einem Klick-Handler aufgerufen werden.
   * showAll = true zeigt alle BLE-Geräte in der Auswahl (falls das Gerät anders heißt als erwartet).
   */
  async connect({ showAll = false, choose = false } = {}) {
    if (!hasWebBluetooth()) {
      this._setStatus('error', 'Kein Web Bluetooth in diesem Browser');
      throw new Error('Kein Web Bluetooth');
    }
    this.stopAuto();
    if (this.status === 'connecting') return;
    this.step = '';
    try {
      // Schnellweg: bereits erlaubtes Gerät ohne Auswahlfenster (nur wenn der Browser getDevices() kann).
      const known = !showAll && !choose ? await this._knownDevice() : null;
      if (known) {
        this._attach(known);
        this._setStatus('connecting', 'Warte auf ' + this.deviceName + ' …');
        await this._waitForAdvertisement(known);
      } else {
        this._setStatus('connecting', 'Gerät auswählen …');
        const opts = this.requestOptions();
        const device = await navigator.bluetooth.requestDevice(showAll
          ? { acceptAllDevices: true, optionalServices: opts.optionalServices || [] }
          : opts);
        this._attach(device);
      }
      await this._open();
      this._remember();
    } catch (err) {
      this._fail(err);
      throw err;
    }
  }

  /** Kann dieser Browser bekannte Geräte ohne Auswahlfenster verbinden? */
  static get canQuickConnect() {
    return typeof navigator !== 'undefined' && typeof navigator.bluetooth?.getDevices === 'function';
  }

  get rememberedName() {
    try { return JSON.parse(localStorage.getItem('magichub_dev_' + this.id) || 'null')?.name || ''; } catch { return ''; }
  }

  _remember() {
    try { localStorage.setItem('magichub_dev_' + this.id, JSON.stringify({ id: this.device.id, name: this.device.name || '' })); } catch { /* egal */ }
  }

  forget() {
    try { localStorage.removeItem('magichub_dev_' + this.id); } catch { /* egal */ }
  }

  async _knownDevice() {
    if (!BleDevice.canQuickConnect) return null;
    let saved;
    try { saved = JSON.parse(localStorage.getItem('magichub_dev_' + this.id) || 'null'); } catch { saved = null; }
    if (!saved?.id) return null;
    try {
      const list = await navigator.bluetooth.getDevices();
      return list.find((d) => d.id === saved.id) || null;
    } catch { return null; }
  }

  /** Wartet (max. 10 s), bis das Gerät funkt – sonst schlägt gatt.connect() auf Android oft fehl. */
  async _waitForAdvertisement(device) {
    if (typeof device.watchAdvertisements !== 'function') return;
    const ctrl = new AbortController();
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error(this.deviceName + ' antwortet nicht. Eingeschaltet und nicht mit einer anderen App verbunden? Sonst „Anderes Gerät wählen“.'), { name: 'NotInRange' })), 10000);
        device.addEventListener('advertisementreceived', () => { clearTimeout(timer); resolve(); }, { once: true });
        device.watchAdvertisements({ signal: ctrl.signal }).catch(() => { clearTimeout(timer); resolve(); });
      });
    } finally {
      ctrl.abort();
    }
  }

  /** Erneut mit dem zuletzt gewählten Gerät verbinden (ohne neue Auswahl). Nur auf Nutzer-Tipp aufrufen. */
  async reconnect() {
    this.stopAuto();
    if (!this.device) return this.connect();
    this._setStatus('connecting', 'Verbinde erneut …');
    try {
      await this._open();
    } catch (err) {
      this._fail(err);
      throw err;
    }
  }

  disconnect() {
    this.stopAuto();
    this._manualDisconnect = true;
    this.teardown();
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { /* egal */ }
    this._setStatus('idle', 'Getrennt');
  }

  _attach(device) {
    if (this.device && this.device !== device) this.device.removeEventListener('gattserverdisconnected', this._onDisconnected);
    this.device = device;
    device.addEventListener('gattserverdisconnected', this._onDisconnected);
  }

  async _open() {
    this._manualDisconnect = false;
    this._setStatus('connecting', 'Verbinde mit ' + this.deviceName + ' …');
    // Android meldet beim ersten GATT-Versuch oft einen Fehler (z. B. GATT 133) → bis zu 3 Versuche.
    this.step = 'Verbindung aufbauen';
    for (let attempt = 1; ; attempt++) {
      try {
        this.server = await this.device.gatt.connect();
        break;
      } catch (err) {
        if (attempt >= 3 || this._manualDisconnect) throw err;
        this.log('warn', 'Verbindungsversuch ' + attempt + ' fehlgeschlagen (' + (err.message || err.name) + ') – neuer Versuch');
        this._setStatus('connecting', 'Verbinde erneut (Versuch ' + (attempt + 1) + ') …');
        await sleep(800 * attempt);
      }
    }
    this.step = 'Dienste lesen';
    try {
      await this.setup(this.server);
    } catch (err) {
      if (err?.name === 'NotFoundError') {
        const e = new Error('„' + this.deviceName + '“ ist verbunden, bietet aber den ' + this.label +
          '-Dienst über BLE nicht an. Falsches Gerät gewählt – oder es spricht nur klassisches Bluetooth, das Browser nicht können.');
        e.name = 'ServiceMissing';
        throw e;
      }
      throw err;
    }
    this.step = '';
    this._setStatus('connected', this.deviceName);
  }

  _fail(err) {
    let text = describeError(err);
    const cancelled = err?.name === 'NotFoundError' && /cancel/i.test(err?.message || '');
    if (!cancelled && err?.name !== 'ServiceMissing' && this.step) {
      text = 'Schritt „' + this.step + '“: ' + text + (err?.message && !text.includes(err.message) ? ' [' + err.name + ': ' + err.message + ']' : '');
    }
    this.step = '';
    this.log('error', text);
    this.teardown();
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { /* egal */ }
    this._setStatus(cancelled ? 'idle' : 'error', text);
  }

  _handleDisconnect() {
    this.teardown();
    if (this._manualDisconnect) return;
    this.log('warn', this.deviceName + ': Verbindung verloren');
    this._setStatus('lost', 'Verbindung verloren');
    if (this.autoConnect && this.device) this._autoLoop('lost', 'Verbindung verloren – verbinde automatisch …');
  }

  _setStatus(status, message) {
    this.status = status;
    this.statusMessage = message;
    this.dispatchEvent(new CustomEvent('status', { detail: { status, message } }));
  }

  log(level, message) {
    this.dispatchEvent(new CustomEvent('log', { detail: { level, message } }));
    (level === 'error' ? console.warn : console.log)('[' + this.id + '] ' + message);
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
