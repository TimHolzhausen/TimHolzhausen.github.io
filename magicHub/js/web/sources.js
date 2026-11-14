// Web-Quellen, die regelmäßig abgefragt werden.
// Inject: https://11z.co/_w/<Account-ID>/selection → { value, source }.
//   CORS geprüft am 13.11.2026: Access-Control-Allow-Origin: * → im Browser abfragbar.
//   Senden: POST an dieselbe Adresse,
//   JSON { "value": "<Text>" }. Preflight erlaubt POST + content-type (geprüft 13.11.2026).
//   Unbekannte Account-ID → HTTP 400. Die Abfrage Inject-ID (Benutzername) → Account-Nummer
//   (inject.joshuariley.co.uk/id/…) erlaubt kein CORS, daher muss die Account-Nummer eingetragen werden.
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
        this._receivedAt = Date.now();
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

  /**
   * Text an Inject senden. Zeilenumbrüche → Leerzeichen, und ein gerade erst von
   * Inject empfangener Wert wird nicht innerhalb von 10 s zurückgeschickt (sonst Endlosschleife).
   * Danach gilt der gesendete Wert als bekannt, damit die eigene Abfrage ihn nicht als neue Auswahl meldet.
   */
  async send(text) {
    const err = this.validate();
    if (err) throw new Error(err);
    const value = String(text ?? '').replace(/<br>|\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!value) throw new Error('Leerer Text');
    if (value === this.lastValue && Date.now() - (this._receivedAt || 0) < 10000) return { skipped: true };
    let res;
    try {
      res = await fetch(this.url(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }), cache: 'no-store' });
    } catch {
      throw new Error('Senden blockiert (Netzwerk oder CORS)');
    }
    if (res.status === 400) throw new Error('Inject: Account-ID unbekannt');
    if (!res.ok) throw new Error('Inject: HTTP ' + res.status);
    this.lastValue = value;
    this.lastSent = value;
    this._emit('sent', { text: value });
    return { skipped: false };
  }

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
