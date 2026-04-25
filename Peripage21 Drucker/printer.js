/**
 * printer.js — Peripage P21 BLE Protocol v4
 *
 * VERBINDEN: Multi-UUID-Scan, acceptAllDevices (Android-kompatibel)
 *
 * DRUCKPROTOKOLL:
 *   Es werden zwei Modi unterstuetzt (MODE A und MODE B), da das exakte
 *   Protokoll des P21 nicht oeffentlich dokumentiert ist.
 *
 *   MODE A (Standard, am wahrscheinlichsten korrekt fuer P21):
 *     0xA4 [heat]             – Drueckwaerme setzen
 *     0xBE [hi, lo]           – Druckjob starten (Anzahl Zeilen)
 *     0xA2 [48 Bytes] x N     – Eine Bitmap-Zeile senden
 *     0xA9 [0x00, lines]      – Papiervorschub
 *
 *   MODE B (Alternative, Lattice-Protokoll):
 *     0xAF [lo, hi]           – Energie setzen
 *     0xBE [0x31]             – Lattice EIN
 *     0xA2 [48 Bytes] x N     – Zeile senden
 *     0xBE [0x30]             – Lattice AUS
 *     0xA1 [0x00, lines]      – Papiervorschub
 *
 * PACKET: [0x51, 0x78, CMD, 0x00, LEN_LO, LEN_HI, DATA..., CRC8(DATA)]
 *
 * BLE-WRITE: writeValueWithoutResponse zuerst (dann writeValue als Fallback),
 *   aufgeteilt in 20-Byte-Chunks — exakt wie das funktionierende Referenz-Skript.
 */

'use strict';

class PeripagePrinter {

  // === Druckmodi ================================================
  // A: heat+height+row+feed  (wahrscheinlichste Option fuer P21)
  // B: energy+lattice-on+row+lattice-off+feed (ae30-Standard-Doku)
  static PROTOCOL_MODE = 'A';  // 'A' oder 'B'

  // === Alle bekannten UUID-Kombinationen ========================
  static UUID_CANDIDATES = [
    {
      label: 'PeriPage AE30 (Peripage-Basis 00ae9bdb96f0)',
      svc:   '0000ae30-0000-1000-8000-00ae9bdb96f0',
      write: '0000ae01-0000-1000-8000-00ae9bdb96f0',
      notif: '0000ae02-0000-1000-8000-00ae9bdb96f0',
    },
    {
      label: 'AE30 (BT-Standard 00805f9b34fb)',
      svc:   '0000ae30-0000-1000-8000-00805f9b34fb',
      write: '0000ae01-0000-1000-8000-00805f9b34fb',
      notif: '0000ae02-0000-1000-8000-00805f9b34fb',
    },
    {
      label: 'Nordic UART (NUS)',
      svc:   '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
      notif: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    },
    {
      label: 'Microchip ISSC UART',
      svc:   '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      write: '49535343-8841-43f4-a8d4-ecbe34729bb3',
      notif: '49535343-1e4d-4bd9-ba61-23c647249616',
    },
    {
      label: 'Sifli/PPG FF00',
      svc:   '0000ff00-0000-1000-8000-00805f9b34fb',
      write: '0000ff02-0000-1000-8000-00805f9b34fb',
      notif: '0000ff01-0000-1000-8000-00805f9b34fb',
    },
    {
      label: 'Generic FFF0',
      svc:   '0000fff0-0000-1000-8000-00805f9b34fb',
      write: '0000fff2-0000-1000-8000-00805f9b34fb',
      notif: '0000fff1-0000-1000-8000-00805f9b34fb',
    },
    {
      label: 'Generic FFF0 (Peripage-Basis)',
      svc:   '0000fff0-0000-1000-8000-00ae9bdb96f0',
      write: '0000fff2-0000-1000-8000-00ae9bdb96f0',
      notif: '0000fff1-0000-1000-8000-00ae9bdb96f0',
    },
    {
      label: 'BM Series E7810',
      svc:   'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
      notif: null,
    },
  ];

  static get ALL_SVC_UUIDS() {
    return PeripagePrinter.UUID_CANDIDATES.map(c => c.svc);
  }

  static PRINT_WIDTH = 384;
  static ROW_BYTES   = 48;   // 384 / 8
  static BLE_CHUNK   = 20;   // Bytes pro BLE-Write (exakt wie Referenz)
  static BLE_DELAY   = 18;   // ms zwischen Chunks

  constructor() {
    this.device     = null;
    this.gattServer = null;
    this.writeChar  = null;
    this.connected  = false;
    this.printing   = false;

    this.onStatusChange = null;
    this.onLog          = null;
    this.onUuidProgress = null;
  }

  // === CRC-8 (nur ueber DATA) ===================================
  static crc8(data) {
    let c = 0;
    for (let i = 0; i < data.length; i++) {
      c ^= data[i];
      for (let j = 0; j < 8; j++) {
        c = (c & 0x80) ? ((c << 1) ^ 0x07) & 0xFF : (c << 1) & 0xFF;
      }
    }
    return c;
  }

  // === Paket bauen ==============================================
  // Format: [0x51, 0x78, CMD, 0x00, LEN_LO, LEN_HI, DATA..., CRC8(DATA)]
  static buildPacket(cmd, data) {
    data = data || [];
    const d = Array.isArray(data) ? data : Array.from(data);
    const header = [0x51, 0x78, cmd, 0x00, d.length & 0xFF, (d.length >> 8) & 0xFF];
    const crc = PeripagePrinter.crc8(d);
    return new Uint8Array(header.concat(d).concat([crc]));
  }

  // === VERBINDEN ================================================
  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth nicht verfuegbar. Bitte Chrome/Edge verwenden.');
    }
    if (!window.isSecureContext) {
      throw new Error('Kein sicherer Kontext (HTTPS oder localhost erforderlich).');
    }

    this._log('info', 'Oeffne BLE-Geraeteauswahl...');
    this._status('connecting', 'Verbinde...');

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PeripagePrinter.ALL_SVC_UUIDS,
    });

    this.device = device;
    this._log('info', 'Geraet: ' + (device.name || '(kein Name)') + ' [' + device.id + ']');

    device.addEventListener('gattserverdisconnected', () => {
      this._log('warn', 'GATT getrennt');
      this._onDisconnect();
    });

    this.gattServer = await device.gatt.connect();
    this._log('success', 'GATT verbunden');

    const char = await this._tryAllUUIDs(this.gattServer);
    if (!char) {
      throw new Error('Kein kompatibler Service gefunden. Drucker eingeschaltet?');
    }

    this.writeChar = char;
    this.connected = true;
    this._status('connected', device.name || 'Peripage P21');
    this._log('success', 'Drucker bereit! Protokoll-Modus: ' + PeripagePrinter.PROTOCOL_MODE);
    return true;
  }

  // === UUID-Scan ================================================
  async _tryAllUUIDs(gattServer) {
    const candidates = PeripagePrinter.UUID_CANDIDATES;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      this._uuidProgress(i, c.label, 'trying');
      this._log('info', 'Teste [' + (i + 1) + '/' + candidates.length + ']: ' + c.label);
      try {
        const svc = await gattServer.getPrimaryService(c.svc);
        this._uuidProgress(i, c.label, 'found');
        this._log('success', 'Service gefunden: ' + c.label);
        try {
          const ch = await svc.getCharacteristic(c.write);
          this._log('success', 'Write-Char: ' + c.write);
          await this._setupNotify(svc, c);
          return ch;
        } catch {
          this._log('warn', 'Write-Char nicht direkt, auto-scan...');
          const ch = await this._autoFindWriteChar(svc);
          if (ch) { await this._setupNotify(svc, c); return ch; }
        }
      } catch {
        this._uuidProgress(i, c.label, 'fail');
      }
    }
    return null;
  }

  async _autoFindWriteChar(svc) {
    try {
      const chars = await svc.getCharacteristics();
      for (const ch of chars) {
        const w = ch.properties.write || ch.properties.writeWithoutResponse;
        this._log('info', '  ' + ch.uuid + ' write=' + (w ? 'JA' : 'nein') + ' notify=' + (ch.properties.notify ? 'JA' : 'nein'));
        if (w) { this._log('success', 'Auto-Write: ' + ch.uuid); return ch; }
      }
    } catch (e) {
      this._log('warn', 'getCharacteristics: ' + e.message);
    }
    return null;
  }

  async _setupNotify(svc, candidate) {
    try {
      let nc = null;
      if (candidate.notif) nc = await svc.getCharacteristic(candidate.notif).catch(() => null);
      if (!nc) {
        const chars = await svc.getCharacteristics().catch(() => []);
        nc = chars.find(c => c.properties.notify) || null;
      }
      if (nc) {
        await nc.startNotifications();
        nc.addEventListener('characteristicvaluechanged', (e) => {
          const b = Array.from(new Uint8Array(e.target.value.buffer));
          this._log('info', '<< ' + b.map(x => x.toString(16).padStart(2,'0')).join(' '));
        });
        this._log('info', 'Notify aktiv (Drucker-Antworten werden geloggt)');
      }
    } catch (e) {
      this._log('warn', 'Notify nicht verfuegbar: ' + e.message);
    }
  }

  // === TRENNEN ==================================================
  disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._onDisconnect();
  }

  _onDisconnect() {
    this.connected = false;
    this.printing  = false;
    this.writeChar = null;
    this._status('disconnected', 'Nicht verbunden');
  }

  // === DRUCKEN ==================================================
  // canvas: HTMLCanvasElement mit Inhalt
  // heat:   0-63 (Druckwaerme; ~35 = gut)
  // rotate: wenn true → 90° Drehung fuer Banner-/Querformat
  async printCanvas(canvas, heat, rotate) {
    heat   = (heat   === undefined) ? 35  : heat;
    rotate = (rotate === undefined) ? false : rotate;

    if (!this.connected || !this.writeChar) throw new Error('Drucker nicht verbunden!');
    if (this.printing) throw new Error('Druck laeuft bereits!');

    this.printing = true;
    this._status('connected', 'Druckt...');

    try {
      // Canvas ggf. rotieren fuer Querformat/Banner
      const srcCanvas = rotate ? this._rotateCanvas(canvas) : canvas;
      const bdata = this._canvasToBitmap(srcCanvas);

      this._log('info', 'Bitmap: ' + bdata.W + 'x' + bdata.H + 'px [heat=' + heat + ' mode=' + PeripagePrinter.PROTOCOL_MODE + ']');

      if (PeripagePrinter.PROTOCOL_MODE === 'A') {
        await this._printModeA(bdata, heat);
      } else {
        await this._printModeB(bdata, heat);
      }

      this._log('success', 'Druck abgeschlossen!');
    } finally {
      this.printing = false;
      this._status('connected', (this.device && this.device.name) ? this.device.name : 'Verbunden');
    }
  }

  // --- MODE A: heat + height + row(0xA2) + feed(0xA9) ----------
  // Entspricht der Referenz-Implementierung, aber mit 0xA2 statt 0xA3
  async _printModeA(bdata, heat) {
    heat = Math.max(0, Math.min(255, heat));

    // 1. Waerme setzen (0xA4)
    this._log('info', 'MODE A: 0xA4 heat=' + heat);
    await this._sendCmd(0xA4, [heat & 0xFF]);
    await this._delay(120);

    // 2. Hoehe mitteilen (0xBE) — hi byte zuerst, dann lo
    const hi = (bdata.H >> 8) & 0xFF;
    const lo = bdata.H & 0xFF;
    this._log('info', 'MODE A: 0xBE height=' + bdata.H + ' [' + hi + ',' + lo + ']');
    await this._sendCmd(0xBE, [hi, lo]);
    await this._delay(150);

    // 3. Zeilen senden (0xA2 — exakt 48 Bytes pro Zeile)
    for (let r = 0; r < bdata.H; r++) {
      const row = Array.from(bdata.bm.slice(r * bdata.rb, (r + 1) * bdata.rb));
      await this._sendCmd(0xA2, row);
      if (r % 15 === 0) {
        this._log('info', 'Zeile ' + r + '/' + bdata.H);
        await this._delay(5);
      }
    }

    await this._delay(300);

    // 4. Papiervorschub (0xA9)
    this._log('info', 'MODE A: 0xA9 feed');
    await this._sendCmd(0xA9, [0x00, 60]);
    await this._delay(600);
  }

  // --- MODE B: energy(0xAF) + lattice(0xBE) + row(0xA2) + feed(0xA1)
  async _printModeB(bdata, heat) {
    // Energie als 16-Bit-Wert (5000–50000)
    const energyVal = 5000 + Math.round((heat / 63) * 45000);
    const eLo = energyVal & 0xFF;
    const eHi = (energyVal >> 8) & 0xFF;

    this._log('info', 'MODE B: 0xAF energy=' + energyVal);
    await this._sendCmd(0xAF, [eLo, eHi]);
    await this._delay(50);

    this._log('info', 'MODE B: 0xBE lattice EIN');
    await this._sendCmd(0xBE, [0x31]);
    await this._delay(50);

    for (let r = 0; r < bdata.H; r++) {
      const row = Array.from(bdata.bm.slice(r * bdata.rb, (r + 1) * bdata.rb));
      await this._sendCmd(0xA2, row);
      if (r % 15 === 0) {
        this._log('info', 'Zeile ' + r + '/' + bdata.H);
        await this._delay(5);
      }
    }

    await this._delay(300);

    this._log('info', 'MODE B: 0xBE lattice AUS');
    await this._sendCmd(0xBE, [0x30]);
    await this._delay(100);

    this._log('info', 'MODE B: 0xA1 feed');
    await this._sendCmd(0xA1, [0x00, 60]);
    await this._delay(600);
  }

  // === Papiervorschub (separat) =================================
  async feedPaper(lines) {
    lines = lines || 60;
    if (!this.connected) return;
    // MODE A nutzt 0xA9, MODE B nutzt 0xA1 — versuche beide
    try {
      await this._sendCmd(0xA9, [0x00, lines & 0xFF]);
    } catch {
      await this._sendCmd(0xA1, [0x00, lines & 0xFF]);
    }
    await this._delay(600);
  }

  // === TEST-DRUCK: Einfaches Muster zum Protokoll-Debug =========
  // Druckt 20 Zeilen mit abwechselnden Mustern (hilfreich fuer
  // Protokoll-Debugging — wenn was gedruckt wird, funktionieren die Befehle)
  async testPrint() {
    if (!this.connected || !this.writeChar) throw new Error('Nicht verbunden!');
    this._log('info', '=== TEST-DRUCK START (Modus ' + PeripagePrinter.PROTOCOL_MODE + ') ===');

    const rb = PeripagePrinter.ROW_BYTES; // 48
    const H  = 40;

    // 40 Zeilen: gerade = schwarz, ungerade = weiss
    const bm = new Uint8Array(H * rb);
    for (let r = 0; r < H; r++) {
      if (r % 4 < 2) {  // gestreifte Muster
        for (let b = 0; b < rb; b++) bm[r * rb + b] = 0xAA;  // 10101010
      }
    }
    const bdata = { bm, W: 384, H, rb };

    try {
      if (PeripagePrinter.PROTOCOL_MODE === 'A') {
        await this._printModeA(bdata, 35);
      } else {
        await this._printModeB(bdata, 35);
      }
      this._log('success', 'Test-Druck abgeschlossen. Etwas gedruckt?');
    } catch (e) {
      this._log('error', 'Test-Druck Fehler: ' + e.message);
      throw e;
    }
  }

  // === Befehl senden ============================================
  async _sendCmd(cmd, data) {
    data = data || [];
    const pkt = PeripagePrinter.buildPacket(cmd, data);
    if (data.length < 10) {   // kurze Pakete vollstaendig loggen
      const hexStr = Array.from(pkt).map(b => b.toString(16).padStart(2,'0')).join(' ');
      this._log('info', '>> CMD 0x' + cmd.toString(16).toUpperCase() + ': ' + hexStr);
    } else {
      this._log('info', '>> CMD 0x' + cmd.toString(16).toUpperCase() + ' [' + data.length + 'B Daten, PKT=' + pkt.length + 'B]');
    }
    await this._bleWrite(pkt);
  }

  // === BLE-Write: writeWithoutResponse zuerst, dann writeValue ==
  // Exakt wie im funktionierenden Referenz-Skript, aber mit saubererem
  // Promise-Handling. 20-Byte-Chunks.
  async _bleWrite(buf) {
    if (!this.writeChar) throw new Error('Nicht verbunden');
    const arr = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
    const CHUNK = PeripagePrinter.BLE_CHUNK;  // 20
    const DELAY = PeripagePrinter.BLE_DELAY;  // 18

    for (let i = 0; i < arr.length; i += CHUNK) {
      const slice = arr.slice(i, i + CHUNK);
      await this._writeSlice(slice);
      if (arr.length > CHUNK) await this._delay(DELAY);
    }
  }

  async _writeSlice(slice) {
    // 1. writeValueWithoutResponse (bevorzugt fuer Drucker)
    if (this.writeChar.properties.writeWithoutResponse) {
      try {
        await this.writeChar.writeValueWithoutResponse(slice);
        return;
      } catch (e) {
        this._log('warn', 'writeWithoutResponse: ' + e.name + ' – ' + e.message);
      }
    }
    // 2. writeValueWithResponse (Fallback)
    if (this.writeChar.properties.write) {
      try {
        await this.writeChar.writeValueWithResponse(slice);
        return;
      } catch (e) {
        this._log('warn', 'writeWithResponse: ' + e.name + ' – ' + e.message);
      }
    }
    // 3. writeValue (deprecated, letzter Ausweg)
    try {
      await this.writeChar.writeValue(slice);
    } catch (e) {
      throw new Error('Alle Write-Methoden fehlgeschlagen: ' + e.message);
    }
  }

  // === 90°-Rotation fuer Querformat/Banner ======================
  // Dreht den Canvas 90° im Uhrzeigersinn, sodass horizontaler Text
  // laengs des Papierstreifens gedruckt wird (Banner-Modus).
  _rotateCanvas(src) {
    const W = PeripagePrinter.PRINT_WIDTH;
    const scale = W / src.height;   // Hoehe des Originals wird zur Druckbreite
    const rotW = Math.round(src.height * scale);  // = W = 384
    const rotH = Math.round(src.width  * scale);  // Breite wird zur Drucklaenge

    const rot = document.createElement('canvas');
    rot.width  = rotW;
    rot.height = rotH;
    const ctx = rot.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rotW, rotH);
    ctx.save();
    ctx.translate(rotW, 0);
    ctx.rotate(Math.PI / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    return rot;
  }

  // === Canvas -> 1-Bit-Bitmap (Floyd-Steinberg) ================
  _canvasToBitmap(sourceCanvas) {
    const W  = PeripagePrinter.PRINT_WIDTH;
    const rb = PeripagePrinter.ROW_BYTES;

    const scale = W / sourceCanvas.width;
    const H = Math.ceil(sourceCanvas.height * scale);

    const off = document.createElement('canvas');
    off.width  = W;
    off.height = H;
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(sourceCanvas, 0, 0, W, H);

    const id = ctx.getImageData(0, 0, W, H);
    const px = id.data;

    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const p = i * 4;
      gray[i] = 0.299 * px[p] + 0.587 * px[p+1] + 0.114 * px[p+2];
    }

    // Floyd-Steinberg Dithering
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ov = gray[i], nv = ov < 128 ? 0 : 255, er = ov - nv;
        gray[i] = nv;
        if (x + 1 < W)       gray[i + 1]     += er * 7 / 16;
        if (y + 1 < H) {
          if (x > 0)          gray[i + W - 1] += er * 3 / 16;
                              gray[i + W]     += er * 5 / 16;
          if (x + 1 < W)     gray[i + W + 1] += er * 1 / 16;
        }
      }
    }

    const bm = new Uint8Array(H * rb);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (gray[y * W + x] < 128) {
          bm[y * rb + Math.floor(x / 8)] |= (0x80 >> (x % 8));
        }
      }
    }

    return { bm, W, H, rb };
  }

  // === Utilities ================================================
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  _status(s, m) { if (this.onStatusChange) this.onStatusChange(s, m); }
  _uuidProgress(i, l, r) { if (this.onUuidProgress) this.onUuidProgress(i, l, r); }
  _log(level, msg) {
    if (this.onLog) this.onLog(level, msg);
    console.log('[' + level.toUpperCase().padEnd(7) + '] ' + msg);
  }
}
