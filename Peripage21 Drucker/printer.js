/**
 * printer.js — Peripage P21 BLE Protocol v3
 *
 * VERBINDEN: Multi-UUID-Scan mit acceptAllDevices (funktioniert auf Android)
 *
 * DRUCKPROTOKOLL (ae30-Basis, korrekte Befehlsfolge):
 *   0xAF = Energie setzen [lo, hi]
 *   0xBE + [0x31] = Lattice-Modus EIN (Druckjob starten)
 *   0xA2 = Eine Bitmap-Zeile drucken (48 Bytes Daten)
 *   0xBE + [0x30] = Lattice-Modus AUS (Druckjob beenden)
 *   0xA1 = Papier vorschub [0x00, zeilen]
 *
 * PACKET-FORMAT: [0x51, 0x78, CMD, 0x00, LEN_LO, LEN_HI, DATA..., CRC8(DATA)]
 *   - CRC nur ueber DATA (nicht Header)
 *   - Kein 0xFF am Ende
 *
 * BLE-WRITE: Jedes Paket als EIN einzelner Write (kein Chunking!).
 *   Chrome handelt MTU=512 aus — Pakete bis 55 Bytes passen problemlos.
 *   Chunking auf 20 Bytes war die Ursache fuer das Druckproblem.
 */

'use strict';

class PeripagePrinter {

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
  static ROW_BYTES   = 48;
  static ROW_DELAY   = 8;    // ms nach jeder Druckzeile

  // Befehlscodes (korrekte Peripage-ae30-Befehle)
  static CMD_SET_ENERGY = 0xAF;  // Energie setzen [lo, hi]
  static CMD_LATTICE    = 0xBE;  // Lattice-Modus [0x31=ein, 0x30=aus]
  static CMD_PRINT_ROW  = 0xA2;  // Bitmap-Zeile [48 Bytes]
  static CMD_FEED_PAPER = 0xA1;  // Papiervorschub [0x00, zeilen]

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
  static buildPacket(cmd, data = []) {
    const d = Array.from(data);
    const header = [0x51, 0x78, cmd, 0x00, d.length & 0xFF, (d.length >> 8) & 0xFF];
    const crc = PeripagePrinter.crc8(d);
    return new Uint8Array([...header, ...d, crc]);
  }

  // === VERBINDEN ================================================
  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth nicht verfuegbar. Bitte Chrome/Edge verwenden.');
    }
    if (!window.isSecureContext) {
      throw new Error('Kein sicherer Kontext (HTTPS/localhost erforderlich).');
    }

    this._log('info', 'Oeffne BLE-Geraeteauswahl (alle Geraete)...');
    this._status('connecting', 'Verbinde...');

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PeripagePrinter.ALL_SVC_UUIDS,
    });

    this.device = device;
    this._log('info', 'Geraet: ' + (device.name || '(kein Name)'));

    device.addEventListener('gattserverdisconnected', () => {
      this._log('warn', 'GATT getrennt');
      this._onDisconnect();
    });

    this.gattServer = await device.gatt.connect();
    this._log('success', 'GATT verbunden');

    const char = await this._tryAllUUIDs(this.gattServer);
    if (!char) {
      throw new Error('Kein kompatibler Service gefunden. Ist der Drucker eingeschaltet?');
    }

    this.writeChar = char;
    this.connected = true;
    this._status('connected', device.name || 'Peripage P21');
    this._log('success', 'Drucker bereit!');
    return true;
  }

  // === UUID-Scan ================================================
  async _tryAllUUIDs(gattServer) {
    const candidates = PeripagePrinter.UUID_CANDIDATES;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      this._uuidProgress(i, c.label, 'trying');
      this._log('info', 'Teste [' + (i+1) + '/' + candidates.length + ']: ' + c.label);
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
        this._log('info', '  Char ' + ch.uuid + ': write=' + (w ? 'ja' : 'nein'));
        if (w) { this._log('success', 'Auto-Write-Char: ' + ch.uuid); return ch; }
      }
    } catch (e) {
      this._log('warn', 'getCharacteristics(): ' + e.message);
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
        this._log('info', 'Notify aktiv');
      }
    } catch (e) {
      this._log('warn', 'Notify: ' + e.message);
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
  // canvas: HTMLCanvasElement
  // energy: 0-255 (Kontraststufe aus Slider)
  async printCanvas(canvas, energy) {
    energy = (energy === undefined) ? 128 : energy;
    if (!this.connected || !this.writeChar) throw new Error('Drucker nicht verbunden!');
    if (this.printing) throw new Error('Druck laeuft bereits!');
    this.printing = true;
    this._status('connected', 'Druckt...');

    try {
      const bdata = this._canvasToBitmap(canvas);
      this._log('info', 'Bitmap: ' + bdata.W + 'x' + bdata.H + 'px, ' + bdata.H + ' Zeilen');

      // 1. Energie setzen (0-255 → sinnvoller Bereich fuer P21)
      const energyVal = 5000 + Math.round((energy / 255) * 45000);
      const eLo = energyVal & 0xFF;
      const eHi = (energyVal >> 8) & 0xFF;
      this._log('info', 'Energie: ' + energyVal + ' (0x' + eHi.toString(16) + eHi.toString(16) + ')');
      await this._sendCmd(PeripagePrinter.CMD_SET_ENERGY, [eLo, eHi]);
      await this._delay(50);

      // 2. Lattice-Modus EIN
      this._log('info', 'Lattice EIN (0xBE 0x31)');
      await this._sendCmd(PeripagePrinter.CMD_LATTICE, [0x31]);
      await this._delay(50);

      // 3. Zeilen senden
      let errors = 0;
      for (let row = 0; row < bdata.H; row++) {
        const rowData = Array.from(bdata.bm.slice(row * bdata.rb, (row + 1) * bdata.rb));
        try {
          await this._sendCmd(PeripagePrinter.CMD_PRINT_ROW, rowData);
        } catch (e) {
          errors++;
          this._log('warn', 'Zeile ' + row + ' Fehler: ' + e.message);
          if (errors > 15) throw new Error('Zu viele BLE-Fehler: ' + e.message);
        }
        await this._delay(PeripagePrinter.ROW_DELAY);

        if (row % 20 === 0) {
          this._log('info', 'Zeile ' + row + '/' + bdata.H + ' (' + Math.round(row/bdata.H*100) + '%)');
        }
      }

      await this._delay(200);

      // 4. Lattice-Modus AUS
      this._log('info', 'Lattice AUS (0xBE 0x30)');
      await this._sendCmd(PeripagePrinter.CMD_LATTICE, [0x30]);
      await this._delay(100);

      // 5. Papiervorschub
      await this._sendCmd(PeripagePrinter.CMD_FEED_PAPER, [0x00, 0x40]);
      await this._delay(800);

      this._log('success', 'Druck abgeschlossen!');

    } finally {
      this.printing = false;
      this._status('connected', (this.device && this.device.name) ? this.device.name : 'Verbunden');
    }
  }

  // === Papiervorschub (separat) =================================
  async feedPaper(lines) {
    lines = (lines === undefined) ? 60 : lines;
    if (!this.connected) return;
    this._log('info', 'Papier vor: ' + lines + ' Zeilen');
    await this._sendCmd(PeripagePrinter.CMD_FEED_PAPER, [0x00, lines & 0xFF]);
    await this._delay(800);
  }

  // === Befehl senden ============================================
  async _sendCmd(cmd, data) {
    data = data || [];
    const pkt = PeripagePrinter.buildPacket(cmd, data);
    const hexStr = Array.from(pkt).map(b => b.toString(16).padStart(2,'0')).join(' ');
    this._log('info', '>> 0x' + cmd.toString(16).toUpperCase() + ' [' + data.length + 'B PKT=' + pkt.length + 'B]: ' + hexStr.substring(0, 80));
    await this._bleWrite(pkt);
  }

  // === BLE-Write: GANZES PAKET als EIN Write ===================
  // Chrome handelt MTU=512 aus. Ein Zeilenpaket ist 55 Bytes -> passt!
  // Kein 20-Byte-Chunking mehr (das war die Ursache des Druckproblems).
  async _bleWrite(buf) {
    if (!this.writeChar) throw new Error('Nicht verbunden');
    const pkt = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);

    // Methoden nach verfuegbaren Properties waehlen
    const hasWrite    = this.writeChar.properties.write;
    const hasNoResp   = this.writeChar.properties.writeWithoutResponse;

    // Prioritaet: writeValueWithResponse (zuverlaessiger), dann withoutResponse
    const tryMethods = [];
    if (hasWrite)  tryMethods.push('withResponse');
    if (hasNoResp) tryMethods.push('withoutResponse');
    if (tryMethods.length === 0) tryMethods.push('withResponse', 'withoutResponse');

    for (const method of tryMethods) {
      try {
        if (method === 'withResponse') {
          await this.writeChar.writeValueWithResponse(pkt);
        } else {
          await this.writeChar.writeValueWithoutResponse(pkt);
        }
        return;  // Erfolg!
      } catch (e) {
        const msg = (e.message || '').toLowerCase();
        this._log('warn', method + ' fehlgeschlagen [' + e.name + ']: ' + e.message);
        // "Paket zu gross" → Chunking versuchen
        if (msg.includes('bytes') || msg.includes('length') || msg.includes('mtu') || msg.includes('large') || e.name === 'InvalidStateError') {
          this._log('warn', 'Paket zu gross fuer MTU, versuche 20-Byte-Chunking...');
          await this._bleWriteChunked(pkt, method);
          return;
        }
        // Anderer Fehler: naechste Methode versuchen
      }
    }

    // Letzter Ausweg: Chunking
    this._log('warn', 'Alle Write-Methoden fehlgeschlagen, Chunking...');
    await this._bleWriteChunked(pkt, tryMethods[0]);
  }

  async _bleWriteChunked(buf, method) {
    const CHUNK = 20;
    for (let i = 0; i < buf.length; i += CHUNK) {
      const slice = buf.slice(i, i + CHUNK);
      if (method === 'withResponse') {
        await this.writeChar.writeValueWithResponse(slice);
      } else {
        await this.writeChar.writeValueWithoutResponse(slice);
      }
      await this._delay(20);
    }
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
    console.log('[' + level.toUpperCase() + '] ' + msg);
  }
}
