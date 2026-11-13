// Peripage P21 (und verwandte Peripage-Modelle) – Thermodrucker.
// Protokoll rekonstruiert aus MysterSmith bt_peripage.js / bt_peripage_protocol.js (v2.3.91):
//  Service FF00, Schreiben FF02, Benachrichtigungen FF01 ("aa" = Druck fertig) und FF03
//  (Flusssteuerung "01 nn" = Credits, "02 lo hi" = max. Paketgröße, "00 pp" = Akku %).
//  Raster: 1D 76 30 00 wL wH hL hH + 1 Bit/Pixel, zeilenweise, MSB zuerst, 1 = schwarz.
// Status: an echter Hardware über Web Bluetooth NICHT getestet.

import { BleDevice, uuid16, fromHex, hex, sleep } from './base.js';

const SERVICE = uuid16(0xff00);
const WRITE = uuid16(0xff02);
const NOTIFY_DONE = uuid16(0xff01);
const NOTIFY_FLOW = uuid16(0xff03);

const ZERO_96 = new Uint8Array(96);

export class PeripagePrinter extends BleDevice {
  constructor() {
    super('printer', 'Peripage P21');
    this.density = '02'; // MysterSmith-Standard; höher = dunkler (00..08 je nach Modell)
    this.mode = 'official'; // 'official' (Credits) | 'safe' (Pausen)
    this.battery = null;
    this.printing = false;
    this._maxPacket = 160;
    this._credits = 4;
  }

  get width() { return (this.device?.name || '').includes('_P21+') ? 576 : 384; }

  requestOptions() {
    return {
      filters: [{ namePrefix: 'PeriPage' }, { namePrefix: 'PPG' }, { namePrefix: 'Glyphs' }],
      optionalServices: [SERVICE],
    };
  }

  async setup(server) {
    const svc = await server.getPrimaryService(SERVICE);
    this.writeC = await svc.getCharacteristic(WRITE);
    for (const [uuid, tag] of [[NOTIFY_DONE, 'FF01'], [NOTIFY_FLOW, 'FF03']]) {
      try {
        const c = await svc.getCharacteristic(uuid);
        c.addEventListener('characteristicvaluechanged', (e) => this._notify(tag, new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength)));
        await c.startNotifications();
      } catch { this.log('info', tag + ' nicht verfügbar'); }
    }
    for (const cmd of ['10ff20f1', '10ff50f1', '10ff1200b4']) await this._raw(fromHex(cmd));
  }

  teardown() {
    this.printing = false;
    clearTimeout(this._doneTimer);
  }

  _notify(tag, v) {
    const h = hex(v);
    if (tag === 'FF03' && v.length === 3 && v[0] === 2) {
      const n = v[1] | (v[2] << 8);
      if (n >= 20 && n <= 512) this._maxPacket = n;
    } else if (tag === 'FF03' && v.length === 2 && v[0] === 1) {
      this._credits = Math.min(4, this._credits + v[1]);
      this._creditWaiter?.();
    } else if (tag === 'FF01' && h === 'aa') {
      this._doneWaiter?.();
    } else if (v.length === 2 && v[0] === 0) {
      this.battery = v[1];
      this.emit('battery', { level: v[1] });
    }
  }

  async _raw(bytes) {
    if (typeof this.writeC.writeValueWithoutResponse === 'function') await this.writeC.writeValueWithoutResponse(bytes);
    else await this.writeC.writeValue(bytes);
  }

  /** Schreibt in Paketen; fällt bei Fehler auf 20 Byte zurück. */
  async _chunks(data, size, { credits = false, delay = 0 } = {}) {
    for (let i = 0; i < data.length;) {
      if (!this.linked) throw new Error('Drucker getrennt');
      if (credits && this._credits <= 0) {
        await new Promise((r) => { this._creditWaiter = r; setTimeout(r, 400); });
        this._creditWaiter = null;
        if (this._credits <= 0) this._credits = 1;
      }
      const part = data.subarray(i, i + size);
      try {
        await this._raw(part);
      } catch (err) {
        if (size > 20) { size = 20; this.log('info', 'Kleinere Pakete (MTU)'); continue; }
        throw err;
      }
      if (credits) this._credits--;
      i += part.length;
      if (delay) await sleep(delay);
      this.emit('progress', { done: i, total: data.length });
    }
  }

  /** Canvas drucken. dither=true für Fotos/Zeichnungen in Graustufen. */
  async printCanvas(canvas, { dither = false } = {}) {
    if (!this.connected) throw new Error('Drucker nicht verbunden');
    if (this.printing) throw new Error('Druck läuft bereits');
    this.printing = true;
    try {
      const { bits, width, height } = toBitmap(canvas, this.width, dither);
      const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, (width / 8) & 255, (width / 8) >> 8, height & 255, height >> 8]);
      const q = fromHex('10ff1000' + this.density);
      this.log('info', 'Drucke ' + width + '×' + height + ' px (' + this.mode + ')');
      if (this.mode === 'official') {
        const z = new Uint8Array(1024);
        const all = concat(z, q, fromHex('10ff8001'), fromHex('10fffe01'), z, header, bits, fromHex('1b4a64'), fromHex('10fffe45'));
        this._credits = 4;
        await this._chunks(all, this._maxPacket, { credits: true });
      } else {
        await this._raw(ZERO_96);
        for (const c of [q, fromHex('10ff8001'), fromHex('10fffe01')]) await this._raw(c);
        await this._chunks(concat(new Uint8Array(12), header, bits), 96, { delay: 20 });
        await this._raw(fromHex('1b4a4010fffe45'));
      }
      await new Promise((r) => {
        this._doneWaiter = r;
        this._doneTimer = setTimeout(r, Math.max(8000, height * 15));
      });
      this._doneWaiter = null;
      clearTimeout(this._doneTimer);
      await this._raw(ZERO_96);
      this.log('info', 'Druck fertig');
    } finally {
      this.printing = false;
    }
  }

  async feed(mm = 10) {
    if (!this.connected) return;
    let dots = Math.round(mm * 8);
    await this._raw(fromHex('10fffe01'));
    while (dots > 0) {
      const n = Math.min(255, dots);
      await this._raw(new Uint8Array([0x1b, 0x4a, n]));
      dots -= n;
    }
    await this._raw(fromHex('10fffe45'));
  }
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Canvas → 1-Bit-Raster in Druckerbreite (1 = schwarz). */
export function toBitmap(src, width, dither) {
  const scale = width / src.width;
  const height = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  const px = ctx.getImageData(0, 0, width, height).data;
  const g = new Float32Array(width * height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const rb = width / 8;
  const bits = new Uint8Array(rb * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const black = g[i] < 128;
      if (dither) {
        const err = g[i] - (black ? 0 : 255);
        if (x + 1 < width) g[i + 1] += err * 7 / 16;
        if (y + 1 < height) {
          if (x > 0) g[i + width - 1] += err * 3 / 16;
          g[i + width] += err * 5 / 16;
          if (x + 1 < width) g[i + width + 1] += err / 16;
        }
      }
      if (black) bits[y * rb + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bits, width, height };
}
