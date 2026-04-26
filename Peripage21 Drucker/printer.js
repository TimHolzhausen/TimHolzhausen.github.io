/**
 * printer.js — Peripage P21 BLE Protocol v6 — TSPL2
 *
 * Das P21 verwendet TSPL2 (TSC Label Protocol) mit proprietaeren Erweiterungen.
 * Befehle sind ASCII-Text, direkt (ohne Binary-Framing) an die BLE-Characteristic.
 *
 * DRUCKABLAUF:
 *   SIZE 56 mm,0 mm\r\n        – Breite (58mm-Rolle, 56mm nutzbar), 0=Endlosrolle
 *   GAP 0 mm,0 mm\r\n          – Kein Etikettenabstand (Thermopapier)
 *   DENSITY n\r\n               – Druckdichte 1-15 (15=dunkel)
 *   CLS\r\n                     – Print-Puffer loeschen
 *   BITMAP 0,0,48,H,0,[data]\r\n – Bitmap drucken (48 Bytes/Zeile = 384px)
 *   PRINT 1\r\n                 – Drucken
 *
 * PAPIERVORSCHUB: FEED n\r\n (n = Dots)
 * SELBSTTEST:     SELFTEST\r\n
 *
 * BLE-WRITE: exakt wie funktionierende Referenz (writeWithoutResponse → writeValue)
 *   Aufgeteilt in 20-Byte-Chunks.
 */

'use strict';

class PeripagePrinter {

  static UUID_CANDIDATES = [
    { label: 'AE30 Peripage-Basis',   svc: '0000ae30-0000-1000-8000-00ae9bdb96f0', write: '0000ae01-0000-1000-8000-00ae9bdb96f0', notif: '0000ae02-0000-1000-8000-00ae9bdb96f0' },
    { label: 'AE30 BT-Standard',      svc: '0000ae30-0000-1000-8000-00805f9b34fb', write: '0000ae01-0000-1000-8000-00805f9b34fb', notif: '0000ae02-0000-1000-8000-00805f9b34fb' },
    { label: 'Nordic UART',           svc: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', notif: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
    { label: 'Microchip ISSC',        svc: '49535343-fe7d-4ae5-8fa9-9fafd205e455', write: '49535343-8841-43f4-a8d4-ecbe34729bb3', notif: '49535343-1e4d-4bd9-ba61-23c647249616' },
    { label: 'FF00',                  svc: '0000ff00-0000-1000-8000-00805f9b34fb', write: '0000ff02-0000-1000-8000-00805f9b34fb', notif: '0000ff01-0000-1000-8000-00805f9b34fb' },
    { label: 'FFF0',                  svc: '0000fff0-0000-1000-8000-00805f9b34fb', write: '0000fff2-0000-1000-8000-00805f9b34fb', notif: '0000fff1-0000-1000-8000-00805f9b34fb' },
    { label: 'BM E7810',              svc: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', notif: null },
  ];

  static get ALL_SVC_UUIDS() { return PeripagePrinter.UUID_CANDIDATES.map(c => c.svc); }

  static PRINT_WIDTH = 384;   // Dots (8 dots/mm * 48mm = 384)
  static ROW_BYTES   = 48;    // 384 / 8
  static LABEL_WIDTH = 56;    // mm (nutzbare Breite auf 58mm-Rolle)

  constructor() {
    this.device     = null;
    this.writeChar  = null;
    this.connected  = false;
    this.printing   = false;

    this.onStatusChange = null;
    this.onLog          = null;
    this.onUuidProgress = null;
  }

  // ================================================================
  // VERBINDEN (unveraendert — funktioniert zuverlaessig)
  // ================================================================
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth nicht verfuegbar (Chrome erforderlich)');
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
    if (!ch) throw new Error('Kein Schreib-Characteristic — Drucker eingeschaltet?');

    this.writeChar = ch;
    this._log('info', 'Char properties: ' + JSON.stringify(ch.properties));
    this.connected = true;
    this._status('connected', device.name || 'Peripage P21');
    this._log('success', '✅ Verbunden — Protokoll: TSPL2');

    // Konfiguration abfragen (optionaler Test ob Drucker antwortet)
    await this._delay(300);
    this._log('info', 'Sende CONFIG?...');
    await this._tspl('CONFIG?\r\n');
  }

  async _findWriteChar(server) {
    for (let i = 0; i < PeripagePrinter.UUID_CANDIDATES.length; i++) {
      const c = PeripagePrinter.UUID_CANDIDATES[i];
      this._uuidProgress(i, c.label, 'trying');
      try {
        const svc = await server.getPrimaryService(c.svc);
        this._uuidProgress(i, c.label, 'found');
        this._log('success', 'Service: ' + c.label);

        // Notify aufsetzen (fuer Drucker-Antworten)
        this._setupNotify(svc, c.notif);

        try {
          const ch = await svc.getCharacteristic(c.write);
          this._log('success', 'Write-Char: ' + c.write);
          return ch;
        } catch {
          const chars = await svc.getCharacteristics().catch(() => []);
          for (const ch of chars) {
            this._log('info', '  ' + ch.uuid + ' ' + JSON.stringify(ch.properties));
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
          const bytes = new Uint8Array(e.target.value.buffer);
          // Versuche als ASCII zu decodieren (TSPL2 Antworten sind Text)
          let txt = '';
          try { txt = new TextDecoder().decode(bytes); } catch {}
          const hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(' ');
          this._log('info', '<< "' + txt.replace(/[\r\n]/g,'↵') + '" [' + hex + ']');
        });
        this._log('info', 'Notify aktiv — Drucker-Antworten werden empfangen');
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
  // DRUCKEN via TSPL2
  // canvas: HTMLCanvasElement
  // heat:   0-255 (Slider, wird auf DENSITY 1-15 gemappt)
  // rotate: true = 90°-Drehung fuer Bannerdruck
  // ================================================================
  async printCanvas(canvas, heat, rotate) {
    heat   = heat   === undefined ? 128 : heat;
    rotate = rotate === undefined ? false : rotate;

    if (!this.connected || !this.writeChar) throw new Error('Drucker nicht verbunden!');
    if (this.printing) throw new Error('Druck laeuft bereits!');
    this.printing = true;
    this._status('connected', 'Druckt...');

    try {
      const src   = rotate ? this._rotateCanvas(canvas) : canvas;
      const bdata = this._canvasToBitmap(src);

      // DENSITY: 1-15 (15=dunkel), aus Slider 0-255
      const density = Math.max(1, Math.min(15, Math.round(1 + (heat / 255) * 14)));

      this._log('info', '=== TSPL2 DRUCK START ===');
      this._log('info', 'Bitmap: ' + bdata.W + 'x' + bdata.H + 'px | DENSITY=' + density + ' | Banner=' + rotate);

      // Schritt 1: Drucker initialisieren
      this._log('info', '1/5 SIZE...');
      await this._tspl('SIZE ' + PeripagePrinter.LABEL_WIDTH + ' mm,0 mm\r\n');
      await this._delay(50);

      this._log('info', '2/5 GAP...');
      await this._tspl('GAP 0 mm,0 mm\r\n');
      await this._delay(50);

      this._log('info', '3/5 DENSITY ' + density + '...');
      await this._tspl('DENSITY ' + density + '\r\n');
      await this._delay(50);

      this._log('info', '4/5 CLS...');
      await this._tspl('CLS\r\n');
      await this._delay(100);

      // Schritt 2: BITMAP-Befehl zusammenbauen
      // Format: BITMAP x,y,width_bytes,height,mode,<binary_data>\r\n
      // width_bytes = 48 (= 384 Pixel / 8)
      // mode = 0 (normal, OR)
      const cmdHeader = 'BITMAP 0,0,' + bdata.rb + ',' + bdata.H + ',0,';
      const headerBytes = new TextEncoder().encode(cmdHeader);
      const footer      = new Uint8Array([0x0D, 0x0A]); // \r\n

      // Alles zu einem Buffer zusammenfuegen
      const bitmapBuf = new Uint8Array(headerBytes.length + bdata.bm.length + footer.length);
      bitmapBuf.set(headerBytes, 0);
      bitmapBuf.set(bdata.bm, headerBytes.length);
      bitmapBuf.set(footer, headerBytes.length + bdata.bm.length);

      this._log('info', '5/5 BITMAP (' + bitmapBuf.length + ' Bytes, Header: "' + cmdHeader + '")');
      await this._bleWrite(bitmapBuf);
      await this._delay(500);

      // Schritt 3: Drucken
      this._log('info', 'PRINT 1...');
      await this._tspl('PRINT 1\r\n');
      await this._delay(800);

      this._log('success', '=== TSPL2 DRUCK FERTIG ===');
    } finally {
      this.printing = false;
      this._status('connected', (this.device && this.device.name) || 'Verbunden');
    }
  }

  // ================================================================
  // PAPIERVORSCHUB via TSPL2
  // n = Dots (1 mm = 8 dots fuer 203 DPI)
  // ================================================================
  async feedPaper(mm) {
    mm = mm || 20;
    if (!this.connected || !this.writeChar) { this._log('warn', 'Nicht verbunden'); return; }
    const dots = mm * 8;
    this._log('info', 'FEED ' + dots + ' (' + mm + 'mm)');
    await this._tspl('FEED ' + dots + '\r\n');
    await this._delay(400);
  }

  // ================================================================
  // SELBSTTEST — druckt einen eingebauten Testausdruck
  // Perfekt zum Verifizieren, dass TSPL2 funktioniert!
  // ================================================================
  async selfTest() {
    if (!this.connected || !this.writeChar) throw new Error('Nicht verbunden!');
    this._log('info', '=== SELFTEST ===');
    await this._tspl('SELFTEST\r\n');
    await this._delay(3000);
    this._log('success', 'SELFTEST gesendet');
  }

  // ================================================================
  // TEST-DRUCK — einfaches Streifenmuster per TSPL2 BITMAP
  // ================================================================
  async testPrint() {
    if (!this.connected || !this.writeChar) throw new Error('Nicht verbunden!');

    const rb = PeripagePrinter.ROW_BYTES;  // 48
    const H  = 60;
    const bm = new Uint8Array(H * rb);

    // Streifen: 3 schwarz, 3 weiss
    for (var r = 0; r < H; r++) {
      if (r % 6 < 3) {
        for (var b = 0; b < rb; b++) bm[r*rb + b] = 0xFF;
      }
    }

    this._log('info', '=== TSPL2 TEST-DRUCK (' + H + ' Zeilen) ===');

    await this._tspl('SIZE ' + PeripagePrinter.LABEL_WIDTH + ' mm,0 mm\r\n'); await this._delay(50);
    await this._tspl('GAP 0 mm,0 mm\r\n');  await this._delay(50);
    await this._tspl('DENSITY 12\r\n');       await this._delay(50);
    await this._tspl('CLS\r\n');              await this._delay(100);

    const header  = 'BITMAP 0,0,' + rb + ',' + H + ',0,';
    const hBytes  = new TextEncoder().encode(header);
    const buf     = new Uint8Array(hBytes.length + bm.length + 2);
    buf.set(hBytes); buf.set(bm, hBytes.length); buf[hBytes.length + bm.length] = 0x0D; buf[hBytes.length + bm.length + 1] = 0x0A;

    this._log('info', 'BITMAP: "' + header + '" [' + buf.length + ' Bytes]');
    await this._bleWrite(buf);
    await this._delay(400);

    await this._tspl('PRINT 1\r\n');
    await this._delay(800);
    this._log('success', 'Test-Druck fertig!');
  }

  // ================================================================
  // TSPL2-Befehl senden (ASCII-Text als Bytes)
  // ================================================================
  async _tspl(cmd) {
    const bytes = new TextEncoder().encode(cmd);
    this._log('info', '>> "' + cmd.replace(/[\r\n]/g, '\\r\\n') + '" [' + bytes.length + ' B]');
    await this._bleWrite(bytes);
  }

  // ================================================================
  // BLE-WRITE: exakt wie funktionierende Referenz
  // 20-Byte-Chunks, writeValueWithoutResponse → writeValue
  // ================================================================
  async _bleWrite(buf) {
    if (!this.writeChar) throw new Error('writeChar ist null');
    var arr  = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var self = this;
    var i    = 0;
    var CHUNK = 20;

    var next = async function() {
      if (i >= arr.length) return;
      var sl = arr.slice(i, i + CHUNK);
      i += CHUNK;

      var p;
      try { p = self.writeChar.writeValueWithoutResponse(sl); } catch(e) { p = null; }
      if (!p) { try { p = self.writeChar.writeValue(sl); } catch(e) { p = null; } }
      if (p) await p.catch(function() {
        try { return self.writeChar.writeValue(sl); } catch(e2) {}
      });

      if (arr.length > CHUNK) await self._delay(18);
      await next();
    };

    await next();
  }

  // ================================================================
  // 90-Grad-Rotation fuer Querformat/Banner-Druck
  // ================================================================
  _rotateCanvas(src) {
    var W = PeripagePrinter.PRINT_WIDTH;
    var scale = W / src.height;
    var rot = document.createElement('canvas');
    rot.width = W; rot.height = Math.round(src.width * scale);
    var ctx = rot.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rot.width, rot.height);
    ctx.save(); ctx.translate(rot.width, 0); ctx.rotate(Math.PI / 2);
    ctx.scale(scale, scale); ctx.drawImage(src, 0, 0); ctx.restore();
    return rot;
  }

  // ================================================================
  // Canvas -> 1-Bit-Bitmap (Floyd-Steinberg Dithering)
  // ================================================================
  _canvasToBitmap(sourceCanvas) {
    var W  = PeripagePrinter.PRINT_WIDTH;
    var rb = PeripagePrinter.ROW_BYTES;
    var scale = W / sourceCanvas.width;
    var H = Math.ceil(sourceCanvas.height * scale);

    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var ctx = off.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(sourceCanvas, 0, 0, W, H);

    var id  = ctx.getImageData(0, 0, W, H);
    var px  = id.data;
    var gray = new Float32Array(W * H);

    for (var idx = 0; idx < W * H; idx++) {
      var p = idx * 4;
      gray[idx] = 0.299*px[p] + 0.587*px[p+1] + 0.114*px[p+2];
    }

    var darkCount = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var ii = y*W+x, ov = gray[ii], nv = ov < 128 ? 0 : 255, er = ov-nv;
        gray[ii] = nv;
        if (nv === 0) darkCount++;
        if (x+1 < W)       gray[ii+1]   += er*7/16;
        if (y+1 < H) {
          if (x > 0)        gray[ii+W-1] += er*3/16;
                            gray[ii+W]   += er*5/16;
          if (x+1 < W)     gray[ii+W+1] += er*1/16;
        }
      }
    }

    this._log('info', 'Bitmap: ' + W + 'x' + H + ' | dunkel: ' + darkCount + ' (' + Math.round(darkCount/(W*H)*100) + '%)');
    if (darkCount === 0) this._log('warn', '⚠️ Bitmap komplett weiss — nichts wird gedruckt!');

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
