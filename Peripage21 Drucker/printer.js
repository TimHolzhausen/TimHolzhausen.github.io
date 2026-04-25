/**
 * printer.js — Peripage P21 BLE Protocol Implementation v2
 *
 * Verbindungs-Logik:  Multi-UUID-Scan (aus funktionierender Referenz-Impl.)
 * Druckprotokoll:     Row-by-row mit Befehlen 0xA4/0xBE/0xA3/0xA9
 *
 * Packet-Format: [0x51, 0x78, CMD, 0x00, LEN_LO, LEN_HI, ...DATA, CRC8(DATA)]
 *   - CRC wird nur über DATA berechnet (nicht über Header)
 *   - Kein abschließendes 0xFF
 *
 * UUID-Basis: 0000ae30-0000-1000-8000-00ae9bdb96f0 (Peripage-spezifisch!)
 *   Die Standard-BT-Basis 00805f9b34fb funktioniert auf manchen Geräten NICHT.
 */

'use strict';

class PeripagePrinter {

  // ── Alle bekannten UUID-Kombinationen ─────────────────────────
  // Reihenfolge: wahrscheinlichste zuerst
  static UUID_CANDIDATES = [
    {
      label: 'PeriPage/Paperang AE30 (Peripage-Basis)',
      svc:   '0000ae30-0000-1000-8000-00ae9bdb96f0',
      write: '0000ae01-0000-1000-8000-00ae9bdb96f0',
      notif: '0000ae02-0000-1000-8000-00ae9bdb96f0',
    },
    {
      label: 'AE30 (BT-Standard-Basis)',
      svc:   '0000ae30-0000-1000-8000-00805f9b34fb',
      write: '0000ae01-0000-1000-8000-00805f9b34fb',
      notif: '0000ae02-0000-1000-8000-00805f9b34fb',
    },
    {
      label: 'Nordic UART Service (NUS)',
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

  // Alle Service-UUIDs für optionalServices
  static get ALL_SVC_UUIDS() {
    return PeripagePrinter.UUID_CANDIDATES.map(c => c.svc);
  }

  // ── Drucker-Konfiguration ──────────────────────────────────────
  static PRINT_WIDTH = 384;          // px (fest für P21)
  static ROW_BYTES   = 48;           // 384 / 8
  static BLE_CHUNK   = 20;           // Bytes pro BLE-Write (klein für Stabilität)
  static BLE_DELAY   = 18;           // ms zwischen Chunks
  static ROW_DELAY   = 5;            // ms zwischen Druckzeilen

  // ── Protokoll-Befehle ──────────────────────────────────────────
  static CMD_SET_HEAT    = 0xA4;  // Druckdichte [heat_value]
  static CMD_SET_HEIGHT  = 0xBE;  // Jobhöhe [hi, lo]
  static CMD_PRINT_ROW   = 0xA3;  // Eine Zeile [48 bytes]
  static CMD_FEED_PAPER  = 0xA9;  // Papiervorschub [0x00, lines]
  static CMD_GET_STATUS  = 0xA8;  // Status abfragen

  constructor() {
    this.device     = null;
    this.gattServer = null;
    this.writeChar  = null;
    this.connected  = false;
    this.printing   = false;

    // UI-Callbacks
    this.onStatusChange  = null;   // (state, message) => void
    this.onLog           = null;   // (level, message) => void
    this.onUuidProgress  = null;   // (index, label, result) => void  result: 'trying'|'found'|'fail'
  }

  // ════════════════════════════════════════════════════════════════
  // CRC-8 — nur über DATA berechnet (kein Header, kein Trailer!)
  // ════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════
  // Paket bauen: [0x51, 0x78, CMD, 0x00, LEN_LO, LEN_HI, ...DATA, CRC8(DATA)]
  // ════════════════════════════════════════════════════════════════
  static buildPacket(cmd, data = []) {
    const d = Array.from(data);
    const header = [0x51, 0x78, cmd, 0x00, d.length & 0xFF, (d.length >> 8) & 0xFF];
    const crc = PeripagePrinter.crc8(d);  // CRC nur über DATA
    return new Uint8Array([...header, ...d, crc]);  // kein 0xFF am Ende!
  }

  // ════════════════════════════════════════════════════════════════
  // VERBINDEN — Multi-UUID-Scan (funktioniert auf Android)
  // ════════════════════════════════════════════════════════════════
  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth nicht verfügbar. Bitte Chrome/Edge verwenden.');
    }
    if (!window.isSecureContext) {
      throw new Error('Kein sicherer Kontext (HTTPS/localhost erforderlich).');
    }

    this._log('info', 'Öffne BLE-Dialog (alle Geräte)...');
    this._status('connecting', 'Verbinde...');

    // Direkt acceptAllDevices — funktioniert zuverlässig auf Android
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PeripagePrinter.ALL_SVC_UUIDS,
    });

    this.device = device;
    this._log('info', `Gerät: ${device.name || '(kein Name)'} | ${device.id}`);

    device.addEventListener('gattserverdisconnected', () => {
      this._log('warn', 'GATT getrennt');
      this._onDisconnect();
    });

    this._log('info', 'Verbinde GATT...');
    this.gattServer = await device.gatt.connect();
    this._log('success', 'GATT verbunden');

    // Jeden Service-UUID einzeln testen
    const char = await this._tryAllUUIDs(this.gattServer);
    if (!char) {
      throw new Error('Kein kompatibler Service gefunden. Prüfe ob der Drucker eingeschaltet ist.');
    }

    this.writeChar = char;
    this.connected = true;
    this._status('connected', device.name || 'Peripage P21');
    this._log('success', 'Drucker bereit!');
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // Jeden UUID-Kandidaten einzeln prüfen
  // ════════════════════════════════════════════════════════════════
  async _tryAllUUIDs(gattServer) {
    const candidates = PeripagePrinter.UUID_CANDIDATES;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      this._uuidProgress(i, c.label, 'trying');
      this._log('info', `Teste [${i+1}/${candidates.length}]: ${c.label}`);

      try {
        const svc = await gattServer.getPrimaryService(c.svc);
        this._uuidProgress(i, c.label, 'found');
        this._log('success', `Service gefunden: ${c.label}`);

        // Write-Characteristic direkt versuchen
        try {
          const ch = await svc.getCharacteristic(c.write);
          this._log('success', `Write-Char: ${c.write}`);
          await this._setupNotify(svc, c);
          return ch;
        } catch {
          this._log('warn', 'Write-Char nicht direkt gefunden, auto-scan...');
          const ch = await this._autoFindWriteChar(svc);
          if (ch) {
            await this._setupNotify(svc, c);
            return ch;
          }
        }
      } catch {
        this._uuidProgress(i, c.label, 'fail');
        // Nächster Kandidat
      }
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // Schreibbare Characteristic automatisch finden
  // ════════════════════════════════════════════════════════════════
  async _autoFindWriteChar(svc) {
    try {
      const chars = await svc.getCharacteristics();
      for (const ch of chars) {
        const w = ch.properties.write || ch.properties.writeWithoutResponse;
        this._log('info', `  Char ${ch.uuid}: write=${w?'ja':'nein'} notify=${ch.properties.notify?'ja':'nein'}`);
        if (w) {
          this._log('success', `Auto: Write-Char gefunden: ${ch.uuid}`);
          return ch;
        }
      }
    } catch (e) {
      this._log('warn', `getCharacteristics() fehlgeschlagen: ${e.message}`);
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // Notify-Characteristic einrichten (optional)
  // ════════════════════════════════════════════════════════════════
  async _setupNotify(svc, candidate) {
    try {
      let nc = null;
      if (candidate.notif) {
        nc = await svc.getCharacteristic(candidate.notif).catch(() => null);
      }
      if (!nc) {
        const chars = await svc.getCharacteristics().catch(() => []);
        nc = chars.find(c => c.properties.notify) || null;
      }
      if (nc) {
        await nc.startNotifications();
        nc.addEventListener('characteristicvaluechanged', (e) => {
          const b = Array.from(new Uint8Array(e.target.value.buffer));
          const hex = b.map(x => x.toString(16).padStart(2,'0')).join(' ');
          this._log('info', `<< Notify: ${hex}`);
        });
        this._log('info', 'Notify-Char aktiv');
      }
    } catch (e) {
      this._log('warn', `Notify nicht verfügbar: ${e.message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // TRENNEN
  // ════════════════════════════════════════════════════════════════
  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this._onDisconnect();
  }

  _onDisconnect() {
    this.connected = false;
    this.printing  = false;
    this.writeChar = null;
    this.gattServer = null;
    this._status('disconnected', 'Nicht verbunden');
  }

  // ════════════════════════════════════════════════════════════════
  // DRUCKEN — Canvas → 1-Bit-Bitmap → Row-by-Row
  // canvas:  HTMLCanvasElement (beliebige Größe, wird skaliert)
  // heat:    0–63 (Druckdichte, Default 35)
  // ════════════════════════════════════════════════════════════════
  async printCanvas(canvas, heat = 35) {
    if (!this.connected || !this.writeChar) throw new Error('Drucker nicht verbunden!');
    if (this.printing) throw new Error('Druck läuft bereits!');
    this.printing = true;
    this._status('connected', 'Druckt...');

    try {
      // Zu 384px skalieren
      const bdata = this._canvasToBitmap(canvas);
      this._log('info', `Bitmap: ${bdata.W}×${bdata.H}px, ${bdata.H} Zeilen`);

      // 1. Wärme/Dichte setzen
      await this._sendCmd(PeripagePrinter.CMD_SET_HEAT, [heat & 0xFF]);
      await this._delay(120);

      // 2. Druckjob starten (mit Höhe)
      const hi = (bdata.H >> 8) & 0xFF;
      const lo = bdata.H & 0xFF;
      await this._sendCmd(PeripagePrinter.CMD_SET_HEIGHT, [hi, lo]);
      await this._delay(150);

      // 3. Zeilen senden
      for (let row = 0; row < bdata.H; row++) {
        const rowData = Array.from(bdata.bm.slice(row * bdata.rb, (row + 1) * bdata.rb));
        await this._sendCmd(PeripagePrinter.CMD_PRINT_ROW, rowData);
        if (row % 15 === 0) {
          this._log('info', `Fortschritt: ${row}/${bdata.H} (${Math.round(row/bdata.H*100)}%)`);
          await this._delay(PeripagePrinter.ROW_DELAY);
        }
      }

      await this._delay(300);

      // 4. Papier vorschub
      await this._sendCmd(PeripagePrinter.CMD_FEED_PAPER, [0x00, 60]);
      await this._delay(600);

      this._log('success', 'Druck abgeschlossen!');
    } finally {
      this.printing = false;
      this._status('connected', this.device?.name || 'Verbunden');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Papier vorschub
  // ════════════════════════════════════════════════════════════════
  async feedPaper(lines = 60) {
    if (!this.connected) return;
    await this._sendCmd(PeripagePrinter.CMD_FEED_PAPER, [0x00, lines & 0xFF]);
    await this._delay(600);
  }

  // ════════════════════════════════════════════════════════════════
  // Canvas → Floyd-Steinberg geditherte 1-Bit-Bitmap
  // ════════════════════════════════════════════════════════════════
  _canvasToBitmap(sourceCanvas) {
    const W  = PeripagePrinter.PRINT_WIDTH;
    const rb = PeripagePrinter.ROW_BYTES;  // 48

    // Skalieren
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

    // Zu Graustufen-Float-Array
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const p = i * 4;
      gray[i] = 0.299 * px[p] + 0.587 * px[p+1] + 0.114 * px[p+2];
    }

    // Floyd-Steinberg Dithering
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i  = y * W + x;
        const ov = gray[i];
        const nv = ov < 128 ? 0 : 255;
        const er = ov - nv;
        gray[i] = nv;
        if (x + 1 < W)            gray[i + 1]     += er * 7 / 16;
        if (y + 1 < H) {
          if (x > 0)               gray[i + W - 1] += er * 3 / 16;
                                   gray[i + W]     += er * 5 / 16;
          if (x + 1 < W)           gray[i + W + 1] += er * 1 / 16;
        }
      }
    }

    // 1-Bit-Bitmap
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

  // ════════════════════════════════════════════════════════════════
  // BLE-Schreiben mit Chunking (20 Bytes / Chunk)
  // ════════════════════════════════════════════════════════════════
  async _sendCmd(cmd, data = []) {
    const pkt = PeripagePrinter.buildPacket(cmd, data);
    await this._bleWrite(pkt);
  }

  async _bleWrite(buf) {
    if (!this.writeChar) throw new Error('Nicht verbunden');
    const ch = PeripagePrinter.BLE_CHUNK;
    const dl = PeripagePrinter.BLE_DELAY;
    for (let i = 0; i < buf.length; i += ch) {
      const slice = buf.slice(i, i + ch);
      try {
        await this.writeChar.writeValueWithoutResponse(slice);
      } catch {
        await this.writeChar.writeValue(slice);
      }
      if (buf.length > ch) await this._delay(dl);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Utilities
  // ════════════════════════════════════════════════════════════════
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  _status(state, message) {
    if (this.onStatusChange) this.onStatusChange(state, message);
  }

  _uuidProgress(index, label, result) {
    if (this.onUuidProgress) this.onUuidProgress(index, label, result);
  }

  _log(level, message) {
    if (this.onLog) this.onLog(level, message);
    const pfx = { info: '[INFO]', warn: '[WARN]', error: '[ERR ]', success: '[OK  ]' }[level] || '[LOG ]';
    console.log(`${pfx} ${message}`);
  }
}
