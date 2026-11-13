// Ultra Sharpie / Ultra Pen (umgelabelter NeoSmartpen).
// Protokoll rekonstruiert aus MysterSmith bt_ultrapen.js (siehe cyd_peeksmith/ultra_sharpie_ble_protokoll.md).
// Status: an echter Hardware über Web Bluetooth NICHT getestet.

import { BleDevice, uuid16, fromHex, hex, sleep, writeChar } from './base.js';

const CLASSIC = { service: uuid16(0x19f1), notify: uuid16(0x2ba1), write: uuid16(0x2ba0) };
const NEO = {
  service: '4f99f138-9d53-5bfa-9e50-b147491afe68',
  notify: '64cd86b1-2256-5aeb-9f04-2caf6c60ae57',
  write: '8bc8cc7d-88ca-56b0-af9a-9bf514d0d61a',
};

const INIT_SEQUENCE = [
  'C001 2A00 0000 0000 0000 0000 0000 0000 0000 0000 0110 322E 372E 3100 0000 0000 0000 0000 0000 322E 3133 0000 0000 C1',
  'C0040000C1',
  '@time',
  'C0114A0009001B000003FFFFFFFF1B000000FFFFFFFF1B00000EFFFFFFFF59020004FFFFFFFF5A020004FFFFFFFF5B020004FFFFFFFF5D020004FFFFFFFF01000005FFFFFFFF02000005FFFFFFFFC1',
  'C0210400010000C1',
  'C09100010000C1',
  'C08500010008C1',
  'C00502000500C1',
  'C00502000401C1',
  'C00502000301C1',
  'C005030002100EC1',
];

function setTimeCommand(d = new Date()) {
  return new Uint8Array([0xc0, 0x05, 0x06, 0x00, (d.getFullYear() - 2000) & 255, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), 0xc1]);
}

export class UltraSharpie extends BleDevice {
  constructor() {
    super('pen', 'Ultra Sharpie');
    this.strokes = [];
    this.finishDelay = 2500; // ms ohne Stift = Zeichnung fertig
    this._buf = [];
    this._down = false;
    this._last = null;
    this._onNotify = (e) => this._receive(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength));
  }

  requestOptions() {
    return {
      filters: [
        { services: [CLASSIC.service] },
        { services: [NEO.service] },
        { namePrefix: 'NEOSMARTPEN' },
        { namePrefix: 'Neosmartpen' },
        { namePrefix: 'neosmartpen' },
        { namePrefix: 'NeoSmartpen' },
        { namePrefix: 'UltraPen' },
      ],
      optionalServices: [CLASSIC.service, NEO.service],
    };
  }

  async setup(server) {
    let svc; let ids = CLASSIC;
    try { svc = await server.getPrimaryService(CLASSIC.service); } catch {
      svc = await server.getPrimaryService(NEO.service); ids = NEO;
    }
    this.variant = ids === NEO ? 'Ultra Pen Neo' : 'Ultra Sharpie';
    this.notifyChar = await svc.getCharacteristic(ids.notify);
    this.writeChar = await svc.getCharacteristic(ids.write);
    this.notifyChar.addEventListener('characteristicvaluechanged', this._onNotify);
    await this.notifyChar.startNotifications();
    await sleep(300);
    for (const line of INIT_SEQUENCE) {
      await this._send(line === '@time' ? setTimeCommand() : fromHex(line));
      await sleep(100);
    }
    clearInterval(this._keepAlive);
    this._keepAlive = setInterval(() => this._send(fromHex('C0040000C1')).catch(() => {}), 30000);
    this.log('info', this.variant + ' bereit');
  }

  teardown() {
    clearInterval(this._keepAlive);
    clearTimeout(this._liftTimer);
    clearTimeout(this._finishTimer);
    this.notifyChar?.removeEventListener('characteristicvaluechanged', this._onNotify);
  }

  async _send(bytes) {
    if (!this.writeChar) return;
    await writeChar(this.writeChar, bytes, false);
  }

  clear() {
    this.strokes = [];
    this._last = null;
    this.emit('cleared', {});
  }

  // ---- Empfang: C0 | CMD | LEN(LE16) | PAYLOAD | C1, Byte-Stuffing mit 7D ----
  _receive(bytes) {
    if (hex(bytes) === 'c062010004c1') { this.emit('cap', {}); return; }
    this._buf.push(...bytes);
    const b = this._buf;
    while (b.length >= 5) {
      const start = b.indexOf(0xc0);
      if (start < 0) { b.length = 0; break; }
      if (start > 0) b.splice(0, start);
      if (b.length < 5) break;
      const cmd = b[1];
      const len = b[2] | (b[3] << 8);
      if (len > 100) { b.splice(0, 1); continue; }
      const total = 4 + len + 1;
      if (b.length < total) break;
      let payload; let consumed;
      if (b[total - 1] === 0xc1) {
        payload = b.slice(4, total - 1);
        consumed = total;
      } else {
        let end = -1;
        for (let i = total; i < b.length; i++) if (b[i] === 0xc1) { end = i; break; }
        if (end < 0) break;
        payload = [];
        const raw = b.slice(4, end);
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] === 0x7d && i + 1 < raw.length) {
            const n = raw[++i];
            payload.push(n === 0xe0 ? 0xc0 : n === 0xe1 ? 0xc1 : n === 0x5d ? 0x7d : (payload.push(0x7d), n));
          } else payload.push(raw[i]);
        }
        consumed = end + 1;
      }
      b.splice(0, consumed);
      this._frame(cmd, payload);
    }
  }

  _frame(cmd, p) {
    if (cmd === 0x6c && p.length >= 10) {
      this._point((p[4] | (p[5] << 8)) + p[8] / 100, (p[6] | (p[7] << 8)) + p[9] / 100, p[2] | (p[3] << 8), 30000);
    } else if (cmd === 0x65 && p.length >= 9) {
      this._point((p[3] | (p[4] << 8)) + p[7] / 100, (p[5] | (p[6] << 8)) + p[8] / 100, p[1] | (p[2] << 8), 300000);
    } else if (cmd === 0x6a || cmd === 0x62 || (cmd === 0x63 && p[0] === 1)) {
      this._penUp();
    } else if (cmd === 0x64 || cmd === 0x6b) {
      const sig = hex(cmd === 0x64 ? p.slice(0, 12) : p.slice(1, 13));
      if (sig !== this.pageSig) { this.pageSig = sig; this.emit('page', { sig }); }
    }
  }

  /** Auch vom Demo-Modus genutzt. Koordinaten in Stift-Einheiten. */
  _point(xu, yu, pressure, jump = 30000) {
    const x = xu * 256; const y = yu * 256;
    clearTimeout(this._liftTimer);
    this._liftTimer = setTimeout(() => this._penUp(), 1000);
    clearTimeout(this._finishTimer);
    if (pressure < 1) { this._penUp(); return; }
    const newStroke = !this._down || !this._last ||
      Math.abs(x - this._last.x) > jump || Math.abs(y - this._last.y) > jump;
    if (newStroke) this.strokes.push([]);
    this._down = true;
    this._last = { x, y };
    this.strokes[this.strokes.length - 1].push({ x, y });
    this.emit('point', { x, y, newStroke });
  }

  _penUp() {
    if (!this._down) return;
    this._down = false;
    this._last = null;
    this.emit('penup', {});
    clearTimeout(this._finishTimer);
    this._finishTimer = setTimeout(() => {
      if (this.strokes.length) this.emit('drawing', { strokes: this.strokes.map((s) => s.slice()) });
    }, this.finishDelay);
  }
}
