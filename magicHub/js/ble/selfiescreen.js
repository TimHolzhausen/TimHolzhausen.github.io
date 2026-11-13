// Selfie Screen (Mystersmith) – JPEG-Display mit Tasten, Nordic-UART-ähnlich (…CA9D).
// Protokoll rekonstruiert aus MysterSmith bt_selfie_screen.js (v2.3.91):
//  - Jede Übertragung (beide Richtungen) endet pro BLE-Paket mit einem Flag-Byte: 1 = es folgt mehr, 0 = Ende.
//  - Nachrichten vom Screen beginnen mit AA 55 <cmd>:
//      01 → Größe: w(LE16) h(LE16) rotation(1) buffer(LE32)   → Antwort AA 55 01 01 01
//      03 → Bildanforderung (nächstes JPEG darf kommen)
//      F7 → MTU-Info,  02/06/0A/0B → Tasten (Auslöser, Kamera wechseln, +, −)
//  - Ein Bild ist ein rohes JPEG (ohne eigenen Header), so klein, dass es in den Puffer passt.
// Status: an echter Hardware über Web Bluetooth NICHT getestet.

import { BleDevice, sleep } from './base.js';

const SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9d';
const WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9d';
const NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9d';

const BUTTONS = { 2: 'Auslöser', 6: 'Kamera wechseln', 10: 'Plus', 11: 'Minus' };

export class SelfieScreen extends BleDevice {
  constructor() {
    super('selfie', 'Selfie Screen');
    this.width = 160;
    this.height = 192;
    this.buffer = 15360;
    this.rotation = 0;
    this.brightness = 100;
    this._rx = [];
    this._chunk = 180;
    this._queue = Promise.resolve();
    this._onNotify = (e) => this._receive(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength));
  }

  requestOptions() {
    return { filters: [{ namePrefix: 'SelfieCom' }], optionalServices: [SERVICE] };
  }

  async setup(server) {
    const svc = await server.getPrimaryService(SERVICE);
    this.writeC = await svc.getCharacteristic(WRITE);
    this.notifyC = await svc.getCharacteristic(NOTIFY);
    this.notifyC.addEventListener('characteristicvaluechanged', this._onNotify);
    await this.notifyC.startNotifications();
    this._requested = false;
    this._sizeKnown = false;
    this._gotAny = false;
    this._unasked = false;
    this._send([0xaa, 0x55, 0xf5, 0x01]);
    this._send([0xaa, 0x55, 0xf8, 0x01]);
    clearTimeout(this._sizeTimer);
    this._sizeTimer = setTimeout(() => {
      if (!this.connected || this._sizeKnown) return;
      this.log('info', 'Keine Größenangabe – nutze ' + this.width + '×' + this.height);
      this._send([0xaa, 0x55, 0x01, 0x01, 0x01]);
      this._firstPicture();
    }, 3000);
  }

  teardown() {
    clearTimeout(this._sizeTimer);
    clearTimeout(this._silentTimer);
    this.notifyC?.removeEventListener('characteristicvaluechanged', this._onNotify);
  }

  /** Canvas anzeigen (wird auf Bildschirmgröße skaliert). */
  async showCanvas(canvas) {
    this._lastCanvas = canvas;
    const jpeg = await this._encode(canvas);
    if (!jpeg) return;
    this._jpeg = jpeg;
    this._fresh = true;
    this._pump();
  }

  // ---- intern ----

  _firstPicture() {
    this._requested = true;
    if (this._lastCanvas) this.showCanvas(this._lastCanvas);
    else this.emit('needs-picture', {});
  }

  async _encode(src) {
    const c = document.createElement('canvas');
    c.width = this.width; c.height = this.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    const s = Math.min(c.width / src.width, c.height / src.height);
    const w = src.width * s; const h = src.height * s;
    ctx.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
    if (this.brightness < 100) {
      ctx.fillStyle = 'rgba(0,0,0,' + (100 - this.brightness) / 100 + ')';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    const limit = this.buffer - 100;
    for (let q = 0.85; q > 0.05; q -= 0.1) {
      const bin = atob(c.toDataURL('image/jpeg', q).split(',')[1]);
      if (bin.length <= limit || q < 0.15) {
        if (bin.length > limit) break;
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      }
    }
    this.log('error', 'Bild ist zu groß für den Selfie Screen');
    return null;
  }

  _pump() {
    if (!this.connected || this._sending || !this._jpeg || !this._fresh) return;
    if (!this._requested && !this._unasked) return;
    this._requested = false;
    this._fresh = false;
    this._sending = true;
    const first = !this._sentOnce;
    this._send(this._jpeg).then(() => {
      this._sending = false;
      this._sentOnce = true;
      this.emit('sent', {});
      if (first && !this._gotAny) {
        // Antwortet der Screen nicht, Bilder ohne Anforderung schicken (wie MysterSmith).
        this._silentTimer = setTimeout(() => {
          if (this.connected && !this._gotAny) { this._unasked = true; this.log('warn', 'Screen antwortet nicht – sende ohne Anforderung'); this._pump(); }
        }, 1500);
      }
      if (this._unasked) setTimeout(() => this._pump(), 300);
    });
  }

  _send(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this._queue = this._queue.then(() => this._write(data)).catch((err) => {
      this._sending = false;
      this.log('error', 'Senden fehlgeschlagen: ' + err.message);
    });
    return this._queue;
  }

  async _write(data) {
    for (let i = 0; i < data.length;) {
      if (!this.connected) throw new Error('getrennt');
      const end = Math.min(i + this._chunk, data.length);
      const pkt = new Uint8Array(end - i + 1);
      pkt.set(data.subarray(i, end));
      pkt[end - i] = end < data.length ? 1 : 0;
      try {
        if (typeof this.writeC.writeValueWithoutResponse === 'function') await this.writeC.writeValueWithoutResponse(pkt);
        else await this.writeC.writeValue(pkt);
      } catch (err) {
        if (this._chunk > 19) { this._chunk = 19; this.log('info', 'Kleinere Pakete (MTU)'); continue; }
        throw err;
      }
      i = end;
      await sleep(10);
    }
  }

  _receive(pkt) {
    if (!pkt.length) return;
    this._gotAny = true;
    if (this._unasked) { this._unasked = false; clearTimeout(this._silentTimer); }
    for (let i = 0; i < pkt.length - 1; i++) this._rx.push(pkt[i]);
    if (pkt[pkt.length - 1] !== 0) return;
    const m = this._rx; this._rx = [];
    if (m.length < 3 || m[0] !== 0xaa || m[1] !== 0x55) { this.log('info', 'Unbekannte Daten'); return; }
    const cmd = m[2];
    if (cmd === 3) {
      this._requested = true;
      this._pump();
    } else if (cmd === 1 && m.length >= 12) {
      const w = m[3] | (m[4] << 8); const h = m[5] | (m[6] << 8);
      const buf = (m[8] | (m[9] << 8) | (m[10] << 16) | (m[11] << 24)) >>> 0;
      if (w > 0 && h > 0) { this.width = w; this.height = h; }
      if (buf > 1000) this.buffer = buf;
      this.rotation = m[7] * 90;
      this._send([0xaa, 0x55, 0x01, 0x01, 0x01]);
      const firstTime = !this._sizeKnown;
      this._sizeKnown = true;
      this.emit('info', {});
      if (firstTime) this._firstPicture();
    } else if (BUTTONS[cmd]) {
      this.emit('button', { button: BUTTONS[cmd], long: false });
    }
  }
}
