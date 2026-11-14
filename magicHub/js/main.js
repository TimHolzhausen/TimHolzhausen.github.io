// MagicHub – Einstieg: Geräte, Kombis, Live-Vorschau, Einrichtung, Hilfe.

import { config, resolvedAppUrl, shortcutUrl } from './config.js';
import { buildBluefyUrl } from './bluefy.js';
import { hasWebBluetooth, getPlatform, detectPlatform, setPlatformOverride, looksLikeBluefy, isStandalone } from './platform.js';
import { describeError, BleDevice } from './ble/base.js';
import { GoDiceSet, SHELLS } from './ble/godice.js';
import { DavinciPalette, POT_COUNT } from './ble/davinci.js';
import { UltraSharpie } from './ble/ultrasharpie.js';
import { PeekSmith } from './ble/peeksmith.js';
import { SelfieScreen, PACKET_SIZES } from './ble/selfiescreen.js';
import { detectRotation, rotateStrokes, ROT_NAMES } from './pen-rotate.js';
import { PeripagePrinter } from './ble/peripage.js';
import { InjectSource, JsonUrlSource } from './web/sources.js';
import { AiVision, PROVIDERS, AI_TASKS, localAvailability } from './ai/vision.js';
import { Hub, PRESETS, CONDITIONS, CONTENTS, TEMPLATE_VARS, LIST_MODES, JOINERS, loadStore, saveStore, comboLabel, describeWhen } from './hub.js';
import { buildPrint, ensureFont, normalizeLayout, FONTS, ORIENTATIONS } from './print-layout.js';
import { STACKS, CARD_FORMATS, cardName, stackMapText } from './stacks.js';
import { textCanvas, drawingCanvas, fitInto, demoStrokes } from './render.js';

const VERSION = '0.5.10';
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
  if (typeof a.rotations === 'boolean') dev.ai.tryRotations = a.rotations;
}
if (settings.davinciPots) settings.davinciPots.forEach((n, i) => { if (dev.davinci.pots[i] && n) dev.davinci.pots[i].name = n; });
if (settings.printer) {
  Object.assign(dev.printer, settings.printer);
  if (!['00', '01', '02'].includes(dev.printer.density)) dev.printer.density = '02';
}
let printLayout = normalizeLayout(settings.printLayout);
if (settings.pen?.finishDelay) dev.pen.finishDelay = settings.pen.finishDelay;
if (settings.peeksmith?.brightness != null) dev.peeksmith.brightness = settings.peeksmith.brightness;
if (settings.selfie?.brightness) dev.selfie.brightness = settings.selfie.brightness;
if (settings.selfie?.packetSize && PACKET_SIZES[settings.selfie.packetSize]) dev.selfie.packetSize = settings.selfie.packetSize;
const diceMode = () => settings.diceMode || 'sum';
if (!settings.godice || typeof settings.godice !== 'object') settings.godice = {};
if (!settings.godice.shells) settings.godice.shells = {};
dev.godice.config = settings.godice; // Hülle je Würfel (auto | D6 | D20)
dev.ai.refreshStatus();

const DEVICES = [
  { id: 'godice', group: 'in', name: 'GoDice', desc: 'Smarte Würfel', icon: 'dice', ble: true },
  { id: 'davinci', group: 'in', name: 'Davinci-Palette', desc: 'Farbtöpfe', icon: 'palette', ble: true },
  { id: 'pen', group: 'in', name: 'Ultra Sharpie', desc: 'Smartpen-Zeichnung', icon: 'pen', ble: true },
  { id: 'ai', group: 'in', name: 'KI-Erkennung', desc: 'Handschrift erkennen', icon: 'spark' },
  { id: 'inject', group: 'in', name: 'Inject', desc: 'Magie-App', icon: 'globe' },
  { id: 'json', group: 'in', name: 'Web-Quelle', desc: 'Eigene JSON-URL', icon: 'link' },
  { id: 'peeksmith', group: 'out', name: 'PeekSmith', desc: 'Peek-Display', icon: 'display', ble: true },
  { id: 'selfie', group: 'out', name: 'Selfie Screen', desc: 'Magnet-Display', icon: 'image', ble: true },
  { id: 'printer', group: 'out', name: 'Peripage P21', desc: 'Thermodrucker', icon: 'printer', ble: true },
  { id: 'speech', group: 'out', name: 'Sprachausgabe', desc: 'Ansage übers Handy', icon: 'speaker' },
  { id: 'vibrate', group: 'out', name: 'Vibration', desc: 'Geheimes Zählen am Handy', icon: 'vibrate' },
];
const DEV_BY_ID = Object.fromEntries(DEVICES.map((d) => [d.id, d]));

// ---------------------------------------------------------------- Hub
const hub = new Hub();
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
[
  { id: 'godice', label: 'GoDice', icon: 'dice', kind: 'text', hint: 'Wert = Summe, Einzelwerte oder letzter Würfel (einstellbar beim Gerät).', values: () => range(1, 40) },
  { id: 'davinci', label: 'Davinci-Palette', icon: 'palette', kind: 'text', hint: 'Wert = Name des berührten Topfs.', values: () => dev.davinci.pots.slice(0, POT_COUNT).map((p) => p.name) },
  { id: 'pen', label: 'Ultra Sharpie', icon: 'pen', kind: 'image', hint: 'Fertige Zeichnung (Bild). Für erkannten Text „KI-Erkennung“ wählen.' },
  { id: 'ai', label: 'KI-Erkennung', icon: 'spark', kind: 'text', hint: 'Wert = erkannter Text.' },
  { id: 'inject', label: 'Inject', icon: 'globe', kind: 'text', hint: 'Wert = neu gewähltes Wort.' },
  { id: 'json', label: 'Web-Quelle', icon: 'link', kind: 'text', hint: 'Wert = Feld aus der JSON-Antwort.' },
  { id: 'peeksmith-buttons', label: 'PeekSmith-Taste', icon: 'button', kind: 'trigger', hint: 'Wert = Name der Taste.', values: () => ['Links', 'Rechts', 'Seite', 'Links lang', 'Rechts lang', 'Seite lang', 'Magnet'] },
  { id: 'selfie-buttons', label: 'Selfie-Taste', icon: 'button', kind: 'trigger', hint: 'Wert = Name der Taste: Auslöser, Kamera wechseln, Plus (Lautstärke +), Minus (Lautstärke −).', values: () => ['Auslöser', 'Kamera wechseln', 'Plus', 'Minus'] },
  { id: 'manual', label: 'Manuell', icon: 'hand', kind: 'text', hint: 'Wert = Text aus „Live → Manuell senden“.' },
  { id: 'list', label: 'Sitzungsliste', icon: 'list', kind: 'text', hint: 'Löst bei jedem neuen Listeneintrag aus – egal von welcher Quelle. Wert = neuer Eintrag. Mit Bedingung „Sitzungsliste hat genau 4 Einträge“ z. B. beim 4. Wert.' },
].forEach((s) => hub.registerSource(s));
hub.init();

const pv = { peek: $('#pv-peek'), selfie: $('#pv-selfie'), print: $('#pv-print') };

hub.registerTarget({
  id: 'peeksmith', label: 'PeekSmith', icon: 'display', accepts: ['text'],
  async deliver(p) {
    pv.peek.textContent = p.text || ' ';
    if (dev.peeksmith.connected) await dev.peeksmith.showText(p.text);
  },
  async clear() {
    pv.peek.textContent = ' ';
    if (dev.peeksmith.connected) await dev.peeksmith.clear();
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
  async clear() {
    const s = dev.selfie;
    const c = textCanvas('', s.width, s.height);
    drawPreview(pv.selfie, c);
    if (s.connected) await s.showCanvas(c);
  },
});
hub.registerTarget({
  id: 'printer', label: 'Peripage P21', icon: 'printer', accepts: ['text', 'image'],
  async deliver(p) {
    const { page, print } = await renderPrint(p, p.font && FONTS[p.font] ? { ...printLayout, font: p.font } : printLayout);
    drawPreview(pv.print, page);
    if (dev.printer.connected) {
      await dev.printer.printJob(print, {
        dither: p.kind === 'image' && !p.strokes && printLayout.dither,
        copies: printLayout.copies, feedBefore: printLayout.feedBefore, feedAfter: printLayout.feedAfter,
      });
    }
  },
});

async function renderPrint(p, layout = printLayout) {
  await ensureFont(layout.font);
  return buildPrint(p, layout, dev.printer.width);
}
hub.registerTarget({
  id: 'list', label: 'Sitzungsliste', icon: 'list', accepts: ['text'],
  async deliver(p) { hub.addToList(p.text, 'combo'); },
  clear() { hub.clearList(); },
});
hub.registerTarget({
  id: 'pen-buffer', label: 'Stift-Puffer', icon: 'pen', accepts: ['text', 'image'], clearOnly: true,
  async deliver() { dev.pen.clear(); },
  clear() { dev.pen.clear(); },
});
hub.registerTarget({
  id: 'inject-send', label: 'Inject (senden)', icon: 'globe', accepts: ['text'],
  async deliver(p) {
    const r = await dev.inject.send(p.text);
    if (r.skipped) addLog('skip', 'Inject', 'Nicht zurückgesendet – kam gerade erst von Inject');
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
  clear() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
});
hub.registerTarget({
  id: 'vibrate', label: 'Vibration', icon: 'vibrate', accepts: ['text'],
  async deliver(p) {
    vibrateNow(vibrationPattern(p.text));
  },
  clear() { if ('vibrate' in navigator) navigator.vibrate(0); },
});

/**
 * Vibrieren mit verständlicher Fehlermeldung. Chrome meldet ein Verbot nur über den Rückgabewert false:
 * - erst nach dem ersten Tippen auf die Seite erlaubt (Nutzer-Aktivierung),
 * - nur solange die Seite sichtbar ist (nicht im Hintergrund, nicht bei ausgeschaltetem Display).
 * Ist true zurückgekommen und es vibriert trotzdem nicht, blockiert Android selbst (Einstellungen).
 */
function vibrateNow(pattern) {
  if (!('vibrate' in navigator)) throw new Error('Vibration wird hier nicht unterstützt (z. B. iPhone)');
  if (document.visibilityState !== 'visible') throw new Error('MagicHub ist im Hintergrund – Chrome vibriert nur bei sichtbarer Seite');
  const ok = navigator.vibrate(pattern);
  if (!ok) throw new Error('Chrome hat die Vibration abgelehnt – einmal auf die Seite tippen, dann geht es');
  return ok;
}

/** Zahl n → Impulse: Zehner lang, Einer kurz (z. B. 12 = lang, Pause, kurz, kurz). Text → ein Impuls. */
function vibrationPattern(text) {
  const n = parseInt(String(text).trim(), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 60) return [120];
  const pattern = [];
  const tens = Math.floor(n / 10); const ones = n % 10;
  for (let i = 0; i < tens; i++) pattern.push(600, 350);
  if (tens && ones) pattern.push(0, 500);
  for (let i = 0; i < ones; i++) pattern.push(150, 250);
  return pattern;
}

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

// Live-Anzeige („Peek Drawing“): was gerade geschrieben wird, sofort auf den Selfie Screen.
// Der Screen holt sich das nächste Bild erst, wenn er bereit ist – zwischendurch wird nur das neueste behalten.
let liveTimer = null;
dev.pen.addEventListener('point', () => {
  if (!settings.selfie?.livePen || liveTimer) return;
  liveTimer = setTimeout(() => {
    liveTimer = null;
    const s = dev.selfie;
    const canvas = drawingCanvas(penView(dev.pen.strokes, { learn: true }), s.width, s.height, { bg: '#000', fg: '#fff' });
    drawPreview(pv.selfie, canvas);
    if (s.connected) s.showCanvas(canvas);
  }, 250);
});
dev.peeksmith.addEventListener('button', (e) => hub.publish('peeksmith-buttons', { kind: 'trigger', text: e.detail.button + (e.detail.long ? ' lang' : '') }));
dev.selfie.addEventListener('button', (e) => {
  hub.publish('selfie-buttons', { kind: 'trigger', text: e.detail.button });
  const t = document.getElementById('selfie-keytest');
  if (t) t.textContent = 'Zuletzt gedrückt: ' + e.detail.button + ' (' + new Date().toLocaleTimeString('de-DE') + ')';
});
dev.selfie.addEventListener('needs-picture', () => hub.deliver('selfie', { kind: 'text', text: 'MagicHub' }));
dev.inject.addEventListener('value', (e) => hub.publish('inject', { kind: 'text', text: e.detail.text }));
dev.json.addEventListener('value', (e) => hub.publish('json', { kind: 'text', text: e.detail.text }));

// Stift-Drehung: 'auto' (aus der Schreibrichtung, wie Peekbox-Firmware) oder fest 0–3.
let penRot = 0;
const penRotMode = () => settings.pen?.rotate ?? 'auto';
/** Striche in Leserichtung bringen. learn = Drehung aus diesen Strichen neu bestimmen. */
function penView(strokes, { learn = false } = {}) {
  const mode = penRotMode();
  if (mode !== 'auto') return rotateStrokes(strokes, Number(mode));
  if (learn) {
    const r = detectRotation(strokes, penRot);
    if (r.rot !== penRot) { penRot = r.rot; dev.pen.log('info', 'Schrift ' + ROT_NAMES[penRot] + ' – Zeichnung wird gedreht (' + r.why + ')'); }
  }
  return rotateStrokes(strokes, penRot);
}

let lastDrawing = null; // letzte weitergegebene Zeichnung (für Tests, auch wenn der Puffer schon leer ist)
async function handleDrawing(strokes) {
  strokes = penView(strokes, { learn: true });
  lastDrawing = strokes;
  // Sonst landen beim nächsten Wort die alten Striche wieder mit in der Erkennung.
  if ((settings.pen?.clearAfter || 'send') === 'send') dev.pen.clear();
  hub.publish('pen', { kind: 'image', strokes, canvas: drawingCanvas(strokes, 384, 384) });
  if (dev.ai.auto && dev.ai.ready) {
    try {
      const text = await dev.ai.recognize(drawingCanvas(strokes, 512, 512, { line: 6 }), strokes);
      hub.publish('ai', { kind: 'text', text });
      toast('KI erkannt: ' + text + (dev.ai.lastRotation ? ' (Zeichnung war gedreht)' : ''));
    } catch (err) { toast(err.message, 'error'); }
  }
}

// ---------------------------------------------------------------- Kacheln
function statusOf(id) {
  if (id === 'speech') return { status: 'speechSynthesis' in window ? 'connected' : 'error', message: 'speechSynthesis' in window ? 'Bereit' : 'Nicht unterstützt' };
  if (id === 'vibrate') return { status: 'vibrate' in navigator ? 'connected' : 'error', message: 'vibrate' in navigator ? 'Bereit' : 'Nicht unterstützt (iPhone)' };
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
  if (id === 'vibrate') return { label: 'Test', run: () => hub.deliver('vibrate', { kind: 'text', text: '3' }) };
  if (id === 'inject' || id === 'json') {
    if (d.status === 'connected' || d.status === 'connecting') return { label: 'Stopp', run: () => d.stop() };
    return { label: 'Start', run: () => { if (d.validate()) { openSheet(id); return; } d.start(); } };
  }
  if (d.status === 'connected') return { label: 'Trennen', run: () => d.disconnect() };
  if (d.status === 'connecting') return { label: 'Verbinde …', disabled: true };
  if (d.status === 'lost') return { label: 'Erneut verbinden', run: () => d.reconnect() };
  if (d.autoWaiting) return { label: 'Wartet … jetzt verbinden', run: () => d.connect() };
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
  const n = DEVICES.filter((d) => !['speech', 'vibrate'].includes(d.id) && statusOf(d.id).status === 'connected').length;
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
  const panelUpdate = (PANELS[id] || (() => null))(body) || null;
  let logUpdate = null;
  if (meta.ble) {
    const pre = h('pre', { class: 'devlog' });
    const copy = h('button', { class: 'btn btn-small', type: 'button', onclick: async () => {
      const text = navigator.userAgent + '\n' + devLogs[id].join('\n');
      try { await navigator.clipboard.writeText(text); toast('Protokoll kopiert', 'ok'); } catch { toast('Kopieren nicht möglich'); }
    } }, 'Kopieren');
    body.append(h('details', { class: 'devlog-box' }, h('summary', {}, 'Verbindungsprotokoll'), pre, copy));
    logUpdate = () => { pre.textContent = devLogs[id].length ? devLogs[id].join('\n') : 'Noch keine Einträge.'; };
  }
  sheetUpdate = () => { panelUpdate?.(); logUpdate?.(); };
  refreshSheet();
  if (!sheet.open) sheet.showModal();
}

// Protokoll je Gerät (für die Fehlersuche, max. 60 Zeilen)
const devLogs = Object.fromEntries(Object.keys(dev).map((k) => [k, []]));
function pushDevLog(id, level, message) {
  const t = new Date().toLocaleTimeString('de-DE');
  devLogs[id].push(t + ' ' + (level === 'error' ? '✖ ' : level === 'warn' ? '⚠ ' : '') + message);
  if (devLogs[id].length > 60) devLogs[id].shift();
  if (openId === id) refreshSheet();
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
  const isBle = DEV_BY_ID[id]?.ble && BT;
  const all = isBle ? h('button', { class: 'btn btn-ghost btn-small btn-block', type: 'button',
    onclick: () => runAction({ run: () => dev[id].connect({ showAll: true }) }) }, 'Gerät nicht in der Liste? Alle Bluetooth-Geräte anzeigen') : null;
  const other = isBle ? h('button', { class: 'btn btn-ghost btn-small btn-block', type: 'button',
    onclick: () => runAction({ run: () => dev[id].connect({ choose: true }) }) }, 'Anderes Gerät wählen') : null;
  const quick = isBle ? h('p', { class: 'hint' }) : null;
  const autoBox = isBle && dev[id] instanceof BleDevice ? h('input', { type: 'checkbox' }) : null;
  if (autoBox) {
    autoBox.checked = dev[id].autoConnect;
    autoBox.addEventListener('change', () => {
      settings.autoConnect = { ...settings.autoConnect, [id]: autoBox.checked };
      saveSettings();
      dev[id].autoConnect = autoBox.checked;
      if (!autoBox.checked) dev[id].stopAuto();
      else if (!dev[id].connected) dev[id].autoStart().catch(() => {});
      upd();
    });
  }
  const autoHint = autoBox ? h('p', { class: 'hint' }) : null;
  const el = h('div', {}, btn, other, all, quick,
    autoBox ? h('label', { class: 'switch-row' }, autoBox, h('span', {}, 'Automatisch verbinden (beim Start und nach Abbruch)')) : null, autoHint);
  const upd = () => {
    const d = dev[id];
    const a = primaryAction(id);
    const remembered = isBle ? d.rememberedName : '';
    const fast = isBle && BleDevice.canQuickConnect && remembered;
    btn.textContent = fast && a.label === 'Verbinden' ? 'Verbinden mit ' + remembered : a.label;
    btn.disabled = !!a.disabled;
    btn.classList.toggle('btn-primary', d.status !== 'connected');
    btn.onclick = () => runAction(a);
    const busy = ['connected', 'connecting'].includes(d.status);
    if (all) all.hidden = busy;
    if (other) other.hidden = busy || !fast;
    if (quick) {
      quick.hidden = busy;
      quick.textContent = BleDevice.canQuickConnect
        ? (fast ? 'Verbindet direkt ohne Suche. Für ein neues Gerät „Anderes Gerät wählen“.' : 'Nach der ersten Verbindung geht es künftig ohne Suche.')
        : 'Suche dauert lange? Chrome kann bekannte Geräte auch ohne Suche verbinden – dafür in chrome://flags „Use the new permissions backend for Web Bluetooth“ aktivieren (experimentell).';
    }
    if (autoHint) {
      autoHint.textContent = d.autoWaiting
        ? 'Wartet, bis ' + d.deviceName + ' eingeschaltet und in Reichweite ist. „Verbinden“ oder Abschalten beendet das Warten.'
        : BleDevice.canQuickConnect
          ? 'Nach einem Abbruch und beim Start der App wird das zuletzt genutzte Gerät von selbst verbunden.'
          : 'Nach einem Abbruch wird von selbst neu verbunden. Beim App-Start geht das in diesem Browser nicht (Chrome: Flag oben), dann einmal tippen.';
    }
  };
  upd();
  return { el, upd };
}

function field(label, input, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
}

function noBt() { return BT ? null : h('p', { class: 'callout' }, 'Dieser Browser kann kein Web Bluetooth. ', h('a', { href: '#setup', onclick: () => sheet.close() }, 'Zur Einrichtung')); }

const PANELS = {
  godice(body) {
    const shellInfo = (id, d) => {
      if (!d.type) return 'Hülle: ' + (dev.godice.shellOf(id) === 'auto' ? 'automatisch, noch nicht gewürfelt' : SHELLS[dev.godice.shellOf(id)]);
      if (dev.godice.shellOf(id) !== 'auto') return 'Hülle: ' + d.type + ' (fest)';
      return 'Erkannt: ' + (d.type === 'D20' ? 'D20-Hülle' : 'D6 ohne Hülle') + (d.clear === false ? ' (Lage unklar, bleibt)' : '');
    };
    const shellSelect = (id) => {
      const sel = h('select', { class: 'die-shell', 'aria-label': 'Hülle', onchange: () => { dev.godice.setShell(id, sel.value); saveSettings(); } },
        ...Object.entries(SHELLS).map(([v, l]) => h('option', { value: v }, l)));
      sel.value = dev.godice.shellOf(id);
      return sel;
    };
    const list = h('div', { class: 'dice-list' });
    const mode = h('select', { onchange: () => { settings.diceMode = mode.value; saveSettings(); } },
      h('option', { value: 'sum' }, 'Summe aller Würfel'),
      h('option', { value: 'list' }, 'Einzelwerte (z. B. „3 5“)'),
      h('option', { value: 'last' }, 'Nur letzter Würfel'));
    mode.value = diceMode();
    const add = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: !BT, onclick: () => runAction({ run: () => dev.godice.addDie() }) }, '+ Würfel hinzufügen');
    const auto = h('input', { type: 'checkbox' });
    auto.checked = dev.godice.autoConnect;
    auto.addEventListener('change', () => {
      settings.autoConnect = { ...settings.autoConnect, godice: auto.checked };
      saveSettings();
      dev.godice.autoConnect = auto.checked;
      if (!auto.checked) dev.godice.stopAuto(); else dev.godice.autoStart().catch(() => {});
    });
    const autoHint = h('p', { class: 'hint' }, dev.godice.constructor.canQuickConnect
      ? 'Bekannte Würfel verbinden sich beim Start und nach einem Abbruch von selbst, sobald sie funken (Würfel kurz bewegen).'
      : 'Nach einem Abbruch verbinden sich Würfel von selbst. Beim App-Start nur, wenn Chrome bekannte Geräte kennt: chrome://flags → „Use the new permissions backend for Web Bluetooth“ (experimentell). Neue Würfel brauchen immer einmal „+ Würfel hinzufügen“.');
    body.append(noBt() || '', list, add, field('Gesendet wird', mode),
      h('label', { class: 'switch-row' }, auto, h('span', {}, 'Würfel automatisch verbinden (beim Start und nach Abbruch)')), autoHint, h('p', { class: 'hint' }, 'Mehrere Würfel nacheinander hinzufügen. Gemeldet wird, sobald alle liegen. Hülle „Automatisch“ erkennt pro Wurf, ob der Würfel in einer D20-Hülle steckt.'));
    return () => {
      const dice = [...dev.godice.dice.entries()];
      list.replaceChildren(...(dice.length ? dice.map(([id, d]) => h('div', { class: 'die' + (d.online ? '' : ' off') },
        h('span', { class: 'die-face', style: 'background:' + (d.colorHex || '#555') }, d.rolling ? '…' : (d.value ?? '–')),
        h('span', { class: 'die-text' }, h('strong', {}, d.color || d.name),
          h('small', {}, d.online ? (d.battery != null ? 'Akku ' + d.battery + ' %' : 'verbunden') : d.waiting ? 'wartet – verbindet automatisch, sobald er funkt' : 'getrennt'),
          h('small', {}, shellInfo(id, d))),
        shellSelect(id),
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
    const delay = h('select', { onchange: () => { dev.pen.finishDelay = Number(delay.value); settings.pen = { ...settings.pen, finishDelay: dev.pen.finishDelay }; saveSettings(); } },
      ...[1500, 2500, 4000, 6000].map((v) => h('option', { value: v }, (v / 1000).toLocaleString('de-DE') + ' s')));
    delay.value = String(dev.pen.finishDelay);
    const after = h('select', { onchange: () => { settings.pen = { ...settings.pen, clearAfter: after.value }; saveSettings(); } },
      h('option', { value: 'send' }, 'Leeren – jede Zeichnung wird einzeln erkannt'),
      h('option', { value: 'keep' }, 'Behalten – alles zusammen, bis „Neue Zeichnung“'));
    after.value = settings.pen?.clearAfter || 'send';
    const rot = h('select', { onchange: () => { settings.pen = { ...settings.pen, rotate: rot.value }; saveSettings(); if (rot.value !== 'auto') penRot = Number(rot.value); } },
      h('option', { value: 'auto' }, 'Automatisch (an der Schreibrichtung erkennen)'),
      ...ROT_NAMES.map((n, i) => h('option', { value: String(i) }, 'Fest: ' + n)));
    rot.value = String(penRotMode());
    const rotInfo = h('small', {});
    body.append(noBt() || '', c.el, cv,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => dev.pen.clear() }, 'Neue Zeichnung'),
        h('button', { class: 'btn', type: 'button', onclick: () => dev.pen.strokes.length && handleDrawing(dev.pen.strokes.map((s) => s.slice())) }, 'Jetzt senden')),
      field('Zeichnung gilt als fertig nach', delay, 'Solange ohne Stiftbewegung, dann wird sie an die Kombis (und ggf. die KI) geschickt.'),
      field('Zeichnung drehen', rot, 'Liegt das Blatt quer oder auf dem Kopf, wird die Zeichnung gedreht – auch für Erkennung und Anzeige. Automatisch: aus der Schreibrichtung (Buchstaben laufen nach rechts) bzw. einer langen geraden Linie. '),
      rotInfo,
      field('Danach den Stift-Puffer', after, 'Beim Leeren landen alte Wörter nicht noch einmal in der Erkennung. Leeren geht auch per Kombi-Aktion „Stift-Puffer“ (z. B. auf eine PeekSmith-Taste).'),
      h('p', { class: 'hint' }, 'Der „Neo“ wechselt bei jedem Einschalten Name und Adresse – dann einfach neu verbinden.'));
    return () => { c.upd(); const d = drawingCanvas(penView(dev.pen.strokes, { learn: true }), cv.width, cv.height, { bg: '#fff', fg: '#111' }); cv.getContext('2d').drawImage(d, 0, 0); rotInfo.textContent = penRotMode() === 'auto' ? 'Erkannt: ' + ROT_NAMES[penRot] : ''; };
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
    const rots = h('input', { type: 'checkbox' });
    rots.checked = ai.tryRotations;
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
      ai.task = task.value; ai.auto = auto.checked; ai.tryRotations = rots.checked;
      settings.ai = { provider: ai.provider, keys: ai.keys, models: ai.models, task: ai.task, auto: ai.auto, rotations: ai.tryRotations };
      saveSettings(); ai.refreshStatus(); toast('KI-Einstellungen gespeichert', 'ok');
    };
    const test = h('button', { class: 'btn', type: 'button', onclick: async () => {
      save();
      try {
        const strokes = dev.pen.strokes.length ? penView(dev.pen.strokes, { learn: true }) : (lastDrawing || demoStrokes());
        const text = await dev.ai.recognize(drawingCanvas(strokes, 512, 512, { line: 6 }), strokes);
        hub.publish('ai', { kind: 'text', text });
        toast('KI erkannt: ' + text);
      } catch (err) { toast(err.message, 'error'); }
    } }, 'Mit Zeichnung testen');
    body.append(
      field('Anbieter', prov), note,
      keyField, modelField,
      field('Aufgabe', task),
      h('label', { class: 'switch-row' }, auto, h('span', {}, 'Jede fertige Stift-Zeichnung automatisch erkennen')),
      h('label', { class: 'switch-row' }, rots, h('span', {}, 'Gedrehte Zeichnungen erkennen (seitlich, auf dem Kopf)')),
      h('p', { class: 'hint' }, 'Claude/OpenAI/Gemini bekommen den Hinweis im Auftrag. Google Handschrift probiert bei „Spielkarte“ alle vier Lagen und nimmt die, die eine Karte ergibt; Tesseract nimmt die sicherste Lage. Bei Text mit Google Handschrift zählt die Drehung im Stift-Fenster.'),
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
    const sendTxt = h('input', { type: 'text', placeholder: 'Text an Inject senden', autocomplete: 'off' });
    const sendInfo = h('p', { class: 'hint' }, dev.inject.lastSent ? 'Zuletzt gesendet: „' + dev.inject.lastSent + '“' : '');
    const sendForm = h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      apply();
      try {
        await hub.deliver('inject-send', { kind: 'text', text: sendTxt.value });
        sendInfo.textContent = 'Gesendet: „' + dev.inject.lastSent + '“';
        toast('An Inject gesendet', 'ok');
      } catch (err) { sendInfo.textContent = err.message; toast(err.message, 'error'); }
    } }, sendTxt, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Senden'));
    body.append(field('Inject-Account-ID', id, 'Die Account-Nummer aus der Inject-App (nicht der Benutzername). Abgefragt wird https://11z.co/_w/<ID>/selection.'),
      field('Abfrage alle … Sekunden', iv),
      h('label', { class: 'switch-row' }, g, h('span', {}, 'Ergebnisse von der Google-Seite')),
      h('label', { class: 'switch-row' }, w, h('span', {}, 'Ergebnisse von anderen Seiten')),
      c.el,
      h('p', { class: 'hint' }, 'Der beim Start schon vorhandene Wert wird übersprungen – gemeldet werden nur neue Auswahlen.'),
      h('h3', {}, 'An Inject senden'),
      h('p', { class: 'hint' }, 'Der Text landet in Inject als neue Auswahl. In Kombis gibt es dafür die Ausgabe „Inject (senden)“ – z. B. Zeichnung → KI-Erkennung → Inject. Senden geht auch ohne laufende Abfrage. Ein gerade von Inject empfangener Wert wird nicht sofort zurückgeschickt.'),
      sendForm, sendInfo);
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
    br.addEventListener('change', () => { dev.selfie.brightness = Number(br.value); settings.selfie = { ...settings.selfie, brightness: dev.selfie.brightness }; saveSettings(); });
    const info = h('p', { class: 'hint' });
    const live = h('input', { type: 'checkbox' }); live.checked = !!settings.selfie?.livePen;
    live.addEventListener('change', () => { settings.selfie = { ...settings.selfie, livePen: live.checked }; saveSettings(); });
    const awake = h('input', { type: 'checkbox' }); awake.checked = settings.keepAwake !== false;
    awake.addEventListener('change', () => { settings.keepAwake = awake.checked; saveSettings(); updateWakeLock(); });
    const packet = h('select', { onchange: () => { dev.selfie.packetSize = packet.value; settings.selfie = { ...settings.selfie, packetSize: packet.value }; saveSettings(); } },
      ...['auto', '19', '180', '244'].map((v) => h('option', { value: v }, PACKET_SIZES[v])));
    packet.value = dev.selfie.packetSize;
    const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const img = await createImageBitmap(f);
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      hub.deliver('selfie', { kind: 'image', canvas: cv });
    });
    body.append(noBt() || '', c.el,
      h('p', { class: 'hint' }, 'Am zuverlässigsten: erst „Verbinden“ tippen, dann den Screen einschalten. Ist er schon an: aus- und wieder einschalten, während die Suche läuft.'),
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); hub.deliver('selfie', { kind: 'text', text: txt.value }); } }, txt, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Anzeigen')),
      h('label', { class: 'btn btn-block' }, file, 'Foto anzeigen …'),
      field('Helligkeit (Bild abdunkeln)', br), info,
      h('p', { class: 'hint' }, 'Tasten (Auslöser, Kamera wechseln, Lautstärke + und −) sind in Kombis als Eingabe „Selfie-Taste“ nutzbar – z. B. Auslöser = letzten Inhalt drucken, Plus/Minus = Sitzungsliste leeren oder Display löschen.'),
      h('p', { class: 'keytest', id: 'selfie-keytest' }, 'Tastentest: eine Taste am Screen drücken …'),
      h('label', { class: 'switch-row' }, live, h('span', {}, 'Stift live mitzeichnen (was gerade geschrieben wird)')),
      h('label', { class: 'switch-row' }, awake, h('span', {}, 'Handy-Bildschirm anlassen, solange Geräte verbunden sind')),
      h('details', {}, h('summary', {}, 'Verbindung bricht ab?'),
        field('Paketgröße', packet, 'Gilt ab der nächsten Verbindung. Trennt der Screen immer kurz nach dem ersten Bild, 19 Byte wählen.'),
        h('ol', {},
          h('li', {}, 'App im Vordergrund lassen: Im Hintergrund oder bei ausgeschaltetem Display trennt der Browser Bluetooth oft.'),
          h('li', {}, 'Trennt er jedes Mal gleich nach dem Verbinden bzw. ersten Bild: Paketgröße 19 Byte (auf Android automatisch).'),
          h('li', {}, 'Im Geräte-Protokoll steht bei jedem Abbruch, nach wie vielen Sekunden er kam und wann zuletzt etwas gesendet wurde – das bitte notieren, wenn es weiter passiert.'),
          h('li', {}, 'Abstand klein halten; der Screen ist ein schwacher Sender.'))),
      h('details', {}, h('summary', {}, 'Screen wird nicht gefunden?'),
        h('ol', {},
          h('li', {}, 'Screen einschalten und in anderen Apps trennen (nur eine Verbindung möglich).'),
          h('li', {}, 'Ist er in den Bluetooth-Einstellungen des Handys gekoppelt, dort „Entkoppeln“ – gekoppelte Geräte werben oft nicht mehr per BLE.'),
          h('li', {}, '„Alle Bluetooth-Geräte anzeigen“ antippen und nach SelfieCom, TP02 oder einem unbenannten Gerät in der Nähe schauen.'),
          h('li', {}, 'Meldet die App „bietet den Dienst nicht an“, war es das falsche Gerät – oder der Screen spricht nur klassisches Bluetooth.'))));
    return () => { c.upd(); const s = dev.selfie; info.textContent = s.connected ? s.width + '×' + s.height + ' px · Puffer ' + Math.round(s.buffer / 1024) + ' KB' : ''; };
  },

  printer(body) {
    const c = connectRow('printer');
    const txt = h('textarea', { rows: 2, placeholder: 'Text zum Drucken' });
    txt.value = settings.printTestText || 'Herz Dame';
    const L = { ...printLayout };
    const preview = h('canvas', { class: 'print-preview' });
    const previewInfo = h('p', { class: 'hint center' });
    let pvTimer;
    const redraw = () => {
      clearTimeout(pvTimer);
      pvTimer = setTimeout(async () => {
        const { page } = await renderPrint({ kind: 'text', text: txt.value || ' ' }, L);
        drawPreview(preview, page);
        const mm = (v) => Math.round(v / 8);
        previewInfo.textContent = 'Etikett ' + mm(page.width) + ' × ' + mm(page.height) + ' mm (Leseansicht)';
      }, 80);
    };
    const save = () => { printLayout = normalizeLayout(L); settings.printLayout = printLayout; saveSettings(); redraw(); };
    const sel = (key, opts) => {
      const el = h('select', {}, ...Object.entries(opts).map(([v, l]) => h('option', { value: v }, l)));
      el.value = String(L[key]);
      el.addEventListener('change', () => { L[key] = el.value; save(); });
      return el;
    };
    const numIn = (key, min, max, step = 1) => {
      const el = h('input', { type: 'number', min, max, step, value: L[key], inputmode: 'decimal' });
      el.addEventListener('input', () => { if (el.value !== '') { L[key] = Number(el.value); save(); } });
      return el;
    };
    const rangeIn = (key, min, max, step, fmt) => {
      const out = h('output', {}, fmt(L[key]));
      const el = h('input', { type: 'range', min, max, step, value: L[key] });
      el.addEventListener('input', () => { L[key] = Number(el.value); out.textContent = fmt(L[key]); save(); });
      return h('div', { class: 'range-row' }, el, out);
    };
    const check = (key, label) => {
      const el = h('input', { type: 'checkbox' }); el.checked = !!L[key];
      el.addEventListener('change', () => { L[key] = el.checked; save(); });
      return h('label', { class: 'switch-row' }, el, h('span', {}, label));
    };
    txt.addEventListener('input', () => { settings.printTestText = txt.value; saveSettings(); redraw(); });

    const dens = h('select', {}, ...[['00', 'Hell'], ['01', 'Mittel'], ['02', 'Dunkel']].map(([v, l]) => h('option', { value: v }, l)));
    dens.value = dev.printer.density;
    const mode = h('select', {}, h('option', { value: 'official' }, 'Standard (mit Flusssteuerung)'), h('option', { value: 'safe' }, 'Sicher (langsamer, mit Pausen)'));
    mode.value = dev.printer.mode;
    const applyDev = () => { dev.printer.density = dens.value; dev.printer.mode = mode.value; settings.printer = { density: dens.value, mode: mode.value }; saveSettings(); };
    dens.addEventListener('change', applyDev); mode.addEventListener('change', applyDev);

    const info = h('p', { class: 'hint' });
    const reset = h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => {
      settings.printLayout = undefined; saveSettings(); printLayout = normalizeLayout(); openSheet('printer'); toast('Druck-Einstellungen zurückgesetzt');
    } }, 'Alles zurücksetzen');

    body.append(noBt() || '', c.el,
      h('div', { class: 'paper paper-sheet' }, preview), previewInfo,
      txt,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => txt.value.trim() && hub.deliver('printer', { kind: 'text', text: txt.value }) }, 'Drucken'),
        h('button', { class: 'btn', type: 'button', onclick: () => dev.printer.feed(10).catch((e) => toast(e.message, 'error')) }, 'Papier vor')),
      h('h3', { class: 'group-title' }, 'Layout'),
      field('Ausrichtung', sel('orientation', ORIENTATIONS)),
      field('Etikettenlänge (mm)', numIn('length', 0, 400), '0 = automatisch passend zum Text. Fester Wert = Text wird in das Etikett eingepasst.'),
      h('div', { class: 'grid-2' },
        field('Schrift', sel('font', Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.label])))),
        field('Zeilenhöhe', rangeIn('lineHeight', 70, 180, 5, (v) => v + ' %'))),
      check('bold', 'Fett'),
      h('div', { class: 'grid-2' },
        field('Min. Schrift (mm)', numIn('minFont', 2, 40)),
        field('Max. Schrift (mm)', numIn('maxFont', 3, 45))),
      h('div', { class: 'grid-2' },
        field('Waagerecht', sel('hAlign', { left: 'Links', center: 'Mitte', right: 'Rechts' })),
        field('Senkrecht', sel('vAlign', { top: 'Oben', center: 'Mitte', bottom: 'Unten' }))),
      field('Rand innen (mm)', rangeIn('padding', 0, 15, 1, (v) => v + ' mm')),
      field('Neigung', rangeIn('tilt', -15, 15, 1, (v) => v + '°'), 'Leicht schräg wirkt handgeschrieben.'),
      check('invert', 'Invertiert (weiß auf schwarz)'),
      check('border', 'Rahmen'),
      h('h3', { class: 'group-title' }, 'Papier & Drucker'),
      h('div', { class: 'grid-2' },
        field('Vorschub vorher (mm)', numIn('feedBefore', 0, 50)),
        field('Vorschub nachher (mm)', numIn('feedAfter', 0, 50))),
      field('Kopien', numIn('copies', 1, 10)),
      check('dither', 'Fotos rastern (Graustufen)'),
      field('Schwärzung', dens, 'Wirkt beim nächsten Druck.'),
      field('Übertragung', mode),
      info, reset);
    redraw();
    return () => { c.upd(); const p = dev.printer; info.textContent = p.connected ? (p.device?.name || '') + ' · ' + p.width + ' px (' + Math.round(p.width / 8) + ' mm) breit' + (p.battery != null ? ' · Akku ' + p.battery + ' %' : '') + (p.printing ? ' · druckt …' : '') : 'Nicht verbunden – Vorschau funktioniert trotzdem.'; };
  },

  vibrate(body) {
    const ok = 'vibrate' in navigator;
    const result = h('p', { class: 'hint', role: 'status' });
    const pocket = h('button', { class: 'btn btn-block', type: 'button', 'data-pocket': '' }, 'Taschenmodus starten');
    const direct = h('button', { class: 'btn btn-primary', type: 'button', disabled: !ok, onclick: () => {
      try {
        vibrateNow([1000]);
        result.textContent = 'Chrome hat die Vibration angenommen. Spürst du nichts, blockiert Android sie – siehe unten.';
      } catch (err) { result.textContent = err.message; }
    } }, 'Einfacher Test: 1 Sekunde');
    body.append(
      h('p', {}, 'Lässt das Handy vibrieren. Zahlen werden gezählt: Zehner lang, Einer kurz (12 = lang · kurz kurz).'),
      ok ? '' : h('p', { class: 'callout' }, 'Dieser Browser kann nicht vibrieren (iPhone/Safari/Bluefy unterstützen das nicht).'),
      direct, result,
      h('p', { class: 'callout' }, 'In der Hosentasche: Bei ausgeschaltetem Display pausiert Chrome die Seite – dann vibriert nichts und Bluetooth bricht ab. Das kann eine Web-App nicht umgehen. Stattdessen den Taschenmodus nutzen: Display bleibt an, ist aber komplett schwarz (auf OLED-Displays praktisch aus) und reagiert nicht auf Berührungen. Beenden: 2 Sekunden gedrückt halten.'),
      pocket,
      h('div', { class: 'row' }, ...['3', '7', '12'].map((n) => h('button', { class: 'btn', type: 'button', disabled: !ok, onclick: () => hub.deliver('vibrate', { kind: 'text', text: n }) }, 'Test ' + n))),
      h('details', {}, h('summary', {}, 'Es vibriert nicht?'),
        h('ol', {},
          h('li', {}, 'Chrome vibriert nur, wenn MagicHub sichtbar ist – nicht im Hintergrund und nicht bei ausgeschaltetem Display. Darum lässt MagicHub den Bildschirm an, solange Geräte verbunden sind.'),
          h('li', {}, 'Nach dem Öffnen einmal irgendwo auf die Seite tippen – vorher erlaubt Chrome keine Vibration.'),
          h('li', {}, 'Android: Einstellungen → Töne & Vibration (bzw. „Vibration & Haptik“): Vibration einschalten, Stufen für Benachrichtigungen/Berührung/Medien nicht auf 0.'),
          h('li', {}, 'Lautlos-Modus, „Nicht stören“ und starke Energiesparmodi können die Vibration unterdrücken (je nach Hersteller, z. B. Xiaomi/Samsung).'))));
    return null;
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

// Automatisch verbinden (pro Gerät, Standard an)
const autoOn = (id) => settings.autoConnect?.[id] !== false;
for (const [id, d] of Object.entries(dev)) if (d instanceof BleDevice) d.autoConnect = autoOn(id);
dev.godice.autoConnect = autoOn('godice');
if (BT) setTimeout(() => {
  for (const [id, d] of Object.entries(dev)) if (d instanceof BleDevice && d.autoConnect) d.autoStart().catch(() => {});
  if (dev.godice.autoConnect) dev.godice.autoStart().catch(() => {});
}, 800);

// Status-/Datenänderungen → Oberfläche
for (const [id, d] of Object.entries(dev)) {
  for (const type of ['status', 'dice', 'pots', 'battery', 'info', 'point', 'cleared', 'drawing', 'progress']) {
    d.addEventListener(type, () => { renderTiles(); if (openId === id) refreshSheet(); if (type === 'status') renderCombos(); });
  }
  d.addEventListener('log', (e) => {
    pushDevLog(id, e.detail.level, e.detail.message);
    if (e.detail.level === 'error') addLog('error', DEV_BY_ID[id]?.name || id, e.detail.message);
  });
  d.addEventListener('status', (e) => pushDevLog(id, 'info', 'Status: ' + e.detail.message));
  d.addEventListener('status', (e) => {
    if (e.detail.status === 'lost') toast((DEV_BY_ID[id]?.name || id) + ': Verbindung verloren', 'error');
    if (e.detail.status === 'connected' && DEV_BY_ID[id]?.ble) toast((DEV_BY_ID[id]?.name) + ' verbunden', 'ok');
  });
}

// Bildschirm anlassen, solange ein Gerät verbunden ist: Geht das Handy in den Ruhezustand,
// pausiert der Browser die Seite und Bluetooth-Verbindungen brechen ab.
let wakeLock = null;
async function updateWakeLock() {
  if (!('wakeLock' in navigator)) return;
  const want = document.visibilityState === 'visible' && (pocketActive || (settings.keepAwake !== false && Object.values(dev).some((d) => d.connected)));
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; /* z. B. Energiesparmodus – dann eben nicht */ }
}
for (const d of Object.values(dev)) d.addEventListener('status', updateWakeLock);
document.addEventListener('visibilitychange', updateWakeLock);

// ---------------------------------------------------------------- Kombis
function chip(srcOrTarget, extra = {}, note = '') {
  return h('span', { class: 'chip-static', ...extra }, icon(srcOrTarget.icon), srcOrTarget.label, note ? h('small', {}, ' ' + note) : null);
}

function isLive(id) {
  const map = { 'peeksmith-buttons': 'peeksmith', 'selfie-buttons': 'selfie' };
  const key = map[id] || id;
  if (key === 'manual' || key === 'speech' || key === 'vibrate') return true;
  if (key === 'inject-send') return !dev.inject.validate();
  return dev[key] ? dev[key].connected : true;
}

function renderCombos() {
  const list = $('#combo-list');
  if (!hub.combos.length) {
    list.replaceChildren(h('div', { class: 'empty-card' }, h('strong', {}, 'Noch keine Kombi.'), h('span', {}, 'Nimm eine Vorlage unten oder baue eine eigene.')));
  } else {
    list.replaceChildren(...hub.combos.map((c, idx) => {
      const src = hub.sources.get(c.source);
      const ids = [c.source, ...c.actions.map((a) => a.target)];
      const offline = [...new Set(ids)].filter((x) => !isLive(x)).map((x) => (hub.sources.get(x) || hub.targets.get(x))?.label);
      const toggle = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Kombi aktiv' });
      toggle.checked = c.enabled;
      toggle.addEventListener('change', () => hub.updateCombo(c.id, { enabled: toggle.checked }));
      const cond = describeWhen(c.when);
      const extras = [
        c.content === 'last' ? 'sendet letzten Inhalt' : c.content === 'fixed' ? 'sendet: ' + c.template : (c.template !== '{text}' ? 'Format: ' + c.template : ''),
        c.map.trim() ? 'mit Zuordnung' : '',
        c.cooldown ? 'Sperre ' + c.cooldown + ' s' : '',
        c.onlyNew ? 'nur neue Werte' : '',
        c.once ? 'einmalig' : '',
      ].filter(Boolean);
      return h('article', { class: 'combo card' + (c.enabled ? '' : ' disabled') },
        c.name ? h('strong', { class: 'combo-name' }, c.name) : null,
        h('div', { class: 'combo-flow' },
          src ? chip(src) : h('span', {}, c.source),
          cond ? h('span', { class: 'cond' }, cond) : null,
          h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
          h('span', { class: 'combo-targets' }, ...c.actions.map((a) => {
            const t = hub.targets.get(a.target);
            if (!t) return null;
            const note = [a.delay ? '+' + a.delay + ' s' : '', a.do === 'clear' ? 'leeren' : '', a.hideAfter ? a.hideAfter + ' s sichtbar' : ''].filter(Boolean).join(', ');
            return chip(t, note ? { title: note } : {}, note);
          }))),
        extras.length ? h('small', { class: 'muted combo-extras' }, extras.join(' · ')) : null,
        h('div', { class: 'combo-foot' },
          h('small', { class: offline.length ? 'warn' : 'muted' }, offline.length ? 'Nicht verbunden: ' + offline.join(', ') : 'Bereit'),
          h('span', { class: 'combo-actions' },
            h('button', { class: 'btn btn-ghost btn-small', type: 'button', title: 'Mit Beispielwert auslösen', onclick: () => testCombo(c) }, 'Testen'),
            h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => openComboBuilder(c) }, 'Ändern'),
            idx > 0 ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'aria-label': 'Nach oben', onclick: () => hub.moveCombo(c.id, -1) }, '↑') : null,
            h('label', { class: 'switch' }, toggle, h('span', {})))));
    }));
  }
  $('#presets').replaceChildren(...PRESETS.map((p) => {
    const exists = hub.combos.some((c) => c.name === p.name);
    return h('button', { class: 'preset', type: 'button', disabled: exists, onclick: () => { hub.addCombo({ ...p, actions: p.actions.map((a) => ({ ...a })) }); toast('Kombi angelegt'); } },
      h('span', { class: 'preset-flow' }, icon(hub.sources.get(p.source).icon), '→', ...[...new Set(p.actions.map((a) => a.target))].map((t) => icon(hub.targets.get(t).icon))),
      h('span', {}, p.name), h('small', {}, exists ? 'vorhanden' : 'übernehmen'));
  }));
}
hub.addEventListener('combos', renderCombos);
$('#combo-new').addEventListener('click', () => openComboBuilder());

/** Beispielwert für den Testknopf. */
function sampleValue(combo) {
  const w = combo.when;
  if (w.type === 'is' || w.type === 'contains') return String(w.value).split(',')[0].trim();
  if (w.type === 'range') return String(w.min !== '' ? w.min : w.max || 1);
  if (w.type === 'even') return '4';
  if (w.type === 'odd') return '3';
  const s = hub.sources.get(combo.source);
  return s?.values?.()[0] || 'Test';
}

function testCombo(combo) {
  const s = hub.sources.get(combo.source);
  const payload = s?.kind === 'image'
    ? { kind: 'image', strokes: dev.pen.strokes.length ? penView(dev.pen.strokes.map((x) => x.slice())) : (lastDrawing || demoStrokes()), source: combo.source }
    : { kind: s?.kind === 'trigger' ? 'trigger' : 'text', text: sampleValue(combo), source: combo.source };
  hub.fire(combo, payload, { force: true });
  toast('Test: „' + comboLabel(hub, combo) + '“ ausgelöst');
}

/** Karten-Stack in das Zuordnungsfeld einfügen (Nummer → Karte oder Karte → Nummer). */
function stackInsert(mapField) {
  const picker = stackPicker({ withView: false });
  const dir = h('select', { 'aria-label': 'Richtung' },
    h('option', { value: 'num2card' }, 'Nummer → Karte (z. B. 7 → Pik Ass)'),
    h('option', { value: 'card2num' }, 'Karte → Nummer (z. B. Pik Ass → 7)'));
  const view = h('div', { class: 'stack-view', hidden: true });
  const show = h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => {
    view.hidden = !view.hidden;
    show.textContent = view.hidden ? 'Stack ansehen' : 'Stack ausblenden';
    if (!view.hidden) view.replaceChildren(stackGrid(picker.stackSel.value, picker.fmtSel.value));
  } }, 'Stack ansehen');
  const refresh = () => { if (!view.hidden) view.replaceChildren(stackGrid(picker.stackSel.value, picker.fmtSel.value)); };
  picker.stackSel.addEventListener('change', refresh); picker.fmtSel.addEventListener('change', refresh);
  const insert = h('button', { class: 'btn', type: 'button', onclick: () => {
    if (mapField.value.trim() && !confirm('Vorhandene Zuordnung ersetzen?')) return;
    mapField.value = stackMapText(picker.stackSel.value, { format: picker.fmtSel.value, direction: dir.value });
    toast(STACKS[picker.stackSel.value].label + ' eingefügt', 'ok');
  } }, 'Stack einfügen');
  return h('div', { class: 'stack-insert' },
    h('p', { class: 'hint' }, 'Karten-Stack als Zuordnung übernehmen – z. B. Würfel, Inject-Zahl oder KI-erkannte Nummer → Karte.'),
    picker.el, field('Richtung', dir), h('div', { class: 'row' }, insert, show), view);
}

function openComboBuilder(existing = null) {
  openId = null;
  sheetUpdate = null;
  $('#sheet-icon').replaceChildren(icon('combo'));
  $('#sheet-title').textContent = existing ? 'Kombi ändern' : 'Neue Kombi';
  $('#sheet-status').textContent = 'Auslöser → Bedingung → Inhalt → Aktionen';
  $('#sheet-status').className = 'sheet-status';

  const c = existing
    ? JSON.parse(JSON.stringify(existing))
    : { name: '', source: null, when: { type: 'any', value: '', min: '', max: '' }, content: 'event', map: '', template: '{text}', actions: [], cooldown: 0, onlyNew: false, once: false };

  // 1 Auslöser
  const srcBox = h('div', { class: 'chips' });
  const srcHint = h('p', { class: 'hint' });
  // 2 Bedingung
  const condType = h('select', {}, ...Object.entries(CONDITIONS).map(([k, l]) => h('option', { value: k }, l)));
  const listId = 'vals' + Math.random().toString(36).slice(2, 6);
  const values = h('datalist', { id: listId });
  const condVal = h('input', { type: 'text', list: listId, placeholder: 'z. B. 6 oder Rot, Blau', autocomplete: 'off' });
  const condMin = h('input', { type: 'number', placeholder: 'von', inputmode: 'decimal' });
  const condMax = h('input', { type: 'number', placeholder: 'bis', inputmode: 'decimal' });
  const condValRow = field('Wert(e)', condVal, 'Mehrere durch Komma trennen. Groß/klein egal.');
  const condRangeRow = h('div', { class: 'grid-2' }, field('Von', condMin), field('Bis', condMax));
  const suggest = h('div', { class: 'chips chips-small' });
  // 3 Inhalt
  const contentSel = h('select', {}, ...Object.entries(CONTENTS).map(([k, l]) => h('option', { value: k }, l)));
  const tpl = h('input', { type: 'text', autocomplete: 'off' });
  const listN = h('input', { type: 'number', min: 0, max: 99, inputmode: 'numeric', placeholder: '0 = alle' });
  const joiner = h('select', {}, ...Object.entries(JOINERS).map(([k, l]) => h('option', { value: k }, l)));
  const listNRow = field('Wie viele (die letzten)', listN, '0 = die ganze Liste. Eine Zuordnung unten gilt für jeden Eintrag einzeln (z. B. 7, 12 → Pik Ass, Herz Dame).');
  const map = h('textarea', { rows: 4, placeholder: '1=Pik Ass\n2=Herz Dame\nRot=Feuer\n*=Unbekannt' });
  // 4 Aktionen
  const actBox = h('div', { class: 'stack actions-list' });
  const addSel = h('select', { 'aria-label': 'Ziel für neue Aktion' });
  const addBtn = h('button', { class: 'btn', type: 'button' }, '+ Aktion');
  // 5 Optionen
  const name = h('input', { type: 'text', placeholder: 'z. B. Kartenvorhersage', maxlength: 40 });
  const cooldown = h('input', { type: 'number', min: 0, max: 600, step: 1, inputmode: 'numeric' });
  const onlyNew = h('input', { type: 'checkbox' });
  const once = h('input', { type: 'checkbox' });

  const save = h('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Speichern' : 'Kombi anlegen');
  const test = h('button', { class: 'btn', type: 'button' }, 'Testen');
  const del = existing ? h('button', { class: 'btn btn-ghost', type: 'button' }, 'Löschen') : null;

  const read = () => {
    c.when = { type: condType.value, value: condVal.value.trim(), min: condMin.value, max: condMax.value };
    c.content = contentSel.value;
    c.template = tpl.value || '{text}';
    c.listN = Math.max(0, Number(listN.value) || 0);
    c.joiner = joiner.value;
    c.map = map.value;
    c.name = name.value.trim();
    c.cooldown = Math.max(0, Number(cooldown.value) || 0);
    c.onlyNew = onlyNew.checked;
    c.once = once.checked;
  };

  const drawActions = () => {
    actBox.replaceChildren(...(c.actions.length ? c.actions.map((a, i) => {
      const t = hub.targets.get(a.target);
      const doSel = h('select', { 'aria-label': 'Aktion' }, t?.clearOnly ? null : h('option', { value: 'show' }, a.target === 'list' ? 'Eintrag hinzufügen' : 'Anzeigen'), t?.clear ? h('option', { value: 'clear' }, 'Leeren') : null);
      doSel.value = a.do;
      const delay = h('input', { type: 'number', min: 0, max: 600, step: 0.5, value: a.delay, inputmode: 'decimal', 'aria-label': 'Verzögerung in Sekunden' });
      const hide = h('input', { type: 'number', min: 0, max: 600, step: 0.5, value: a.hideAfter, inputmode: 'decimal', 'aria-label': 'Nach Sekunden wieder leeren' });
      doSel.addEventListener('change', () => { a.do = doSel.value; drawActions(); });
      delay.addEventListener('input', () => { a.delay = Math.max(0, Number(delay.value) || 0); });
      hide.addEventListener('input', () => { a.hideAfter = Math.max(0, Number(hide.value) || 0); });
      return h('div', { class: 'action-row' },
        h('div', { class: 'action-head' },
          h('span', { class: 'num' }, String(i + 1)),
          t ? chip(t) : a.target,
          h('span', { class: 'spacer' }),
          i > 0 ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'aria-label': 'Nach oben', onclick: () => { c.actions.splice(i - 1, 0, c.actions.splice(i, 1)[0]); drawActions(); } }, '↑') : null,
          h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'aria-label': 'Aktion entfernen', onclick: () => { c.actions.splice(i, 1); drawActions(); } }, '✕')),
        h('div', { class: 'action-fields' },
          h('label', {}, h('span', {}, 'Was'), doSel),
          h('label', {}, h('span', {}, 'Nach … s'), delay),
          a.do === 'show' && t?.clear ? h('label', {}, h('span', {}, 'Leeren nach … s'), hide) : null,
          a.do === 'show' && a.target === 'printer' ? (() => {
            const f = h('select', { 'aria-label': 'Druckschrift' }, h('option', { value: '' }, 'wie Drucker-Einstellung'),
              ...Object.entries(FONTS).map(([k, v]) => h('option', { value: k }, v.label)));
            f.value = a.font || '';
            f.addEventListener('change', () => { if (f.value) a.font = f.value; else delete a.font; });
            return h('label', {}, h('span', {}, 'Schrift'), f);
          })() : null));
    }) : [h('p', { class: 'empty' }, 'Noch keine Aktion. Ziel wählen und „+ Aktion“.')]));
    validate();
  };

  const drawAddSel = () => {
    const keep = addSel.value;
    addSel.replaceChildren(...[...hub.targets.values()].map((t) => h('option', { value: t.id, disabled: !!c.source && !hub.compatible(c.source, t.id, contentSel.value) }, t.label)));
    if (keep && !addSel.querySelector('option[value="' + keep + '"]:disabled')) addSel.value = keep;
    else { const first = addSel.querySelector('option:not(:disabled)'); if (first) addSel.value = first.value; }
  };

  const drawCond = () => {
    const t = condType.value;
    condValRow.hidden = !['is', 'not', 'contains', 'count', 'countMin'].includes(t);
    condVal.placeholder = t.startsWith('count') ? 'z. B. 4' : 'z. B. 6 oder Rot, Blau';
    condRangeRow.hidden = t !== 'range';
    const s = hub.sources.get(c.source);
    const vals = t.startsWith('count') ? ['1', '2', '3', '4', '5'] : (s?.values?.() || []);
    values.replaceChildren(...vals.map((v) => h('option', { value: v })));
    suggest.hidden = condValRow.hidden || !vals.length;
    suggest.replaceChildren(...vals.slice(0, 12).map((v) => h('button', { type: 'button', class: 'chip', onclick: () => {
      const cur = condVal.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (!cur.includes(v)) cur.push(v);
      condVal.value = cur.join(', ');
    } }, v)));
  };

  const drawSources = () => {
    srcBox.replaceChildren(...[...hub.sources.values()].map((s) => h('button', { type: 'button', class: 'chip' + (s.id === c.source ? ' on' : ''), 'aria-pressed': String(s.id === c.source), onclick: () => {
      c.source = s.id;
      if (s.kind === 'trigger' && contentSel.value === 'event' && !existing) contentSel.value = 'last';
      drawSources(); drawCond(); drawAddSel(); validate();
    } }, icon(s.icon), s.label)));
    const s = hub.sources.get(c.source);
    srcHint.textContent = s ? s.hint : 'Was soll die Kombi auslösen?';
  };

  const validate = () => {
    const okTargets = c.actions.every((a) => a.do === 'clear' || hub.compatible(c.source, a.target, contentSel.value));
    save.disabled = !c.source || !c.actions.length || !okTargets;
    test.disabled = save.disabled;
  };

  // Werte setzen
  condType.value = c.when.type; condVal.value = c.when.value || ''; condMin.value = c.when.min ?? ''; condMax.value = c.when.max ?? '';
  contentSel.value = c.content; tpl.value = c.template; map.value = c.map;
  listN.value = c.listN || 0; joiner.value = c.joiner ?? ', ';
  listNRow.hidden = c.content !== 'list';
  name.value = c.name; cooldown.value = c.cooldown || 0; onlyNew.checked = c.onlyNew; once.checked = c.once;

  condType.addEventListener('change', drawCond);
  contentSel.addEventListener('change', () => { listNRow.hidden = contentSel.value !== 'list'; drawAddSel(); validate(); });
  addBtn.addEventListener('click', () => {
    if (!addSel.value || addSel.selectedOptions[0]?.disabled) return;
    c.actions.push({ target: addSel.value, do: hub.targets.get(addSel.value)?.clearOnly ? 'clear' : 'show', delay: 0, hideAfter: 0 });
    drawActions();
  });
  save.addEventListener('click', () => {
    read();
    if (existing) hub.updateCombo(existing.id, c); else hub.addCombo(c);
    sheet.close();
    toast(existing ? 'Kombi gespeichert' : 'Kombi angelegt', 'ok');
  });
  test.addEventListener('click', () => { read(); testCombo({ ...c, id: existing?.id || 'test' }); });
  del?.addEventListener('click', () => { hub.removeCombo(existing.id); sheet.close(); toast('Kombi gelöscht'); });

  drawSources(); drawCond(); drawAddSel(); drawActions();

  const step = (n, title) => h('h3', { class: 'step-title' }, h('span', { class: 'num' }, String(n)), title);
  $('#sheet-body').replaceChildren(
    step(1, 'Wenn …'), srcBox, srcHint,
    step(2, '… und wenn der Wert …'), field('Bedingung', condType), condValRow, suggest, condRangeRow, values,
    step(3, '… dann senden'), field('Inhalt', contentSel), listNRow,
    field('Trennzeichen zwischen Listeneinträgen', joiner, 'Gilt für „Letzte Einträge“, {liste} und {letzte:3}.'),
    field('Text-Vorlage', tpl, TEMPLATE_VARS + '. Beispiel: „Deine Karte: {text}“.'),
    h('details', { open: !!c.map.trim() }, h('summary', {}, 'Zuordnung (Wert → Text)'),
      stackInsert(map),
      field('Eine Zeile pro Wert', map, 'Format „Wert=Text“. Mehrere Werte: „1,2=Klein“. „*=…“ gilt für alles andere. Beispiel: Würfel 3 → „Karo Drei“.')),
    step(4, 'Aktionen (der Reihe nach)'), actBox,
    h('div', { class: 'row add-action' }, addSel, addBtn),
    h('p', { class: 'hint' }, '„Nach … s“ verzögert die Aktion. „Leeren nach … s“ blendet sie wieder aus – ideal für Peeks.'),
    h('details', {}, h('summary', {}, 'Weitere Optionen'),
      field('Name (optional)', name),
      field('Sperrzeit (s)', cooldown, 'Nach dem Auslösen so lange ignorieren – gegen doppelte Würfe oder Tastenprellen.'),
      h('label', { class: 'switch-row' }, onlyNew, h('span', {}, 'Nur auslösen, wenn sich der Wert geändert hat')),
      h('label', { class: 'switch-row' }, once, h('span', {}, 'Nur einmal auslösen, danach ausschalten'))),
    h('div', { class: 'row sheet-actions' }, save, test, del));
  if (!sheet.open) sheet.showModal();
}

/** Stack als Tabelle Position → Karte. Rote Farben rot. */
function stackGrid(stackId, format = 'de') {
  const st = STACKS[stackId];
  return h('ol', { class: 'stack-grid' }, ...st.cards.map((code, i) => h('li', { class: /[HD]$/.test(code) ? 'red' : '' },
    h('span', { class: 'pos' }, String(i + 1)),
    h('span', { class: 'sym' }, cardName(code, 'symbol')),
    h('span', { class: 'name' }, cardName(code, format)))));
}

/** Auswahl Stack + Schreibweise + Ansicht; onChange(stackId, format). */
function stackPicker({ withView = true } = {}) {
  const stackSel = h('select', { 'aria-label': 'Stack' }, ...Object.entries(STACKS).map(([k, st]) => h('option', { value: k }, st.label)));
  stackSel.value = settings.stackId && STACKS[settings.stackId] ? settings.stackId : 'mnemonica';
  const fmtSel = h('select', { 'aria-label': 'Schreibweise' }, ...Object.entries(CARD_FORMATS).map(([k, f]) => h('option', { value: k }, f.label)));
  fmtSel.value = settings.cardFormat && CARD_FORMATS[settings.cardFormat] ? settings.cardFormat : 'de';
  const search = h('input', { type: 'search', placeholder: 'Suchen: Nummer oder Karte', autocomplete: 'off' });
  const view = h('div', { class: 'stack-view' });
  const draw = () => {
    settings.stackId = stackSel.value; settings.cardFormat = fmtSel.value; saveSettings();
    if (!withView) return;
    const grid = stackGrid(stackSel.value, fmtSel.value);
    const q = search.value.trim().toLowerCase();
    if (q) {
      for (const li of grid.children) {
        const hit = li.querySelector('.pos').textContent === q || li.textContent.toLowerCase().includes(q);
        li.classList.toggle('hit', hit);
        li.hidden = !hit;
      }
    }
    view.replaceChildren(grid);
  };
  stackSel.addEventListener('change', draw); fmtSel.addEventListener('change', draw); search.addEventListener('input', draw);
  draw();
  const el = h('div', { class: 'stack-picker' },
    h('div', { class: 'grid-2' }, field('Stack', stackSel), field('Schreibweise', fmtSel)),
    withView ? search : null, withView ? view : null);
  return { el, stackSel, fmtSel };
}

// Bereich „Karten-Stacks“ auf der Kombi-Seite
(() => {
  const box = $('#stacks-box');
  if (!box) return;
  box.append(stackPicker().el);
})();

// ---------------------------------------------------------------- Taschenmodus
// Display bleibt an (sonst pausiert Chrome die Seite: keine Vibration, Bluetooth bricht ab), zeigt aber nur Schwarz
// und ignoriert Berührungen. Beenden: 2 s gedrückt halten.
async function pocketOn() {
  const el = $('#pocket');
  el.hidden = false;
  $('#pocket-hint').style.opacity = '1';
  setTimeout(() => { $('#pocket-hint').style.opacity = '0'; }, 2500);
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* egal */ }
  pocketActive = true;
  updateWakeLock();
}
function pocketOff() {
  $('#pocket').hidden = true;
  pocketActive = false;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  updateWakeLock();
}
let pocketActive = false;
(() => {
  const el = $('#pocket');
  let hold = null;
  const stop = (e) => { e.preventDefault(); clearTimeout(hold); hold = null; };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    clearTimeout(hold);
    hold = setTimeout(() => { pocketOff(); try { navigator.vibrate?.(60); } catch { /* egal */ } }, 2000);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, stop));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('click', (e) => { if (e.target.closest('[data-pocket]')) pocketOn(); });
})();

// ---------------------------------------------------------------- Sitzungsliste
function renderList() {
  const list = hub.list;
  $('#list-count').textContent = list.length ? '(' + list.length + ')' : '';
  $('#session-list').replaceChildren(...(list.length
    ? list.map((e) => h('li', {}, h('span', { class: 'session-text' }, e.text),
      h('span', { class: 'session-meta' }, (hub.sources.get(e.source)?.label || (e.source === 'combo' ? 'Kombi' : e.source)) + ' · ' +
        new Date(e.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))))
    : [h('li', { class: 'empty' }, 'Noch leer. Erkannte Texte, Würfel, Inject-Wörter … erscheinen hier.')]));
}
hub.addEventListener('list', renderList);
$('#list-clear').addEventListener('click', () => { hub.clearList(); toast('Sitzungsliste geleert'); });
(() => {
  const cfg = hub.listConfig;
  const mode = h('select', {}, ...Object.entries(LIST_MODES).map(([k, l]) => h('option', { value: k }, l)));
  mode.value = cfg.mode;
  const max = h('input', { type: 'number', min: 1, max: 99, value: cfg.max, inputmode: 'numeric' });
  const idle = h('input', { type: 'number', min: 1, max: 600, value: cfg.idleMin, inputmode: 'numeric' });
  const maxRow = field('Einträge', max, 'Ist die Liste voll, beginnt der nächste Wert eine neue. Die Kombi für den letzten Eintrag läuft vorher noch.');
  const idleRow = field('Minuten', idle);
  const textSources = [...hub.sources.values()].filter((s) => s.kind === 'text' && s.id !== 'list');
  const srcBox = h('div', { class: 'chips' });
  const drawSrc = () => {
    const on = hub.listConfig.sources || textSources.map((s) => s.id);
    srcBox.replaceChildren(...textSources.map((s) => h('button', { type: 'button', class: 'chip' + (on.includes(s.id) ? ' on' : ''), 'aria-pressed': String(on.includes(s.id)), onclick: () => {
      const cur = new Set(hub.listConfig.sources || textSources.map((x) => x.id));
      if (cur.has(s.id)) cur.delete(s.id); else cur.add(s.id);
      hub.setListConfig({ sources: cur.size === textSources.length ? null : [...cur] });
      drawSrc();
    } }, icon(s.icon), s.label)));
  };
  const apply = () => {
    hub.setListConfig({ mode: mode.value, max: Math.max(1, Number(max.value) || 4), idleMin: Math.max(1, Number(idle.value) || 10) });
    maxRow.hidden = mode.value !== 'count'; idleRow.hidden = mode.value !== 'idle';
  };
  [mode, max, idle].forEach((x) => x.addEventListener('change', apply));
  maxRow.hidden = cfg.mode !== 'count'; idleRow.hidden = cfg.mode !== 'idle';
  drawSrc();
  $('#list-settings').append(
    field('Wann wird die Liste geleert?', mode), maxRow, idleRow,
    h('p', { class: 'hint' }, 'Außerdem: Knopf „Leeren“, Kombi-Aktion „Sitzungsliste → Leeren“ (z. B. auf eine Taste) und beim Neuladen der App.'),
    h('h3', {}, 'Was kommt in die Liste?'), srcBox,
    h('p', { class: 'hint' }, 'In Kombis: Bedingung „Sitzungsliste hat genau … Einträge“, Auslöser „Sitzungsliste“ (jeder neue Eintrag) und in Vorlagen {liste}, {anzahl}, {1} … {9}, {-1}.'));
  renderList();
})();

// ---------------------------------------------------------------- Live
const logEl = $('#log');
function addLog(kind, label, text) {
  const t = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEl.prepend(h('li', { class: 'log-' + kind }, h('time', {}, t), h('span', { class: 'log-dir' }, kind === 'in' ? '▸' : kind === 'out' ? '◂' : kind === 'skip' ? '·' : '!'), h('strong', {}, label), h('span', {}, text || '')));
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
$('#cancel-pending').addEventListener('click', () => {
  const n = hub.cancelPending();
  toast(n ? n + ' geplante Aktion(en) abgebrochen' : 'Nichts geplant');
});

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
renderPrint({ kind: 'text', text: 'MagicHub' }).then(({ page }) => drawPreview(pv.print, page));

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

// ---------------------------------------------------------------- Installation
let installEvent = null;
const INSTALL_BTNS = ['#install-btn', '#install-top', '#install-help-btn'];
const isInstalled = () => isStandalone();
function renderInstall() {
  INSTALL_BTNS.forEach((s) => { $(s).hidden = !installEvent; });
  let t;
  if (isInstalled()) t = 'MagicHub läuft als installierte App.';
  else if (installEvent) t = 'Dieser Browser kann MagicHub als App installieren – mit eigenem Symbol, ohne Adressleiste.';
  else if (detectPlatform() === 'ios') t = 'iPhone: Bluefy kann keine Apps installieren. Leg die Seite in Bluefy als Favorit an. Ein Symbol über Safari → Teilen → „Zum Home-Bildschirm“ öffnet in Safari – dort gibt es kein Bluetooth.';
  else t = 'Installieren über das Browser-Menü: Chrome ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Erscheint der Punkt nicht, ist die App vielleicht schon installiert.';
  $('#install-state').textContent = t;
}
async function doInstall() {
  if (!installEvent) return;
  installEvent.prompt();
  const r = await installEvent.userChoice.catch(() => null);
  if (r?.outcome === 'accepted') toast('Installation gestartet', 'ok');
  installEvent = null; renderInstall();
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
INSTALL_BTNS.forEach((s) => $(s).addEventListener('click', doInstall));
window.addEventListener('appinstalled', () => { installEvent = null; renderInstall(); toast('MagicHub installiert – Bluetooth bitte einmal neu testen', 'ok'); });
renderInstall();

// ---------------------------------------------------------------- Einstellungen lokal + Sicherung
async function renderStorage() {
  let t = 'Gespeichert im Browser (localStorage).';
  try {
    if (navigator.storage?.persist) {
      const ok = (await navigator.storage.persisted()) || (await navigator.storage.persist());
      t += ok ? ' Der Browser hält die Daten dauerhaft fest.' : ' Der Browser darf sie bei Speichermangel löschen – Sicherung empfohlen.';
    }
  } catch { /* egal */ }
  $('#storage-state').textContent = t;
}
renderStorage();
$('#settings-export').addEventListener('click', () => {
  const data = structuredClone(loadStore());
  if (!$('#export-keys').checked && data.settings?.ai) data.settings.ai.keys = {};
  const blob = new Blob([JSON.stringify({ app: 'MagicHub', version: VERSION, saved: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'magichub-einstellungen-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Sicherung erstellt', 'ok');
});
$('#settings-import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== 'MagicHub' || typeof j.data !== 'object') throw new Error('keine MagicHub-Sicherung');
    if (!confirm('Alle aktuellen Einstellungen und Kombis durch die Sicherung vom ' + new Date(j.saved).toLocaleString('de-DE') + ' ersetzen?')) return;
    const keep = loadStore().settings?.ai?.keys;
    if (keep && j.data.settings?.ai && !Object.keys(j.data.settings.ai.keys || {}).length) j.data.settings.ai.keys = keep;
    localStorage.setItem('magichub_v1', JSON.stringify(j.data));
    toast('Sicherung geladen – starte neu …', 'ok');
    setTimeout(() => location.reload(), 800);
  } catch (err) { toast('Laden fehlgeschlagen: ' + err.message, 'error'); }
});

$('#test-status').replaceChildren(...[
  'Ultra Sharpie / Ultra Pen (Init-Sequenz, Koordinaten)',
  'PeekSmith (Text, Tasten; Umlaute/PS3-Schrift vereinfacht)',
  'Selfie Screen (JPEG-Übertragung, Tasten)',
  'Peripage P21 (Druck, Flusssteuerung, Papiervorschub, Querdruck-Richtung, Kopien)',
  'Kostenlose Erkennung (Google Handschrift, Tesseract) mit echtem Stift',
  'Vibration auf Android',
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

// ---------------------------------------------------------------- Service Worker + Updates
let swReg = null;
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch((err) => console.warn('Service Worker:', err));
}

/** Ist Version a neuer als b? */
function newer(a, b) {
  const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
let lastUpdateCheck = 0;
/** Liest die Version aus sw.js am Server (eine Quelle der Wahrheit) und vergleicht sie mit der laufenden. */
async function checkForUpdate({ manual = false } = {}) {
  lastUpdateCheck = Date.now();
  const state = $('#update-state');
  try {
    const res = await fetch('sw.js?check=' + Date.now(), { cache: 'no-store' });
    const remote = (await res.text()).match(/magichub-(\d+(?:\.\d+)*)/)?.[1];
    if (!remote) throw new Error('Version nicht lesbar');
    if (newer(remote, VERSION)) {
      $('#update-text').textContent = 'Version ' + remote + ' (du hast ' + VERSION + ').';
      $('#update-banner').hidden = false;
      state.textContent = 'Version ' + remote + ' ist verfügbar.';
    } else {
      state.textContent = 'Aktuell (' + VERSION + '), geprüft um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '.';
      if (manual) toast('MagicHub ist aktuell', 'ok');
    }
    swReg?.update().catch(() => {});
  } catch (err) {
    state.textContent = navigator.onLine === false ? 'Offline – Update-Prüfung beim nächsten Start.' : 'Update-Prüfung fehlgeschlagen: ' + err.message;
    if (manual) toast(state.textContent, 'error');
  }
}
async function applyUpdate() {
  if (Object.values(dev).some((d) => d.connected) && !confirm('Beim Aktualisieren werden alle Geräte getrennt. Jetzt aktualisieren?')) return;
  const btn = $('#update-now'); btn.disabled = true; btn.textContent = 'Lade …';
  try {
    await swReg?.update().catch(() => {});
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith('magichub-')) await caches.delete(k);
  } catch { /* trotzdem neu laden */ }
  location.reload();
}
$('#update-now').addEventListener('click', applyUpdate);
$('#update-check').addEventListener('click', () => checkForUpdate({ manual: true }));
// Beim Start prüfen – und wenn die (installierte) App nach mehr als 30 min Pause wieder in den Vordergrund kommt.
setTimeout(checkForUpdate, 1500);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck > 30 * 60 * 1000) checkForUpdate();
});
