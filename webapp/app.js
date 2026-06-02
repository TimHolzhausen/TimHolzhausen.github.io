// BLE UUID Constants (standard specifications support lowercase 16-bit UUID strings)
const SENSOR_SERVICE_UUID = 0x181a;       // Environmental Sensing
const SENSOR_CHAR_UUID = 0x2a58;          // Analog State
const SENSOR_CONFIG_UUID = 0x2a59;        // Lock/Reset Config State
const SENSOR_THRESHOLD_UUID = 0x2a5a;     // Threshold Config State
const BATTERY_SERVICE_UUID = 0x180f;     // Battery Service
const BATTERY_CHAR_UUID = 0x2a19;        // Battery Level

// Global States
let bleDevice = null;
let sensorCharacteristic = null;
let configCharacteristic = null;
let thresholdCharacteristic = null;
let batteryCharacteristic = null;
let lastStateByte = 0;
let isConnecting = false;

// Audio Context for Web Audio API
let audioCtx = null;
const SCALE_NOTES = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // C4, D4, E4, G4, A4, C5 (Pentatonic)

// Default Pot Settings
const defaultPots = [
    { name: "Topf 1", color: "#ff3b30", glow: "rgba(255, 59, 48, 0.4)" },
    { name: "Topf 2", color: "#ffcc00", glow: "rgba(255, 204, 0, 0.4)" },
    { name: "Topf 3", color: "#007aff", glow: "rgba(0, 122, 255, 0.4)" },
    { name: "Topf 4", color: "#34c759", glow: "rgba(52, 199, 89, 0.4)" },
    { name: "Topf 5", color: "#ff9500", glow: "rgba(255, 149, 0, 0.4)" },
    { name: "Topf 6", color: "#af52de", glow: "rgba(175, 82, 222, 0.4)" }
];

let potSettings = [...defaultPots];
let currentEditingIndex = null;

// DOM Elements
const connectBtn = document.getElementById('connect-btn');
const batteryProgress = document.getElementById('battery-progress');
const batteryValue = document.getElementById('battery-value');
const batteryTooltip = document.getElementById('battery-tooltip');
const logContainer = document.getElementById('log-container');
const clearLogBtn = document.getElementById('clear-log-btn');
const notificationToast = document.getElementById('notification-toast');
const editModal = document.getElementById('edit-modal');
const modalPotNameInput = document.getElementById('modal-pot-name');
const saveModalBtn = document.getElementById('save-modal-btn');

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    applySettingsToUI();
    setupEventListeners();
});

// Settings Management
function loadSettings() {
    const saved = localStorage.getItem('davinci_pot_settings');
    if (saved) {
        try {
            potSettings = JSON.parse(saved);
        } catch (e) {
            console.error("Konnte Einstellungen nicht laden, nutze Standardwerte", e);
            potSettings = [...defaultPots];
        }
    }
}

function saveSettings() {
    localStorage.setItem('davinci_pot_settings', JSON.stringify(potSettings));
}

function applySettingsToUI() {
    for (let i = 0; i < 6; i++) {
        const card = document.getElementById(`pot-${i}`);
        const nameEl = document.getElementById(`pot-name-${i}`);
        if (card && nameEl) {
            const config = potSettings[i];
            card.style.setProperty('--accent-color', config.color);
            card.style.setProperty('--glow-color', config.glow);
            nameEl.innerText = config.name;
        }
    }
}

// Modal Logic
window.openEditModal = function(index) {
    currentEditingIndex = index;
    const config = potSettings[index];
    modalPotNameInput.value = config.name;
    
    // Set active color dot
    const dots = document.querySelectorAll('.color-dot');
    dots.forEach(dot => {
        const color = dot.getAttribute('data-color');
        if (color === config.color) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    
    editModal.classList.add('open');
};

window.closeEditModal = function() {
    editModal.classList.remove('open');
    currentEditingIndex = null;
};

// Event Listeners Setup
function setupEventListeners() {
    // BLE Connection Click
    connectBtn.addEventListener('click', () => {
        initAudioContext();
        if (bleDevice && bleDevice.gatt.connected) {
            disconnectBLE();
        } else {
            connectBLE();
        }
    });



    // Clear Log Button
    clearLogBtn.addEventListener('click', () => {
        logContainer.innerHTML = '<div class="log-placeholder">Protokoll gelöscht.</div>';
    });

    // Color dot picker in modal
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            colorDots.forEach(d => d.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Save Modal settings
    saveModalBtn.addEventListener('click', () => {
        if (currentEditingIndex === null) return;
        
        const activeDot = document.querySelector('.color-dot.active');
        const newName = modalPotNameInput.value.trim() || `Topf ${currentEditingIndex + 1}`;
        const newColor = activeDot ? activeDot.getAttribute('data-color') : '#ffffff';
        const newGlow = activeDot ? activeDot.getAttribute('data-glow') : 'rgba(255, 255, 255, 0.2)';
        
        potSettings[currentEditingIndex] = {
            name: newName,
            color: newColor,
            glow: newGlow
        };
        
        saveSettings();
        applySettingsToUI();
        closeEditModal();
        showToast(`Einstellungen für Kanal ${currentEditingIndex + 1} gespeichert.`);
    });

    // Lock-After-Trigger Switch & Reset Buttons
    const lockSwitch = document.getElementById('lock-after-trigger-switch');
    const resetBtn = document.getElementById('reset-locks-btn');
    if (lockSwitch && resetBtn) {
        lockSwitch.addEventListener('change', async () => {
            if (configCharacteristic) {
                try {
                    const val = lockSwitch.checked ? 0x01 : 0x00;
                    await writeConfigValue(configCharacteristic, val);
                    resetBtn.disabled = !lockSwitch.checked;
                    showToast(lockSwitch.checked ? "Sperre nach Auslösung aktiv." : "Mehrfach-Auslösung erlaubt.");
                } catch (err) {
                    console.error("Fehler beim Senden des Lock-Status:", err);
                    showToast("Schreibfehler: " + err.message);
                    // UI zurücksetzen
                    try {
                        const configVal = await configCharacteristic.readValue();
                        lockSwitch.checked = configVal.getUint8(0) !== 0;
                    } catch (readErr) {
                        console.error(readErr);
                    }
                }
            } else {
                showToast("Nicht verbunden oder Konfiguration nicht unterstützt.");
                lockSwitch.checked = !lockSwitch.checked;
            }
        });

        resetBtn.addEventListener('click', async () => {
            if (configCharacteristic) {
                try {
                    await writeConfigValue(configCharacteristic, 0x02);
                    showToast("Sperrung aller Töpfe aufgehoben!");
                } catch (err) {
                    console.error("Fehler beim Senden des Entsperr-Befehls:", err);
                    showToast("Fehler beim Entsperren: " + err.message);
                }
            } else {
                showToast("Nicht mit dem Board verbunden.");
            }
        });
    }

    // Threshold-Slider
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdSlider && thresholdVal) {
        // Live Wert-Anzeige beim Ziehen
        thresholdSlider.addEventListener('input', () => {
            thresholdVal.innerText = thresholdSlider.value;
        });

        // BLE-Schreiben nach dem Loslassen
        thresholdSlider.addEventListener('change', async () => {
            if (thresholdCharacteristic) {
                try {
                    const val = parseInt(thresholdSlider.value);
                    // 16-Bit Wert als Little-Endian senden (2 Bytes)
                    const data = new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
                    await writeConfigValue(thresholdCharacteristic, data);
                    showToast(`Schwellenwert auf ${val} geändert.`);
                } catch (err) {
                    console.error("Fehler beim Senden des Schwellenwerts:", err);
                    showToast("Schreibfehler: " + err.message);
                    // Regler zurücksetzen
                    try {
                        const valData = await thresholdCharacteristic.readValue();
                        const val = valData.getUint16(0, true);
                        thresholdSlider.value = val;
                        thresholdVal.innerText = val;
                    } catch (readErr) {
                        console.error(readErr);
                    }
                }
            } else {
                showToast("Nicht mit dem Board verbunden.");
            }
        });
    }
}

// Hilfsfunktion für robustes BLE-Schreiben mit Fallback
async function writeConfigValue(characteristic, value) {
    const data = new Uint8Array([value]);
    if (typeof characteristic.writeValueWithResponse === 'function') {
        await characteristic.writeValueWithResponse(data);
    } else {
        await characteristic.writeValue(data);
    }
}

// Toast Notification Helper
function showToast(message) {
    notificationToast.innerText = message;
    notificationToast.classList.add('show');
    setTimeout(() => {
        notificationToast.classList.remove('show');
    }, 3000);
}

// Audio Engine (Web Audio API Synthesizer)
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playToneForPot(index) {
    if (!document.getElementById('audio-feedback').checked) return;
    initAudioContext();
    if (!audioCtx) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine'; // Premium glatter Sound
    const freq = SCALE_NOTES[index] || 440;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    // Lautstärke-Hüllkurve (Envelope)
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.04); // Sanfter Attack
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45); // Schönes Nachklingen
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}


// Activity Event Logger
function logEvent(potIndex, isActive) {
    // Remove placeholder
    const placeholder = logContainer.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    const time = new Date().toLocaleTimeString('de-DE');
    const config = potSettings[potIndex];
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.style.setProperty('--log-accent', config.color);
    
    const actionText = isActive ? 'benutzt 🟢' : 'wieder bereit ⚪';
    logItem.innerHTML = `
        <span><strong>${config.name}</strong> wurde ${actionText}</span>
        <span class="log-time">${time}</span>
    `;
    
    logContainer.appendChild(logItem);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Web Bluetooth Logic
async function connectBLE() {
    if (isConnecting) return;
    isConnecting = true;
    updateConnectButtonState('connecting', 'Verbinden...');
    
    try {
        console.log("Suche nach BLE-Geräten...");
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Davinci_Color_V2' }],
            optionalServices: [SENSOR_SERVICE_UUID, BATTERY_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

        console.log("Verbinde mit GATT-Server...");
        const server = await bleDevice.gatt.connect();

        // 1. Get Environmental Sensing Service (Sensors)
        console.log("Hole Sensor-Service...");
        const sensorService = await server.getPrimaryService(SENSOR_SERVICE_UUID);
        sensorCharacteristic = await sensorService.getCharacteristic(SENSOR_CHAR_UUID);
        
        // Start notifications for sensor characteristic
        await sensorCharacteristic.startNotifications();
        sensorCharacteristic.addEventListener('characteristicvaluechanged', handleSensorNotification);
        
        // Get Configuration Characteristic
        try {
            console.log("Hole Konfigurations-Charakteristik...");
            configCharacteristic = await sensorService.getCharacteristic(SENSOR_CONFIG_UUID);
            
            // Initialen Wert lesen
            const configVal = await configCharacteristic.readValue();
            const isLockActive = configVal.getUint8(0) !== 0;
            const lockSwitch = document.getElementById('lock-after-trigger-switch');
            const resetBtn = document.getElementById('reset-locks-btn');
            if (lockSwitch) lockSwitch.checked = isLockActive;
            if (resetBtn) resetBtn.disabled = !isLockActive;
        } catch (configError) {
            console.warn("Konfigurations-Charakteristik nicht verfügbar:", configError);
        }

        // Get Threshold Characteristic
        try {
            console.log("Hole Schwellenwert-Charakteristik...");
            thresholdCharacteristic = await sensorService.getCharacteristic(SENSOR_THRESHOLD_UUID);
            
            // Initialen Wert lesen (16-bit Little-Endian)
            const valData = await thresholdCharacteristic.readValue();
            const val = valData.getUint16(0, true);
            const thresholdSlider = document.getElementById('threshold-slider');
            const thresholdVal = document.getElementById('threshold-val');
            if (thresholdSlider) {
                thresholdSlider.value = val;
                thresholdSlider.disabled = false;
            }
            if (thresholdVal) thresholdVal.innerText = val;
        } catch (threshError) {
            console.warn("Schwellenwert-Charakteristik nicht verfügbar:", threshError);
        }
        
        // 2. Get Battery Service (Optional)
        try {
            console.log("Hole Battery-Service...");
            const batteryService = await server.getPrimaryService(BATTERY_SERVICE_UUID);
            batteryCharacteristic = await batteryService.getCharacteristic(BATTERY_CHAR_UUID);
            
            // Read initial battery
            const batValue = await batteryCharacteristic.readValue();
            updateBatteryUI(batValue.getUint8(0));
            
            // Start notifications for battery level
            await batteryCharacteristic.startNotifications();
            batteryCharacteristic.addEventListener('characteristicvaluechanged', handleBatteryNotification);
        } catch (batError) {
            console.warn("Batteriedienst nicht verfügbar oder konnte nicht abonniert werden:", batError);
        }

        console.log("Erfolgreich verbunden!");
        updateConnectButtonState('connected', 'Verbunden');
        showToast("Erfolgreich mit Davinci Color verbunden!");
        
        // Initialer Zustand abfragen (einmalig lesen)
        const initialVal = await sensorCharacteristic.readValue();
        parseStateByte(initialVal.getUint8(0));

    } catch (error) {
        console.error("BLE Verbindungsfehler:", error);
        showToast("Verbindungsfehler: " + error.message);
        resetState();
    } finally {
        isConnecting = false;
    }
}

function disconnectBLE() {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }
}

function onDisconnected() {
    showToast("Verbindung zum Sender getrennt!");
    resetState();
}

function resetState() {
    bleDevice = null;
    sensorCharacteristic = null;
    configCharacteristic = null;
    thresholdCharacteristic = null;
    batteryCharacteristic = null;
    lastStateByte = 0;
    
    updateConnectButtonState('disconnected', 'Verbinden');
    
    // Reset battery values
    batteryProgress.style.strokeDasharray = "0, 100";
    batteryValue.innerText = "--%";
    batteryTooltip.setAttribute('data-tooltip', 'Batteriestand unbekannt');
    
    // Reset control switch, buttons, and slider
    const resetBtn = document.getElementById('reset-locks-btn');
    if (resetBtn) resetBtn.disabled = true;
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdSlider) thresholdSlider.disabled = true;
    if (thresholdVal) thresholdVal.innerText = '--';
    
    // Set all cards to inactive
    for (let i = 0; i < 6; i++) {
        const card = document.getElementById(`pot-${i}`);
        const statusText = document.getElementById(`pot-status-${i}`);
        if (card) card.classList.remove('active');
        if (statusText) statusText.innerText = 'Bereit';
    }
}

function updateConnectButtonState(state, text) {
    connectBtn.className = `connect-btn ${state}`;
    connectBtn.querySelector('.btn-text').innerText = text;
    
    const icon = connectBtn.querySelector('.btn-icon');
    if (state === 'connected') {
        icon.innerText = '🟢';
    } else if (state === 'connecting') {
        icon.innerText = '⏳';
    } else {
        icon.innerText = '⚡';
    }
}

// Data Processing
function handleSensorNotification(event) {
    const value = event.target.value.getUint8(0);
    parseStateByte(value);
}

function handleBatteryNotification(event) {
    const level = event.target.value.getUint8(0);
    updateBatteryUI(level);
}

function updateBatteryUI(level) {
    // 0-100% circular progress bar
    batteryProgress.style.strokeDasharray = `${level}, 100`;
    batteryValue.innerText = `${level}%`;
    batteryTooltip.setAttribute('data-tooltip', `Batteriestand: ${level}%`);
    
    // Adjust battery progress color based on state
    if (level > 50) {
        batteryProgress.style.stroke = '#00e676';
    } else if (level > 20) {
        batteryProgress.style.stroke = '#ffcc00';
    } else {
        batteryProgress.style.stroke = '#ff3b30';
    }
}

function parseStateByte(stateByte) {
    // Check bits 0 to 5 for changes
    for (let i = 0; i < 6; i++) {
        const wasActive = (lastStateByte & (1 << i)) !== 0;
        const isActive = (stateByte & (1 << i)) !== 0;
        
        const card = document.getElementById(`pot-${i}`);
        const statusText = document.getElementById(`pot-status-${i}`);
        
        if (isActive !== wasActive) {
            // State changed
            if (isActive) {
                // Used
                if (card) card.classList.add('active');
                if (statusText) statusText.innerText = 'Benutzt';
                
                logEvent(i, true);
                playToneForPot(i);
            } else {
                // Ready
                if (card) card.classList.remove('active');
                if (statusText) statusText.innerText = 'Bereit';
                
                logEvent(i, false);
            }
        } else {
            // Ensure UI is in sync on connection
            if (isActive) {
                if (card) card.classList.add('active');
                if (statusText) statusText.innerText = 'Benutzt';
            } else {
                if (card) card.classList.remove('active');
                if (statusText) statusText.innerText = 'Bereit';
            }
        }
    }
    lastStateByte = stateByte;
}
