// PeekSmith One/Two/3 (HM-10-artiger BLE-UART auf FFE0/FFE1).
// Textdarstellung vereinfacht (kein eigener Zeilenumbruch, Umlaute werden umschrieben).

import { BleDevice, uuid16, sleep, writeChar } from './base.js';

const SERVICE = uuid16(0xffe0);
const CHAR = uuid16(0xffe1);

const BUTTONS = { isb0: 'Seite', isb1: 'Links', isb2: 'Rechts' };

// Vibration bei neuem Text: PeekSmith-Befehl „/V=<ms>“ (Benachrichtigungs-Vibration, 0 = aus; übliche Vorgabe 50).
// 'device' = nichts senden, das Gerät behält seine Einstellung.
export const PEEK_VIBRATE = { device: 'Wie am Gerät eingestellt', 0: 'Aus', 50: 'Kurz', 150: 'Mittel', 300: 'Lang' };

export function toPeekText(text) {
  return String(text ?? '')
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[♠♤]/g, 'P').replace(/[♥♡❤]/g, 'H').replace(/[♦♢]/g, 'Ka').replace(/[♣♧]/g, 'Kr') // PeekSmith kann keine Symbole – deutsche Kürzel
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
}

export class PeekSmith extends BleDevice {
  constructor() {
    super('peeksmith', 'PeekSmith');
    this.brightness = 5; // 0..9
    this.vibrate = 'device';
    this.batteryMv = null;
    this.version = null;
    this._queue = Promise.resolve();
    this._onNotify = (e) => this._token(new TextDecoder().decode(e.target.value));
  }

  get model() {
    const n = this.device?.name || '';
    if (n.startsWith('PeekSmith-03X')) return 'Bond';
    if (/-03/.test(n)) return 'PeekSmith 3';
    if (/-02/.test(n)) return 'PeekSmith 2';
    return 'PeekSmith One';
  }

  get isPs3() { return this.model === 'PeekSmith 3' || this.model === 'Bond'; }

  requestOptions() {
    return {
      filters: [{ namePrefix: 'PeekSmith' }, { namePrefix: 'peeksmith' }, { namePrefix: 'MLT-BT' }],
      optionalServices: [SERVICE],
    };
  }

  async setup(server) {
    const svc = await server.getPrimaryService(SERVICE);
    this.char = await svc.getCharacteristic(CHAR);
    if (this.char.properties.notify) {
      this.char.addEventListener('characteristicvaluechanged', this._onNotify);
      await this.char.startNotifications();
    }
    for (const cmd of ['/B' + this.brightness, '/?b', '/?c', '/?v', '/R0']) await this.command(cmd);
    if (this.vibrate !== 'device') await this.command('/V=' + Number(this.vibrate));
    await this.showText('MagicHub');
  }

  teardown() {
    this.char?.removeEventListener('characteristicvaluechanged', this._onNotify);
  }

  /** Text auf dem Display. Leerer Text = Display leeren. */
  showText(text) {
    const clean = toPeekText(text);
    return this._line((this.isPs3 ? '$' : '#') + clean);
  }

  clear() { return this._line('#'); }

  setBrightness(n) {
    this.brightness = Math.max(0, Math.min(9, Math.round(n)));
    return this.command('/B' + this.brightness);
  }

  /** Vibration bei neuem Text einstellen ('device' = Gerät entscheidet, sonst Millisekunden, 0 = aus). */
  setVibrate(v) {
    this.vibrate = v;
    if (this.connected && v !== 'device') return this.command('/V=' + Number(v));
  }

  command(cmd) { return this._line(cmd); }

  _line(str) {
    const bytes = [...new TextEncoder().encode(str), 10];
    this._queue = this._queue.then(async () => {
      if (!this.linked || !this.char) return;
      for (let i = 0; i < bytes.length; i += 18) {
        await writeChar(this.char, bytes.slice(i, i + 18), true);
        await sleep(60);
      }
    }).catch((err) => this.log('error', 'Senden fehlgeschlagen: ' + err.message));
    return this._queue;
  }

  _token(raw) {
    const t = raw.trim();
    const m = t.match(/^(isb[0-2]),(click|longpress)/);
    if (m) {
      this.emit('button', { button: BUTTONS[m[1]], long: m[2] === 'longpress' });
      return;
    }
    if (t.startsWith('ish,open')) { this.emit('button', { button: 'Magnet', long: false }); return; }
    if (t.startsWith('ib')) {
      const mv = parseInt(t.substring(2, 6), 10);
      if (!Number.isNaN(mv)) { this.batteryMv = mv; this.emit('battery', { mv }); }
      return;
    }
    if (t.startsWith('iv')) { this.version = t.substring(2); this.emit('info', {}); return; }
    this.log('info', 'Empfangen: ' + t);
  }
}
