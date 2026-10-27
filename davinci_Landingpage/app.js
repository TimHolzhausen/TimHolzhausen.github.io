// BLE UUID Constants for Palette (Sender)
const SENSOR_SERVICE_UUID = 0x181a;       // Environmental Sensing
const SENSOR_CHAR_UUID = 0x2a58;          // Analog State
const SENSOR_CONFIG_UUID = 0x2a59;        // Lock/Reset Config State
const SENSOR_THRESHOLD_UUID = 0x2a5a;     // Threshold Config State
const SENSOR_VALUES_CHAR_UUID = 0x2a5b;    // Live Sensor values (6 slots * 2 bytes, slot 6 unused)
const POT_COUNT = 5;                      // Farbtöpfe auf der Palette
const SENSOR_TIMEOUT_CHAR_UUID = 0x2a5c;   // Standby Timeout (2 bytes in minutes)
const BATTERY_SERVICE_UUID = 0x180f;     // Battery Service
const BATTERY_CHAR_UUID = 0x2a19;        // Battery Level

// BLE UUID Constants for Receiver
const RX_CONFIG_SERVICE_UUID = 'e695d730-802c-4740-97eb-30f1d07c08d1';
const RX_VIBRO_ON_CHAR_UUID = 'e695d731-802c-4740-97eb-30f1d07c08d1';
const RX_VIBRO_OFF_CHAR_UUID = 'e695d732-802c-4740-97eb-30f1d07c08d1';
const RX_VIBRO_TEST_CHAR_UUID = 'e695d733-802c-4740-97eb-30f1d07c08d1';
const RX_BATTERY_SERVICE_UUID = 0x180f;
const RX_BATTERY_CHAR_UUID = 0x2a19;

// Palette State
let senderDevice = null;
let senderSensorChar = null;
let senderConfigChar = null;
let senderThresholdChar = null;
let senderSensorValuesChar = null;
let senderTimeoutChar = null;
let senderBatteryChar = null;
let lastStateByte = 0;
let senderIsConnecting = false;

// Receiver State
let receiverDevice = null;
let rxVibroOnChar = null;
let rxVibroOffChar = null;
let rxVibroTestChar = null;
let rxBatteryChar = null;
let receiverIsConnecting = false;

// BLE UUID Constants for GoDice on Receiver
const CONNECTED_BAT_CHAR_UUID = "e695d734-802c-4740-97eb-30f1d07c08d1";
const CONNECTED_NAME_CHAR_UUID = "e695d735-802c-4740-97eb-30f1d07c08d1";
const DIE_TYPE_CHAR_UUID = "e695d736-802c-4740-97eb-30f1d07c08d1";
const LAST_ROLL_CHAR_UUID = "e695d737-802c-4740-97eb-30f1d07c08d1";      // Wert, Typ, Nr., Status, RSSI
const DICE_SETTINGS_CHAR_UUID = "e695d738-802c-4740-97eb-30f1d07c08d1";  // RSSI-Schwelle, D20-Code, Kippen, Bindung
const DICE_INFO_CHAR_UUID = "e695d739-802c-4740-97eb-30f1d07c08d1";      // Lesen: Würfelfarbe, Schreiben 1: blinken

// GoDice on Receiver state variables
let connectedBatChar = null;
let connectedNameChar = null;
let dieTypeChar = null;
let directGoDice = null; // direct GoDice connection
let rxSensorStateChar = null;
let lastRollChar = null;
let diceSettingsChar = null;
let diceInfoChar = null;
let rxDieColor = 0xFF;
let rxDieName = '';
// GoDice-Farbcodes laut Hersteller-SDK
const GODICE_COLORS = {
    0: { name: 'Black', css: '#1b1b1b' },
    1: { name: 'Red', css: '#e5383b' },
    2: { name: 'Green', css: '#2fa84f' },
    3: { name: 'Blue', css: '#2f6fe0' },
    4: { name: 'Yellow', css: '#f2c318' },
    5: { name: 'Orange', css: '#f28c28' },
};
// Was der Empfänger gerade verbunden hat: 'none', 'palette' oder 'dice' (Palette hat Vorrang)
let rxCentralKind = 'none';
let paletteDirectActive = false; // WebApp selbst mit der Palette verbunden
let rxDieMode = 0;               // 0 = Auto, 6 = D6, 20 = D20
// move: D6 bewegt statt gewürfelt -> 0 ignorieren, 1 zählen, 2 zählen + Bewegungssignal
let diceSettings = { rssi: -65, d20Code: 1, move: 0, bind: 0, pulses: 3, pulseMs: 60 };
let diceHistory = [];
let lastRollSeq = -1;
const DICE_HISTORY_LENGTH = 10;

// Shared States
let fullscreenAlertEnabled = false;

// Default Pot Settings
const defaultPots = [
    { name: "Rot", color: "#ff3b30", glow: "rgba(255, 59, 48, 0.4)" },
    { name: "Gelb", color: "#ffcc00", glow: "rgba(255, 204, 0, 0.4)" },
    { name: "Blau", color: "#007aff", glow: "rgba(0, 122, 255, 0.4)" },
    { name: "Grün", color: "#34c759", glow: "rgba(52, 199, 89, 0.4)" },
    { name: "Schwarz", color: "#000000", glow: "rgba(255, 255, 255, 0.15)" }, // Topf 5
    { name: "Weiß", color: "#ffffff", glow: "rgba(255, 255, 255, 0.4)" }      // ungenutzt (Palette hat 5 Töpfe)
];

const COLOR_TRANSLATIONS = {
    'de': ['Rot', 'Gelb', 'Blau', 'Grün', 'Weiß', 'Schwarz'],
    'en': ['Red', 'Yellow', 'Blue', 'Green', 'White', 'Black'],
    'fr': ['Rouge', 'Jaune', 'Bleu', 'Vert', 'Blanc', 'Noir'],
    'es': ['Rojo', 'Amarillo', 'Azul', 'Verde', 'Blanco', 'Negro'],
    'it': ['Rosso', 'Giallo', 'Blu', 'Verde', 'Bianco', 'Nero'],
    'nl': ['Rood', 'Geel', 'Blauw', 'Groen', 'Wit', 'Zwart'],
    'pt': ['Vermelho', 'Amarelo', 'Azul', 'Verde', 'Branco', 'Preto'],
    'pl': ['Czerwony', 'Żółty', 'Niebieski', 'Zielony', 'Biały', 'Czarny'],
    'sv': ['Röd', 'Gul', 'Blå', 'Grön', 'Vit', 'Svart'],
    'tr': ['Kırmızı', 'Sarı', 'Mavi', 'Yeşil', 'Beyaz', 'Siyah'],
    'ru': ['Красный', 'Желтый', 'Синий', 'Зеленый', 'Белый', 'Черный']
};

let potSettings = [...defaultPots];
let currentEditingIndex = null;

function translatePotNamesToLanguage(targetLangCode) {
    if (!targetLangCode) return;
    const langKey = targetLangCode.split('-')[0].toLowerCase();
    const targetList = COLOR_TRANSLATIONS[langKey] || COLOR_TRANSLATIONS['en'];

    let changed = false;
    for (let i = 0; i < POT_COUNT; i++) {
        if (!potSettings[i]) continue;

        const currentName = potSettings[i].name;

        // Farbe anhand des Namens erkennen (unabhängig davon, auf welchem Topf sie liegt)
        let colorIdx = -1;
        for (const key in COLOR_TRANSLATIONS) {
            const idx = COLOR_TRANSLATIONS[key].indexOf(currentName);
            if (idx !== -1) {
                colorIdx = idx;
                break;
            }
        }

        // If it matches a default color name, translate it!
        if (colorIdx !== -1) {
            const newName = targetList[colorIdx];
            if (newName && currentName !== newName) {
                potSettings[i].name = newName;
                changed = true;
            }
        }
    }

    if (changed) {
        saveSettings();
        applySettingsToUI();
    }
}

// Sleep Dial Constants & State
const SLEEP_TIMEOUT_STEPS = [5, 10, 15, 30, 45, 60, 120, 180, 240, 360, 720, 1440];
const SLEEP_TIMEOUT_LABELS = ["5m", "10m", "15m", "30m", "45m", "1h", "2h", "3h", "4h", "6h", "12h", "24h"];
let currentSleepMinutes = 240; // default 4h
let isDraggingSleepDial = false;

// DOM Elements - Tabs
const tabPaletteBtn = document.getElementById('tab-palette-btn');
const tabReceiverBtn = document.getElementById('tab-receiver-btn');
const paletteView = document.getElementById('palette-view');
const receiverView = document.getElementById('receiver-view');
const paletteStatusBox = document.getElementById('palette-status-box');
const receiverStatusBox = document.getElementById('receiver-status-box');

// DOM Elements - Palette BLE
const connectBtn = document.getElementById('connect-btn');
const batteryProgress = document.getElementById('battery-progress');
const batteryValue = document.getElementById('battery-value');
const batteryTooltip = document.getElementById('battery-tooltip');

// DOM Elements - Receiver BLE
const connectRxBtn = document.getElementById('connect-rx-btn');
const rxBatteryProgress = document.getElementById('rx-battery-progress');
const rxBatteryValue = document.getElementById('rx-battery-value');
const rxBatteryTooltip = document.getElementById('rx-battery-tooltip');
const rxStatusText = document.getElementById('rx-status-text');
const rxBatteryText = document.getElementById('rx-battery-text');
const vibroOnSlider = document.getElementById('vibro-on-slider');
const vibroOnVal = document.getElementById('vibro-on-val');
const vibroOffSlider = document.getElementById('vibro-off-slider');
const vibroOffVal = document.getElementById('vibro-off-val');
const testVibroBtn = document.getElementById('test-vibro-btn');
const diceCard = document.getElementById('dice-card');
const diceSettingsCard = document.getElementById('dice-settings-card');
const diceStatePill = document.getElementById('dice-state-pill');
const diceVisual = document.getElementById('dice-visual');
const dieD6 = document.getElementById('die-d6');
const dieD20Number = document.getElementById('die-d20-number');
const diceValueEl = document.getElementById('dice-value');
const diceMovedBadge = document.getElementById('dice-moved-badge');
const diceStatusEl = document.getElementById('dice-status');
const diceTypeChip = document.getElementById('dice-type-chip');
const diceNameChip = document.getElementById('dice-name-chip');
const diceNameText = document.getElementById('dice-name-text');
const dieColorDot = document.getElementById('die-color-dot');
const diceBlinkBtn = document.getElementById('dice-blink-btn');
const diceRssiChip = document.getElementById('dice-rssi-chip');
const diceRssiText = document.getElementById('dice-rssi-text');
const diceBatteryChip = document.getElementById('dice-battery-chip');
const dicePatternEl = document.getElementById('dice-pattern');
const diceHistoryEl = document.getElementById('dice-history');
const dieTypeSeg = document.getElementById('die-type-seg');
const d20CodeSeg = document.getElementById('d20-code-seg');
const diceRssiSlider = document.getElementById('dice-rssi-slider');
const diceRssiVal = document.getElementById('dice-rssi-val');
const diceMoveSeg = document.getElementById('dice-move-seg');
const diceMoveHint = document.getElementById('dice-move-hint');
const moveSignalSettings = document.getElementById('move-signal-settings');
const movePulsesSlider = document.getElementById('move-pulses-slider');
const movePulsesVal = document.getElementById('move-pulses-val');
const moveMsSlider = document.getElementById('move-ms-slider');
const moveMsVal = document.getElementById('move-ms-val');
const diceBindSwitch = document.getElementById('dice-bind-switch');
const diceBindHint = document.getElementById('dice-bind-hint');

// Other common elements
const logContainer = document.getElementById('log-container');
const clearLogBtn = document.getElementById('clear-log-btn');
const notificationToast = document.getElementById('notification-toast');
const editModal = document.getElementById('edit-modal');
const modalPotNameInput = document.getElementById('modal-pot-name');
const saveModalBtn = document.getElementById('save-modal-btn');
const sleepDialKnob = document.getElementById('sleep-dial-knob');
const dialValueText = document.getElementById('dial-value-text');
const sleepDialMarker = document.getElementById('sleep-dial-marker');

// Tabs switching logic
function initTabs() {
    tabPaletteBtn.addEventListener('click', () => {
        tabPaletteBtn.classList.add('active');
        tabReceiverBtn.classList.remove('active');
        paletteView.classList.add('active');
        receiverView.classList.remove('active');
        paletteStatusBox.style.display = 'flex';
        receiverStatusBox.style.display = 'none';
    });

    tabReceiverBtn.addEventListener('click', () => {
        tabReceiverBtn.classList.add('active');
        tabPaletteBtn.classList.remove('active');
        receiverView.classList.add('active');
        paletteView.classList.remove('active');
        receiverStatusBox.style.display = 'flex';
        paletteStatusBox.style.display = 'none';
    });
}

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

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    applySettingsToUI();
    initTabs();
    setupEventListeners();
    initReceiverControls();

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

            // Migrate old generic names to the new default color names
            let migrated = false;
            for (let i = 0; i < POT_COUNT; i++) {
                if (potSettings[i]) {
                    const name = potSettings[i].name;
                    const isGenericName = name === `Pot ${i + 1}` ||
                                          name === `Topf ${i + 1}` ||
                                          name === `Kanal ${i + 1}`;
                    if (isGenericName) {
                        potSettings[i].name = defaultPots[i].name;
                        potSettings[i].color = defaultPots[i].color;
                        potSettings[i].glow = defaultPots[i].glow;
                        migrated = true;
                    }
                }
            }
            // Topf 5 war früher standardmäßig Weiß, jetzt Schwarz
            const old5 = potSettings[4];
            const whiteNames = Object.values(COLOR_TRANSLATIONS).map(list => list[4]);
            if (old5 && old5.color === '#ffffff' && whiteNames.includes(old5.name)) {
                potSettings[4] = { ...defaultPots[4] };
                migrated = true;
            }
            if (migrated) {
                saveSettings();
            }
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
    for (let i = 0; i < POT_COUNT; i++) {
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
    // BLE Connection Click for Palette
    connectBtn.addEventListener('click', () => {
        if (senderDevice && senderDevice.gatt.connected) {
            disconnectSenderBLE();
        } else {
            connectSenderBLE();
        }
    });

    // BLE Connection Click for Receiver
    connectRxBtn.addEventListener('click', () => {
        if (receiverDevice && receiverDevice.gatt.connected) {
            disconnectReceiverBLE();
        } else {
            connectReceiverBLE();
        }
    });

    // Audio Feedback Mode Dropdown Selection
    const audioSelect = document.getElementById('audio-feedback-mode');
    const voiceRow = document.getElementById('speech-voice-row');
    const voiceSelect = document.getElementById('speech-voice-select');

    function updateVoiceRowVisibility() {
        if (!audioSelect || !voiceRow) return;
        const mode = audioSelect.value;
        if (mode === 'speech' || mode === 'names') {
            voiceRow.style.display = 'flex';
            populateVoiceList();
        } else {
            voiceRow.style.display = 'none';
        }
    }

    if (audioSelect) {
        // Load initial state
        const savedMode = localStorage.getItem('davinci_audio_mode') || 'off';
        audioSelect.value = savedMode;
        updateVoiceRowVisibility();

        audioSelect.addEventListener('change', () => {
            const mode = audioSelect.value;
            localStorage.setItem('davinci_audio_mode', mode);
            updateVoiceRowVisibility();

            // Interaction trigger to enable audio / speech synthesis
            if (mode === 'speech') {
                speakNumber(0);
            } else if (mode === 'names') {
                speakText(potSettings[0] ? potSettings[0].name : "Test");
            }
        });
    }

    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            const selectedVoiceURI = voiceSelect.value;
            localStorage.setItem('davinci_speech_voice', selectedVoiceURI);

            const selectedVoice = speechVoices.find(v => v.voiceURI === selectedVoiceURI);
            if (selectedVoice) {
                // Automatically translate default pot names to the selected voice language!
                translatePotNamesToLanguage(selectedVoice.lang);

                // Speak a small test to verify
                const utterance = new SpeechSynthesisUtterance("OK");
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            }
        });
    }

    // Full Screen Alert Toggle
    const fsSwitch = document.getElementById('fullscreen-alert-switch');
    if (fsSwitch) {
        fullscreenAlertEnabled = localStorage.getItem('davinci_fs_alert') === 'true';
        fsSwitch.checked = fullscreenAlertEnabled;

        fsSwitch.addEventListener('change', () => {
            fullscreenAlertEnabled = fsSwitch.checked;
            localStorage.setItem('davinci_fs_alert', fullscreenAlertEnabled);
        });
    }

    // Full Screen Overlay Click Dismiss & Reset Locks
    const fsOverlay = document.getElementById('fullscreen-overlay');
    if (fsOverlay) {
        fsOverlay.addEventListener('click', async () => {
            fsOverlay.classList.remove('active');
            fsOverlay.classList.remove('dice-alert');
            const fsResetHint = document.getElementById('fullscreen-reset-hint');
            if (fsResetHint) fsResetHint.innerText = 'Tap to Reset';

            // Automatically reset locks when dismissed!
            if (senderConfigChar) {
                try {
                    await writeConfigValue(senderConfigChar, 0x02);
                    showToast("All pots unlocked!");
                } catch (err) {
                    console.error("Error sending unlock command:", err);
                }
            }
        });
    }

    if ('speechSynthesis' in window) {
        // Pre-warm voices cache
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                populateVoiceList();
            };
        }
        populateVoiceList();
    }

    // Clear Log Button
    clearLogBtn.addEventListener('click', () => {
        logContainer.innerHTML = '<div class="log-placeholder">Log cleared.</div>';
    });

    // Color dot picker in modal
    const colorDots = document.querySelectorAll('.color-dot');
    const COLOR_HEX_MAP = {
        '#ff3b30': 0,
        '#ffcc00': 1,
        '#007aff': 2,
        '#34c759': 3,
        '#ffffff': 4,
        '#000000': 5
    };
    colorDots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            colorDots.forEach(d => d.classList.remove('active'));
            e.target.classList.add('active');

            // Automatically update name input to correspond to the selected color in the active voice language
            const hexColor = e.target.getAttribute('data-color');
            const colorIdx = COLOR_HEX_MAP[hexColor];
            if (colorIdx !== undefined && modalPotNameInput) {
                const chosenVoice = getChosenVoice();
                const langKey = chosenVoice ? chosenVoice.lang.split('-')[0].toLowerCase() : 'de';
                const targetList = COLOR_TRANSLATIONS[langKey] || COLOR_TRANSLATIONS['en'];
                const colorName = targetList[colorIdx];
                if (colorName) {
                    modalPotNameInput.value = colorName;
                }
            }
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
            if (senderConfigChar) {
                try {
                    const val = lockSwitch.checked ? 0x01 : 0x00;
                    await writeConfigValue(senderConfigChar, val);
                    resetBtn.disabled = !lockSwitch.checked;
                    showToast(lockSwitch.checked ? "Lock active after trigger." : "Multiple triggers allowed.");
                } catch (err) {
                    console.error("Error sending lock status:", err);
                    showToast("Write error: " + err.message);
                    // Reset UI checkbox
                    try {
                        const configVal = await senderConfigChar.readValue();
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
            if (senderConfigChar) {
                try {
                    await writeConfigValue(senderConfigChar, 0x02);
                    showToast("All channels unlocked!");
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
                if (senderConfigChar) {
                    if (confirm("Are you sure you want to turn off the sender? It can only be woken up by connecting USB power.")) {
                        try {
                            await writeConfigValue(senderConfigChar, 0x03);
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
                    if (senderTimeoutChar) {
                        try {
                            const minutes = currentSleepMinutes;
                            const data = new Uint8Array([minutes & 0xff, (minutes >> 8) & 0xff]);
                            await writeConfigValue(senderTimeoutChar, data);
                            const labelIdx = SLEEP_TIMEOUT_STEPS.indexOf(minutes);
                            const label = SLEEP_TIMEOUT_LABELS[labelIdx] || `${minutes}m`;
                            showToast(`Standby timeout set to ${label}`);
                        } catch (err) {
                            console.error("Error writing standby timeout:", err);
                            showToast("Write error: " + err.message);
                            // Reset to actual board value
                            try {
                                const valData = await senderTimeoutChar.readValue();
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
            if (senderThresholdChar) {
                try {
                    const val = parseInt(thresholdSlider.value);
                    const data = new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
                    await writeConfigValue(senderThresholdChar, data);
                    showToast(`Threshold changed to ${val}.`);
                } catch (err) {
                    console.error("Error sending threshold:", err);
                    showToast("Write error: " + err.message);
                    // Reset slider
                    try {
                        const valData = await senderThresholdChar.readValue();
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

let speechVoices = [];

function populateVoiceList() {
    if (!('speechSynthesis' in window)) return;

    speechVoices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('speech-voice-select');
    if (!voiceSelect) return;

    // Clear previous options
    voiceSelect.innerHTML = '';

    // Sort voices by language then name
    speechVoices.sort((a, b) => {
        if (a.lang < b.lang) return -1;
        if (a.lang > b.lang) return 1;
        return a.name.localeCompare(b.name);
    });

    const savedVoiceURI = localStorage.getItem('davinci_speech_voice');
    let selectedIdx = 0;

    speechVoices.forEach((voice, idx) => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;

        if (voice.voiceURI === savedVoiceURI) {
            selectedIdx = idx;
        }
        voiceSelect.appendChild(option);
    });

    if (speechVoices.length > 0) {
        voiceSelect.selectedIndex = selectedIdx;
        const activeVoice = speechVoices[selectedIdx];
        if (activeVoice) {
            translatePotNamesToLanguage(activeVoice.lang);
        }
    }
}

function getChosenVoice() {
    if (!('speechSynthesis' in window) || speechVoices.length === 0) return null;
    const savedVoiceURI = localStorage.getItem('davinci_speech_voice');
    if (savedVoiceURI) {
        const voice = speechVoices.find(v => v.voiceURI === savedVoiceURI);
        if (voice) return voice;
    }
    // Fallback: try to find an English voice or the first available voice
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

function speakNumber(index) {
    if (!('speechSynthesis' in window)) {
        console.warn("Speech Synthesis is not supported in this browser");
        return;
    }
    window.speechSynthesis.cancel();

    const ENGLISH_NUMBERS = ["One", "Two", "Three", "Four", "Five", "Six"];
    let text = ENGLISH_NUMBERS[index] || (index + 1).toString();
    const utterance = new SpeechSynthesisUtterance(text);

    const chosenVoice = getChosenVoice();
    if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;

        // Translate number dynamically if voice language matches common ones
        if (chosenVoice.lang.startsWith('de')) {
            const DE_NUMBERS = ["Eins", "Zwei", "Drei", "Vier", "Fünf", "Sechs"];
            utterance.text = DE_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('fr')) {
            const FR_NUMBERS = ["Un", "Deux", "Trois", "Quatre", "Cinq", "Six"];
            utterance.text = FR_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('es')) {
            const ES_NUMBERS = ["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis"];
            utterance.text = ES_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('it')) {
            const IT_NUMBERS = ["Uno", "Due", "Tre", "Quattro", "Cinque", "Sei"];
            utterance.text = IT_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('pl')) {
            const PL_NUMBERS = ["Jeden", "Dwa", "Trzy", "Cztery", "Pięć", "Sześć"];
            utterance.text = PL_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('sv')) {
            const SV_NUMBERS = ["Ett", "Två", "Tre", "Fyra", "Fem", "Sex"];
            utterance.text = SV_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('tr')) {
            const TR_NUMBERS = ["Bir", "İki", "Üç", "Dört", "Beş", "Altı"];
            utterance.text = TR_NUMBERS[index] || utterance.text;
        } else if (chosenVoice.lang.startsWith('ru')) {
            const RU_NUMBERS = ["Один", "Два", "Три", "Четыре", "Пять", "Шесть"];
            utterance.text = RU_NUMBERS[index] || utterance.text;
        }
    } else {
        utterance.lang = 'en-US';
    }

    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const chosenVoice = getChosenVoice();
    if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
    } else {
        utterance.lang = 'en-US';
    }

    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

function triggerAudioFeedback(index) {
    const audioSelect = document.getElementById('audio-feedback-mode');
    if (!audioSelect) return;

    const mode = audioSelect.value;
    if (mode === 'speech') {
        speakNumber(index);
    } else if (mode === 'names') {
        const potName = potSettings[index] ? potSettings[index].name : `Channel ${index + 1}`;
        speakText(potName);
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

// Web Bluetooth Logic for Palette (Sender)
async function connectSenderBLE() {
    if (senderIsConnecting) return;
    senderIsConnecting = true;
    updateConnectButtonState('connecting', 'Connecting...');

    try {
        console.log("Searching for Sender BLE devices...");
        senderDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [SENSOR_SERVICE_UUID] },
                { namePrefix: 'Davinci' },
                { namePrefix: 'Davinic' },
                { namePrefix: 'dav' },
                { namePrefix: 'Dav' },
                { namePrefix: 'GoDice_' }
            ],
            optionalServices: [
                SENSOR_SERVICE_UUID,
                BATTERY_SERVICE_UUID,
                '6e400001-b5a3-f393-e0a9-e50e24dcca9e' // GoDice service UUID
            ]
        });

        senderDevice.addEventListener('gattserverdisconnected', onSenderDisconnected);

        // Check if direct GoDice connection is needed
        if (senderDevice.name && senderDevice.name.startsWith('GoDice_')) {
            console.log("Connecting directly to GoDice...");
            directGoDice = new GoDice();

            directGoDice.onDiceConnected = (diceId, diceInstance) => {
                console.log("GoDice connected directly:", diceId);
                showToast("Connected directly to: " + senderDevice.name);
                updateConnectButtonState('connected', 'Connected');
                senderIsConnecting = false;

                // Fetch initial battery
                setTimeout(() => {
                    diceInstance.getBatteryLevel();
                    diceInstance.pulseLed(2, 20, 20, [16, 185, 129]);
                }, 500);
            };

            directGoDice.onBatteryLevel = (diceId, batteryLevel) => {
                let percentage = batteryLevel;
                if (percentage > 100) percentage = 100;
                updateBatteryUI(percentage);
            };

            directGoDice.onRollStart = (diceId) => {
                console.log("Direct GoDice is rolling...");
                setDiceCardState('rolling');
            };

            directGoDice.onStable = (diceId, value, xyz) => { handleDirectRoll(xyz); };
            directGoDice.onTiltStable = (diceId, xyz, value) => { handleDirectRoll(xyz, true); };
            directGoDice.onMoveStable = (diceId, value, xyz) => { handleDirectRoll(xyz, true); };
            directGoDice.onFakeStable = (diceId, value, xyz) => { handleDirectRoll(xyz, true); };

            directGoDice.onDiceDisconnected = () => {
                showToast("Direct GoDice disconnected!");
                resetSenderState();
            };

            await directGoDice.attachDevice(senderDevice);
            return;
        }

        console.log("Connecting to GATT Server...");
        const server = await senderDevice.gatt.connect();

        // 1. Get Environmental Sensing Service (Sensors)
        console.log("Getting Sensor Service...");
        const sensorService = await server.getPrimaryService(SENSOR_SERVICE_UUID);
        senderSensorChar = await sensorService.getCharacteristic(SENSOR_CHAR_UUID);

        // Start notifications for sensor characteristic
        await senderSensorChar.startNotifications();
        senderSensorChar.addEventListener('characteristicvaluechanged', handleSensorNotification);

        // Get Configuration Characteristic
        try {
            console.log("Getting Configuration Characteristic...");
            senderConfigChar = await sensorService.getCharacteristic(SENSOR_CONFIG_UUID);

            const configVal = await senderConfigChar.readValue();
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
            senderThresholdChar = await sensorService.getCharacteristic(SENSOR_THRESHOLD_UUID);

            const valData = await senderThresholdChar.readValue();
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
            senderSensorValuesChar = await sensorService.getCharacteristic(SENSOR_VALUES_CHAR_UUID);

            await senderSensorValuesChar.startNotifications();
            senderSensorValuesChar.addEventListener('characteristicvaluechanged', handleValuesNotification);
        } catch (valuesError) {
            console.warn("Live sensor values characteristic not available:", valuesError);
        }

        // Get Standby Timeout Characteristic
        try {
            console.log("Getting Standby Timeout Characteristic...");
            senderTimeoutChar = await sensorService.getCharacteristic(SENSOR_TIMEOUT_CHAR_UUID);

            const valData = await senderTimeoutChar.readValue();
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
            senderBatteryChar = await batteryService.getCharacteristic(BATTERY_CHAR_UUID);

            const batValue = await senderBatteryChar.readValue();
            updateBatteryUI(batValue.getUint8(0));

            await senderBatteryChar.startNotifications();
            senderBatteryChar.addEventListener('characteristicvaluechanged', handleBatteryNotification);
        } catch (batError) {
            console.warn("Battery service not available or failed to subscribe:", batError);
        }

        console.log("Successfully connected!");
        updateConnectButtonState('connected', 'Connected');
        showToast("Connected to Davinci Color!");

        const initialVal = await senderSensorChar.readValue();
        parseStateByte(initialVal.getUint8(0));

    } catch (error) {
        console.error("BLE connection error:", error);
        showToast("Connection error: " + error.message);
        resetSenderState();
    } finally {
        senderIsConnecting = false;
    }
}

function disconnectSenderBLE() {
    if (directGoDice) {
        directGoDice.onDisconnectButtonClick();
        directGoDice = null;
    }
    if (senderDevice && senderDevice.gatt.connected) {
        senderDevice.gatt.disconnect();
    }
}

function onSenderDisconnected() {
    showToast("Connection to sender lost!");
    resetSenderState();
}

function resetSenderState() {
    senderDevice = null;
    senderSensorChar = null;
    senderConfigChar = null;
    senderThresholdChar = null;
    senderSensorValuesChar = null;
    senderBatteryChar = null;
    lastStateByte = 0;

    if (directGoDice) {
        directGoDice = null;
    }

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
    updateSleepDialUI(240);
    senderTimeoutChar = null;
    const thresholdSlider = document.getElementById('threshold-slider');

    const fsOverlay = document.getElementById('fullscreen-overlay');
    if (fsOverlay) {
        fsOverlay.classList.remove('active');
    }
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdSlider) thresholdSlider.disabled = true;
    if (thresholdVal) thresholdVal.innerText = '--';

    // Set all cards to inactive and clear value labels
    for (let i = 0; i < POT_COUNT; i++) {
        const card = document.getElementById(`pot-${i}`);
        const statusText = document.getElementById(`pot-status-${i}`);
        const valueText = document.getElementById(`pot-value-${i}`);
        if (card) card.classList.remove('active');
        if (statusText) statusText.innerText = 'Ready';
        if (valueText) valueText.innerText = '--';
    }
}

// Direkt verbundener Würfel: Typ und Zahl wie im Empfänger aus der Lage berechnen
// Wie in der Firmware: beim D20 ist Tilt/Move das normale Ergebnis, beim D6 heißt es "bewegt"
function handleDirectRoll(xyz, isTilt = false) {
    if (!xyz) return;
    const { value, type } = dieFromXyz(xyz, rxDieMode);
    const moved = isTilt && type !== 20;
    if (moved && diceSettings.move === 0) return;
    console.log("GoDice directly rolled:", value, "D" + type, moved ? "(moved)" : "");
    lastRollSeq = -1;
    showDiceRoll(value, type, null, moved);
}

function nearestFace(table, xyz) {
    let best = Number.MAX_SAFE_INTEGER;
    let face = 0;
    for (const key in table) {
        const v = table[key];
        const d = (xyz[0] - v[0]) ** 2 + (xyz[1] - v[1]) ** 2 + (xyz[2] - v[2]) ** 2;
        if (d < best) { best = d; face = parseInt(key); }
    }
    return { face, dist: best };
}

function dieFromXyz(xyz, mode) {
    const d6 = nearestFace(GoDice.d6Vectors, xyz);
    const d20 = nearestFace(GoDice.d20Vectors, xyz);
    const type = mode === 0 ? (d20.dist < d6.dist ? 20 : 6) : mode;
    return { value: type === 20 ? d20.face : d6.face, type };
}

function updateConnectButtonState(state, text) {
    paletteDirectActive = state === 'connected' && !directGoDice;
    updateDiceSectionVisibility();
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

// Data Processing for Palette (Sender)
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
        for (let i = 0; i < POT_COUNT; i++) {
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
    for (let i = 0; i < POT_COUNT; i++) {
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

                if (fullscreenAlertEnabled) {
                    showFullscreenAlert(i);
                }
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

    if (stateByte === 0) {
        const fsOverlay = document.getElementById('fullscreen-overlay');
        if (fsOverlay) {
            fsOverlay.classList.remove('active');
        }
    }
    lastStateByte = stateByte;
}

// --- Full Screen Alert ---
function showFullscreenAlert(index) {
    const config = potSettings[index];
    const fsOverlay = document.getElementById('fullscreen-overlay');
    const fsName = document.getElementById('fullscreen-name');
    const fsResetHint = document.getElementById('fullscreen-reset-hint');

    if (fsOverlay && fsName && fsResetHint) {
        fsOverlay.classList.remove('dice-alert');
        const fsMoved = document.getElementById('fullscreen-moved');
        if (fsMoved) fsMoved.hidden = true;
        fsResetHint.innerText = 'Tap to Reset';
        fsOverlay.style.backgroundColor = config.color;
        fsName.innerText = config.name;

        const isLight = isLightColor(config.color);
        fsName.style.color = isLight ? '#000000' : '#ffffff';
        fsResetHint.style.color = isLight ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
        fsResetHint.style.borderColor = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
        fsResetHint.style.background = isLight ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';

        fsOverlay.classList.add('active');
    }
}

function isLightColor(hex) {
    if (!hex || hex.length < 7) return false;
    const rgb = parseInt(hex.substring(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma > 180;
}

// --- Receiver BLE Connection & Interaction ---
async function connectReceiverBLE() {
    if (receiverIsConnecting) return;
    receiverIsConnecting = true;
    updateRxConnectButtonState('connecting', 'Connecting...');

    try {
        console.log("Searching for Receiver BLE device...");
        receiverDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { name: 'Davinci_Receiver' },
                { services: [RX_CONFIG_SERVICE_UUID] }
            ],
            optionalServices: [RX_CONFIG_SERVICE_UUID, RX_BATTERY_SERVICE_UUID, SENSOR_SERVICE_UUID]
        });

        receiverDevice.addEventListener('gattserverdisconnected', onRxDisconnected);

        console.log("Connecting to Receiver GATT Server...");
        const server = await receiverDevice.gatt.connect();

        // 1. Get Config Service
        console.log("Getting Receiver Config Service...");
        const rxConfigService = await server.getPrimaryService(RX_CONFIG_SERVICE_UUID);

        // Get Vibro ON characteristic
        try {
            rxVibroOnChar = await rxConfigService.getCharacteristic(RX_VIBRO_ON_CHAR_UUID);
            const valData = await rxVibroOnChar.readValue();
            const val = valData.getUint16(0, true);
            vibroOnSlider.value = val;
            vibroOnSlider.disabled = false;
            vibroOnVal.innerText = `${val} ms`;
        } catch (err) {
            console.error("Vibro ON characteristic not available:", err);
        }

        // Get Vibro OFF characteristic
        try {
            rxVibroOffChar = await rxConfigService.getCharacteristic(RX_VIBRO_OFF_CHAR_UUID);
            const valData = await rxVibroOffChar.readValue();
            const val = valData.getUint16(0, true);
            vibroOffSlider.value = val;
            vibroOffSlider.disabled = false;
            vibroOffVal.innerText = `${val} ms`;
        } catch (err) {
            console.error("Vibro OFF characteristic not available:", err);
        }

        // Get Vibro TEST characteristic
        try {
            rxVibroTestChar = await rxConfigService.getCharacteristic(RX_VIBRO_TEST_CHAR_UUID);
        } catch (err) {
            console.error("Vibro TEST characteristic not available:", err);
        }

        // Get Connected GoDice Characteristics (Optional)
        try {
            connectedBatChar = await rxConfigService.getCharacteristic(CONNECTED_BAT_CHAR_UUID);
            const val = await connectedBatChar.readValue();
            updateSubBatteryUI(val.getUint8(0));

            await connectedBatChar.startNotifications();
            connectedBatChar.addEventListener('characteristicvaluechanged', handleSubBatteryNotification);
        } catch (err) {
            console.warn("Connected battery characteristic not available:", err);
        }

        try {
            connectedNameChar = await rxConfigService.getCharacteristic(CONNECTED_NAME_CHAR_UUID);
            const val = await connectedNameChar.readValue();
            const name = new TextDecoder().decode(val);
            updateConnectedDeviceName(name);
        } catch (err) {
            console.warn("Connected name characteristic not available:", err);
        }

        try {
            if (connectedNameChar) {
                await connectedNameChar.startNotifications();
                connectedNameChar.addEventListener('characteristicvaluechanged', (event) => {
                    updateConnectedDeviceName(new TextDecoder().decode(event.target.value));
                });
            }
        } catch (err) {
            console.warn("Connected name notifications not available (older receiver firmware):", err);
        }

        try {
            dieTypeChar = await rxConfigService.getCharacteristic(DIE_TYPE_CHAR_UUID);
            const val = await dieTypeChar.readValue();
            rxDieMode = val.getUint8(0);
            setSegValue(dieTypeSeg, rxDieMode);
            setSegEnabled(dieTypeSeg, true);
        } catch (err) {
            console.warn("Die type characteristic not available:", err);
        }

        try {
            diceSettingsChar = await rxConfigService.getCharacteristic(DICE_SETTINGS_CHAR_UUID);
            applyDiceSettings(await diceSettingsChar.readValue());
            setDiceSettingsEnabled(true);
        } catch (err) {
            console.warn("Dice settings characteristic not available (older receiver firmware):", err);
        }

        try {
            diceInfoChar = await rxConfigService.getCharacteristic(DICE_INFO_CHAR_UUID);
            updateDieColor((await diceInfoChar.readValue()).getUint8(0));
            await diceInfoChar.startNotifications();
            diceInfoChar.addEventListener('characteristicvaluechanged', (event) => {
                updateDieColor(event.target.value.getUint8(0));
            });
        } catch (err) {
            console.warn("Dice info characteristic not available (older receiver firmware):", err);
        }

        try {
            lastRollChar = await rxConfigService.getCharacteristic(LAST_ROLL_CHAR_UUID);
            const val = await lastRollChar.readValue();
            lastRollSeq = val.byteLength >= 3 ? val.getUint8(2) : -1; // alten Wurf nicht erneut melden
            await lastRollChar.startNotifications();
            lastRollChar.addEventListener('characteristicvaluechanged', handleLastRollNotification);
        } catch (err) {
            console.warn("Last roll characteristic not available (older receiver firmware):", err);
        }

        // 2. Get Battery Service
        try {
            console.log("Getting Receiver Battery Service...");
            const batteryService = await server.getPrimaryService(RX_BATTERY_SERVICE_UUID);
            rxBatteryChar = await batteryService.getCharacteristic(RX_BATTERY_CHAR_UUID);

            const batValue = await rxBatteryChar.readValue();
            updateRxBatteryUI(batValue.getUint8(0));

            await rxBatteryChar.startNotifications();
            rxBatteryChar.addEventListener('characteristicvaluechanged', handleRxBatteryNotification);
        } catch (batError) {
            console.warn("Receiver battery service not available or failed to subscribe:", batError);
        }

        // 3. Get Sensor Service on Receiver (Optional - for GoDice rolls)
        try {
            console.log("Getting Receiver Sensor Service...");
            const sensorService = await server.getPrimaryService(SENSOR_SERVICE_UUID);
            rxSensorStateChar = await sensorService.getCharacteristic(SENSOR_CHAR_UUID);

            await rxSensorStateChar.startNotifications();
            rxSensorStateChar.addEventListener('characteristicvaluechanged', handleRxSensorNotification);
        } catch (sensorErr) {
            console.warn("Receiver sensor service not available or failed to subscribe:", sensorErr);
        }

        console.log("Receiver successfully connected!");
        updateRxConnectButtonState('connected', 'Connected');
        rxStatusText.innerText = "Connected";
        rxStatusText.style.color = "var(--accent-connect)";
        showToast("Connected to Davinci Receiver!");

    } catch (error) {
        console.error("Receiver BLE connection error:", error);
        showToast("Connection error: " + error.message);
        resetRxState();
    } finally {
        receiverIsConnecting = false;
    }
}

function disconnectReceiverBLE() {
    if (receiverDevice && receiverDevice.gatt.connected) {
        receiverDevice.gatt.disconnect();
    }
}

function onRxDisconnected() {
    showToast("Connection to receiver lost!");
    resetRxState();
}

function resetRxState() {
    receiverDevice = null;
    rxVibroOnChar = null;
    rxVibroOffChar = null;
    rxVibroTestChar = null;
    rxBatteryChar = null;

    if (rxSensorStateChar) {
        try {
            rxSensorStateChar.removeEventListener('characteristicvaluechanged', handleRxSensorNotification);
        } catch (e) {}
        rxSensorStateChar = null;
    }
    // GoDice on receiver cleanup
    connectedBatChar = null;
    connectedNameChar = null;
    dieTypeChar = null;
    lastRollChar = null;
    diceSettingsChar = null;
    diceInfoChar = null;
    rxDieColor = 0xFF;
    setSegEnabled(dieTypeSeg, false);
    setDiceSettingsEnabled(false);

    updateRxConnectButtonState('disconnected', 'Connect Rx');
    rxStatusText.innerText = "Disconnected";
    rxStatusText.style.color = "var(--accent-disconnect)";
    rxBatteryText.innerText = "-- %";

    // Reset battery rings
    rxBatteryProgress.style.strokeDasharray = "0, 100";
    rxBatteryValue.innerText = "--%";
    rxBatteryTooltip.setAttribute('data-tooltip', 'Receiver battery unknown');

    // Disable sliders and GoDice select
    vibroOnSlider.disabled = true;
    vibroOffSlider.disabled = true;
    vibroOnVal.innerText = "-- ms";
    vibroOffVal.innerText = "-- ms";

    updateConnectedDeviceName('None');
    setDiceCardState('offline');
}

function updateSubBatteryUI(level) {
    // Gilt für das Gerät, das der Empfänger verbunden hat; angezeigt wird es nur beim Würfel
    if (diceBatteryChip) {
        diceBatteryChip.innerText = `Battery ${level}%`;
        diceBatteryChip.hidden = !(rxCentralKind === 'dice' && level > 0);
    }
}

function handleSubBatteryNotification(event) {
    const level = event.target.value.getUint8(0);
    updateSubBatteryUI(level);
}

function updateConnectedDeviceName(name) {
    const clean = (name || '').replace(/\0/g, '').trim();
    if (!clean || clean === 'None') {
        rxCentralKind = 'none';
    } else if (clean.startsWith('GoDice')) {
        rxCentralKind = 'dice';
    } else {
        rxCentralKind = 'palette';
    }
    rxDieName = clean;
    if (rxCentralKind !== 'dice') rxDieColor = 0xFF;
    renderDieIdentity();
    updateDiceSectionVisibility();
    if (diceBatteryChip && rxCentralKind !== 'dice') diceBatteryChip.hidden = true;
    if (diceRssiChip && rxCentralKind !== 'dice') diceRssiChip.hidden = true;

    if (!receiverDevice) {
        setDiceCardState('offline');
    } else if (rxCentralKind === 'dice') {
        setDiceCardState('connected');
    } else if (rxCentralKind === 'palette') {
        setDiceCardState('palette');
    } else {
        setDiceCardState('searching');
    }
    updateBindHint();
}

// ---------- Würfel-Karte ----------
// Ist die Palette aktiv (am Empfänger oder direkt an der WebApp), wird kein Würfel genutzt:
// GoDice-Karte und GoDice-Einstellungen werden dann ausgeblendet.
function updateDiceSectionVisibility() {
    const paletteActive = rxCentralKind === 'palette' || paletteDirectActive;
    if (diceCard) diceCard.hidden = paletteActive;
    if (diceSettingsCard) diceSettingsCard.hidden = paletteActive;
}

// Farbe und Kennung des verbundenen Würfels, damit man sieht, welcher es ist
function renderDieIdentity() {
    const isDice = rxCentralKind === 'dice';
    if (diceNameChip) diceNameChip.hidden = !isDice;
    if (diceBlinkBtn) diceBlinkBtn.hidden = !(isDice && diceInfoChar);
    if (!isDice) return;
    const color = GODICE_COLORS[rxDieColor];
    // GoDice_<ID>_<Farbe>_v<Version>: die ID unterscheidet Würfel gleicher Farbe
    const idPart = rxDieName.replace(/^GoDice_?/, '').split('_')[0] || rxDieName;
    if (diceNameText) diceNameText.innerText = color ? `${color.name} · ${idPart}` : rxDieName.replace(/_v\d+$/, '');
    if (diceNameChip) diceNameChip.title = rxDieName;
    if (dieColorDot) {
        dieColorDot.classList.toggle('known', !!color);
        dieColorDot.style.background = color ? color.css : 'transparent';
    }
}

function updateDieColor(code) {
    rxDieColor = code;
    renderDieIdentity();
}
const DICE_STATE_TEXT = {
    offline:   { pill: 'Receiver offline', status: 'Connect the receiver to see rolls.' },
    searching: { pill: 'Searching', status: 'Looking for a GoDice nearby...' },
    palette:   { pill: 'Palette active', status: 'The palette has priority. Switch it off to use the die.' },
    connected: { pill: 'Connected', status: 'Roll the die.' },
    rolling:   { pill: 'Rolling', status: 'Rolling...' },
};

function setDiceCardState(state) {
    if (!diceCard) return;
    diceCard.dataset.state = state;
    const text = DICE_STATE_TEXT[state] || DICE_STATE_TEXT.offline;
    if (diceStatePill) diceStatePill.innerText = text.pill;
    // Nach einem Wurf bleibt die Ergebniszeile stehen, bis wieder gerollt wird
    if (diceStatusEl && !(state === 'connected' && diceHistory.length > 0)) {
        diceStatusEl.innerText = text.status;
    }
}

function renderDieFace(value, type) {
    if (!diceVisual) return;
    diceVisual.dataset.type = String(type);
    if (type === 20) {
        if (dieD20Number) dieD20Number.textContent = String(value);
    } else if (dieD6) {
        dieD6.dataset.face = String(value);
    }
}

// Gleiche Regeln wie die Firmware: D20 mit Zehnercode = pro Zehner lang, dann die Einer kurz
function renderVibrationPattern(value, type, moved = false) {
    if (!dicePatternEl) return;
    const tensCode = type === 20 && diceSettings.d20Code === 1;
    let html = '';
    let label;
    if (tensCode && value >= 10) {
        const tens = Math.floor(value / 10);
        const ones = value % 10;
        html += '<i class="long"></i>'.repeat(tens);
        if (ones > 0) html += '<i class="gap"></i>' + '<i class="short"></i>'.repeat(ones);
        label = ones > 0 ? `${tens} long + ${ones} short` : `${tens} long`;
    } else {
        html += '<i class="short"></i>'.repeat(value);
        label = `${value} short`;
    }
    if (moved && diceSettings.move === 2) {
        html += '<i class="gap"></i>' + '<i class="signal"></i>'.repeat(diceSettings.pulses);
        label += ` + ${diceSettings.pulses} fast`;
    }
    dicePatternEl.innerHTML = html + `<small>${label}</small>`;
}

function renderDiceHistory() {
    if (!diceHistoryEl) return;
    diceHistoryEl.innerHTML = diceHistory.map(r =>
        `<span class="${r.moved ? 'moved' : ''}" title="D${r.type}${r.moved ? ' · moved' : ''}">${r.value}</span>`
    ).join('');
}

function updateRssiChip(rssi) {
    if (!diceRssiChip) return;
    if (!rssi || rssi >= 0 || rxCentralKind !== 'dice') {
        diceRssiChip.hidden = true;
        return;
    }
    diceRssiChip.hidden = false;
    if (diceRssiText) diceRssiText.innerText = `${rssi} dBm`;
    const level = rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : 1;
    diceRssiChip.querySelectorAll('.rssi-bars i').forEach((bar, i) => bar.classList.toggle('on', i < level));
}

function showDiceRoll(value, type, rssi, moved = false) {
    if (!value) return;
    renderDieFace(value, type);
    if (diceValueEl) {
        diceValueEl.innerText = String(value);
        diceValueEl.classList.remove('pop');
        void diceValueEl.offsetWidth; // Animation neu starten
        diceValueEl.classList.add('pop');
    }
    if (diceTypeChip) {
        diceTypeChip.innerText = rxDieMode === 0 ? `D${type} · auto` : `D${type}`;
        diceTypeChip.hidden = false;
    }
    updateRssiChip(rssi);
    renderVibrationPattern(value, type, moved);
    diceHistory.unshift({ value, type, moved });
    diceHistory = diceHistory.slice(0, DICE_HISTORY_LENGTH);
    renderDiceHistory();
    setDiceCardState('connected');
    if (diceStatusEl) {
        diceStatusEl.innerText = moved
            ? `Moved, not rolled. Now showing ${value}.`
            : `Rolled ${value} on a D${type}.`;
    }

    // Hinweis auf die Bewegung nur im Modus "Signal", passend zum Vibrationssignal
    const signalMove = moved && diceSettings.move === 2;
    if (diceMovedBadge) diceMovedBadge.hidden = !signalMove;
    triggerDiceAudio(value, signalMove);
    if (fullscreenAlertEnabled) showDiceFullscreen(value, signalMove);
}

// "Bewegt" in der Sprache der gewählten Stimme
const MOVED_WORDS = {
    de: 'bewegt', en: 'moved', fr: 'déplacé', es: 'movido', it: 'spostato', nl: 'verplaatst',
    pt: 'movido', pl: 'przesunięty', sv: 'flyttad', tr: 'oynatıldı', ru: 'сдвинут',
};

function triggerDiceAudio(value, signalMove = false) {
    const audioSelect = document.getElementById('audio-feedback-mode');
    if (!audioSelect || audioSelect.value === 'off') return;
    let text = String(value);
    if (signalMove) {
        const voice = getChosenVoice();
        const lang = voice ? voice.lang.split('-')[0].toLowerCase() : 'en';
        // Komma statt Punkt: "6." liest die deutsche Stimme als Ordnungszahl ("sechste")
        text += ', ' + (MOVED_WORDS[lang] || MOVED_WORDS.en);
    }
    speakText(text);
}

function showDiceFullscreen(value, signalMove = false) {
    const fsOverlay = document.getElementById('fullscreen-overlay');
    const fsName = document.getElementById('fullscreen-name');
    const fsResetHint = document.getElementById('fullscreen-reset-hint');
    const fsMoved = document.getElementById('fullscreen-moved');
    if (!fsOverlay || !fsName || !fsResetHint) return;
    if (fsMoved) fsMoved.hidden = !signalMove;
    fsOverlay.style.backgroundColor = '#1a1308';
    fsOverlay.classList.add('dice-alert');
    fsName.innerText = String(value);
    fsName.style.color = '#dfc070';
    fsResetHint.innerText = 'Tap to close';
    fsResetHint.style.color = 'rgba(255, 255, 255, 0.6)';
    fsResetHint.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    fsResetHint.style.background = 'rgba(0, 0, 0, 0.3)';
    fsOverlay.classList.add('active');
}

function handleLastRollNotification(event) {
    const data = event.target.value;
    if (data.byteLength < 4) return;
    const value = data.getUint8(0);
    const type = data.getUint8(1) === 20 ? 20 : 6;
    const seq = data.getUint8(2);
    const status = data.getUint8(3);
    const rssi = data.byteLength >= 5 ? data.getInt8(4) : 0;

    if (status === 1) {
        setDiceCardState('rolling');
        updateRssiChip(rssi);
        return;
    }
    if ((status === 2 || status === 3) && seq !== lastRollSeq) {
        lastRollSeq = seq;
        showDiceRoll(value, type, rssi, status === 3);
    }
}

// ---------- Würfel-Einstellungen ----------
function setSegValue(seg, value) {
    if (!seg) return;
    seg.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.value) === value);
    });
}

function setSegEnabled(seg, enabled) {
    if (!seg) return;
    seg.querySelectorAll('button').forEach(btn => { btn.disabled = !enabled; });
}

function setDiceSettingsEnabled(enabled) {
    setSegEnabled(d20CodeSeg, enabled);
    setSegEnabled(diceMoveSeg, enabled);
    if (diceRssiSlider) diceRssiSlider.disabled = !enabled;
    if (movePulsesSlider) movePulsesSlider.disabled = !enabled;
    if (moveMsSlider) moveMsSlider.disabled = !enabled;
    if (!enabled && diceRssiVal) diceRssiVal.innerText = '-- dBm';
    updateBindHint();
}

function applyDiceSettings(dataView) {
    if (!dataView || dataView.byteLength < 4) return;
    diceSettings = {
        rssi: dataView.getInt8(0),
        d20Code: dataView.getUint8(1),
        move: Math.min(dataView.getUint8(2), 2),
        bind: dataView.getUint8(3),
        pulses: dataView.byteLength >= 6 ? dataView.getUint8(4) : 3,
        pulseMs: dataView.byteLength >= 6 ? dataView.getUint8(5) : 60,
    };
    setSegValue(d20CodeSeg, diceSettings.d20Code);
    if (diceRssiSlider) diceRssiSlider.value = diceSettings.rssi;
    if (diceRssiVal) diceRssiVal.innerText = `${diceSettings.rssi} dBm`;
    if (movePulsesSlider) movePulsesSlider.value = diceSettings.pulses;
    if (moveMsSlider) moveMsSlider.value = diceSettings.pulseMs;
    renderMoveSettings();
    if (diceBindSwitch) diceBindSwitch.checked = diceSettings.bind === 1;
    updateBindHint();
}

const MOVE_HINTS = [
    'Ignore: only real rolls count.',
    'Count: moving the die counts like a roll.',
    'Signal: the receiver buzzes the number, then fast pulses so you know the die was moved.',
];

function renderMoveSettings() {
    setSegValue(diceMoveSeg, diceSettings.move);
    if (diceMoveHint) diceMoveHint.innerText = MOVE_HINTS[diceSettings.move] || MOVE_HINTS[0];
    if (moveSignalSettings) moveSignalSettings.hidden = diceSettings.move !== 2;
    if (movePulsesVal) movePulsesVal.innerText = String(diceSettings.pulses);
    if (moveMsVal) moveMsVal.innerText = `${diceSettings.pulseMs} ms`;
}

function updateBindHint() {
    if (!diceBindSwitch || !diceBindHint) return;
    const canBind = !!diceSettingsChar && (diceSettings.bind === 1 || rxCentralKind === 'dice');
    diceBindSwitch.disabled = !canBind;
    if (!diceSettingsChar) {
        diceBindHint.innerText = 'Connect the receiver to change GoDice settings.';
    } else if (diceSettings.bind === 1) {
        diceBindHint.innerText = 'The receiver only connects to the remembered die.';
    } else if (rxCentralKind === 'dice') {
        diceBindHint.innerText = 'Turn on to remember the connected die and ignore all others.';
    } else {
        diceBindHint.innerText = 'Connect a GoDice to remember it.';
    }
}

async function writeDiceSettings() {
    if (!diceSettingsChar) return;
    const data = new Uint8Array([
        diceSettings.rssi & 0xff,
        diceSettings.d20Code,
        diceSettings.move,
        diceSettings.bind,
        diceSettings.pulses,
        diceSettings.pulseMs,
    ]);
    try {
        await writeConfigValue(diceSettingsChar, data);
        applyDiceSettings(await diceSettingsChar.readValue());
    } catch (err) {
        console.error("Error writing dice settings:", err);
        showToast("Write error: " + err.message);
    }
}

function updateRxConnectButtonState(state, text) {
    connectRxBtn.className = `connect-btn ${state}`;
    connectRxBtn.querySelector('.btn-text').innerText = text;

    const icon = connectRxBtn.querySelector('.btn-icon');
    if (state === 'connected') {
        icon.innerText = '🟢';
    } else if (state === 'connecting') {
        icon.innerText = '⏳';
    } else {
        icon.innerText = '⚡';
    }
}

function handleRxBatteryNotification(event) {
    const level = event.target.value.getUint8(0);
    updateRxBatteryUI(level);
}

// Der Empfänger leitet die Topf-Zustände der Palette weiter. Würfelwürfe kommen über LAST_ROLL_CHAR_UUID.
function handleRxSensorNotification(event) {
    if (rxCentralKind === 'palette') {
        parseStateByte(event.target.value.getUint8(0));
    }
}

function updateRxBatteryUI(level) {
    rxBatteryProgress.style.strokeDasharray = `${level}, 100`;
    rxBatteryValue.innerText = `${level}%`;
    rxBatteryText.innerText = `${level} %`;
    rxBatteryTooltip.setAttribute('data-tooltip', `Battery level: ${level}%`);

    if (level > 50) {
        rxBatteryProgress.style.stroke = '#00e676';
    } else if (level > 20) {
        rxBatteryProgress.style.stroke = '#ffcc00';
    } else {
        rxBatteryProgress.style.stroke = '#ff3b30';
    }
}

function initReceiverControls() {
    vibroOnSlider.addEventListener('input', () => {
        vibroOnVal.innerText = `${vibroOnSlider.value} ms`;
    });

    vibroOnSlider.addEventListener('change', async () => {
        if (rxVibroOnChar) {
            try {
                const val = parseInt(vibroOnSlider.value);
                const data = new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
                if (typeof rxVibroOnChar.writeValueWithResponse === 'function') {
                    await rxVibroOnChar.writeValueWithResponse(data);
                } else {
                    await rxVibroOnChar.writeValue(data);
                }
                showToast(`Vibration ON duration changed to ${val} ms.`);
            } catch (err) {
                console.error("Error writing Vibro ON duration:", err);
                showToast("Write error: " + err.message);
                // Reset slider
                try {
                    const valData = await rxVibroOnChar.readValue();
                    const val = valData.getUint16(0, true);
                    vibroOnSlider.value = val;
                    vibroOnVal.innerText = `${val} ms`;
                } catch (readErr) {
                    console.error(readErr);
                }
            }
        }
    });

    vibroOffSlider.addEventListener('input', () => {
        vibroOffVal.innerText = `${vibroOffSlider.value} ms`;
    });

    vibroOffSlider.addEventListener('change', async () => {
        if (rxVibroOffChar) {
            try {
                const val = parseInt(vibroOffSlider.value);
                const data = new Uint8Array([val & 0xff, (val >> 8) & 0xff]);
                if (typeof rxVibroOffChar.writeValueWithResponse === 'function') {
                    await rxVibroOffChar.writeValueWithResponse(data);
                } else {
                    await rxVibroOffChar.writeValue(data);
                }
                showToast(`Pause duration changed to ${val} ms.`);
            } catch (err) {
                console.error("Error writing Vibro OFF duration:", err);
                showToast("Write error: " + err.message);
                // Reset slider
                try {
                    const valData = await rxVibroOffChar.readValue();
                    const val = valData.getUint16(0, true);
                    vibroOffSlider.value = val;
                    vibroOffVal.innerText = `${val} ms`;
                } catch (readErr) {
                    console.error(readErr);
                }
            }
        }
    });

    testVibroBtn.addEventListener('click', async () => {
        if (rxVibroTestChar) {
            try {
                // Send 3 to trigger a triple pulse test vibration on the receiver
                const data = new Uint8Array([3]);
                await writeConfigValue(rxVibroTestChar, data);
                showToast("Test vibration sent to receiver.");
            } catch (err) {
                console.error("Error writing Vibro TEST command:", err);
                showToast("Failed to send command: " + err.message);
            }
        } else {
            showToast("Receiver not connected!");
        }
    });

    if (dieTypeSeg) {
        dieTypeSeg.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled || !dieTypeChar) return;
            const val = parseInt(btn.dataset.value);
            try {
                await writeConfigValue(dieTypeChar, new Uint8Array([val]));
                rxDieMode = val;
                setSegValue(dieTypeSeg, val);
                showToast(val === 0 ? "Die type: detect automatically" : `Die type: D${val}`);
            } catch (err) {
                console.error("Error writing GoDice die type:", err);
                showToast("Write error: " + err.message);
            }
        });
    }

    if (d20CodeSeg) {
        d20CodeSeg.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled) return;
            diceSettings.d20Code = parseInt(btn.dataset.value);
            setSegValue(d20CodeSeg, diceSettings.d20Code);
            writeDiceSettings();
        });
    }

    if (diceRssiSlider) {
        diceRssiSlider.addEventListener('input', () => {
            diceRssiVal.innerText = `${diceRssiSlider.value} dBm`;
        });
        diceRssiSlider.addEventListener('change', () => {
            diceSettings.rssi = parseInt(diceRssiSlider.value);
            writeDiceSettings();
        });
    }

    if (diceMoveSeg) {
        diceMoveSeg.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled) return;
            diceSettings.move = parseInt(btn.dataset.value);
            renderMoveSettings();
            writeDiceSettings();
        });
    }

    if (movePulsesSlider) {
        movePulsesSlider.addEventListener('input', () => {
            movePulsesVal.innerText = movePulsesSlider.value;
        });
        movePulsesSlider.addEventListener('change', () => {
            diceSettings.pulses = parseInt(movePulsesSlider.value);
            writeDiceSettings();
        });
    }

    if (moveMsSlider) {
        moveMsSlider.addEventListener('input', () => {
            moveMsVal.innerText = `${moveMsSlider.value} ms`;
        });
        moveMsSlider.addEventListener('change', () => {
            diceSettings.pulseMs = parseInt(moveMsSlider.value);
            writeDiceSettings();
        });
    }

    if (diceBindSwitch) {
        diceBindSwitch.addEventListener('change', async () => {
            diceSettings.bind = diceBindSwitch.checked ? 1 : 0;
            await writeDiceSettings();
            showToast(diceSettings.bind ? "Die remembered." : "Die forgotten.");
        });
    }

    if (diceBlinkBtn) {
        diceBlinkBtn.addEventListener('click', async () => {
            if (!diceInfoChar) return;
            try {
                await writeConfigValue(diceInfoChar, new Uint8Array([1]));
                showToast("The connected die is blinking.");
            } catch (err) {
                console.error("Error sending blink command:", err);
                showToast("Write error: " + err.message);
            }
        });
    }

    setDiceCardState('offline');
}
