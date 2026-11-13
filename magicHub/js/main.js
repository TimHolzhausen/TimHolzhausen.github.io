// MagicHub – Einstieg: Geräte, Kombis, Live-Vorschau, Einrichtung, Hilfe.

import { config, resolvedAppUrl, shortcutUrl } from './config.js';
import { buildBluefyUrl } from './bluefy.js';
import { hasWebBluetooth, getPlatform, detectPlatform, setPlatformOverride, looksLikeBluefy, isStandalone } from './platform.js';
import { describeError } from './ble/base.js';
import { GoDiceSet } from './ble/godice.js';
import { DavinciPalette, POT_COUNT } from './ble/davinci.js';
import { UltraSharpie } from './ble/ultrasharpie.js';
import { PeekSmith } from './ble/peeksmith.js';
import { SelfieScreen } from './ble/selfiescreen.js';
import { PeripagePrinter } from './ble/peripage.js';
import { InjectSource, JsonUrlSource } from './web/sources.js';
import { AiVision, PROVIDERS, AI_TASKS, localAvailability } from './ai/vision.js';
import { Hub, PRESETS, loadStore, saveStore } from './hub.js';
import { textCanvas, printTextCanvas, drawingCanvas, fitInto, demoStrokes } from './render.js';

const VERSION = '0.1.0';
const BT = hasWebBluetooth();

// ---------------------------------------------------------------- Helfer
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const icon = (name, cls = '') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  if (cls) s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
};
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}
const store = loadStore();
const settings = store.settings || {};
function saveSettings() { saveStore({ settings }); }

// ---------------------------------------------------------------- Geräte
const dev = {
  godice: new GoDiceSet(),
  davinci: new DavinciPalette(),
  pen: new UltraSharpie(),
  peeksmith: new PeekSmith(),
  selfie: new SelfieScreen(),
  printer: new PeripagePrinter(),
  inject: new InjectSource(),
  json: new JsonUrlSource(),
  ai: new AiVision(),
};

// gespeicherte Einstellungen übernehmen
Object.assign(dev.inject, settings.inject || {});
Object.assign(dev.json, settings.json || {});
if (settings.ai) {
  const a = settings.ai;
  if (PROVIDERS[a.provider]) dev.ai.provider = a.provider;
  dev.ai.keys = a.keys || {};
  dev.ai.models = a.models || {};
  if (AI_TASKS[a.task]) dev.ai.task = a.task;
  if (typeof a.auto === 'boolean') dev.ai.auto = a.auto;
}
if (settings.davinciPots) settings.davinciPots.forEach((n, i) => { if (dev.davinci.pots[i] && n) dev.davinci.pots[i].name = n; });
if (settings.printer) Object.assign(dev.printer, settings.printer);
if (settings.pen?.finishDelay) dev.pen.finishDelay = settings.pen.finishDelay;
if (settings.peeksmith?.brightness != null) dev.peeksmith.brightness = settings.peeksmith.brightness;
if (settings.selfie?.brightness) dev.selfie.brightness = settings.selfie.brightness;
const diceMode = () => settings.diceMode || 'sum';
dev.ai.refreshStatus();

const DEVICES = [
  { id: 'godice', group: 'in', name: 'GoDice', desc: 'Smarte Würfel', icon: 'dice', ble: true },
  { id: 'davinci', group: 'in', name: 'Davinci-Palette', desc: 'Farbtöpfe', icon: 'palette', ble: true },
  { id: 'pen', group: 'in', name: 'Ultra Sharpie', desc: 'Smartpen-Zeichnung', icon: 'pen', ble: true },
  { id: 'ai', group: 'in', name: 'KI-Erkennung', desc: 'Handschrift erkennen', icon: 'spark' },
  { id: 'inject', group: 'in', name: 'Inject', desc: 'Magie-App', icon: 'globe' },
  { id: 'json', group: 'in', name: 'Web-Quelle', desc: 'Eigene JSON-URL', icon: 'link' },
  { id: 'peeksmith', group: 'out', name: 'PeekSmith', desc: 'Peek-Display', icon: 'display', ble: true },
  { id: 'selfie', group: 'out', name: 'Selfie Screen', desc: 'Mystersmith-Display', icon: 'image', ble: true },
  { id: 'printer', group: 'out', name: 'Peripage P21', desc: 'Thermodrucker', icon: 'printer', ble: true },
  { id: 'speech', group: 'out', name: 'Sprachausgabe', desc: 'Ansage übers Handy', icon: 'speaker' },
];
const DEV_BY_ID = Object.fromEntries(DEVICES.map((d) => [d.id, d]));

// ---------------------------------------------------------------- Hub
const hub = new Hub();
[
  { id: 'godice', label: 'GoDice', icon: 'dice', kind: 'text' },
  { id: 'davinci', label: 'Davinci-Palette', icon: 'palette', kind: 'text' },
  { id: 'pen', label: 'Ultra Sharpie', icon: 'pen', kind: 'image' },
  { id: 'ai', label: 'KI-Erkennung', icon: 'spark', kind: 'text' },
  { id: 'inject', label: 'Inject', icon: 'globe', kind: 'text' },
  { id: 'json', label: 'Web-Quelle', icon: 'link', kind: 'text' },
  { id: 'peeksmith-buttons', label: 'PeekSmith-Taste', icon: 'button', kind: 'trigger' },
  { id: 'selfie-buttons', label: 'Selfie-Taste', icon: 'button', kind: 'trigger' },
  { id: 'manual', label: 'Manuell', icon: 'hand', kind: 'text' },
].forEach((s) => hub.registerSource(s));

const pv = { peek: $('#pv-peek'), selfie: $('#pv-selfie'), print: $('#pv-print') };

hub.registerTarget({
  id: 'peeksmith', label: 'PeekSmith', icon: 'display', accepts: ['text'],
  async deliver(p) {
    pv.peek.textContent = p.text || ' ';
    if (dev.peeksmith.connected) await dev.peeksmith.showText(p.text);
  },
});
hub.registerTarget({
  id: 'selfie', label: 'Selfie Screen', icon: 'image', accepts: ['text', 'image'],
  async deliver(p) {
    const s = dev.selfie;
    const canvas = p.kind === 'image'
      ? (p.strokes ? drawingCanvas(p.strokes, s.width, s.height, { bg: '#000', fg: '#fff' }) : fitInto(p.canvas, s.width, s.height))
      : textCanvas(p.text, s.width, s.height);
    drawPreview(pv.selfie, canvas);
    if (s.connected) await s.showCanvas(canvas);
  },
});
hub.registerTarget({
  id: 'printer', label: 'Peripage P21', icon: 'printer', accepts: ['text', 'image'],
  async deliver(p) {
    const w = dev.printer.width;
    const canvas = p.kind === 'image'
      ? (p.strokes ? drawingCanvas(p.strokes, w, w, { bg: '#fff', fg: '#000', line: 5 }) : fitInto(p.canvas, w, Math.round(p.canvas.height * w / p.canvas.width), '#fff'))
      : printTextCanvas(p.text, w);
    pv.print.width = canvas.width; pv.print.height = canvas.height;
    pv.print.getContext('2d').drawImage(canvas, 0, 0);
    if (dev.printer.connected) await dev.printer.printCanvas(canvas, { dither: p.kind === 'image' && !p.strokes });
  },
});
hub.registerTarget({
  id: 'speech', label: 'Sprachausgabe', icon: 'speaker', accepts: ['text'],
  async deliver(p) {
    if (!('speechSynthesis' in window)) throw new Error('Sprachausgabe wird nicht unterstützt');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = 'de-DE';
    u.rate = settings.speechRate || 1;
    speechSynthesis.speak(u);
  },
});

function drawPreview(canvas, src) {
  canvas.width = src.width; canvas.height = src.height;
  canvas.getContext('2d').drawImage(src, 0, 0);
}

// Quellen-Ereignisse → Hub
dev.godice.addEventListener('roll', (e) => {
  const d = e.detail;
  const mode = diceMode();
  const text = mode === 'sum' ? String(d.sum) : mode === 'list' ? d.values.map((v) => v.value).join(' ') : String(d.value);
  hub.publish('godice', { kind: 'text', text });
});
dev.davinci.addEventListener('touch', (e) => hub.publish('davinci', { kind: 'text', text: e.detail.name }));
dev.pen.addEventListener('drawing', (e) => handleDrawing(e.detail.strokes));
dev.peeksmith.addEventListener('button', (e) => hub.publish('peeksmith-buttons', { kind: 'trigger', text: e.detail.button + (e.detail.long ? ' lang' : '') }));
dev.selfie.addEventListener('button', (e) => hub.publish('selfie-buttons', { kind: 'trigger', text: e.detail.button }));
dev.selfie.addEventListener('needs-picture', () => hub.deliver('selfie', { kind: 'text', text: 'MagicHub' }));
dev.inject.addEventListener('value', (e) => hub.publish('inject', { kind: 'text', text: e.detail.text }));
dev.json.addEventListener('value', (e) => hub.publish('json', { kind: 'text', text: e.detail.text }));

async function handleDrawing(strokes) {
  hub.publish('pen', { kind: 'image', strokes, canvas: drawingCanvas(strokes, 384, 384) });
  if (dev.ai.auto && dev.ai.ready) {
    try {
      const text = await dev.ai.recognize(drawingCanvas(strokes, 512, 512, { line: 6 }));
      hub.publish('ai', { kind: 'text', text });
      toast('KI erkannt: ' + text);
    } catch (err) { toast(err.message, 'error'); }
  }
}

// ---------------------------------------------------------------- Kacheln
function statusOf(id) {
  if (id === 'speech') return { status: 'speechSynthesis' in window ? 'connected' : 'error', message: 'speechSynthesis' in window ? 'Bereit' : 'Nicht unterstützt' };
  const d = dev[id];
  return { status: d.status, message: d.statusMessage };
}

function primaryAction(id) {
  const meta = DEV_BY_ID[id];
  const d = dev[id];
  if (meta.ble && !BT) return { label: 'Nicht verfügbar', disabled: true };
  if (id === 'godice') return { label: '+ Würfel', run: () => dev.godice.addDie() };
  if (id === 'ai') return { label: d.ready ? 'Einstellen' : 'Einrichten', run: () => openSheet('ai') };
  if (id === 'speech') return { label: 'Test', run: () => hub.deliver('speech', { kind: 'text', text: 'MagicHub ist bereit' }) };
  if (id === 'inject' || id === 'json') {
    if (d.status === 'connected' || d.status === 'connecting') return { label: 'Stopp', run: () => d.stop() };
    return { label: 'Start', run: () => { if (d.validate()) { openSheet(id); return; } d.start(); } };
  }
  if (d.status === 'connected') return { label: 'Trennen', run: () => d.disconnect() };
  if (d.status === 'connecting') return { label: 'Verbinde …', disabled: true };
  if (d.status === 'lost') return { label: 'Erneut verbinden', run: () => d.reconnect() };
  return { label: 'Verbinden', run: () => d.connect() };
}

async function runAction(action) {
  try { await action.run?.(); } catch (err) {
    const msg = describeError(err);
    if (!/abgebrochen/.test(msg)) toast(msg, 'error');
  }
}

function renderTiles() {
  for (const group of ['in', 'out']) {
    const box = $('#tiles-' + group);
    box.replaceChildren(...DEVICES.filter((d) => d.group === group).map((meta) => {
      const st = statusOf(meta.id);
      const act = primaryAction(meta.id);
      return h('article', { class: 'tile status-' + st.status, 'data-id': meta.id },
        h('button', { class: 'tile-main', type: 'button', 'aria-label': meta.name + ' öffnen', onclick: () => openSheet(meta.id) },
          h('span', { class: 'tile-icon' }, icon(meta.icon)),
          h('span', { class: 'tile-text' },
            h('strong', {}, meta.name),
            h('span', { class: 'tile-status' }, h('i', { class: 'dot' }), st.message || meta.desc))),
        h('button', { class: 'btn btn-small tile-action' + (st.status === 'connected' ? '' : ' btn-primary'), type: 'button', disabled: act.disabled, onclick: () => runAction(act) }, act.label));
    }));
  }
  const n = DEVICES.filter((d) => d.id !== 'speech' && statusOf(d.id).status === 'connected').length;
  $('#conn-pill').textContent = n + ' aktiv';
  $('#conn-pill').classList.toggle('on', n > 0);
}

// ---------------------------------------------------------------- Detail-Sheet
const sheet = $('#sheet');
let openId = null;
let sheetUpdate = null;

function openSheet(id) {
  const meta = DEV_BY_ID[id];
  openId = id;
  $('#sheet-icon').replaceChildren(icon(meta.icon));
  $('#sheet-title').textContent = meta.name;
  const body = $('#sheet-body');
  body.replaceChildren();
  sheetUpdate = (PANELS[id] || (() => null))(body) || null;
  refreshSheet();
  if (!sheet.open) sheet.showModal();
}

function refreshSheet() {
  if (!openId || !sheet.open && openId == null) return;
  const st = statusOf(openId);
  const el = $('#sheet-status');
  el.textContent = st.message;
  el.className = 'sheet-status status-' + st.status;
  sheetUpdate?.();
}

sheet.addEventListener('close', () => { openId = null; sheetUpdate = null; });
$('#sheet-close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

function connectRow(id) {
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' });
  const upd = () => {
    const a = primaryAction(id);
    btn.textContent = a.label;
    btn.disabled = !!a.disabled;
    btn.classList.toggle('btn-primary', dev[id].status !== 'connected');
    btn.onclick = () => runAction(a);
  };
  upd();
  return { el: btn, upd };
}

function field(label, input, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
}

function noBt() { return BT ? null : h('p', { class: 'callout' }, 'Dieser Browser kann kein Web Bluetooth. ', h('a', { href: '#setup', onclick: () => sheet.close() }, 'Zur Einrichtung')); }

const PANELS = {
  godice(body) {
    const list = h('div', { class: 'dice-list' });
    const mode = h('select', { onchange: () => { settings.diceMode = mode.value; saveSettings(); } },
      h('option', { value: 'sum' }, 'Summe aller Würfel'),
      h('option', { value: 'list' }, 'Einzelwerte (z. B. „3 5“)'),
      h('option', { value: 'last' }, 'Nur letzter Würfel'));
    mode.value = diceMode();
    const add = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: !BT, onclick: () => runAction({ run: () => dev.godice.addDie() }) }, '+ Würfel hinzufügen');
    body.append(noBt() || '', list, add, field('Gesendet wird', mode), h('p', { class: 'hint' }, 'Mehrere Würfel nacheinander hinzufügen. Gemeldet wird, sobald alle liegen.'));
    return () => {
      const dice = [...dev.godice.dice.entries()];
      list.replaceChildren(...(dice.length ? dice.map(([id, d]) => h('div', { class: 'die' + (d.online ? '' : ' off') },
        h('span', { class: 'die-face', style: 'background:' + (d.colorHex || '#555') }, d.rolling ? '…' : (d.value ?? '–')),
        h('span', { class: 'die-text' }, h('strong', {}, d.color || d.name), h('small', {}, d.online ? (d.battery != null ? 'Akku ' + d.battery + ' %' : 'verbunden') : 'getrennt')),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => dev.godice.blink(id) }, 'Blinken'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => dev.godice.remove(id) }, 'Entfernen'))) : [h('p', { class: 'empty' }, 'Noch kein Würfel verbunden.')]));
      if (dice.length) list.append(h('p', { class: 'sum' }, 'Summe: ', h('strong', {}, String(dev.godice.sum))));
    };
  },

  davinci(body) {
    const c = connectRow('davinci');
    const pots = h('div', { class: 'pots' });
    const names = dev.davinci.pots.map((p, i) => {
      const inp = h('input', { type: 'text', value: p.name, maxlength: 24 });
      inp.addEventListener('change', () => {
        dev.davinci.pots[i].name = inp.value.trim() || p.name;
        settings.davinciPots = dev.davinci.pots.map((x) => x.name); saveSettings();
      });
      return field('Topf ' + (i + 1), inp);
    });
    body.append(noBt() || '', c.el, pots, h('details', {}, h('summary', {}, 'Namen der Töpfe (werden gesendet)'), ...names));
    return () => {
      c.upd();
      pots.replaceChildren(...dev.davinci.pots.slice(0, POT_COUNT).map((p, i) => h('div', { class: 'pot' + ((dev.davinci.state >> i) & 1 ? ' active' : '') },
        h('span', { class: 'pot-color', style: 'background:' + p.color }), h('small', {}, p.name))));
      if (dev.davinci.battery != null) pots.append(h('p', { class: 'hint' }, 'Akku: ' + dev.davinci.battery + ' %'));
    };
  },

  pen(body) {
    const c = connectRow('pen');
    const cv = h('canvas', { class: 'pen-canvas', width: 480, height: 360 });
    const delay = h('select', { onchange: () => { dev.pen.finishDelay = Number(delay.value); settings.pen = { finishDelay: dev.pen.finishDelay }; saveSettings(); } },
      ...[1500, 2500, 4000, 6000].map((v) => h('option', { value: v }, (v / 1000).toLocaleString('de-DE') + ' s')));
    delay.value = String(dev.pen.finishDelay);
    body.append(noBt() || '', c.el, cv,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => dev.pen.clear() }, 'Neue Zeichnung'),
        h('button', { class: 'btn', type: 'button', onclick: () => dev.pen.strokes.length && handleDrawing(dev.pen.strokes.map((s) => s.slice())) }, 'Jetzt senden')),
      field('Zeichnung gilt als fertig nach', delay, 'Solange ohne Stiftbewegung, dann wird sie an die Kombis (und ggf. die KI) geschickt.'),
      h('p', { class: 'hint' }, 'Kappe aufsetzen wird erkannt. Der „Neo“ wechselt bei jedem Einschalten Name und Adresse – dann einfach neu verbinden.'));
    return () => { c.upd(); const d = drawingCanvas(dev.pen.strokes, cv.width, cv.height, { bg: '#fff', fg: '#111' }); cv.getContext('2d').drawImage(d, 0, 0); };
  },

  ai(body) {
    const ai = dev.ai;
    const prov = h('select', {}, ...Object.entries(PROVIDERS).map(([k, p]) => h('option', { value: k }, p.label)));
    prov.value = ai.provider;
    const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false' });
    const keyField = field('API-Key', key, 'Bleibt nur in diesem Browser und geht nur an den gewählten Anbieter. Am besten einen eigenen Key mit Ausgabenlimit nutzen.');
    const modelSel = h('select', {});
    const modelTxt = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' });
    const modelField = h('div', {});
    const note = h('p', { class: 'hint' });
    const task = h('select', {}, ...Object.entries(AI_TASKS).map(([k, t]) => h('option', { value: k }, t.label)));
    task.value = ai.task;
    const auto = h('input', { type: 'checkbox' });
    auto.checked = ai.auto;
    const showProvider = () => {
      const p = PROVIDERS[prov.value];
      keyField.hidden = !p.needsKey;
      key.value = ai.keys[prov.value] || '';
      key.placeholder = p.keyHint || '';
      modelField.replaceChildren();
      if (p.models) {
        modelSel.replaceChildren(...p.models.map((m) => h('option', { value: m }, m)));
        modelSel.value = ai.models[prov.value] || p.defaultModel;
        modelField.append(field('Modell', modelSel));
      } else if (p.freeModel) {
        modelTxt.value = ai.models[prov.value] || p.defaultModel;
        modelField.append(field('Modell', modelTxt));
      }
      note.textContent = p.note;
      if (prov.value === 'local') localAvailability().then((a) => { note.textContent = p.note + ' Hier: ' + (a || 'nicht verfügbar') + '.'; });
    };
    prov.addEventListener('change', showProvider);
    showProvider();
    const save = () => {
      const p = PROVIDERS[prov.value];
      ai.provider = prov.value;
      if (p.needsKey) ai.keys[prov.value] = key.value.trim();
      if (p.models) ai.models[prov.value] = modelSel.value;
      else if (p.freeModel) ai.models[prov.value] = modelTxt.value.trim() || p.defaultModel;
      ai.task = task.value; ai.auto = auto.checked;
      settings.ai = { provider: ai.provider, keys: ai.keys, models: ai.models, task: ai.task, auto: ai.auto };
      saveSettings(); ai.refreshStatus(); toast('KI-Einstellungen gespeichert', 'ok');
    };
    const test = h('button', { class: 'btn', type: 'button', onclick: async () => {
      save();
      try {
        const strokes = dev.pen.strokes.length ? dev.pen.strokes : demoStrokes();
        const text = await dev.ai.recognize(drawingCanvas(strokes, 512, 512, { line: 6 }));
        hub.publish('ai', { kind: 'text', text });
        toast('KI erkannt: ' + text);
      } catch (err) { toast(err.message, 'error'); }
    } }, 'Mit Zeichnung testen');
    body.append(
      field('Anbieter', prov), note,
      keyField, modelField,
      field('Aufgabe', task),
      h('label', { class: 'switch-row' }, auto, h('span', {}, 'Jede fertige Stift-Zeichnung automatisch erkennen')),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Speichern'), test),
      h('p', { class: 'hint' }, 'Das Ergebnis erscheint als Eingabe „KI-Erkennung“ – z. B. mit der Vorlage „Handschrift (KI) aufs PeekSmith“.'));
    return null;
  },

  inject(body) {
    const id = h('input', { type: 'text', value: dev.inject.accountId, placeholder: 'z. B. abc123', autocomplete: 'off', spellcheck: 'false' });
    const iv = h('input', { type: 'number', min: 1, max: 30, value: dev.inject.interval });
    const g = h('input', { type: 'checkbox' }); g.checked = dev.inject.allowGoogle;
    const w = h('input', { type: 'checkbox' }); w.checked = dev.inject.allowWeb;
    const apply = () => {
      Object.assign(dev.inject, { accountId: id.value.trim(), interval: Math.max(1, Number(iv.value) || 2), allowGoogle: g.checked, allowWeb: w.checked });
      settings.inject = { accountId: dev.inject.accountId, interval: dev.inject.interval, allowGoogle: g.checked, allowWeb: w.checked };
      saveSettings();
    };
    [id, iv, g, w].forEach((x) => x.addEventListener('change', apply));
    const c = connectRow('inject');
    body.append(field('Inject-Account-ID', id, 'Steht in der Inject-App. Abgefragt wird https://11z.co/_w/<ID>/selection.'),
      field('Abfrage alle … Sekunden', iv),
      h('label', { class: 'switch-row' }, g, h('span', {}, 'Ergebnisse von der Google-Seite')),
      h('label', { class: 'switch-row' }, w, h('span', {}, 'Ergebnisse von anderen Seiten')),
      c.el,
      h('p', { class: 'hint' }, 'Der beim Start schon vorhandene Wert wird übersprungen – gemeldet werden nur neue Auswahlen.'));
    return () => { c.upd(); };
  },

  json(body) {
    const url = h('input', { type: 'url', value: dev.json.address, placeholder: 'https://…', autocomplete: 'off' });
    const path = h('input', { type: 'text', value: dev.json.path, placeholder: 'z. B. data.word', autocomplete: 'off' });
    const iv = h('input', { type: 'number', min: 1, max: 60, value: dev.json.interval });
    const apply = () => {
      Object.assign(dev.json, { address: url.value.trim(), path: path.value.trim(), interval: Math.max(1, Number(iv.value) || 2) });
      settings.json = { address: dev.json.address, path: dev.json.path, interval: dev.json.interval }; saveSettings();
    };
    [url, path, iv].forEach((x) => x.addEventListener('change', apply));
    const c = connectRow('json');
    body.append(field('Adresse (HTTPS, JSON)', url, 'Der Server muss Browser-Abfragen erlauben (CORS). Viele Magie-App-Server tun das nicht.'),
      field('Feld', path, 'Punkt-getrennt, Zahlen für Listen: items.0.name. Leer = ganze Antwort.'),
      field('Abfrage alle … Sekunden', iv), c.el);
    return () => { c.upd(); };
  },

  peeksmith(body) {
    const c = connectRow('peeksmith');
    const txt = h('input', { type: 'text', placeholder: 'Text fürs Display', autocomplete: 'off' });
    const br = h('input', { type: 'range', min: 0, max: 9, value: dev.peeksmith.brightness });
    br.addEventListener('change', () => { dev.peeksmith.setBrightness(Number(br.value)); settings.peeksmith = { brightness: Number(br.value) }; saveSettings(); });
    const info = h('p', { class: 'hint' });
    body.append(noBt() || '', c.el,
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); hub.deliver('peeksmith', { kind: 'text', text: txt.value }); } }, txt, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Anzeigen')),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { dev.peeksmith.clear(); pv.peek.textContent = ' '; } }, 'Display leeren')),
      field('Helligkeit', br), info,
      h('p', { class: 'hint' }, 'Tasten (links/rechts, lang) sind als Eingabe „PeekSmith-Taste“ nutzbar. Umlaute werden umschrieben (ä → ae).'));
    return () => {
      c.upd();
      const d = dev.peeksmith;
      info.textContent = d.connected ? d.model + (d.version ? ' · FW ' + d.version : '') + (d.batteryMv ? ' · ' + (d.batteryMv / 1000).toFixed(2) + ' V' : '') : '';
    };
  },

  selfie(body) {
    const c = connectRow('selfie');
    const txt = h('input', { type: 'text', placeholder: 'Text für den Screen', autocomplete: 'off' });
    const br = h('input', { type: 'range', min: 10, max: 100, step: 10, value: dev.selfie.brightness });
    br.addEventListener('change', () => { dev.selfie.brightness = Number(br.value); settings.selfie = { brightness: dev.selfie.brightness }; saveSettings(); });
    const info = h('p', { class: 'hint' });
    const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const img = await createImageBitmap(f);
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      hub.deliver('selfie', { kind: 'image', canvas: cv });
    });
    body.append(noBt() || '', c.el,
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); hub.deliver('selfie', { kind: 'text', text: txt.value }); } }, txt, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Anzeigen')),
      h('label', { class: 'btn btn-block' }, file, 'Foto anzeigen …'),
      field('Helligkeit (Bild abdunkeln)', br), info,
      h('p', { class: 'hint' }, 'Tasten (Auslöser, Kamera, +/−) sind als Eingabe „Selfie-Taste“ nutzbar.'));
    return () => { c.upd(); const s = dev.selfie; info.textContent = s.connected ? s.width + '×' + s.height + ' px · Puffer ' + Math.round(s.buffer / 1024) + ' KB' : ''; };
  },

  printer(body) {
    const c = connectRow('printer');
    const txt = h('textarea', { rows: 2, placeholder: 'Text zum Drucken' });
    const dens = h('select', {}, ...[['00', 'Hell'], ['02', 'Normal'], ['04', 'Dunkler'], ['08', 'Sehr dunkel']].map(([v, l]) => h('option', { value: v }, l)));
    dens.value = dev.printer.density;
    const mode = h('select', {}, h('option', { value: 'official' }, 'Standard (mit Flusssteuerung)'), h('option', { value: 'safe' }, 'Sicher (langsamer, mit Pausen)'));
    mode.value = dev.printer.mode;
    const apply = () => { dev.printer.density = dens.value; dev.printer.mode = mode.value; settings.printer = { density: dens.value, mode: mode.value }; saveSettings(); };
    dens.addEventListener('change', apply); mode.addEventListener('change', apply);
    const info = h('p', { class: 'hint' });
    body.append(noBt() || '', c.el,
      txt,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => txt.value.trim() && hub.deliver('printer', { kind: 'text', text: txt.value }) }, 'Drucken'),
        h('button', { class: 'btn', type: 'button', onclick: () => dev.printer.feed(10).catch((e) => toast(e.message, 'error')) }, 'Papier vor')),
      field('Schwärzung', dens), field('Übertragung', mode), info,
      h('p', { class: 'hint' }, 'Ohne Verbindung zeigt „Live“ nur die Druckvorschau.'));
    return () => { c.upd(); const p = dev.printer; info.textContent = p.connected ? (p.device?.name || '') + ' · ' + p.width + ' px breit' + (p.battery != null ? ' · Akku ' + p.battery + ' %' : '') + (p.printing ? ' · druckt …' : '') : ''; };
  },

  speech(body) {
    const rate = h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.1, value: settings.speechRate || 1 });
    rate.addEventListener('change', () => { settings.speechRate = Number(rate.value); saveSettings(); });
    body.append(h('p', {}, 'Spricht Texte über den Lautsprecher bzw. Kopfhörer des Handys – praktisch mit einem Ohrhörer.'),
      field('Sprechtempo', rate),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => hub.deliver('speech', { kind: 'text', text: 'Herz Dame' }) }, 'Test: „Herz Dame“'));
    return null;
  },
};

// Status-/Datenänderungen → Oberfläche
for (const [id, d] of Object.entries(dev)) {
  for (const type of ['status', 'dice', 'pots', 'battery', 'info', 'point', 'cleared', 'drawing', 'progress']) {
    d.addEventListener(type, () => { renderTiles(); if (openId === id) refreshSheet(); if (type === 'status') renderCombos(); });
  }
  d.addEventListener('log', (e) => { if (e.detail.level === 'error') addLog('error', DEV_BY_ID[id]?.name || id, e.detail.message); });
  d.addEventListener('status', (e) => {
    if (e.detail.status === 'lost') toast((DEV_BY_ID[id]?.name || id) + ': Verbindung verloren', 'error');
    if (e.detail.status === 'connected' && DEV_BY_ID[id]?.ble) toast((DEV_BY_ID[id]?.name) + ' verbunden', 'ok');
  });
}

// ---------------------------------------------------------------- Kombis
function chip(srcOrTarget, extra = {}) {
  return h('span', { class: 'chip-static', ...extra }, icon(srcOrTarget.icon), srcOrTarget.label);
}

function isLive(id) {
  const map = { 'peeksmith-buttons': 'peeksmith', 'selfie-buttons': 'selfie' };
  const key = map[id] || id;
  if (key === 'manual' || key === 'speech') return true;
  return dev[key] ? dev[key].connected : true;
}

function renderCombos() {
  const list = $('#combo-list');
  if (!hub.combos.length) {
    list.replaceChildren(h('div', { class: 'empty-card' }, h('strong', {}, 'Noch keine Kombi.'), h('span', {}, 'Nimm eine Vorlage unten oder baue eine eigene.')));
  } else {
    list.replaceChildren(...hub.combos.map((c) => {
      const src = hub.sources.get(c.source);
      const offline = [c.source, ...c.targets].filter((x) => !isLive(x)).map((x) => (hub.sources.get(x) || hub.targets.get(x))?.label);
      const toggle = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Kombi aktiv' });
      toggle.checked = c.enabled;
      toggle.addEventListener('change', () => hub.updateCombo(c.id, { enabled: toggle.checked }));
      return h('article', { class: 'combo card' + (c.enabled ? '' : ' disabled') },
        h('div', { class: 'combo-flow' },
          src ? chip(src) : h('span', {}, c.source),
          h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
          h('span', { class: 'combo-targets' }, ...c.targets.map((t) => hub.targets.get(t)).filter(Boolean).map((t) => chip(t)))),
        h('div', { class: 'combo-foot' },
          h('small', { class: offline.length ? 'warn' : 'muted' }, offline.length ? 'Nicht verbunden: ' + offline.join(', ') : (c.template !== '{text}' ? 'Format: ' + c.template : 'Bereit')),
          h('span', { class: 'combo-actions' },
            h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => openComboBuilder(c) }, 'Ändern'),
            h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { hub.removeCombo(c.id); toast('Kombi gelöscht'); } }, 'Löschen'),
            h('label', { class: 'switch' }, toggle, h('span', {})))));
    }));
  }
  $('#presets').replaceChildren(...PRESETS.map((p) => {
    const exists = hub.combos.some((c) => c.source === p.source && p.targets.every((t) => c.targets.includes(t)));
    return h('button', { class: 'preset', type: 'button', disabled: exists, onclick: () => { hub.addCombo({ source: p.source, targets: p.targets, template: p.template }); toast('Kombi angelegt'); } },
      h('span', { class: 'preset-flow' }, icon(hub.sources.get(p.source).icon), '→', ...p.targets.map((t) => icon(hub.targets.get(t).icon))),
      h('span', {}, p.name), h('small', {}, exists ? 'vorhanden' : 'übernehmen'));
  }));
}
hub.addEventListener('combos', renderCombos);
$('#combo-new').addEventListener('click', () => openComboBuilder());

function openComboBuilder(existing = null) {
  openId = null;
  sheetUpdate = null;
  $('#sheet-icon').replaceChildren(icon('combo'));
  $('#sheet-title').textContent = existing ? 'Kombi ändern' : 'Neue Kombi';
  $('#sheet-status').textContent = 'Eingabe wählen, dann eine oder mehrere Ausgaben';
  $('#sheet-status').className = 'sheet-status';
  let source = existing?.source || null;
  const targets = new Set(existing?.targets || []);
  const tpl = h('input', { type: 'text', value: existing?.template || '{text}' });
  const srcBox = h('div', { class: 'chips' });
  const tgtBox = h('div', { class: 'chips' });
  const save = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, existing ? 'Speichern' : 'Kombi anlegen');
  const draw = () => {
    srcBox.replaceChildren(...[...hub.sources.values()].map((s) => h('button', { type: 'button', class: 'chip' + (s.id === source ? ' on' : ''), 'aria-pressed': String(s.id === source), onclick: () => { source = s.id; [...targets].forEach((t) => { if (!hub.compatible(source, t)) targets.delete(t); }); draw(); } }, icon(s.icon), s.label)));
    tgtBox.replaceChildren(...[...hub.targets.values()].map((t) => {
      const ok = !source || hub.compatible(source, t.id);
      return h('button', { type: 'button', class: 'chip' + (targets.has(t.id) ? ' on' : ''), disabled: !ok, 'aria-pressed': String(targets.has(t.id)), onclick: () => { targets.has(t.id) ? targets.delete(t.id) : targets.add(t.id); draw(); } }, icon(t.icon), t.label);
    }));
    save.disabled = !source || !targets.size;
  };
  save.addEventListener('click', () => {
    const data = { source, targets: [...targets], template: tpl.value.includes('{text}') ? tpl.value : '{text}' };
    if (existing) hub.updateCombo(existing.id, data); else hub.addCombo(data);
    sheet.close();
    toast(existing ? 'Kombi gespeichert' : 'Kombi angelegt', 'ok');
  });
  draw();
  $('#sheet-body').replaceChildren(
    h('h3', { class: 'step-title' }, h('span', { class: 'num' }, '1'), 'Wenn …'), srcBox,
    h('h3', { class: 'step-title' }, h('span', { class: 'num' }, '2'), '… dann ausgeben auf'), tgtBox,
    h('details', {}, h('summary', {}, 'Format (optional)'), field('Text-Vorlage', tpl, '{text} = Wert, {quelle} = Name der Eingabe. Beispiel: „Karte: {text}“. Bilder werden unverändert weitergegeben.')),
    save);
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- Live
const logEl = $('#log');
function addLog(kind, label, text) {
  const t = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEl.prepend(h('li', { class: 'log-' + kind }, h('time', {}, t), h('span', { class: 'log-dir' }, kind === 'in' ? '▸' : kind === 'out' ? '◂' : '!'), h('strong', {}, label), h('span', {}, text || '')));
  while (logEl.children.length > 80) logEl.lastChild.remove();
}
hub.addEventListener('activity', (e) => {
  const d = e.detail;
  const text = d.message || (d.payload?.kind === 'image' ? '[Zeichnung]' : d.payload?.text);
  addLog(d.dir, d.label, text);
  if (d.dir === 'error') toast(d.label + ': ' + d.message, 'error');
});
hub.addEventListener('unrouted', (e) => {
  if (e.detail.source === 'manual') toast('Keine Kombi für „Manuell“ – nutze die Schnellziele darunter.');
});
$('#log-clear').addEventListener('click', () => logEl.replaceChildren());

$('#manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#manual-text').value.trim();
  if (v) hub.publish('manual', { kind: 'text', text: v });
});
$('#manual-targets').replaceChildren(...[...hub.targets.values()].map((t) => h('button', { type: 'button', class: 'chip', onclick: () => {
  const v = $('#manual-text').value.trim();
  if (!v) { toast('Erst einen Text eingeben'); $('#manual-text').focus(); return; }
  hub.deliver(t.id, { kind: 'text', text: v, source: 'manual' });
} }, icon(t.icon), t.label)));

const DEMOS = [
  { label: 'Würfeln', icon: 'dice', run: () => dev.godice.simulate() },
  { label: 'Farbtopf', icon: 'palette', run: () => { const i = Math.floor(Math.random() * POT_COUNT); dev.davinci._parse(0, true); dev.davinci._parse(1 << i); setTimeout(() => dev.davinci._parse(0), 1200); } },
  { label: 'Zeichnung', icon: 'pen', run: () => { const s = demoStrokes(); dev.pen.strokes = s; dev.pen.emit('cleared', {}); handleDrawing(s); } },
  { label: 'Inject-Wort', icon: 'globe', run: () => hub.publish('inject', { kind: 'text', text: ['Elefant', 'Pik Ass', 'Berlin', 'Mona Lisa'][Math.floor(Math.random() * 4)] }) },
  { label: 'PeekSmith-Taste', icon: 'button', run: () => hub.publish('peeksmith-buttons', { kind: 'trigger', text: 'Rechts' }) },
  { label: 'Selfie-Auslöser', icon: 'button', run: () => hub.publish('selfie-buttons', { kind: 'trigger', text: 'Auslöser' }) },
];
$('#demo-buttons').replaceChildren(...DEMOS.map((d) => h('button', { type: 'button', class: 'chip', onclick: d.run }, icon(d.icon), d.label)));
drawPreview(pv.selfie, textCanvas('MagicHub', 160, 192));
drawPreview(pv.print, printTextCanvas('MagicHub', 384));

// ---------------------------------------------------------------- Einrichtung & Hilfe
const appUrl = resolvedAppUrl();
let setupPlatform = getPlatform();

function renderSetup() {
  const names = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Computer' };
  $('#setup-detected').textContent = 'Erkannt: ' + names[detectPlatform()] + (looksLikeBluefy() ? ' (Bluefy)' : '') +
    ' · Web Bluetooth: ' + (BT ? 'ja ✓' : 'nein') + (isStandalone() ? ' · als App gestartet' : '') + '. Andere Plattform? Einfach umschalten.';
  document.querySelectorAll('.segmented button').forEach((b) => {
    const on = b.dataset.platform === setupPlatform;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.setup-panel').forEach((p) => { p.hidden = p.dataset.panel !== setupPlatform; });
}
document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
  setupPlatform = b.dataset.platform; setPlatformOverride(setupPlatform); renderSetup();
}));
document.querySelectorAll('[data-platform-link]').forEach((a) => a.addEventListener('click', () => { setupPlatform = a.dataset.platformLink; renderSetup(); }));

$('#ios-appstore').href = config.bluefyAppStoreUrl;
const bluefy = buildBluefyUrl(appUrl);
if (bluefy) $('#ios-bluefy').href = bluefy; else $('#ios-bluefy').removeAttribute('href');
for (const sel of ['#ios-url', '#android-url', '#desktop-url']) $(sel).value = appUrl;
$('#help-url').textContent = appUrl;
const sc = shortcutUrl();
if (sc) { $('#ios-shortcut').href = sc; $('#ios-shortcut-hint').textContent = 'Öffnet die iCloud-Freigabe. Vor dem Hinzufügen zeigt iOS die Aktionen an.'; }
else { $('#ios-shortcut').removeAttribute('href'); $('#ios-shortcut').classList.add('disabled'); $('#ios-shortcut').setAttribute('aria-disabled', 'true'); $('#ios-shortcut-hint').textContent = 'Noch kein Kurzbefehl hinterlegt – der Entwickler muss ihn erst auf einem iPhone erstellen und teilen.'; }
const u = new URL(appUrl);
$('#android-chrome').href = 'intent://' + u.host + u.pathname + u.search + '#Intent;scheme=https;package=com.android.chrome;end';
$('#android-ok').hidden = !BT; $('#android-no').hidden = BT;
if (BT) $('#android-chrome-step').hidden = true;

document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  const inp = $(b.dataset.copy);
  try { await navigator.clipboard.writeText(inp.value); toast('Adresse kopiert', 'ok'); } catch { inp.select(); toast('Bitte manuell kopieren'); }
}));

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#install-btn').hidden = false; });
$('#install-btn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const r = await installEvent.userChoice.catch(() => null);
  if (r?.outcome === 'accepted') toast('Installation gestartet', 'ok');
  installEvent = null; $('#install-btn').hidden = true;
});
window.addEventListener('appinstalled', () => toast('MagicHub installiert – Bluetooth bitte einmal neu testen', 'ok'));

$('#test-status').replaceChildren(...[
  'Ultra Sharpie / Ultra Pen (Init-Sequenz, Koordinaten)',
  'PeekSmith (Text, Tasten; Umlaute/PS3-Schrift vereinfacht)',
  'Selfie Screen (JPEG-Übertragung, Tasten)',
  'Peripage P21 (Druck, Flusssteuerung, Papiervorschub)',
  'GoDice und Davinci-Palette in dieser App (in den Einzel-Apps erprobt)',
  'Inject mit echter Account-ID',
  'KI-Erkennung mit echten Keys (Claude, OpenAI, Gemini, Google Vision) und lokale Browser-KI',
  'Bluefy-Direktlink und Apple-Kurzbefehl auf echtem iPhone',
  'Android-Installation als PWA und Start vom Homescreen',
].map((t) => h('li', {}, t)));
$('#version').textContent = config.appName + ' ' + VERSION;

// Banner
if (!BT) {
  $('#bt-banner').hidden = false;
  if (detectPlatform() === 'ios') $('#bt-banner-text').textContent = 'Auf dem iPhone brauchst du dafür die App Bluefy.';
}
$('#conn-pill').addEventListener('click', () => { location.hash = '#devices'; });

// ---------------------------------------------------------------- Navigation
const VIEWS = ['devices', 'combos', 'live', 'setup', 'help'];
function route() {
  let v = location.hash.slice(1);
  if (!VIEWS.includes(v)) v = 'devices';
  VIEWS.forEach((x) => { $('#view-' + x).hidden = x !== v; });
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === v || (v === 'setup' && a.dataset.tab === 'help')));
  if (v === 'setup') renderSetup();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// Erster Besuch ohne Web Bluetooth: einmalig zur Einrichtung, danach nie wieder automatisch.
if (!location.hash && !BT && !settings.setupSeen) { settings.setupSeen = true; saveSettings(); location.hash = '#setup'; }
route();
renderTiles();
renderCombos();

// ---------------------------------------------------------------- Service Worker
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
}
