// Web-Quellen, die regelmäßig abgefragt werden.
// Inject: https://11z.co/_w/<Account-ID>/selection → { value, source } (aus MysterSmith web_polling.js).
//   CORS geprüft am 13.11.2026: Access-Control-Allow-Origin: * → im Browser abfragbar.
// Eigene JSON-URL: jede HTTPS-Adresse, die CORS erlaubt; Feldpfad wie "data.word" oder "items.0.name".

class PollSource extends EventTarget {
  constructor(id, label) {
    super();
    this.id = id;
    this.label = label;
    this.interval = 2;
    this.status = 'idle';
    this.statusMessage = 'Gestoppt';
    this.lastValue = null;
    this._timer = null;
    this._first = true;
  }

  get connected() { return this.status === 'connected'; }

  _set(status, message) {
    this.status = status; this.statusMessage = message;
    this.dispatchEvent(new CustomEvent('status', { detail: { status, message } }));
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  start() {
    const err = this.validate();
    if (err) { this._set('error', err); throw new Error(err); }
    this.stop(true);
    this._first = true;
    this._set('connecting', 'Verbinde …');
    this._tick();
  }

  stop(silent = false) {
    clearTimeout(this._timer);
    this._timer = null;
    if (!silent) this._set('idle', 'Gestoppt');
  }

  async _tick() {
    try {
      const res = await fetch(this.url(), { cache: 'no-store' });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* kein JSON */ }
      if (!res.ok && !json) throw new Error('HTTP ' + res.status);
      const value = this.extract(json, text, res.status);
      this._set('connected', 'Läuft · alle ' + this.interval + ' s');
      if (value != null && value !== '' && value !== this.lastValue) {
        const initial = this._first;
        this.lastValue = value;
        if (!initial || this.showInitial) this._emit('value', { text: String(value), initial });
      }
      this._first = false;
    } catch (err) {
      const msg = err instanceof TypeError
        ? 'Abfrage blockiert (Netzwerk oder CORS)'
        : err.message;
      this._set('error', msg);
    }
    if (this.status !== 'idle') this._timer = setTimeout(() => this._tick(), Math.max(1, this.interval) * 1000);
  }
}

export class InjectSource extends PollSource {
  constructor() {
    super('inject', 'Inject');
    this.accountId = '';
    this.allowGoogle = true;
    this.allowWeb = true;
    this.showInitial = false;
  }

  validate() {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(this.accountId.trim())) return 'Bitte eine gültige Inject-Account-ID eintragen.';
    return '';
  }

  url() { return 'https://11z.co/_w/' + encodeURIComponent(this.accountId.trim()) + '/selection'; }

  extract(json, _text, status) {
    if (!json) return null;
    if (status === 400) throw new Error('Account-ID unbekannt');
    if (!json.value) return null;
    if (json.source === 'google' && !this.allowGoogle) return null;
    if (json.source !== 'google' && !this.allowWeb) return null;
    return json.value;
  }
}

export class JsonUrlSource extends PollSource {
  constructor() {
    super('json', 'Web-Quelle');
    this.address = '';
    this.path = '';
    this.showInitial = false;
  }

  validate() {
    try {
      const u = new URL(this.address.trim());
      if (u.protocol !== 'https:') return 'Nur HTTPS-Adressen sind erlaubt.';
    } catch { return 'Bitte eine gültige HTTPS-Adresse eintragen.'; }
    return '';
  }

  url() { return this.address.trim(); }

  extract(json, text) {
    if (!this.path.trim()) return json == null ? text.trim().slice(0, 200) : JSON.stringify(json).slice(0, 200);
    let v = json;
    for (const key of this.path.trim().split('.')) {
      if (v == null) return null;
      v = v[key];
    }
    return v == null ? null : (typeof v === 'object' ? JSON.stringify(v) : v);
  }
}
