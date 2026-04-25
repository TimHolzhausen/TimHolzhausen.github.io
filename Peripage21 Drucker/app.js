/**
 * app.js — Peripage P21 Banner Drucker
 * UI logic, canvas rendering, speech recognition
 */

'use strict';

// ============================================================
// State
// ============================================================
const state = {
  font:       'Dancing Script',
  fontSize:   72,
  contrast:   128,
  lineSpacing: 20,
  align:      'left',
  text:       '',
  speechActive: false,
  speechRecognition: null,
  printer: new PeripagePrinter(),
  printHistory: [],
};

// ============================================================
// On Load
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  // Wire up printer callbacks
  state.printer.onStatusChange = updateConnectionStatus;
  state.printer.onLog = (level, msg) => addDebugLog(level, msg);
  state.printer.onUuidProgress = (index, label, result) => {
    const icons = { trying: '⏳', found: '✅', fail: '✗' };
    const levels = { trying: 'info', found: 'success', fail: 'info' };
    addDebugLog(levels[result] || 'info', `${icons[result]} UUID [${index+1}]: ${label}`);
  };

  // Init sliders
  syncSlider('font-size', 'font-size-val', v => { state.fontSize = +v; });
  syncSlider('contrast', 'contrast-val', v => { state.contrast = +v; });
  syncSlider('line-spacing', 'line-spacing-val', v => { state.lineSpacing = +v; });

  // Initial preview
  updatePreview();

  // Update char counter
  document.getElementById('banner-text').addEventListener('input', () => {
    const txt = document.getElementById('banner-text').value;
    document.getElementById('char-count').textContent = txt.length;
    state.text = txt;
    updatePreview();
  });

  // Check Web Bluetooth support
  if (!navigator.bluetooth) {
    showToast('Web Bluetooth nicht verfügbar. Bitte Chrome/Edge mit aktiviertem Bluetooth nutzen.', 'warning', 6000);
    addDebugLog('warn', 'navigator.bluetooth nicht vorhanden');
  }

  // Check Web Speech API
  if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
    showToast('Spracherkennung nicht verfügbar in diesem Browser.', 'warning', 4000);
    const toggle = document.getElementById('speech-toggle');
    if (toggle) { toggle.disabled = true; }
    addDebugLog('warn', 'SpeechRecognition API nicht vorhanden');
  }

  addDebugLog('info', 'App geladen. Peripage P21 Banner Drucker bereit.');
});

// ============================================================
// Slider sync helper
// ============================================================
function syncSlider(sliderId, labelId, onChange) {
  const slider = document.getElementById(sliderId);
  const label  = document.getElementById(labelId);
  if (!slider) return;
  const update = () => {
    label.textContent = slider.value;
    onChange(slider.value);
    updatePreview();
  };
  slider.addEventListener('input', update);
  update();
}

// ============================================================
// Connection
// ============================================================
async function connectPrinter() {
  const btn = document.getElementById('btn-connect');
  if (state.printer.connected) {
    state.printer.disconnect();
    btn.querySelector('span').textContent = 'Verbinden';
    return;
  }
  btn.querySelector('span').textContent = 'Verbinde...';
  btn.disabled = true;
  try {
    await state.printer.connect();
    btn.querySelector('span').textContent = 'Trennen';
    document.getElementById('btn-print').disabled = false;
    document.getElementById('printer-led').className = 'printer-led connected-led';
    showToast('✅ Drucker verbunden!', 'success');
  } catch (e) {
    const userCancelled = e.name === 'NotFoundError' || (e.message && e.message.toLowerCase().includes('cancel'));
    if (!userCancelled) {
      showToast(`❌ Fehler: ${e.message}`, 'error', 7000);
      addDebugLog('error', `Verbindungsfehler: ${e.name} – ${e.message}`);
    }
    btn.querySelector('span').textContent = 'Verbinden';
    updateConnectionStatus(userCancelled ? 'disconnected' : 'error', userCancelled ? 'Nicht verbunden' : 'Verbindungsfehler');
  } finally {
    btn.disabled = false;
  }
}

function updateConnectionStatus(state_, message) {
  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  indicator.className = `status-indicator ${state_}`;
  statusText.textContent = message;

  const btn = document.getElementById('btn-connect');
  if (state_ === 'connected') {
    btn.querySelector('span').textContent = 'Trennen';
    document.getElementById('btn-print').disabled = false;
    document.getElementById('printer-led').className = 'printer-led connected-led';
  } else if (state_ === 'disconnected') {
    btn.querySelector('span').textContent = 'Verbinden';
    document.getElementById('btn-print').disabled = true;
    document.getElementById('printer-led').className = 'printer-led';
  } else if (state_ === 'connecting') {
    btn.querySelector('span').textContent = 'Verbinde...';
  }
}

// ============================================================
// Canvas Preview Rendering
// ============================================================
function updatePreview() {
  const text = document.getElementById('banner-text').value || '';
  state.text = text;

  const fontSize    = +document.getElementById('font-size').value;
  const contrast    = +document.getElementById('contrast').value;
  const lineSpacing = +document.getElementById('line-spacing').value;
  const font        = state.font;
  const align       = state.align;

  // Update slider display values
  document.getElementById('font-size-val').textContent = fontSize;
  document.getElementById('contrast-val').textContent = contrast;
  document.getElementById('line-spacing-val').textContent = lineSpacing;

  const canvas = document.getElementById('preview-canvas');
  renderTextToCanvas(canvas, text, {
    font, fontSize, lineSpacing, align, contrast,
    width: PeripagePrinter.PRINT_WIDTH,
  });
}

/**
 * Render cursive text to a canvas at printer resolution (384px wide).
 * Returns the canvas for printing.
 */
function renderTextToCanvas(canvas, text, opts = {}) {
  const {
    font        = 'Dancing Script',
    fontSize    = 72,
    lineSpacing = 20,
    align       = 'left',
    contrast    = 128,
    width       = 384,
  } = opts;

  const ctx = canvas.getContext('2d');

  // Prepare font string
  const fontStr = `${fontSize}px '${font}'`;
  ctx.font = fontStr;

  // Split text into lines (word-wrap at width)
  const lines = wrapText(ctx, text || 'Vorschau', width - 20, fontStr);

  // Calculate height
  const lineHeight = fontSize + lineSpacing;
  const paddingV   = 20;
  const totalHeight = Math.max(paddingV * 2 + lines.length * lineHeight, 60);

  canvas.width  = width;
  canvas.height = totalHeight;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Apply contrast mapping:
  // contrast slider 0-255; we map to grayscale fill color
  // 128 = black, 255 = very dark gray, 0 = light gray
  const darkness = Math.round(255 - (contrast / 255) * 255);
  ctx.fillStyle = `rgb(${darkness},${darkness},${darkness})`;

  // Text rendering settings
  ctx.font = fontStr;
  ctx.textBaseline = 'top';

  // Align
  let x;
  if (align === 'center') {
    ctx.textAlign = 'center';
    x = width / 2;
  } else if (align === 'right') {
    ctx.textAlign = 'right';
    x = width - 10;
  } else {
    ctx.textAlign = 'left';
    x = 10;
  }

  lines.forEach((line, i) => {
    ctx.fillText(line, x, paddingV + i * lineHeight);
  });

  // Update info
  document.getElementById('preview-dims').textContent = `${canvas.width} × ${canvas.height} px`;
  document.getElementById('preview-lines').textContent = `${lines.length} ${lines.length === 1 ? 'Zeile' : 'Zeilen'}`;

  return canvas;
}

/**
 * Word-wrap text to fit within maxWidth using the given font.
 */
function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const rawLines = text.split('\n');
  const wrappedLines = [];

  for (const raw of rawLines) {
    if (raw === '') { wrappedLines.push(''); continue; }
    const words = raw.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        wrappedLines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) wrappedLines.push(current);
  }

  return wrappedLines.length > 0 ? wrappedLines : [''];
}

// ============================================================
// Print
// ============================================================
async function printBanner() {
  if (!state.printer.connected) {
    showToast('❌ Drucker nicht verbunden!', 'error');
    return;
  }
  if (!state.text.trim()) {
    showToast('⚠️ Bitte zuerst Text eingeben!', 'warning');
    return;
  }

  const btn = document.getElementById('btn-print');
  btn.disabled = true;
  btn.classList.add('printing-anim');
  document.getElementById('printer-led').className = 'printer-led printing-led';

  try {
    // Render to a high-quality offscreen canvas
    const printCanvas = document.createElement('canvas');
    renderTextToCanvas(printCanvas, state.text, {
      font:        state.font,
      fontSize:    +document.getElementById('font-size').value,
      lineSpacing: +document.getElementById('line-spacing').value,
      align:       state.align,
      contrast:    +document.getElementById('contrast').value,
      width:       PeripagePrinter.PRINT_WIDTH,
    });

    // heat: 0-63 für den P21 (aus Kontrast-Slider 0–255 skaliert; ~35 = gut)
    const heat = Math.round(20 + (+document.getElementById('contrast').value / 255) * 43);
    addDebugLog('info', `Starte Druck: "${state.text.substring(0,40)}", Heat: ${heat}`);
    showToast('🖨️ Druckt...', 'info', 30000);

    await state.printer.printCanvas(printCanvas, heat);

    showToast('✅ Erfolgreich gedruckt!', 'success');
    addToHistory(state.text);
    addDebugLog('success', 'Druck abgeschlossen');
  } catch (e) {
    showToast(`❌ Druckfehler: ${e.message}`, 'error', 8000);
    addDebugLog('error', `Druckfehler: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.classList.remove('printing-anim');
    document.getElementById('printer-led').className = state.printer.connected ? 'printer-led connected-led' : 'printer-led';
  }
}

async function feedPaper() {
  if (!state.printer.connected) {
    showToast('❌ Drucker nicht verbunden!', 'error');
    return;
  }
  try {
    await state.printer.feedPaper(5);
    showToast('📄 Papier vorgeschoben', 'info');
  } catch (e) {
    showToast(`❌ Fehler: ${e.message}`, 'error');
  }
}

// ============================================================
// Font Selection
// ============================================================
function selectFont(btn) {
  document.querySelectorAll('.font-option').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.font = btn.dataset.font;

  // Update textarea font
  const textarea = document.getElementById('banner-text');
  textarea.style.fontFamily = `'${state.font}', cursive`;
  updatePreview();
}

// ============================================================
// Text Alignment
// ============================================================
function setAlign(align, btn) {
  state.align = align;
  document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updatePreview();
}

// ============================================================
// Quick Text
// ============================================================
function setQuickText(text) {
  document.getElementById('banner-text').value = text;
  document.getElementById('char-count').textContent = text.length;
  state.text = text;
  updatePreview();
}

function clearText() {
  document.getElementById('banner-text').value = '';
  document.getElementById('char-count').textContent = '0';
  state.text = '';
  updatePreview();
}

function handleKeydown(e) {
  // Ctrl+Enter → print
  if (e.ctrlKey && e.key === 'Enter') {
    printBanner();
  }
}

// ============================================================
// Speech Recognition
// ============================================================
function toggleSpeech(enabled) {
  if (enabled) {
    startSpeechRecognition();
  } else {
    stopSpeechRecognition();
  }
}

function startSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Spracherkennung nicht verfügbar!', 'error');
    document.getElementById('speech-toggle').checked = false;
    return;
  }

  if (state.speechRecognition) {
    state.speechRecognition.stop();
  }

  const recognition = new SR();
  recognition.continuous    = true;
  recognition.interimResults = true;
  recognition.lang          = 'de-DE';
  recognition.maxAlternatives = 1;

  state.speechRecognition = recognition;
  state.speechActive = true;

  recognition.onstart = () => {
    updateSpeechUI(true);
    addDebugLog('info', 'Spracherkennung gestartet');
    showToast('🎤 Spracherkennung aktiv', 'info', 2000);
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final_  = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final_ += transcript;
      } else {
        interim += transcript;
      }
    }

    document.getElementById('interim-text').textContent = interim;
    document.getElementById('final-text').textContent   = final_;

    if (final_) {
      processVoiceCommand(final_.trim());
    }
  };

  recognition.onerror = (event) => {
    addDebugLog('error', `Sprach-Fehler: ${event.error}`);
    if (event.error === 'no-speech') return; // Ignore
    if (event.error === 'not-allowed') {
      showToast('❌ Mikrofon-Zugriff verweigert!', 'error');
      document.getElementById('speech-toggle').checked = false;
      stopSpeechRecognition();
    }
  };

  recognition.onend = () => {
    // Restart continuously if still enabled
    if (state.speechActive) {
      setTimeout(() => {
        if (state.speechActive && state.speechRecognition === recognition) {
          try { recognition.start(); } catch (e) { /* ignore */ }
        }
      }, 200);
    } else {
      updateSpeechUI(false);
    }
  };

  try {
    recognition.start();
  } catch (e) {
    showToast(`❌ Sprach-Fehler: ${e.message}`, 'error');
    addDebugLog('error', `Sprach-Start Fehler: ${e.message}`);
  }
}

function stopSpeechRecognition() {
  state.speechActive = false;
  if (state.speechRecognition) {
    state.speechRecognition.stop();
    state.speechRecognition = null;
  }
  updateSpeechUI(false);
  addDebugLog('info', 'Spracherkennung gestoppt');
}

function updateSpeechUI(active) {
  const wave = document.getElementById('speech-wave');
  const txt  = document.getElementById('speech-status-text');
  if (active) {
    wave.classList.add('active');
    txt.textContent = '🎤 Hört zu... Sprich das Wake-Word!';
    txt.style.color = '#10b981';
  } else {
    wave.classList.remove('active');
    txt.textContent = 'Spracherkennung inaktiv';
    txt.style.color = '';
    document.getElementById('interim-text').textContent = '';
    document.getElementById('final-text').textContent   = '';
  }
}

/**
 * Process recognized speech:
 * If the transcript begins with the wake word, extract the rest as banner text.
 * Also match patterns like "drucke [text]", "print [text]", "schreib [text]"
 */
function processVoiceCommand(transcript) {
  const wakeWord = document.getElementById('wakeword-input').value.trim().toLowerCase();
  const lower    = transcript.toLowerCase();

  // Built-in command patterns (German + English)
  const patterns = [
    wakeWord,
    'drucke',
    'drucken',
    'print',
    'schreib',
    'schreibe',
    'tippe',
    'hey drucker',
    'hallo drucker',
  ].filter(Boolean);

  let matched = false;
  let bannerText = '';

  for (const pattern of patterns) {
    if (lower.startsWith(pattern)) {
      bannerText = transcript.substring(pattern.length).trim();
      matched = true;
      addDebugLog('success', `Wake-Word erkannt: "${pattern}", Text: "${bannerText}"`);
      break;
    }
  }

  // Special: "drucke das" / "drucke:" remove filler words
  if (matched && bannerText) {
    bannerText = bannerText.replace(/^(das|den|die|:)\s*/i, '');
  }

  // Also check for "papier vor" command
  if (lower.includes('papier vor') || lower.includes('vorschub')) {
    showToast('🎤 Sprachbefehl: Papier vorstrecken', 'info');
    feedPaper();
    return;
  }
  if (lower.includes('verbinden') || lower.includes('connect')) {
    showToast('🎤 Sprachbefehl: Verbinden', 'info');
    connectPrinter();
    return;
  }
  if (lower.includes('löschen') || lower.includes('clear')) {
    showToast('🎤 Sprachbefehl: Text löschen', 'info');
    clearText();
    return;
  }

  if (matched && bannerText) {
    // Capitalize first letter
    bannerText = bannerText.charAt(0).toUpperCase() + bannerText.slice(1);

    document.getElementById('banner-text').value = bannerText;
    document.getElementById('char-count').textContent = bannerText.length;
    state.text = bannerText;
    updatePreview();

    showToast(`🎤 Erkannt: "${bannerText}"`, 'success', 2500);

    // Auto-print after short delay (configurable)
    setTimeout(async () => {
      if (state.printer.connected) {
        showToast('🖨️ Auto-Druck startet...', 'info', 1500);
        await printBanner();
      } else {
        showToast('⚠️ Drucker nicht verbunden – Text gesetzt, aber nicht gedruckt.', 'warning');
      }
    }, 800);
  }
}

// ============================================================
// Print History
// ============================================================
function addToHistory(text) {
  const now = new Date();
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  state.printHistory.unshift({ text, time });
  if (state.printHistory.length > 20) state.printHistory.pop();
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (state.printHistory.length === 0) {
    list.innerHTML = '<li class="history-empty">Noch nichts gedruckt.</li>';
    return;
  }
  state.printHistory.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.title = 'Klicken um Text erneut laden';
    li.onclick = () => {
      document.getElementById('banner-text').value = item.text;
      document.getElementById('char-count').textContent = item.text.length;
      state.text = item.text;
      updatePreview();
      showToast(`📋 Text geladen: "${item.text.substring(0,30)}..."`, 'info', 2000);
    };
    li.innerHTML = `
      <span class="history-icon">🖨️</span>
      <span class="history-text">${escapeHtml(item.text)}</span>
      <span class="history-time">${item.time}</span>
    `;
    list.appendChild(li);
  });
}

function clearHistory() {
  state.printHistory = [];
  renderHistory();
  showToast('Verlauf gelöscht', 'info', 1500);
}

// ============================================================
// Toast Notifications
// ============================================================
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ============================================================
// Debug Log
// ============================================================
function addDebugLog(level, message) {
  const log = document.getElementById('debug-log');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${level}`;
  const ts = new Date().toLocaleTimeString('de-DE');
  entry.textContent = `[${ts}] ${message}`;
  log.prepend(entry);
  // Trim to 100 entries
  while (log.children.length > 100) log.removeChild(log.lastChild);
}

function clearDebugLog() {
  document.getElementById('debug-log').innerHTML = '';
}

function toggleDebug() {
  const body = document.getElementById('debug-body');
  const icon = document.getElementById('debug-toggle-icon');
  body.classList.toggle('open');
  icon.textContent = body.classList.contains('open') ? '▲' : '▼';
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
