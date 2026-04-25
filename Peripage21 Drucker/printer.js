/**
 * printer.js — Peripage P21 BLE Protocol v5
 *
 * BLE-WRITE: EXAKT wie das funktionierende Referenz-Skript:
 *   try { writeValueWithoutResponse } catch { p=null }
 *   if (!p) p = writeValue(sl)
 *   await p.catch(() => writeValue(sl))
 *
 * PROTOKOLL-BEFEHLSFOLGE (beide Modi sind testbar):
 *   Modus A:  0xA4[heat] → 0xBE[hi,lo] → 0xA2[row]×N → 0xA9[feed]
 *   Modus B:  0xA4[heat] → 0xBE[hi,lo] → 0xA3[row]×N → 0xA9[feed]
 *   (Unterschied nur im Zeilen-Befehl: 0xA2 vs 0xA3)
 *
 * PAPIERVORSCHUB: 0xA9 (bestätigt funktionierend)
 */

'use strict';

class PeripagePrinter {

  // Zeilen-Befehl: 0xA2 oder 0xA3 — per switchProtocol() umschaltbar
  static ROW_CMD = 0xA2;

  static UUID_CANDIDATES = [
    { label: 'AE30 Peripage-Basis',   svc: '0000ae30-0000-1000-8000-00ae9bdb96f0', write: '0000ae01-0000-1000-8000-00ae9bdb96f0', notif: '0000ae02-0000-1000-8000-00ae9bdb96f0' },
    { label: 'AE30 BT-Standard',      svc: '0000ae30-0000-1000-8000-00805f9b34fb', write: '0000ae01-0000-1000-8000-00805f9b34fb', notif: '0000ae02-0000-1000-8000-00805f9b34fb' },
    { label: 'Nordic UART',           svc: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', notif: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
    { label: 'Microchip ISSC',        svc: '49535343-fe7d-4ae5-8fa9-9fafd205e455', write: '49535343-8841-43f4-a8d4-ecbe34729bb3', notif: '49535343-1e4d-4bd9-ba61-23c647249616' },
    { label: 'FF00',                  svc: '0000ff00-0000-1000-8000-00805f9b34fb', write: '0000ff02-0000-1000-8000-00805f9b34fb', notif: '0000ff01-0000-1000-8000-00805f9b34fb' },
    { label: 'FFF0',                  svc: '0000fff0-0000-1000-8000-00805f9b34fb', write: '0000fff2-0000-1000-8000-00805f9b34fb', notif: '0000fff1-0000-1000-8000-00805f9b34fb' },
    { label: 'FFF0 Peripage-Basis',   svc: '0000fff0-0000-1000-8000-00ae9bdb96f0', write: '0000fff2-0000-1000-8000-00ae9bdb96f0', notif: '0000fff1-0000-1000-8000-00ae9bdb96f0' },
    { label: 'BM E7810',              svc: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', notif: null },
  ];

  static get ALL_SVC_UUIDS() { return PeripagePrinter.UUID_CANDIDATES.map(c => c.svc); }

  static PRINT_WIDTH = 384;
  static ROW_BYTES   = 48;   // 384 / 8

  constructor() {
    this.device     = null;
    this.writeChar  = null;
    this.connected  = false;
    this.printing   = false;
    this.charProps   = '';   // Wird beim Verbinden gesetzt, fuer Debug

    this.onStatusChange = null;
    this.onLog          = null;
    this.onUuidProgress = null;
  }

  // ================================================================
  // CRC-8 (exakt wie Referenzcode)
  // ================================================================
  static crc8(arr) {
    var c = 0;
    for (var j = 0; j < arr.length; j++) {
      c ^= arr[j];
      for (var i = 0; i < 8; i++) c = (c & 0x80) ? ((c << 1) ^ 0x07) & 0xFF : (c << 1) & 0xFF;
    }
    return c;
  }

  // ================================================================
  // Paket bauen: [0x51,0x78,CMD,0x00,LEN_LO,LEN_HI,DATA...,CRC8(DATA)]
  // ================================================================
  static buildPkt(cmd, data) {
    var d = Array.isArray(data) ? data : Array.from(data);
    return new Uint8Array([0x51, 0x78, cmd, 0x00, d.length & 0xFF, (d.length >> 8) & 0xFF].concat(d).concat([PeripagePrinter.crc8(d)]));
  }

  // ================================================================
  // VERBINDEN
  // ================================================================
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth nicht verfuegbar (Chrome/Edge erforderlich)');
    if (!window.isSecureContext) throw new Error('HTTPS oder localhost erforderlich');

    this._log('info', 'BLE-Auswahl oeffnen...');
    this._status('connecting', 'Verbinde...');

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PeripagePrinter.ALL_SVC_UUIDS,
    });

    this.device = device;
    this._log('info', 'Geraet: ' + (device.name || '(kein Name)'));
    device.addEventListener('gattserverdisconnected', () => this._onDisconnect());

    const server = await device.gatt.connect();
    this._log('success', 'GATT verbunden');

    const ch = await this._findWriteChar(server);
    if (!ch) throw new Error('Kein Schreib-Characteristic gefunden. Drucker eingeschaltet?');

    this.writeChar = ch;
    this.charProps  = JSON.stringify(ch.properties);
    this._log('info', 'Write-Char Properties: ' + this.charProps);
    this.connected = true;
    this._status('connected', device.name || 'Peripage P21');
    this._log('success', 'Verbunden! Zeilen-CMD: 0x' + PeripagePrinter.ROW_CMD.toString(16).toUpperCase());
  }

  async _findWriteChar(server) {
    for (let i = 0; i < PeripagePrinter.UUID_CANDIDATES.length; i++) {
      const c = PeripagePrinter.UUID_CANDIDATES[i];
      this._uuidProgress(i, c.label, 'trying');
      try {
        const svc = await server.getPrimaryService(c.svc);
        this._uuidProgress(i, c.label, 'found');
        this._log('success', 'Service: ' + c.label);

        // Notify einrichten
        this._setupNotify(svc, c.notif);

        // Write-Characteristic suchen
        try {
          const ch = await svc.getCharacteristic(c.write);
          this._log('success', 'Write-Char gefunden: ' + c.write);
          return ch;
        } catch {
          // Auto-Scan
          const chars = await svc.getCharacteristics().catch(() => []);
          for (const ch of chars) {
            this._log('info', '  ' + ch.uuid + ' props: ' + JSON.stringify(ch.properties));
            if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
          }
        }
      } catch {
        this._uuidProgress(i, c.label, 'fail');
      }
    }
    return null;
  }

  async _setupNotify(svc, notifUuid) {
    try {
      let nc = null;
      if (notifUuid) nc = await svc.getCharacteristic(notifUuid).catch(() => null);
      if (!nc) {
        const chars = await svc.getCharacteristics().catch(() => []);
        nc = chars.find(c => c.properties.notify) || null;
      }
      if (nc) {
        await nc.startNotifications();
        nc.addEventListener('characteristicvaluechanged', (e) => {
          const bytes = Array.from(new Uint8Array(e.target.value.buffer));
          this._log('info', '<< DRUCKER: ' + bytes.map(b => b.toString(16).padStart(2,'0')).join(' '));
        });
        this._log('info', 'Notify aktiv — Drucker-Antworten werden unten angezeigt');
      }
    } catch(e) { this._log('warn', 'Notify: ' + e.message); }
  }

  // ================================================================
  // TRENNEN
  // ================================================================
  disconnect() {
    try { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); } catch {}
    this._onDisconnect();
  }

  _onDisconnect() {
    this.connected = false; this.printing = false; this.writeChar = null;
    this._status('disconnected', 'Nicht verbunden');
  }

  // ================================================================
  // DRUCKEN
  // heat: 0-255 (Slider-Wert), rotate: Banner-Modus (90deg)
  // ================================================================
  async printCanvas(canvas, heat, rotate) {
    heat   = heat   === undefined ? 128 : heat;
    rotate = rotate === undefined ? false : rotate;

    if (!this.connected || !this.writeChar) throw new Error('Drucker nicht verbunden!');
    if (this.printing) throw new Error('Druck laeuft bereits!');
    this.printing = true;
    this._status('connected', 'Druckt...');

    try {
      const src = rotate ? this._rotateCanvas(canvas) : canvas;
      const bdata = this._canvasToBitmap(src);
      const heatByte = Math.max(1, Math.min(255, Math.round(heat)));
      const rowCmd = PeripagePrinter.ROW_CMD;

      this._log('info', '=== DRUCK START ===');
      this._log('info', 'Bitmap: ' + bdata.W + 'x' + bdata.H + 'px | heat=' + heatByte + ' | rowCMD=0x' + rowCmd.toString(16).toUpperCase() + ' | Banner=' + rotate);

      // Schritt 1: Waerme setzen (0xA4)
      this._log('info', '1. 0xA4 [heat=' + heatByte + ']');
      await this._send(0xA4, [heatByte]);
      await this._delay(120);

      // Schritt 2: Hoehe mitteilen (0xBE) — [hi, lo]
      const hi = (bdata.H >> 8) & 0xFF;
      const lo = bdata.H & 0xFF;
      this._log('info', '2. 0xBE [height=' + bdata.H + ' => hi=' + hi + ' lo=' + lo + ']');
      await this._send(0xBE, [hi, lo]);
      await this._delay(150);

      // Schritt 3: Zeilen senden
      this._log('info', '3. Sende ' + bdata.H + ' Zeilen (CMD=0x' + rowCmd.toString(16).toUpperCase() + ')...');
      for (var r = 0; r < bdata.H; r++) {
        var row = Array.from(bdata.bm.slice(r * bdata.rb, (r+1) * bdata.rb));
        await this._send(rowCmd, row);
        if (r % 15 === 0) { await this._delay(5); }
        if (r % 50 === 0) this._log('info', '   Zeile ' + r + '/' + bdata.H + ' (' + Math.round(r/bdata.H*100) + '%)');
      }
      await this._delay(300);

      // Schritt 4: Papiervorschub (0xA9)
      this._log('info', '4. 0xA9 [feed=60]');
      await this._send(0xA9, [0x00, 60]);
      await this._delay(600);

      this._log('success', '=== DRUCK FERTIG ===');
    } finally {
      this.printing = false;
      this._status('connected', (this.device && this.device.name) || 'Verbunden');
    }
  }

  // ================================================================
  // PAPIERVORSCHUB (0xA9 — bestätigt funktioniered)
  // ================================================================
  async feedPaper(lines) {
    lines = lines || 60;
    if (!this.connected || !this.writeChar) { this._log('warn', 'feedPaper: nicht verbunden'); return; }
    this._log('info', 'Papier vor: 0xA9 [0x00, ' + lines + ']');
    await this._send(0xA9, [0x00, lines & 0xFF]);
    await this._delay(600);
  }

  // ================================================================
  // TEST-DRUCK: Streifenmuster (kein Text — reines Protokoll-Debug)
  // ================================================================
  async testPrint() {
    if (!this.connected || !this.writeChar) throw new Error('Nicht verbunden!');
    const rb = PeripagePrinter.ROW_BYTES;
    const H  = 40;
    const bm = new Uint8Array(H * rb);
    for (var r = 0; r < H; r++) {
      // Gestreiftes Muster: 2 Zeilen schwarz, 2 Zeilen weiss
      if (r % 4 < 2) {
        for (var b = 0; b < rb; b++) bm[r*rb + b] = 0xFF;  // Vollschwarz
      }
    }
    this._log('info', '=== TEST-DRUCK (' + H + ' Zeilen, CMD=0x' + PeripagePrinter.ROW_CMD.toString(16).toUpperCase() + ') ===');
    await this.printCanvas({ width: 384, height: H,
      getContext: () => ({
        fillStyle: '', fillRect: () => {},
        drawImage: () => {},
        getImageData: (x, y, w, h) => ({
          data: (() => {
            const d = new Uint8ClampedArray(w*h*4);
            for (var i=0; i<w*h; i++) {
              const row = Math.floor(i/w), col = i%w;
              const idx = row*rb + Math.floor(col/8);
              const bit = (0x80 >> (col%8));
              const dark = bm[idx] & bit;
              d[i*4]   = dark ? 0 : 255;
              d[i*4+1] = dark ? 0 : 255;
              d[i*4+2] = dark ? 0 : 255;
              d[i*4+3] = 255;
            }
            return d;
          })()
        })
      })
    }, 200, false);
  }

  // ================================================================
  // Befehl senden — mit vollstaendigem Hex-Log
  // ================================================================
  async _send(cmd, data) {
    var pkt = PeripagePrinter.buildPkt(cmd, data);
    var hex = Array.from(pkt).map(b => b.toString(16).padStart(2,'0')).join(' ');
    // Kurz-Log fuer lange Pakete
    if (pkt.length > 20) {
      this._log('info', '>> 0x' + cmd.toString(16).toUpperCase() + ' [' + pkt.length + 'B]: ' + hex.substring(0, 60) + '...');
    } else {
      this._log('info', '>> 0x' + cmd.toString(16).toUpperCase() + ': ' + hex);
    }
    await this._bleWrite(pkt);
  }

  // ================================================================
  // BLE-WRITE: EXAKT wie das funktionierende Referenzskript
  // Aufgeteilt in 20-Byte-Chunks (CFG.BLE_CHUNK=20)
  // Delay 18ms zwischen Chunks wenn Paket > 20 Bytes (CFG.BLE_DELAY=18)
  // ================================================================
  async _bleWrite(buf) {
    if (!this.writeChar) throw new Error('writeChar ist null!');
    var arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var CHUNK = 20;

    var i = 0;
    var self = this;

    var sendChunk = async function() {
      if (i >= arr.length) return;
      var sl = arr.slice(i, i + CHUNK);
      i += CHUNK;

      // === EXAKT wie Referenzcode ===
      var p;
      try { p = self.writeChar.writeValueWithoutResponse(sl); } catch(e) { p = null; }
      if (!p) { try { p = self.writeChar.writeValue(sl); } catch(e) { p = null; } }
      if (p) {
        await p.catch(function() {
          try { return self.writeChar.writeValue(sl); } catch(e2) {}
        });
      }
      // =============================

      if (arr.length > CHUNK) await self._delay(18);
      await sendChunk();
    };

    await sendChunk();
  }

  // ================================================================
  // 90-Grad-Rotation fuer Banner-Modus
  // ================================================================
  _rotateCanvas(src) {
    var W = PeripagePrinter.PRINT_WIDTH;
    var scale = W / src.height;
    var rotW = W;
    var rotH = Math.round(src.width * scale);
    var rot = document.createElement('canvas');
    rot.width = rotW; rot.height = rotH;
    var ctx = rot.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rotW, rotH);
    ctx.save(); ctx.translate(rotW, 0); ctx.rotate(Math.PI / 2); ctx.scale(scale, scale); ctx.drawImage(src, 0, 0); ctx.restore();
    return rot;
  }

  // ================================================================
  // Canvas -> 1-Bit Bitmap (Floyd-Steinberg)
  // ================================================================
  _canvasToBitmap(sourceCanvas) {
    var W  = PeripagePrinter.PRINT_WIDTH;
    var rb = PeripagePrinter.ROW_BYTES;
    var scale = W / sourceCanvas.width;
    var H = Math.ceil(sourceCanvas.height * scale);

    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var ctx = off.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(sourceCanvas, 0, 0, W, H);

    var id = ctx.getImageData(0, 0, W, H);
    var px = id.data;
    var gray = new Float32Array(W * H);

    for (var idx = 0; idx < W * H; idx++) {
      var p = idx * 4;
      gray[idx] = 0.299*px[p] + 0.587*px[p+1] + 0.114*px[p+2];
    }

    // Dunkle Pixel zaehlen (Debug)
    var darkCount = 0;

    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y*W+x, ov = gray[i], nv = ov < 128 ? 0 : 255, er = ov-nv;
        gray[i] = nv;
        if (nv === 0) darkCount++;
        if (x+1 < W)       gray[i+1]   += er*7/16;
        if (y+1 < H) {
          if (x > 0)        gray[i+W-1] += er*3/16;
                            gray[i+W]   += er*5/16;
          if (x+1 < W)     gray[i+W+1] += er*1/16;
        }
      }
    }

    this._log('info', 'Bitmap: ' + W + 'x' + H + 'px | dunkle Pixel: ' + darkCount + ' (' + Math.round(darkCount/(W*H)*100) + '%)');
    if (darkCount === 0) this._log('warn', 'WARNUNG: Bitmap ist leer (0 dunkle Pixel)! Wird nicht gedruckt.');

    var bm = new Uint8Array(H * rb);
    for (var y2 = 0; y2 < H; y2++) {
      for (var x2 = 0; x2 < W; x2++) {
        if (gray[y2*W+x2] < 128) bm[y2*rb + Math.floor(x2/8)] |= (0x80 >> (x2%8));
      }
    }

    return { bm: bm, W: W, H: H, rb: rb };
  }

  _delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  _status(s, m) { if (this.onStatusChange) this.onStatusChange(s, m); }
  _uuidProgress(i, l, r) { if (this.onUuidProgress) this.onUuidProgress(i, l, r); }
  _log(level, msg) {
    if (this.onLog) this.onLog(level, msg);
    console.log('[' + level.padEnd(7) + '] ' + msg);
  }
}
