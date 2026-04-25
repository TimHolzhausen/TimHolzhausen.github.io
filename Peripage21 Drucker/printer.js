/**
 * printer.js — Peripage P21 BLE Protocol Implementation
 *
 * Protocol references:
 * - BLE Service UUID: 0000ae30-0000-1000-8000-00805f9b34fb
 * - Write Characteristic: 0000ae01-0000-1000-8000-00805f9b34fb
 * - Notify Characteristic: 0000ae02-0000-1000-8000-00805f9b34fb
 *
 * Packet format (for ae30-based models):
 *   [0x51, 0x78] [CMD] [0x00] [LEN_LO] [LEN_HI] [DATA...] [CRC8] [0xFF]
 *
 * A6/P21 also supports RFCOMM-style direct commands used via the older Python lib.
 * For BLE (P21), we use the ae30 service with packeted protocol.
 */

'use strict';

class PeripagePrinter {
  // BLE UUIDs
  static SERVICE_UUID      = '0000ae30-0000-1000-8000-00805f9b34fb';
  static WRITE_CHAR_UUID   = '0000ae01-0000-1000-8000-00805f9b34fb';
  static NOTIFY_CHAR_UUID  = '0000ae02-0000-1000-8000-00805f9b34fb';

  // Print width in pixels (fixed for Peripage A6/P21)
  static PRINT_WIDTH   = 384;
  static CHUNK_SIZE    = 200; // bytes per BLE write
  static CHUNK_DELAY   = 20;  // ms between chunks

  // Protocol commands
  static CMD_GET_DEVICE_INFO = 0xA8;
  static CMD_PRINT_BITMAP    = 0xA2;
  static CMD_FEED_PAPER      = 0xA1;
  static CMD_SET_ENERGY      = 0xAF;
  static CMD_SET_QUALITY     = 0xBE;
  static CMD_GET_STATUS      = 0xA3;

  constructor() {
    this.device         = null;
    this.server         = null;
    this.service        = null;
    this.writeChar      = null;
    this.notifyChar     = null;
    this.connected      = false;
    this.printing       = false;
    this.onStatusChange = null; // callback(status, message)
    this.onLog          = null; // callback(level, message)
  }

  // -------------------------------------------------------
  // CRC8 Checksum (polynomial 0x07, standard CRC-8)
  // -------------------------------------------------------
  static crc8(data) {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x80) {
          crc = ((crc << 1) ^ 0x07) & 0xFF;
        } else {
          crc = (crc << 1) & 0xFF;
        }
      }
    }
    return crc;
  }

  // -------------------------------------------------------
  // Build a packet: [0x51, 0x78, cmd, 0x00, lenLo, lenHi, ...data, crc, 0xFF]
  // -------------------------------------------------------
  static buildPacket(cmd, data = []) {
    const dataArray = Array.from(data);
    const lenLo = dataArray.length & 0xFF;
    const lenHi = (dataArray.length >> 8) & 0xFF;
    const body = [0x51, 0x78, cmd, 0x00, lenLo, lenHi, ...dataArray];
    const crc = PeripagePrinter.crc8(body);
    return new Uint8Array([...body, crc, 0xFF]);
  }

  // -------------------------------------------------------
  // Connect to printer via Web Bluetooth
  // -------------------------------------------------------
  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge (mit Bluetooth-Flag) verwenden.');
    }

    this._log('info', 'Suche nach Peripage P21...');
    this._status('connecting', 'Verbinde...');

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'PeriPage' },
          { namePrefix: 'Peripage' },
          { namePrefix: 'GB03' },
          { namePrefix: 'MX10' },
        ],
        optionalServices: [PeripagePrinter.SERVICE_UUID],
        // Also accept any device that has our service
        acceptAllDevices: false,
      });
    } catch (e) {
      // Fallback: accept all and look for service
      this._log('warn', 'Gefilterter Scan fehlgeschlagen, versuche acceptAllDevices...');
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [PeripagePrinter.SERVICE_UUID],
      });
    }

    this._log('info', `Gerät gefunden: ${this.device.name || 'Unbekannt'}`);

    this.device.addEventListener('gattserverdisconnected', () => {
      this._log('warn', 'Drucker getrennt (GATT disconnect)');
      this._onDisconnect();
    });

    this.server = await this.device.gatt.connect();
    this._log('info', 'GATT Server verbunden');

    try {
      this.service = await this.server.getPrimaryService(PeripagePrinter.SERVICE_UUID);
      this._log('success', 'AE30 Service gefunden');
    } catch (e) {
      throw new Error(`Service ${PeripagePrinter.SERVICE_UUID} nicht gefunden. Überprüfe ob der Drucker eingeschaltet und nicht mit einem anderen Gerät verbunden ist.`);
    }

    try {
      this.writeChar = await this.service.getCharacteristic(PeripagePrinter.WRITE_CHAR_UUID);
      this._log('success', 'Write-Characteristic AE01 bereit');
    } catch (e) {
      throw new Error('Write-Characteristic AE01 nicht gefunden.');
    }

    try {
      this.notifyChar = await this.service.getCharacteristic(PeripagePrinter.NOTIFY_CHAR_UUID);
      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', (e) => {
        const val = e.target.value;
        const hex = Array.from(new Uint8Array(val.buffer)).map(b => b.toString(16).padStart(2,'0')).join(' ');
        this._log('info', `Notify: ${hex}`);
      });
      this._log('info', 'Notify-Characteristic AE02 aktiv');
    } catch (e) {
      this._log('warn', 'Notify-Characteristic nicht verfügbar (kein Problem)');
    }

    this.connected = true;
    this._status('connected', `${this.device.name || 'Peripage P21'}`);
    this._log('success', 'Drucker verbunden!');

    // Initialize printer
    await this._initPrinter();
    return true;
  }

  // -------------------------------------------------------
  // Initialize printer (set energy, quality)
  // -------------------------------------------------------
  async _initPrinter() {
    this._log('info', 'Initialisiere Drucker...');
    try {
      // Set print energy (0-65535, default ~8000 for medium darkness)
      await this._sendPacket(PeripagePrinter.CMD_SET_ENERGY, [0x40, 0x1F]); // ~8000
      await this._delay(50);
      // Set drawing mode
      await this._sendPacket(PeripagePrinter.CMD_SET_QUALITY, [0x33]);
      await this._delay(50);
      this._log('success', 'Drucker initialisiert');
    } catch (e) {
      this._log('warn', `Init-Fehler (ignoriert): ${e.message}`);
    }
  }

  // -------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._onDisconnect();
  }

  _onDisconnect() {
    this.connected = false;
    this.printing = false;
    this.server = null;
    this.service = null;
    this.writeChar = null;
    this.notifyChar = null;
    this._status('disconnected', 'Nicht verbunden');
  }

  // -------------------------------------------------------
  // Print a canvas-rendered image bitmap
  // canvas: HTMLCanvasElement (any size, will be scaled to 384px wide)
  // energy: 0-100 (darkness), 50 = default
  // -------------------------------------------------------
  async printCanvas(canvas, energy = 50) {
    if (!this.connected || !this.writeChar) {
      throw new Error('Drucker nicht verbunden!');
    }
    if (this.printing) {
      throw new Error('Druckvorgang läuft bereits!');
    }
    this.printing = true;
    this._status('connected', 'Druckt...');

    try {
      // Scale energy (0-100 → energyValue 0x0000–0xFFFF, sane range 0x1388–0xFFFF)
      const energyVal = Math.round(5000 + (energy / 100) * 60535);
      const energyHi = (energyVal >> 8) & 0xFF;
      const energyLo = energyVal & 0xFF;
      await this._sendPacket(PeripagePrinter.CMD_SET_ENERGY, [energyLo, energyHi]);
      await this._delay(30);

      // Convert canvas to 1-bit monochrome bitmap at 384px wide
      const bitmapData = await this._canvasToBitmap(canvas);
      const { data: rows, height } = bitmapData;

      this._log('info', `Drucke: 384 × ${height}px, ${rows.length} Bytes`);

      // Send print header
      // AE30 protocol: send CMD_PRINT_BITMAP with height info, then row data
      const heightLo = height & 0xFF;
      const heightHi = (height >> 8) & 0xFF;
      await this._sendPacket(PeripagePrinter.CMD_PRINT_BITMAP, [0x00, heightLo, heightHi]);
      await this._delay(50);

      // Send raw row data in chunks
      await this._sendRaw(rows);
      this._log('success', 'Bild-Daten gesendet');

      // Feed paper after printing
      await this._delay(200);
      await this.feedPaper(3);

    } finally {
      this.printing = false;
      this._status('connected', this.device?.name || 'Verbunden');
    }
  }

  // -------------------------------------------------------
  // Feed paper (num = number of feed steps)
  // -------------------------------------------------------
  async feedPaper(num = 3) {
    if (!this.connected) return;
    this._log('info', `Papier vor: ${num} Schritte`);
    await this._sendPacket(PeripagePrinter.CMD_FEED_PAPER, [num]);
    await this._delay(num * 100);
  }

  // -------------------------------------------------------
  // Send a protocol packet
  // -------------------------------------------------------
  async _sendPacket(cmd, data = []) {
    const packet = PeripagePrinter.buildPacket(cmd, data);
    const hex = Array.from(packet).map(b => b.toString(16).padStart(2,'0')).join(' ');
    this._log('info', `TX Packet [${cmd.toString(16)}]: ${hex}`);
    await this._writeChunk(packet);
  }

  // -------------------------------------------------------
  // Send raw byte array in chunks
  // -------------------------------------------------------
  async _sendRaw(data) {
    const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
    const total = arr.length;
    let sent = 0;
    while (sent < total) {
      const chunk = arr.slice(sent, sent + PeripagePrinter.CHUNK_SIZE);
      await this._writeChunk(chunk);
      sent += chunk.length;
      await this._delay(PeripagePrinter.CHUNK_DELAY);
      // Progress log every 2000 bytes
      if (sent % 2000 < PeripagePrinter.CHUNK_SIZE) {
        this._log('info', `Fortschritt: ${sent}/${total} Bytes (${Math.round(sent/total*100)}%)`);
      }
    }
  }

  // -------------------------------------------------------
  // Write to BLE characteristic (with retry)
  // -------------------------------------------------------
  async _writeChunk(data) {
    const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Try writeValueWithoutResponse first (faster, less overhead)
        if (this.writeChar.properties.writeWithoutResponse) {
          await this.writeChar.writeValueWithoutResponse(arr);
        } else {
          await this.writeChar.writeValueWithResponse(arr);
        }
        return;
      } catch (e) {
        if (attempt === 2) throw e;
        this._log('warn', `Write retry ${attempt+1}: ${e.message}`);
        await this._delay(50);
      }
    }
  }

  // -------------------------------------------------------
  // Convert canvas to 384px-wide 1-bit bitmap row data
  // Returns { data: Uint8Array, height: number }
  // -------------------------------------------------------
  async _canvasToBitmap(sourceCanvas) {
    const targetWidth = PeripagePrinter.PRINT_WIDTH;

    // Draw scaled image to offscreen canvas
    const scaleRatio = targetWidth / sourceCanvas.width;
    const targetHeight = Math.ceil(sourceCanvas.height * scaleRatio);

    const offscreen = document.createElement('canvas');
    offscreen.width  = targetWidth;
    offscreen.height = targetHeight;
    const ctx = offscreen.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const pixels = imageData.data;

    // Convert to 1-bit: each row is ceil(384/8) = 48 bytes
    const bytesPerRow = Math.ceil(targetWidth / 8);
    const result = new Uint8Array(targetHeight * bytesPerRow);

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = (y * targetWidth + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        // Convert to grayscale
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        // Threshold: dark pixel (< 128) → set bit (print dot)
        if (gray < 128) {
          const byteIdx = y * bytesPerRow + Math.floor(x / 8);
          const bitPos  = 7 - (x % 8);
          result[byteIdx] |= (1 << bitPos);
        }
      }
    }

    return { data: result, height: targetHeight };
  }

  // -------------------------------------------------------
  // Utilities
  // -------------------------------------------------------
  _delay(ms) { return new Promise(res => setTimeout(res, ms)); }

  _status(state, message) {
    if (this.onStatusChange) this.onStatusChange(state, message);
  }

  _log(level, message) {
    if (this.onLog) this.onLog(level, message);
    const prefix = { info: '[INFO]', warn: '[WARN]', error: '[ERR ]', success: '[OK  ]' }[level] || '[LOG ]';
    console.log(`${prefix} Peripage: ${message}`);
  }
}
