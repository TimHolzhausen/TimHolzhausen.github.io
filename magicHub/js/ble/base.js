// Gemeinsame Web-Bluetooth-Schicht für alle Gerätetreiber.
// - requestDevice() wird nur aus connect() aufgerufen, und connect() nur direkt aus einem Klick-Handler.
// - Kein automatischer Reconnect: nach Verbindungsverlust bietet die Oberfläche "Erneut verbinden" an.

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
  }

  get connected() { return this.status === 'connected'; }
  get deviceName() { return this.device?.name || this.label; }

  requestOptions() { throw new Error('requestOptions() fehlt'); }
  async setup(_server) { /* von Unterklassen */ }
  teardown() { /* von Unterklassen: Timer stoppen usw. */ }

  /** Muss direkt aus einem Klick-Handler aufgerufen werden. */
  async connect() {
    if (!hasWebBluetooth()) {
      this._setStatus('error', 'Kein Web Bluetooth in diesem Browser');
      throw new Error('Kein Web Bluetooth');
    }
    if (this.status === 'connecting') return;
    this._setStatus('connecting', 'Gerät auswählen …');
    try {
      const device = await navigator.bluetooth.requestDevice(this.requestOptions());
      this._attach(device);
      await this._open();
    } catch (err) {
      this._fail(err);
      throw err;
    }
  }

  /** Erneut mit dem zuletzt gewählten Gerät verbinden (ohne neue Auswahl). Nur auf Nutzer-Tipp aufrufen. */
  async reconnect() {
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
    this.server = await this.device.gatt.connect();
    await this.setup(this.server);
    this._setStatus('connected', this.deviceName);
  }

  _fail(err) {
    const text = describeError(err);
    this.log('error', text);
    this.teardown();
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { /* egal */ }
    this._setStatus(err?.name === 'NotFoundError' && /cancel/i.test(err?.message || '') ? 'idle' : 'error', text);
  }

  _handleDisconnect() {
    this.teardown();
    if (this._manualDisconnect) return;
    this.log('warn', this.deviceName + ': Verbindung verloren');
    this._setStatus('lost', 'Verbindung verloren');
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
