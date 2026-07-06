// GoDice Dashboard - Application Logic

// Reactive State
const state = {
  connectedDice: {}, // diceId -> { instance, battery: null, color: null, type: 0, status: 'Bereit', value: 0 }
  history: [], // Array of { diceId, value, type, color, time }
  stats: {
    totalRolls: 0,
    sum: 0,
    average: 0,
    lastRoll: '-',
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } // Default for D6, resets/adapts dynamically
  }
};

// Maps for GoDice Constants
const DICE_COLOR_CLASSES = {
  0: 'color-black',
  1: 'color-red',
  2: 'color-green',
  3: 'color-blue',
  4: 'color-yellow',
  5: 'color-orange'
};

const DICE_COLOR_NAMES_DE = {
  0: 'Schwarz',
  1: 'Rot',
  2: 'Grün',
  3: 'Blau',
  4: 'Gelb',
  5: 'Orange'
};

const DICE_TYPE_NAMES = {
  0: 'D6',
  1: 'D20',
  2: 'D10',
  3: 'D10X',
  4: 'D4',
  5: 'D8',
  6: 'D12'
};

// On Window Load
window.addEventListener('DOMContentLoaded', () => {
  const btnConnect = document.getElementById('btn-connect');
  btnConnect.addEventListener('click', openConnectionDialog);

  const btnResetStats = document.getElementById('btn-reset-stats');
  if (btnResetStats) {
    btnResetStats.addEventListener('click', resetStatistics);
  }
  
  updateGlobalStatsUI();
  renderDiceGrid();
  renderHistoryUI();
  renderChartUI();

  // Versuche, zuvor gekoppelte Würfel automatisch zu verbinden
  tryAutoConnect();
});

// Automatische Verbindung mit bereits bekannten Geräten
async function tryAutoConnect() {
  if (navigator.bluetooth && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      console.log(`Zuvor gekoppelte Geräte gefunden: ${devices.length}`);
      
      for (const device of devices) {
        if (device.name && device.name.startsWith('GoDice_')) {
          console.log(`Versuche automatische Verbindung mit: ${device.name}`);
          const newDice = new GoDice();
          
          // Füge den Würfel der Status-Liste hinzu mit Status "Verbindet..."
          const diceId = device.id.toString();
          
          // Versuche, die Farbe aus dem Bluetooth-Gerätenamen zu lesen (als schneller Fallback)
          let parsedColor = null;
          const nameParts = device.name.split('_');
          if (nameParts.length >= 3) {
            const colorChar = nameParts[2].toUpperCase();
            if (colorChar === 'R') parsedColor = 1;
            else if (colorChar === 'G') parsedColor = 2;
            else if (colorChar === 'B') parsedColor = 3;
            else if (colorChar === 'Y') parsedColor = 4;
            else if (colorChar === 'O') parsedColor = 5;
            else if (colorChar === 'K' || colorChar === 'BLK') parsedColor = 0;
          }

          state.connectedDice[diceId] = {
            instance: newDice,
            battery: null,
            color: parsedColor,
            type: GoDice.diceTypes.D6,
            status: 'Verbindet...',
            value: 0
          };
          renderDiceGrid();

          newDice.attachDevice(device).catch(err => {
            console.warn(`Automatische Verbindung fehlgeschlagen für ${device.name}:`, err);
            // Bei Fehler aus der Liste löschen
            delete state.connectedDice[diceId];
            renderDiceGrid();
          });
        }
      }
    } catch (err) {
      console.error('Fehler bei automatischer Verbindung:', err);
    }
  }
}

// Trigger Web Bluetooth prompt
function openConnectionDialog() {
  const newDice = new GoDice();
  // Connection picker needs user gesture
  newDice.requestDevice().catch(err => {
    console.warn('Verbindung abgebrochen oder Fehler: ', err);
  });
}

// Reset Stats
function resetStatistics() {
  state.history = [];
  state.stats.totalRolls = 0;
  state.stats.sum = 0;
  state.stats.average = 0;
  state.stats.lastRoll = '-';
  state.stats.distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  
  updateGlobalStatsUI();
  renderHistoryUI();
  renderChartUI();
}

// ----------------------------------------------------
// GoDice SDK Event Listeners (registered on prototype)
// ----------------------------------------------------

GoDice.prototype.onDiceConnected = (diceId, diceInstance) => {
  console.log(`Dice connected: ${diceId}`);
  
  // Versuche, die Farbe aus dem Bluetooth-Gerätenamen zu lesen (als schneller Fallback)
  let parsedColor = null;
  const deviceName = diceInstance.bluetoothDevice?.name || '';
  console.log(`Gerätename: ${deviceName}`);
  const nameParts = deviceName.split('_');
  if (nameParts.length >= 3) {
    const colorChar = nameParts[2].toUpperCase();
    if (colorChar === 'R') parsedColor = 1;      // Red / Rot
    else if (colorChar === 'G') parsedColor = 2; // Green / Grün
    else if (colorChar === 'B') parsedColor = 3; // Blue / Blau
    else if (colorChar === 'Y') parsedColor = 4; // Yellow / Gelb
    else if (colorChar === 'O') parsedColor = 5; // Orange
    else if (colorChar === 'K' || colorChar === 'BLK') parsedColor = 0; // Black / Schwarz
  } else {
    // Falls das Namensschema abweicht, suche nach Keywords im Namen
    const lowerName = deviceName.toLowerCase();
    if (lowerName.includes('red') || lowerName.includes('rot')) parsedColor = 1;
    else if (lowerName.includes('green') || lowerName.includes('grün') || lowerName.includes('gruen')) parsedColor = 2;
    else if (lowerName.includes('blue') || lowerName.includes('blau')) parsedColor = 3;
    else if (lowerName.includes('yellow') || lowerName.includes('gelb')) parsedColor = 4;
    else if (lowerName.includes('orange')) parsedColor = 5;
    else if (lowerName.includes('black') || lowerName.includes('schwarz')) parsedColor = 0;
  }

  state.connectedDice[diceId] = {
    instance: diceInstance,
    battery: null,
    color: parsedColor,
    type: GoDice.diceTypes.D6,
    status: 'Bereit',
    value: 0
  };

  // Fetch initial info
  setTimeout(() => {
    diceInstance.getBatteryLevel();
    diceInstance.getDiceColor();
    // Default led blink (identification pulse: Green, 2 times)
    diceInstance.pulseLed(2, 20, 20, [16, 185, 129]);
  }, 500);

  renderDiceGrid();
  updateGlobalStatsUI();
};

GoDice.prototype.onDiceDisconnected = (diceId, diceInstance) => {
  console.log(`Dice disconnected: ${diceId}`);
  
  if (state.connectedDice[diceId]) {
    state.connectedDice[diceId].status = 'Getrennt';
    renderDiceGrid();
  }
  
  updateGlobalStatsUI();
  
  // Try reconnecting
  diceInstance.attemptReconnect(diceId, diceInstance);
};

GoDice.prototype.onBatteryLevel = (diceId, batteryLevel) => {
  console.log(`Battery level for ${diceId}: ${batteryLevel}%`);
  if (state.connectedDice[diceId]) {
    state.connectedDice[diceId].battery = batteryLevel;
    updateDiceCardBattery(diceId, batteryLevel);
  }
};

GoDice.prototype.onDiceColor = (diceId, colorCode) => {
  console.log(`Dice color for ${diceId}: ${colorCode}`);
  if (state.connectedDice[diceId]) {
    state.connectedDice[diceId].color = colorCode;
    renderDiceGrid(); // Re-render to apply new color styles and badges
  }
};

GoDice.prototype.onRollStart = (diceId) => {
  console.log(`Roll start for ${diceId}`);
  if (state.connectedDice[diceId]) {
    state.connectedDice[diceId].status = 'Rollt...';
    updateDiceCardStatus(diceId, 'Rollt...', true);
  }
};

GoDice.prototype.onStable = (diceId, value, xyzArray) => {
  console.log(`Stable value for ${diceId}: ${value}`);
  handleStableRoll(diceId, value, 'Stable');
};

GoDice.prototype.onFakeStable = (diceId, value, xyzArray) => {
  console.log(`Fake Stable value for ${diceId}: ${value}`);
  handleStableRoll(diceId, value, 'Fake Stable');
};

GoDice.prototype.onTiltStable = (diceId, xyzArray, value) => {
  console.log(`Tilt Stable value for ${diceId}: ${value}`);
  handleStableRoll(diceId, value, 'Tilt Stable');
};

GoDice.prototype.onMoveStable = (diceId, value, xyzArray) => {
  console.log(`Move Stable value for ${diceId}: ${value}`);
  handleStableRoll(diceId, value, 'Move Stable');
};

// ----------------------------------------------------
// UI Logic & Rendering Helpers
// ----------------------------------------------------

function handleStableRoll(diceId, value, typeStr) {
  const dieState = state.connectedDice[diceId];
  if (!dieState) return;

  dieState.status = 'Bereit';
  dieState.value = value;
  
  // Update Global Stats
  state.stats.totalRolls++;
  state.stats.sum += value;
  state.stats.average = (state.stats.sum / state.stats.totalRolls).toFixed(2);
  state.stats.lastRoll = value;

  // Track distribution
  if (state.stats.distribution[value] !== undefined) {
    state.stats.distribution[value]++;
  } else {
    state.stats.distribution[value] = 1;
  }

  // Time format
  const now = new Date();
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Add to History
  state.history.unshift({
    diceId,
    value,
    type: DICE_TYPE_NAMES[dieState.type],
    color: dieState.color,
    time: timeStr
  });

  // Keep history max length at 50
  if (state.history.length > 50) {
    state.history.pop();
  }

  // Update UI Elements
  updateDiceCardValue(diceId, value, typeStr);
  updateGlobalStatsUI();
  renderHistoryUI();
  renderChartUI();
}

function updateGlobalStatsUI() {
  const connectedCount = Object.values(state.connectedDice).filter(d => d.status !== 'Getrennt').length;
  
  document.getElementById('stat-connected-dice').textContent = connectedCount;
  document.getElementById('stat-total-rolls').textContent = state.stats.totalRolls;
  document.getElementById('stat-avg-roll').textContent = state.stats.average;
  document.getElementById('stat-last-roll').textContent = state.stats.lastRoll;
}

function renderDiceGrid() {
  const diceGrid = document.getElementById('dice-grid');
  diceGrid.innerHTML = '';

  const activeDice = Object.entries(state.connectedDice);
  
  if (activeDice.length === 0) {
    diceGrid.innerHTML = `
      <div class="empty-state">
        <i class="brand-icon">🎲</i>
        <h3>Keine Würfel verbunden</h3>
        <p>Klicke oben auf "Verbinden" und schalte deine GoDice ein, um loszulegen. Stelle sicher, dass Bluetooth auf deinem Gerät aktiviert ist.</p>
      </div>
    `;
    return;
  }

  activeDice.forEach(([diceId, die]) => {
    const colorClass = DICE_COLOR_CLASSES[die.color] || 'color-black';
    const colorName = DICE_COLOR_NAMES_DE[die.color] || 'Unbekannt';
    
    // Create card wrapper
    const card = document.createElement('div');
    card.id = `card-${diceId}`;
    card.className = `dice-card ${colorClass}`;

    // Battery calculation HTML
    const batteryLevel = die.battery !== null ? `${die.battery}%` : 'Lade...';
    let batteryColorClass = '';
    if (die.battery !== null) {
      if (die.battery <= 20) batteryColorClass = 'danger';
      else if (die.battery <= 50) batteryColorClass = 'warning';
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="dice-meta">
          <div class="dice-id-badge">
            <span>🎲 ID: ${diceId.substring(0, 8)}...</span>
          </div>
          <div class="dice-color-label">Farbe: ${colorName}</div>
        </div>
        <div class="battery-wrapper" id="battery-${diceId}">
          <span class="battery-text">${batteryLevel}</span>
          <div class="battery-icon">
            <div class="battery-level-bar ${batteryColorClass}" style="width: ${die.battery !== null ? die.battery : 0}%"></div>
          </div>
        </div>
      </div>

      <div class="roll-display-area">
        <div class="dice-visual" id="visual-${diceId}">${die.value || '-'}</div>
        <div class="dice-status-label" id="status-${diceId}">${die.status}</div>
      </div>

      <div class="shell-selector">
        <label>Würfel-Typ / Shell</label>
        <div class="shell-buttons">
          ${Object.entries(DICE_TYPE_NAMES).map(([typeId, typeName]) => {
            const isActive = parseInt(typeId) === die.type ? 'active' : '';
            return `<button class="btn-shell ${isActive}" onclick="setDiceShell('${diceId}', ${typeId})">${typeName}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="led-control-panel">
        <div class="led-header">
          <span>LED Steuerung</span>
          <button class="btn-pulse" onclick="pulseDiceLED('${diceId}')">
            ⚡ Identifizieren
          </button>
        </div>
        <div class="led-actions">
          <div class="color-dots">
            <button class="dot-btn dot-red" title="Rot" onclick="setDiceLED('${diceId}', [255, 0, 0])"></button>
            <button class="dot-btn dot-green" title="Grün" onclick="setDiceLED('${diceId}', [0, 255, 0])"></button>
            <button class="dot-btn dot-blue" title="Blau" onclick="setDiceLED('${diceId}', [0, 0, 255])"></button>
            <button class="dot-btn dot-yellow" title="Gelb" onclick="setDiceLED('${diceId}', [255, 255, 0])"></button>
            <button class="dot-btn dot-off" title="Ausschalten" onclick="setDiceLED('${diceId}', [0, 0, 0])"></button>
          </div>
        </div>
      </div>

      <div class="card-footer">
        <button class="btn-disconnect" onclick="disconnectDice('${diceId}')">
          ❌ Verbindung trennen
        </button>
      </div>
    `;

    diceGrid.appendChild(card);
  });
}

// Partial updates for better performance & preserving user interactions
function updateDiceCardBattery(diceId, batteryLevel) {
  const container = document.getElementById(`battery-${diceId}`);
  if (!container) return;

  const text = container.querySelector('.battery-text');
  const bar = container.querySelector('.battery-level-bar');
  
  if (text) text.textContent = `${batteryLevel}%`;
  
  if (bar) {
    bar.style.width = `${batteryLevel}%`;
    bar.className = 'battery-level-bar';
    if (batteryLevel <= 20) bar.classList.add('danger');
    else if (batteryLevel <= 50) bar.classList.add('warning');
  }
}

function updateDiceCardStatus(diceId, statusText, isRolling) {
  const statusEl = document.getElementById(`status-${diceId}`);
  const visualEl = document.getElementById(`visual-${diceId}`);
  
  if (statusEl) statusEl.textContent = statusText;
  if (visualEl) {
    if (isRolling) {
      visualEl.classList.add('rolling');
      visualEl.textContent = '🎲';
    } else {
      visualEl.classList.remove('rolling');
    }
  }
}

function updateDiceCardValue(diceId, value, statusText) {
  const statusEl = document.getElementById(`status-${diceId}`);
  const visualEl = document.getElementById(`visual-${diceId}`);
  
  if (statusEl) statusEl.textContent = statusText;
  
  if (visualEl) {
    visualEl.classList.remove('rolling');
    visualEl.textContent = value;
    
    // Add stable pop bounce animation
    visualEl.classList.add('stable-pop');
    setTimeout(() => {
      visualEl.classList.remove('stable-pop');
    }, 600);
  }
}

// Change physical and logical die type shell
window.setDiceShell = (diceId, typeId) => {
  const die = state.connectedDice[diceId];
  if (!die) return;

  die.type = typeId;
  die.instance.setDieType(typeId);

  // Re-render only shell buttons on the card to avoid layout flashing
  const card = document.getElementById(`card-${diceId}`);
  if (card) {
    const buttons = card.querySelectorAll('.shell-buttons .btn-shell');
    buttons.forEach((btn, idx) => {
      if (idx === typeId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Also query color again to keep color up-to-date
  die.instance.getDiceColor();
};

// Set physical LED color
window.setDiceLED = (diceId, rgbArray) => {
  const die = state.connectedDice[diceId];
  if (!die) return;
  
  // Set both LEDs to the same color
  die.instance.setLed(rgbArray, rgbArray);
};

// Pulse physical LED for identification
window.pulseDiceLED = (diceId) => {
  const die = state.connectedDice[diceId];
  if (!die) return;

  // Pulse Cyan color 6 times
  die.instance.pulseLed(6, 15, 10, [6, 182, 212]);
};

// Disconnect single die
window.disconnectDice = (diceId) => {
  const die = state.connectedDice[diceId];
  if (!die) return;

  die.instance.onDisconnectButtonClick();
  delete state.connectedDice[diceId];
  
  renderDiceGrid();
  updateGlobalStatsUI();
};

// Render roll history list in sidebar
function renderHistoryUI() {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  if (state.history.length === 0) {
    historyList.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 1rem 0;">Noch keine Würfe</div>`;
    return;
  }

  historyList.innerHTML = state.history.map(item => {
    const dotClass = `dot-${DICE_COLOR_CLASSES[item.color]?.split('-')[1] || 'black'}`;
    
    return `
      <div class="history-item">
        <div class="history-dice-info">
          <div class="history-dice-dot ${dotClass}"></div>
          <span class="history-dice-id" title="${item.diceId}">ID: ${item.diceId.substring(0, 4)}...</span>
          <span class="history-dice-type">${item.type}</span>
        </div>
        <div class="history-right">
          <span class="history-value">${item.value}</span>
          <span class="history-time">${item.time}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render dynamic CSS-based frequency bar chart in sidebar
function renderChartUI() {
  const chartContainer = document.getElementById('chart-container');
  if (!chartContainer) return;

  // Find max roll count to scale percentages
  const counts = Object.values(state.stats.distribution);
  const maxCount = Math.max(...counts, 1);

  // Render 6 bars for D6 values by default
  let barsHtml = '';
  for (let val = 1; val <= 6; val++) {
    const count = state.stats.distribution[val] || 0;
    const pct = ((count / maxCount) * 100).toFixed(0);
    
    barsHtml += `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${val}</span>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width: ${pct}%"></div>
        </div>
        <span class="chart-bar-value">${count}x</span>
      </div>
    `;
  }

  chartContainer.innerHTML = barsHtml;
}
