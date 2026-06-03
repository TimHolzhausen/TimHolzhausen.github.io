// BLE UUID Constants (standard specifications support lowercase 16-bit UUID strings)
const SENSOR_SERVICE_UUID = 0x181a;       // Environmental Sensing
const SENSOR_CHAR_UUID = 0x2a58;          // Analog State
const SENSOR_CONFIG_UUID = 0x2a59;        // Lock/Reset Config State
const SENSOR_THRESHOLD_UUID = 0x2a5a;     // Threshold Config State
const SENSOR_VALUES_CHAR_UUID = 0x2a5b;    // Live Sensor values (6 channels * 2 bytes)
const SENSOR_TIMEOUT_CHAR_UUID = 0x2a5c;   // Standby Timeout (2 bytes in minutes)
const BATTERY_SERVICE_UUID = 0x180f;     // Battery Service
const BATTERY_CHAR_UUID = 0x2a19;        // Battery Level

// Global States
let bleDevice = null;
let sensorCharacteristic = null;
let configCharacteristic = null;
let thresholdCharacteristic = null;
let sensorValuesCharacteristic = null;
let timeoutCharacteristic = null;
let batteryCharacteristic = null;
let lastStateByte = 0;
let isConnecting = false;

// Audio Context for Web Audio API
let audioCtx = null;
const SCALE_NOTES = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // C4, D4, E4, G4, A4, C5 (Pentatonic)

// Default Pot Settings
const defaultPots = [
    { name: "Pot 1", color: "#ff3b30", glow: "rgba(255, 59, 48, 0.4)" },
    { name: "Pot 2", color: "#ffcc00", glow: "rgba(255, 204, 0, 0.4)" },
    { name: "Pot 3", color: "#007aff", glow: "rgba(0, 122, 255, 0.4)" },
    { name: "Pot 4", color: "#34c759", glow: "rgba(52, 199, 89, 0.4)" },
    { name: "Pot 5", color: "#ff9500", glow: "rgba(255, 149, 0, 0.4)" },
    { name: "Pot 6", color: "#af52de", glow: "rgba(175, 82, 222, 0.4)" }
];

let potSettings = [...defaultPots];
let currentEditingIndex = null;

// Sleep Dial Constants & State
const SLEEP_TIMEOUT_STEPS = [5, 10, 15, 30, 45, 60, 120, 180, 360, 720, 1440];
const SLEEP_TIMEOUT_LABELS = ["5m", "10m", "15m", "30m", "45m", "1h", "2h", "3h", "6h", "12h", "24h"];
let currentSleepMinutes = 180; // default 3h
let isDraggingSleepDial = false;

// DOM Elements
const connectBtn = document.getElementById('connect-btn');
const sleepDialKnob = document.getElementById('sleep-dial-knob');
const dialValueText = document.getElementById('dial-value-text');
const sleepDialMarker = document.getElementById('sleep-dial-marker');

function updateSleepDialUI(minutes) {
    let closestIdx = 0;
    let minDiff = Math.abs(minutes - SLEEP_TIMEOUT_STEPS[0]);
    for (let i = 1; i < SLEEP_TIMEOUT_STEPS.length; i++) {
        let diff = Math.abs(minutes - SLEEP_TIMEOUT_STEPS[i]);
        if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
        }
    }
    
    currentSleepMinutes = SLEEP_TIMEOUT_STEPS[closestIdx];
    if (dialValueText) {
        dialValueText.innerText = SLEEP_TIMEOUT_LABELS[closestIdx];
    }
    
    const deg = -135 + (closestIdx / (SLEEP_TIMEOUT_STEPS.length - 1)) * 270;
    if (sleepDialMarker) {
        sleepDialMarker.style.transform = `rotate(${deg}deg)`;
    }
}

function handleSleepDialDrag(clientX, clientY) {
    if (!sleepDialKnob || sleepDialKnob.classList.contains('disabled')) return;
    
    const rect = sleepDialKnob.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    
    let angleRad = Math.atan2(dy, dx);
    let angleDeg = angleRad * (180 / Math.PI) + 90; // 0 is UP
    if (angleDeg < 0) angleDeg += 360;
    
    // Bottom gap: 135 to 225
    if (angleDeg > 135 && angleDeg < 225) {
        angleDeg = (angleDeg < 180) ? 135 : 225;
    }
    
    let t = 0;
    if (angleDeg >= 225 && angleDeg <= 360) {
        t = (angleDeg - 225) / 270;
    } else if (angleDeg >= 0 && angleDeg <= 135) {
        t = (angleDeg + 135) / 270;
    }
    
    const stepIdx = Math.round(t * (SLEEP_TIMEOUT_STEPS.length - 1));
    const newMinutes = SLEEP_TIMEOUT_STEPS[stepIdx];
    
    if (newMinutes !== currentSleepMinutes) {
        currentSleepMinutes = newMinutes;
        if (dialValueText) {
            dialValueText.innerText = SLEEP_TIMEOUT_LABELS[stepIdx];
        }
        const deg = -135 + (stepIdx / (SLEEP_TIMEOUT_STEPS.length - 1)) * 270;
        if (sleepDialMarker) {
            sleepDialMarker.style.transform = `rotate(${deg}deg)`;
        }
    }
}
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
    
    // Register Service Worker for offline PWA capabilities
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered successfully!', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }
});

// Settings Management
function loadSettings() {
    const saved = localStorage.getItem('davinci_pot_settings');
    if (saved) {
        try {
            potSettings = JSON.parse(saved);
        } catch (e) {
            console.error("Could not load settings, using defaults", e);
            potSettings = [...defaultPots];
        }
    }
}

// Save Pot Names / Colors to Local Storage
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

    // Audio Feedback Mode Dropdown Selection
    const audioSelect = document.getElementById('audio-feedback-mode');
    if (audioSelect) {
        // Load initial state
        const savedMode = localStorage.getItem('davinci_audio_mode') || 'tones';
        audioSelect.value = savedMode;
        
        audioSelect.addEventListener('change', () => {
            const mode = audioSelect.value;
            localStorage.setItem('davinci_audio_mode', mode);
            
            // Interaction trigger to enable audio / speech synthesis
            if (mode === 'speech') {
                speakText('Voice predictive active');
            } else if (mode === 'tones') {
                playToneForPot(2); // Play a test tone (channel 3)
            }
        });
    }

    if ('speechSynthesis' in window) {
        // Pre-warm voices cache
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }
    }

    // Clear Log Button
    clearLogBtn.addEventListener('click', () => {
        logContainer.innerHTML = '<div class="log-placeholder">Log cleared.</div>';
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
        const newName = modalPotNameInput.value.trim() || `Pot ${currentEditingIndex + 1}`;
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
        showToast(`Settings for Channel ${currentEditingIndex + 1} saved.`);
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
                    showToast(lockSwitch.checked ? "Lock active after trigger." : "Multiple triggers allowed.");
                } catch (err) {
                    console.error("Error sending lock status:", err);
                    showToast("Write error: " + err.message);
                    // Reset UI checkbox
                    try {
                        const configVal = await configCharacteristic.readValue();
                        lockSwitch.checked = configVal.getUint8(0) !== 0;
                    } catch (readErr) {
                        console.error(readErr);
                    }
                }
            } else {
                showToast("Not connected or configuration not supported.");
                lockSwitch.checked = !lockSwitch.checked;
            }
        });

        resetBtn.addEventListener('click', async () => {
            if (configCharacteristic) {
                try {
                    await writeConfigValue(configCharacteristic, 0x02);
                    showToast("All pots unlocked!");
                } catch (err) {
                    console.error("Error sending unlock command:", err);
                    showToast("Unlock error: " + err.message);
                }
            } else {
                showToast("Not connected to the board.");
            }
        });

        const deepSleepBtn = document.getElementById('deep-sleep-btn');
        if (deepSleepBtn) {
            deepSleepBtn.addEventListener('click', async () => {
                if (configCharacteristic) {
                    if (confirm("Are you sure you want to turn off the sender? It can only be woken up by connecting USB power.")) {
                        try {
                            await writeConfigValue(configCharacteristic, 0x03);
                            showToast("Power-off command sent.");
                        } catch (err) {
                            console.error("Error sending deep sleep command:", err);
                            showToast("Power-off error: " + err.message);
                        }
                    }
                } else {
                    showToast("Not connected to the board.");
                }
            });
        }
    }

    // Auto Standby Timeout Drag/Touch interaction
    if (sleepDialKnob) {
        const startDrag = (e) => {
            if (sleepDialKnob.classList.contains('disabled')) return;
            isDraggingSleepDial = true;
            
            // Prevent default touch scrolling
            if (e.type === 'touchstart') {
                e.preventDefault();
            }
            
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;
            handleSleepDialDrag(clientX, clientY);
            
            const moveHandler = (moveEvent) => {
                if (!isDraggingSleepDial) return;
                const moveX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
                const moveY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
                if (moveX !== undefined && moveY !== undefined) {
                    handleSleepDialDrag(moveX, moveY);
                }
            };
            
            const endHandler = async () => {
                if (isDraggingSleepDial) {
                    isDraggingSleepDial = false;
                    window.removeEventListener('mousemove', moveHandler);
                    window.removeEventListener('mouseup', endHandler);
                    window.removeEventListener('touchmove', moveHandler);
                    window.removeEventListener('touchend', endHandler);
                    
                    // Write value over BLE
                    if (timeoutCharacteristic) {
                        try {
                            const minutes = currentSleepMinutes;
                            const data = new Uint8Array([minutes & 0xff, (minutes >> 8) & 0xff]);
                            await writeConfigValue(timeoutCharacteristic, data);
                            const labelIdx = SLEEP_TIMEOUT_STEPS.indexOf(minutes);
                            const label = SLEEP_TIMEOUT_LABELS[labelIdx] || `${minutes}m`;
                            showToast(`Standby timeout set to ${label}`);
                        } catch (err) {
                            console.error("Error writing standby timeout:", err);
                            showToast("Write error: " + err.message);
                            // Reset to actual board value
                            try {
                                const valData = await timeoutCharacteristic.readValue();
                                const minutes = valData.getUint16(0, true);
                                updateSleepDialUI(minutes);
                            } catch (readErr) {
                                console.error(readErr);
                            }
                        }
                    }
                }
            };
            
            window.addEventListener('mousemove', moveHandler, { passive: true });
            window.addEventListener('mouseup', endHandler, { passive: true });
            window.addEventListener('touchmove', moveHandler, { passive: false });
            window.addEventListener('touchend', endHandler, { passive: true });
        };
        
        sleepDialKnob.addEventListener('mousedown', startDrag);
        sleepDialKnob.addEventListener('touchstart', startDrag, { passive: false });
    }

    // Threshold-Slider
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdSlider && thresholdVal) {
        // Live value on dragging
        thresholdSlider.addEventListener('input', () => {
            thresholdVal.innerText = thresholdSlider.value;
        });

        // BLE write on release
        thresholdSlider.addEventListener('change', async () => {
            if (thresholdCharacteristic) {
                try {
                    const val = parseInt(thresholdSlider.value);
                    const data = new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
                    await writeConfigValue(thresholdCharacteristic, data);
                    showToast(`Threshold changed to ${val}.`);
                } catch (err) {
                    console.error("Error sending threshold:", err);
                    showToast("Write error: " + err.message);
                    // Reset slider
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
                showToast("Not connected to the board.");
            }
        });
    }

    // OTA UI Event Listeners
    const selectFwBtn = document.getElementById('select-fw-btn');
    const otaFileInput = document.getElementById('ota-file-input');
    const startOtaBtn = document.getElementById('start-ota-btn');
    
    if (selectFwBtn && otaFileInput) {
        selectFwBtn.addEventListener('click', () => {
            otaFileInput.click();
        });
    }
    
    if (otaFileInput) {
        otaFileInput.addEventListener('change', handleOtaFileSelect);
    }
    
    if (startOtaBtn) {
        startOtaBtn.addEventListener('click', startOtaFlashSequence);
    }
}

// BLE Write Helper
async function writeConfigValue(characteristic, value) {
    const data = (value instanceof Uint8Array) ? value : new Uint8Array([value]);
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

function speakNumber(index) {
    if (!('speechSynthesis' in window)) {
        console.warn("Speech Synthesis is not supported in this browser");
        return;
    }
    window.speechSynthesis.cancel();
    
    const ENGLISH_NUMBERS = ["One", "Two", "Three", "Four", "Five", "Six"];
    const text = ENGLISH_NUMBERS[index] || (index + 1).toString();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(voice => voice.lang.startsWith('en'));
    if (enVoice) {
        utterance.voice = enVoice;
    }
    
    utterance.rate = 1.1; 
    window.speechSynthesis.speak(utterance);
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(voice => voice.lang.startsWith('en'));
    if (enVoice) {
        utterance.voice = enVoice;
    }
    
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

function triggerAudioFeedback(index) {
    const audioSelect = document.getElementById('audio-feedback-mode');
    if (!audioSelect) return;
    
    const mode = audioSelect.value;
    if (mode === 'tones') {
        playToneForPot(index);
    } else if (mode === 'speech') {
        speakNumber(index);
    }
}

// Activity Event Logger
function logEvent(potIndex, isActive) {
    const placeholder = logContainer.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    const time = new Date().toLocaleTimeString('en-US');
    const config = potSettings[potIndex];
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.style.setProperty('--log-accent', config.color);
    
    const actionText = isActive ? 'used 🟢' : 'ready again ⚪';
    logItem.innerHTML = `
        <span><strong>${config.name}</strong> is now ${actionText}</span>
        <span class="log-time">${time}</span>
    `;
    
    logContainer.appendChild(logItem);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Web Bluetooth Logic
async function connectBLE() {
    if (isConnecting) return;
    isConnecting = true;
    updateConnectButtonState('connecting', 'Connecting...');
    
    try {
        console.log("Searching for BLE devices...");
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [SENSOR_SERVICE_UUID] },
                { namePrefix: 'Davinci' },
                { namePrefix: 'Davinic' },
                { namePrefix: 'dav' },
                { namePrefix: 'Dav' }
            ],
            optionalServices: [SENSOR_SERVICE_UUID, BATTERY_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

        console.log("Connecting to GATT Server...");
        const server = await bleDevice.gatt.connect();

        // 1. Get Environmental Sensing Service (Sensors)
        console.log("Getting Sensor Service...");
        const sensorService = await server.getPrimaryService(SENSOR_SERVICE_UUID);
        sensorCharacteristic = await sensorService.getCharacteristic(SENSOR_CHAR_UUID);
        
        // Start notifications for sensor characteristic
        await sensorCharacteristic.startNotifications();
        sensorCharacteristic.addEventListener('characteristicvaluechanged', handleSensorNotification);
        
        // Get Configuration Characteristic
        try {
            console.log("Getting Configuration Characteristic...");
            configCharacteristic = await sensorService.getCharacteristic(SENSOR_CONFIG_UUID);
            
            const configVal = await configCharacteristic.readValue();
            const isLockActive = configVal.getUint8(0) !== 0;
            const lockSwitch = document.getElementById('lock-after-trigger-switch');
            const resetBtn = document.getElementById('reset-locks-btn');
            if (lockSwitch) lockSwitch.checked = isLockActive;
            if (resetBtn) resetBtn.disabled = !isLockActive;
            
            const deepSleepBtn = document.getElementById('deep-sleep-btn');
            if (deepSleepBtn) deepSleepBtn.disabled = false;
        } catch (configError) {
            console.warn("Configuration characteristic not available:", configError);
        }

        // Get Threshold Characteristic
        try {
            console.log("Getting Threshold Characteristic...");
            thresholdCharacteristic = await sensorService.getCharacteristic(SENSOR_THRESHOLD_UUID);
            
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
            console.warn("Threshold characteristic not available:", threshError);
        }

        // Get Live Sensor Values Characteristic
        try {
            console.log("Getting Live Sensor Values Characteristic...");
            sensorValuesCharacteristic = await sensorService.getCharacteristic(SENSOR_VALUES_CHAR_UUID);
            
            await sensorValuesCharacteristic.startNotifications();
            sensorValuesCharacteristic.addEventListener('characteristicvaluechanged', handleValuesNotification);
        } catch (valuesError) {
            console.warn("Live sensor values characteristic not available:", valuesError);
        }

        // Get Standby Timeout Characteristic
        try {
            console.log("Getting Standby Timeout Characteristic...");
            timeoutCharacteristic = await sensorService.getCharacteristic(SENSOR_TIMEOUT_CHAR_UUID);
            
            const valData = await timeoutCharacteristic.readValue();
            const minutes = valData.getUint16(0, true);
            if (sleepDialKnob) {
                sleepDialKnob.classList.remove('disabled');
            }
            updateSleepDialUI(minutes);
        } catch (timeoutError) {
            console.warn("Standby timeout characteristic not available:", timeoutError);
        }
        
        // 2. Get Battery Service (Optional)
        try {
            console.log("Getting Battery Service...");
            const batteryService = await server.getPrimaryService(BATTERY_SERVICE_UUID);
            batteryCharacteristic = await batteryService.getCharacteristic(BATTERY_CHAR_UUID);
            
            const batValue = await batteryCharacteristic.readValue();
            updateBatteryUI(batValue.getUint8(0));
            
            await batteryCharacteristic.startNotifications();
            batteryCharacteristic.addEventListener('characteristicvaluechanged', handleBatteryNotification);
        } catch (batError) {
            console.warn("Battery service not available or failed to subscribe:", batError);
        }

        console.log("Successfully connected!");
        updateConnectButtonState('connected', 'Connected');
        showToast("Connected to Davinci Color!");
        
        const initialVal = await sensorCharacteristic.readValue();
        parseStateByte(initialVal.getUint8(0));

    } catch (error) {
        console.error("BLE connection error:", error);
        showToast("Connection error: " + error.message);
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
    showToast("Connection to sender lost!");
    resetState();
}

function resetState() {
    bleDevice = null;
    sensorCharacteristic = null;
    configCharacteristic = null;
    thresholdCharacteristic = null;
    sensorValuesCharacteristic = null;
    batteryCharacteristic = null;
    lastStateByte = 0;
    
    updateConnectButtonState('disconnected', 'Connect');
    
    // Reset battery values
    batteryProgress.style.strokeDasharray = "0, 100";
    batteryValue.innerText = "--%";
    batteryTooltip.setAttribute('data-tooltip', 'Battery status unknown');
    
    // Reset control switch, buttons, and sliders
    const resetBtn = document.getElementById('reset-locks-btn');
    if (resetBtn) resetBtn.disabled = true;
    const deepSleepBtn = document.getElementById('deep-sleep-btn');
    if (deepSleepBtn) deepSleepBtn.disabled = true;
    if (sleepDialKnob) {
        sleepDialKnob.classList.add('disabled');
    }
    updateSleepDialUI(180);
    timeoutCharacteristic = null;
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdSlider) thresholdSlider.disabled = true;
    if (thresholdVal) thresholdVal.innerText = '--';
    
    // Set all cards to inactive and clear value labels
    for (let i = 0; i < 6; i++) {
        const card = document.getElementById(`pot-${i}`);
        const statusText = document.getElementById(`pot-status-${i}`);
        const valueText = document.getElementById(`pot-value-${i}`);
        if (card) card.classList.remove('active');
        if (statusText) statusText.innerText = 'Ready';
        if (valueText) valueText.innerText = '--';
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

function handleValuesNotification(event) {
    const dataView = event.target.value;
    if (dataView.byteLength >= 12) {
        for (let i = 0; i < 6; i++) {
            const val = dataView.getUint16(i * 2, true);
            const valEl = document.getElementById(`pot-value-${i}`);
            if (valEl) {
                valEl.innerText = val;
            }
        }
    }
}

function updateBatteryUI(level) {
    batteryProgress.style.strokeDasharray = `${level}, 100`;
    batteryValue.innerText = `${level}%`;
    batteryTooltip.setAttribute('data-tooltip', `Battery level: ${level}%`);
    
    if (level > 50) {
        batteryProgress.style.stroke = '#00e676';
    } else if (level > 20) {
        batteryProgress.style.stroke = '#ffcc00';
    } else {
        batteryProgress.style.stroke = '#ff3b30';
    }
}

function parseStateByte(stateByte) {
    for (let i = 0; i < 6; i++) {
        const wasActive = (lastStateByte & (1 << i)) !== 0;
        const isActive = (stateByte & (1 << i)) !== 0;
        
        const card = document.getElementById(`pot-${i}`);
        const statusText = document.getElementById(`pot-status-${i}`);
        
        if (isActive !== wasActive) {
            if (isActive) {
                if (card) card.classList.add('active');
                if (statusText) statusText.innerText = 'Used';
                
                logEvent(i, true);
                triggerAudioFeedback(i);
            } else {
                if (card) card.classList.remove('active');
                if (statusText) statusText.innerText = 'Ready';
                
                logEvent(i, false);
            }
        } else {
            if (isActive) {
                if (card) card.classList.add('active');
                if (statusText) statusText.innerText = 'Used';
            } else {
                if (card) card.classList.remove('active');
                if (statusText) statusText.innerText = 'Ready';
            }
        }
    }
    lastStateByte = stateByte;
}

// --- OTA Firmware Update (Nordic Secure DFU over BLE) ---

let selectedFwBin = null;
let selectedFwDat = null;
let dfuResponseResolver = null;

async function handleOtaFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const selectFwBtn = document.getElementById('select-fw-btn');
    const otaStatusArea = document.getElementById('ota-status-area');
    const otaStatusText = document.getElementById('ota-status-text');
    const otaPercentText = document.getElementById('ota-percent-text');
    const otaProgressBar = document.getElementById('ota-progress-bar');
    
    if (selectFwBtn) selectFwBtn.innerText = file.name;
    
    try {
        if (typeof fflate === 'undefined') {
            throw new Error("Zip library 'fflate' is not loaded. Please verify internet connection.");
        }
        
        otaStatusArea.style.display = 'flex';
        otaStatusText.innerText = "Parsing ZIP file...";
        otaStatusText.style.color = "var(--text-secondary)";
        otaPercentText.innerText = "0%";
        otaProgressBar.style.width = "0%";
        
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const arrayBuffer = evt.target.result;
                const zipData = new Uint8Array(arrayBuffer);
                const unzipped = fflate.unzipSync(zipData);
                
                selectedFwBin = null;
                selectedFwDat = null;
                
                for (const filename in unzipped) {
                    if (filename.endsWith('.bin')) {
                        selectedFwBin = unzipped[filename];
                    } else if (filename.endsWith('.dat')) {
                        selectedFwDat = unzipped[filename];
                    }
                }
                
                if (!selectedFwBin || !selectedFwDat) {
                    throw new Error("Could not find firmware .bin or .dat files inside the zip package.");
                }
                
                otaStatusText.innerText = `Package ready (${Math.round(selectedFwBin.length / 1024)} KB)`;
                showToast("Firmware package loaded successfully!");
            } catch (err) {
                console.error(err);
                otaStatusText.innerText = "Error: " + err.message;
                otaStatusText.style.color = "#ff3b30";
                showToast("ZIP parse failed: " + err.message);
                selectedFwBin = null;
                selectedFwDat = null;
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (err) {
        console.error(err);
        otaStatusText.innerText = "Error: " + err.message;
        otaStatusText.style.color = "#ff3b30";
        showToast("Error: " + err.message);
    }
}

async function startOtaFlashSequence() {
    if (!selectedFwBin || !selectedFwDat) {
        showToast("Please select a valid firmware.zip first.");
        return;
    }
    
    const otaStatusText = document.getElementById('ota-status-text');
    const otaPercentText = document.getElementById('ota-percent-text');
    const otaProgressBar = document.getElementById('ota-progress-bar');
    
    // Step 1: Trigger reboot if currently connected
    if (bleDevice && bleDevice.gatt.connected && configCharacteristic) {
        if (!confirm("Start OTA Update? Device will reboot into DFU Mode.")) {
            return;
        }
        
        try {
            otaStatusText.innerText = "Triggering DFU Mode on device...";
            otaStatusText.style.color = "var(--text-secondary)";
            // Command 0x04 reboots Xiao into bootloader mode
            await writeConfigValue(configCharacteristic, 0x04);
            showToast("DFU trigger command sent. Waiting for reset...");
        } catch (err) {
            console.error("Error triggering DFU mode:", err);
            // It might fail because of immediate reset/disconnection, which is normal.
        }
        
        // Disconnect immediately and wait 2 seconds for bootloader to advertise
        disconnectBLE();
        await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
        if (!confirm("Start OTA Update? Make sure device is already in DFU/bootloader mode (red LED blinking slowly).")) {
            return;
        }
    }
    
    // Step 2: Request the DFU Target device
    let dfuDevice = null;
    try {
        otaStatusText.innerText = "Scanning for DfuTarg...";
        dfuDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [0x1530] } // Nordic DFU service 16-bit UUID
            ]
        });
        
        otaStatusText.innerText = "Connecting to DfuTarg...";
        const server = await dfuDevice.gatt.connect();
        
        otaStatusText.innerText = "Getting DFU Service...";
        const dfuService = await server.getPrimaryService('00001530-1212-efde-1523-785feabcd123');
        const controlChar = await dfuService.getCharacteristic('00001531-1212-efde-1523-785feabcd123');
        const packetChar = await dfuService.getCharacteristic('00001532-1212-efde-1523-785feabcd123');
        
        // Listen to control point notifications
        await controlChar.startNotifications();
        controlChar.addEventListener('characteristicvaluechanged', handleDfuNotification);
        
        otaStatusText.innerText = "Starting DFU sequence...";
        
        // Disable Packet Receipt Notification (PRN) -> Opcode 0x02, value 0 (no PRN)
        await sendDfuCommand(controlChar, [0x02, 0x00, 0x00]);
        
        // --- 1. Upload Init Packet (.dat) ---
        otaStatusText.innerText = "Sending Init Packet...";
        // Select Command Object (0x06, 0x01)
        let selectCmdResp = await sendDfuCommand(controlChar, [0x06, 0x01]);
        // Response format: [0x60, 0x06, 0x01, max_size (4 bytes), offset (4 bytes), crc (4 bytes)]
        let cmdOffset = new DataView(selectCmdResp.buffer).getUint32(7, true);
        
        const datLen = selectedFwDat.length;
        if (cmdOffset < datLen) {
            // Create Command Object (0x01, 0x01, size [4 bytes])
            await sendDfuCommand(controlChar, [0x01, 0x01, datLen & 0xff, (datLen >> 8) & 0xff, (datLen >> 16) & 0xff, (datLen >> 24) & 0xff]);
            
            // Stream .dat bytes to Packet characteristic
            const chunkSize = 20;
            for (let i = 0; i < datLen; i += chunkSize) {
                const chunk = selectedFwDat.slice(i, i + chunkSize);
                await packetChar.writeValueWithoutResponse(chunk);
            }
            
            // Verify Checksum (0x03)
            let checksumResp = await sendDfuCommand(controlChar, [0x03]);
            let verifiedOffset = new DataView(checksumResp.buffer).getUint32(3, true);
            if (verifiedOffset !== datLen) {
                throw new Error("Init packet transfer failed: offset mismatch");
            }
        }
        
        // Execute (0x04)
        await sendDfuCommand(controlChar, [0x04]);
        
        // --- 2. Upload Firmware Binary (.bin) ---
        otaStatusText.innerText = "Sending Firmware Binary...";
        // Select Data Object (0x06, 0x02)
        let selectDataResp = await sendDfuCommand(controlChar, [0x06, 0x02]);
        let maxDataSize = new DataView(selectDataResp.buffer).getUint32(3, true); // e.g. 4096 bytes
        let dataOffset = new DataView(selectDataResp.buffer).getUint32(7, true);
        
        const binLen = selectedFwBin.length;
        let offset = dataOffset;
        
        while (offset < binLen) {
            let currentBlockSize = Math.min(binLen - offset, maxDataSize);
            
            // Create Data Object (0x01, 0x02, size [4 bytes])
            await sendDfuCommand(controlChar, [0x01, 0x02, currentBlockSize & 0xff, (currentBlockSize >> 8) & 0xff, (currentBlockSize >> 16) & 0xff, (currentBlockSize >> 24) & 0xff]);
            
            // Stream this block
            let blockOffset = 0;
            const chunkSize = 20;
            while (blockOffset < currentBlockSize) {
                let chunk = selectedFwBin.slice(offset + blockOffset, offset + blockOffset + chunkSize);
                await packetChar.writeValueWithoutResponse(chunk);
                blockOffset += chunk.length;
                
                // Update Progress UI
                let totalProgress = offset + blockOffset;
                let pct = Math.round((totalProgress / binLen) * 100);
                otaProgressBar.style.width = pct + "%";
                otaPercentText.innerText = pct + "%";
                otaStatusText.innerText = `Uploading: ${Math.round(totalProgress / 1024)} / ${Math.round(binLen / 1024)} KB`;
            }
            
            // Verify Checksum (0x03)
            let checksumResp = await sendDfuCommand(controlChar, [0x03]);
            let verifiedOffset = new DataView(checksumResp.buffer).getUint32(3, true);
            if (verifiedOffset !== offset + currentBlockSize) {
                throw new Error(`Data block transfer failed at offset ${offset + currentBlockSize}`);
            }
            
            // Execute (0x04)
            await sendDfuCommand(controlChar, [0x04]);
            offset += currentBlockSize;
        }
        
        otaStatusText.innerText = "Verification complete! Rebooting...";
        showToast("Firmware successfully updated! Board is restarting.");
        
        // Reset file selection
        setTimeout(() => {
            selectedFwBin = null;
            selectedFwDat = null;
            document.getElementById('select-fw-btn').innerText = "Select firmware.zip";
            document.getElementById('ota-status-area').style.display = 'none';
        }, 3000);
        
        // Disconnect DFU target
        dfuDevice.gatt.disconnect();
        
    } catch (err) {
        console.error("DFU Error:", err);
        otaStatusText.innerText = "OTA Error: " + err.message;
        otaStatusText.style.color = "#ff3b30";
        showToast("OTA Error: " + err.message);
        if (dfuDevice && dfuDevice.gatt.connected) {
            dfuDevice.gatt.disconnect();
        }
    }
}

function handleDfuNotification(event) {
    const value = event.target.value;
    if (dfuResponseResolver) {
        dfuResponseResolver(value);
        dfuResponseResolver = null;
    }
}

async function sendDfuCommand(controlChar, bytes) {
    return new Promise(async (resolve, reject) => {
        dfuResponseResolver = (response) => {
            const respBytes = new Uint8Array(response.buffer);
            if (respBytes[0] !== 0x60) {
                reject(new Error("Invalid DFU response header"));
                return;
            }
            if (respBytes[2] !== 0x01) {
                const errorCodes = {
                    2: "Opcode not supported",
                    3: "Invalid parameter",
                    4: "Insufficient resources",
                    5: "Invalid object",
                    7: "Unsupported type",
                    8: "Operation not permitted",
                    10: "Operation failed",
                    11: "Extended error"
                };
                const errMsg = errorCodes[respBytes[2]] || `Error code ${respBytes[2]}`;
                reject(new Error(`DFU Command Failed: ${errMsg}`));
                return;
            }
            resolve(response);
        };
        
        try {
            await controlChar.writeValueWithResponse(new Uint8Array(bytes));
            // Timeout if response notification is not received in 8 seconds
            setTimeout(() => {
                if (dfuResponseResolver) {
                    dfuResponseResolver = null;
                    reject(new Error("DFU command timeout"));
                }
            }, 8000);
        } catch (err) {
            dfuResponseResolver = null;
            reject(err);
        }
    });
}
