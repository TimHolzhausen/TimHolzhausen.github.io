// Selfie Screen – JPEG-Display mit Tasten, Nordic-UART-ähnlich (…CA9D).
// Protokoll:
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

// Keep-Alive: Steht eine Bildanforderung des Screens offen und wurde so lange nichts gesendet,
// schicken wir das aktuelle Bild noch einmal (sieht identisch aus, hält die Verbindung aktiv).
// Nutzer-Protokoll 14.11.2026: Der Screen fordert nach jedem Bild das nächste an (aa 55 03) und trennt nach
// ~12 s ohne neues Bild (er ist für eine laufende Kamera-Vorschau gebaut). Darum spätestens alle 5 s erneut senden.
const KEEPALIVE_MS = 5000;

const BUTTONS = { 2: 'Auslöser', 6: 'Kamera wechseln', 10: 'Plus', 11: 'Minus' };

// Paketgröße (Nutzdaten je BLE-Schreibvorgang, dazu kommt 1 Flag-Byte).
// Android: Ohne vergrößerte MTU passen nur 20 Byte in ein Paket; längere Schreibvorgänge ohne Bestätigung kürzt
// Android stillschweigend → das Ende-Flag fehlt, der Screen wartet auf den Rest und trennt nach ~12 s
// (Nutzer-Protokoll 14.11.2026: jedes Mal 16 s nach dem Verbinden getrennt). Ein Browser kann die MTU weder
// anfordern noch auslesen → auf Android 19 Byte. Sonst (Windows/macOS handeln die MTU selbst aus, iPhone) 180.
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
export const PACKET_SIZES = { auto: 'Automatisch (Android 19, sonst 180)', 19: '19 Byte (sicher, langsam)', 180: '180 Byte', 244: '244 Byte' };

export class SelfieScreen extends BleDevice {
  constructor() {
    super('selfie', 'Selfie Screen');
    this.width = 160;
    this.height = 192;
    this.buffer = 15360;
    this.rotation = 0;
    this.brightness = 100;
    this.packetSize = 'auto';
    this._rx = [];
    this._chunk = 180;
    this._queue = Promise.resolve();
    // Nutzer-Beobachtung (14.11.2026): Am zuverlässigsten verbindet er, wenn die Suche schon läuft und der
    // Screen erst dann eingeschaltet wird – er funkt offenbar nur kurz nach dem Einschalten verbindbar.
    this.advertWaitMs = 60000;
    this.powerOnHint = 'Jetzt den Screen einschalten.';
    this._onNotify = (e) => this._receive(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength));
  }

  // Der Screen meldet sich meist als „SelfieCom…“ (Magnetic Selfie Screen TP02, Dual-Mode-Gerät).
  // Über BLE kann der beworbene Name abweichen → zusätzlich Dienst- und weitere Namensfilter,
  // notfalls „Alle Bluetooth-Geräte anzeigen“.
  requestOptions() {
    return {
      filters: [
        { namePrefix: 'SelfieCom' },
        { namePrefix: 'Selfie' },
        { namePrefix: 'selfie' },
        { namePrefix: 'TP02' },
        { services: [SERVICE] },
      ],
      optionalServices: [SERVICE],
    };
  }

  async setup(server) {
    this.log('info', 'Verbunden mit „' + this.deviceName + '“ – suche Selfie-Dienst …');
    this._chunk = this.packetSize === 'auto' ? (IS_ANDROID ? 19 : 180) : Number(this.packetSize) || 19;
    this._rxLogged = 0;
    this._imgLogged = 0;
    this.log('info', 'Paketgröße ' + this._chunk + ' Byte' + (this.packetSize === 'auto' ? ' (automatisch' + (IS_ANDROID ? ', Android' : '') + ')' : ''));
    this._sentOnce = false;
    this._sending = false;
    this._connectedAt = Date.now();
    this._lastTx = Date.now();
    this._lastRx = 0;
    this._keepAlives = 0;
    await sleep(400); // Dual-Mode-Geräte unter Android brauchen nach dem Verbinden einen Moment
    let svc;
    try {
      svc = await server.getPrimaryService(SERVICE);
    } catch (err) {
      // Android hält manchmal veraltete Dienstlisten (native Apps können den GATT-Cache auffrischen).
      // Im Browser geht das nicht – einmal trennen und neu verbinden hilft oft.
      this.log('warn', 'Dienst nicht gefunden (' + err.message + ') – verbinde einmal neu');
      this._manualDisconnect = true;
      try { this.device.gatt.disconnect(); } catch { /* egal */ }
      await sleep(1200);
      this._manualDisconnect = false;
      this.server = server = await this.device.gatt.connect();
      await sleep(600);
      svc = await server.getPrimaryService(SERVICE);
    }
    this.step = 'Schreib-Kanal';
    this.writeC = await svc.getCharacteristic(WRITE);
    this.step = 'Benachrichtigungen';
    this._requested = false;
    this._sizeKnown = false;
    this._gotAny = false;
    this._unasked = false;
    try {
      this.notifyC = await svc.getCharacteristic(NOTIFY);
      this.notifyC.addEventListener('characteristicvaluechanged', this._onNotify);
      await this.notifyC.startNotifications();
    } catch (err) {
      // Ohne Rückkanal trotzdem nutzbar: Bilder ohne Anforderung schicken (Notbehelf).
      this.log('warn', 'Benachrichtigungen nicht möglich (' + err.message + ') – sende Bilder ohne Anforderung, Tasten gehen dann nicht');
      this._unasked = true;
    }
    this.step = 'Begrüßung senden';
    this._send([0xaa, 0x55, 0xf5, 0x01]);
    this._send([0xaa, 0x55, 0xf8, 0x01]);
    clearTimeout(this._sizeTimer);
    this._sizeTimer = setTimeout(() => {
      if (!this.linked || this._sizeKnown) return;
      this.log('info', 'Keine Größenangabe – nutze ' + this.width + '×' + this.height);
      this._send([0xaa, 0x55, 0x01, 0x01, 0x01]);
      this._firstPicture();
    }, 3000);
    clearInterval(this._keepAliveTimer);
    this._keepAliveTimer = setInterval(() => this._keepAlive(), 1000);
  }

  _keepAlive() {
    if (!this.linked || this._sending || !this._jpeg) return;
    if (Date.now() - this._lastTx < KEEPALIVE_MS) return;
    if (!this._requested && !this._unasked) return; // Screen wartet gerade nicht auf ein Bild
    this._keepAlives++;
    if (this._keepAlives <= 3) this.log('info', 'Keep-Alive: aktuelles Bild erneut gesendet');
    this._fresh = true;
    this._pump();
  }

  /** Bei Verbindungsverlust festhalten, wann und in welcher Lage – hilft, die Ursache zu finden. */
  _handleDisconnect() {
    if (!this._manualDisconnect && this._connectedAt) {
      const sec = (t) => Math.round((Date.now() - t) / 1000);
      this.log('warn', 'Getrennt nach ' + sec(this._connectedAt) + ' s · zuletzt gesendet vor ' + sec(this._lastTx) + ' s · ' +
        (this._lastRx ? 'zuletzt empfangen vor ' + sec(this._lastRx) + ' s' : 'nie etwas empfangen') +
        ' · Seite ' + (document.visibilityState === 'visible' ? 'sichtbar' : 'im Hintergrund') +
        ' · Keep-Alives: ' + this._keepAlives);
    }
    super._handleDisconnect();
  }

  teardown() {
    clearTimeout(this._sizeTimer);
    clearTimeout(this._silentTimer);
    clearInterval(this._keepAliveTimer);
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
    // Kleine Pakete sind langsam → Bild stärker komprimieren (Text/Zeichnungen bleiben gut lesbar).
    const limit = this.buffer - 100;
    for (let q = this._chunk < 100 ? 0.6 : 0.85; q > 0.05; q -= 0.1) {
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
    if (!this.linked || this._sending || !this._jpeg || !this._fresh) return;
    if (!this._requested && !this._unasked) return;
    this._requested = false;
    this._fresh = false;
    this._sending = true;
    const first = !this._sentOnce;
    const t0 = Date.now();
    const size = this._jpeg.length;
    this._send(this._jpeg).then(() => {
      if (this._imgLogged++ < 3) this.log('info', 'Bild gesendet: ' + size + ' Byte in ' + (Date.now() - t0) + ' ms (' + Math.ceil(size / this._chunk) + ' Pakete à ' + (this._chunk + 1) + ' Byte)');
      this._sending = false;
      this._lastTx = Date.now();
      this._sentOnce = true;
      this.emit('sent', {});
      if (first && !this._gotAny) {
        // Antwortet der Screen nicht, Bilder ohne Anforderung schicken.
        this._silentTimer = setTimeout(() => {
          if (this.linked && !this._gotAny) { this._unasked = true; this.log('warn', 'Screen antwortet nicht – sende ohne Anforderung'); this._pump(); }
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
      if (!this.linked) throw new Error('getrennt');
      const end = Math.min(i + this._chunk, data.length);
      const pkt = new Uint8Array(end - i + 1);
      pkt.set(data.subarray(i, end));
      pkt[end - i] = end < data.length ? 1 : 0;
      const props = this.writeC.properties || {};
      const noResp = props.writeWithoutResponse && typeof this.writeC.writeValueWithoutResponse === 'function' && !this._withResponse;
      try {
        if (noResp) await this.writeC.writeValueWithoutResponse(pkt);
        else if (typeof this.writeC.writeValueWithResponse === 'function') await this.writeC.writeValueWithResponse(pkt);
        else await this.writeC.writeValue(pkt);
      } catch (err) {
        if (this._chunk > 19) { this._chunk = 19; this.log('info', 'Kleinere Pakete (MTU): ' + err.message); continue; }
        if (noResp) { this._withResponse = true; this.log('info', 'Schreibe mit Bestätigung: ' + err.message); continue; }
        throw err;
      }
      i = end;
      // Android: writeValueWithoutResponse wartet bereits auf das Stack-Callback → keine Pause nötig.
      if (!IS_ANDROID) await sleep(10);
    }
  }

  _receive(pkt) {
    if (!pkt.length) return;
    this._gotAny = true;
    this._lastRx = Date.now();
    if (this._unasked) { this._unasked = false; clearTimeout(this._silentTimer); }
    for (let i = 0; i < pkt.length - 1; i++) this._rx.push(pkt[i]);
    if (pkt[pkt.length - 1] !== 0) return;
    const m = this._rx; this._rx = [];
    if (this._rxLogged++ < 12) this.log('info', 'Empfangen: ' + m.slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join(' ') + (m.length > 16 ? ' … (' + m.length + ' Byte)' : ''));
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
    } else if (cmd === 0xf7 && m.length >= 5) {
      this.log('info', 'Screen meldet MTU ' + (m[3] | (m[4] << 8)));
    } else if (BUTTONS[cmd]) {
      this.log('info', 'Taste: ' + BUTTONS[cmd]);
      this.emit('button', { button: BUTTONS[cmd], long: false });
    } else if (cmd !== 0x03 && cmd !== 0x01) {
      // Unbekannt (z. B. andere Tasten-Codes, langes Drücken) – immer protokollieren, damit wir sie zuordnen können.
      if ((this._unknownLogged = (this._unknownLogged || 0) + 1) <= 30) this.log('info', 'Unbekannte Nachricht: ' + m.slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join(' '));
    }
  }
}
