// Davinci-Palette (Sender): 5 Farbtöpfe, Berührungsstatus als Bitmaske.
// Protokoll aus davinci_Landingpage/app.js (eigenes Projekt).

import { BleDevice, uuid16 } from './base.js';

const SENSOR_SERVICE = uuid16(0x181a);
const STATE_CHAR = uuid16(0x2a58);
const BATTERY_SERVICE = uuid16(0x180f);
const BATTERY_CHAR = uuid16(0x2a19);

export const POT_COUNT = 5;
export const DEFAULT_POTS = [
  { name: 'Rot', color: '#ff453a' },
  { name: 'Gelb', color: '#ffd60a' },
  { name: 'Blau', color: '#0a84ff' },
  { name: 'Grün', color: '#30d158' },
  { name: 'Schwarz', color: '#1c1c1e' },
];

export class DavinciPalette extends BleDevice {
  constructor() {
    super('davinci', 'Davinci-Palette');
    this.state = 0;
    this.battery = null;
    this.pots = DEFAULT_POTS.map((p) => ({ ...p }));
    this._onState = (e) => this._parse(e.target.value.getUint8(0));
    this._onBattery = (e) => this._setBattery(e.target.value.getUint8(0));
  }

  requestOptions() {
    return {
      filters: [
        { services: [SENSOR_SERVICE] },
        { namePrefix: 'Davinci' },
        { namePrefix: 'Davinic' },
        { namePrefix: 'Dav' },
        { namePrefix: 'dav' },
      ],
      optionalServices: [SENSOR_SERVICE, BATTERY_SERVICE],
    };
  }

  async setup(server) {
    const svc = await server.getPrimaryService(SENSOR_SERVICE);
    this.stateChar = await svc.getCharacteristic(STATE_CHAR);
    this.stateChar.addEventListener('characteristicvaluechanged', this._onState);
    await this.stateChar.startNotifications();
    try { this._parse((await this.stateChar.readValue()).getUint8(0), true); } catch { /* nicht lesbar */ }
    try {
      const bs = await server.getPrimaryService(BATTERY_SERVICE);
      this.batteryChar = await bs.getCharacteristic(BATTERY_CHAR);
      this._setBattery((await this.batteryChar.readValue()).getUint8(0));
      this.batteryChar.addEventListener('characteristicvaluechanged', this._onBattery);
      await this.batteryChar.startNotifications();
    } catch { this.log('info', 'Kein Akku-Dienst gefunden'); }
  }

  teardown() {
    this.stateChar?.removeEventListener('characteristicvaluechanged', this._onState);
    this.batteryChar?.removeEventListener('characteristicvaluechanged', this._onBattery);
  }

  _setBattery(level) {
    this.battery = level;
    this.emit('battery', { level });
  }

  /** Auch vom Demo-Modus genutzt. */
  _parse(byte, initial = false) {
    const prev = this.state;
    this.state = byte;
    for (let i = 0; i < POT_COUNT; i++) {
      const was = (prev >> i) & 1;
      const is = (byte >> i) & 1;
      if (is && !was && !initial) this.emit('touch', { index: i, name: this.pots[i].name });
    }
    this.emit('pots', { state: byte });
  }
}
