// Übersetzungen der WebApp (Deutsch / Englisch).
// Statische Texte im HTML tragen data-i18n="schlüssel" (bzw. -placeholder, -aria, -tooltip),
// Texte aus app.js holen sich ihre Übersetzung über t('schlüssel', { platzhalter }).
// Die Sprache teilt sich die WebApp mit der Landingpage (localStorage 'davinci_manual_lang').

const I18N = {
    en: {
        'tab.palette': 'Palette',
        'tab.receiver': 'Receiver',
        'btn.connect': 'Connect',
        'btn.connectRx': 'Connect Rx',
        'btn.connecting': 'Connecting...',
        'btn.connected': 'Connected',

        'tooltip.paletteBatteryUnknown': 'Palette battery unknown',
        'tooltip.receiverBatteryUnknown': 'Receiver battery unknown',
        'tooltip.batteryLevel': 'Battery level: {level}%',

        'section.sensorStatus': 'Sensor Status',
        'pot.ready': 'Ready',
        'pot.used': 'Used',
        'pot.channel': 'Channel {n}',

        'card.feedback': 'Feedback Options',
        'audio.label': 'Audio Feedback',
        'audio.off': 'Off',
        'audio.numbers': 'Voice: Numbers',
        'audio.names': 'Voice: Pot Names',
        'audio.voice': 'Speech Voice',
        'fullscreen.label': 'Full Screen Alert',

        'card.paletteSettings': 'Palette Settings',
        'lock.label': 'Lock After Trigger',
        'btn.resetLocks': 'Reset Locks',
        'btn.deepSleep': 'Turn Off (Deep Sleep)',
        'standby.label': 'Auto Standby (Sleep)',
        'standby.sub': 'standby',
        'threshold.label': 'Sensitivity (Threshold)',

        'log.title': 'Activity Log',
        'log.clear': 'Clear',
        'log.empty': 'No events logged. Connect to the board to receive sensor readings.',
        'log.cleared': 'Log cleared.',
        'log.used': '<strong>{name}</strong> is now used 🟢',
        'log.ready': '<strong>{name}</strong> is ready again ⚪',

        'dice.moved': 'Moved',
        'dice.blink': 'Blink Connected Die',
        'dice.patternAria': 'Vibration pattern',
        'dice.historyAria': 'Recent rolls',
        'dice.state.offline.pill': 'Receiver offline',
        'dice.state.offline.status': 'Connect the receiver to see rolls.',
        'dice.state.searching.pill': 'Searching',
        'dice.state.searching.status': 'Looking for a GoDice nearby...',
        'dice.state.palette.pill': 'Palette active',
        'dice.state.palette.status': 'The palette has priority. Switch it off to use the die.',
        'dice.state.connected.pill': 'Connected',
        'dice.state.connected.status': 'Roll the die.',
        'dice.state.rolling.pill': 'Rolling',
        'dice.state.rolling.status': 'Rolling...',
        'dice.rolled': 'Rolled {value} on a D{type}.',
        'dice.movedStatus': 'Moved, not rolled. Now showing {value}.',
        'dice.typeAuto': 'D{type} · auto',
        'dice.battery': 'Battery {level}%',
        'dice.pattern.long': '{n} long',
        'dice.pattern.longShort': '{tens} long + {ones} short',
        'dice.pattern.short': '{n} short',
        'dice.pattern.fast': ' + {n} fast',
        'dice.historyMoved': ' · moved',

        'color.0': 'Black',
        'color.1': 'Red',
        'color.2': 'Green',
        'color.3': 'Blue',
        'color.4': 'Yellow',
        'color.5': 'Orange',

        'diceSettings.title': 'GoDice Settings',
        'diceSettings.dieType': 'Die Type',
        'diceSettings.dieTypeAria': 'Die type',
        'diceSettings.d20Pattern': 'D20 Pattern',
        'diceSettings.d20PatternAria': 'D20 vibration pattern',
        'diceSettings.tensOnes': 'Tens + Ones',
        'diceSettings.count': 'Count',
        'diceSettings.proximity': 'Proximity',
        'diceSettings.far': 'far',
        'diceSettings.veryClose': 'only very close',
        'diceSettings.moved': 'D6 Moved, Not Rolled',
        'diceSettings.movedAria': 'What to do when the D6 is moved instead of rolled',
        'diceSettings.ignore': 'Ignore',
        'diceSettings.signal': 'Signal',
        'diceSettings.pulses': 'Signal Pulses',
        'diceSettings.speed': 'Signal Speed',
        'diceSettings.veryFast': 'very fast',
        'diceSettings.slower': 'slower',
        'diceSettings.onlyThis': 'Only This Die',
        'move.hint.0': 'Ignore: only real rolls count.',
        'move.hint.1': 'Count: moving the die counts like a roll.',
        'move.hint.2': 'Signal: the receiver buzzes the number, then fast pulses so you know the die was moved.',
        'bind.hint.noReceiver': 'Connect the receiver to change GoDice settings.',
        'bind.hint.bound': 'The receiver only connects to the remembered die.',
        'bind.hint.canBind': 'Turn on to remember the connected die and ignore all others.',
        'bind.hint.noDie': 'Connect a GoDice to remember it.',

        'vib.title': 'Vibration Profile',
        'vib.on': 'Vibration Duration (ON)',
        'vib.off': 'Pause Duration (OFF)',
        'test.title': 'Test Vibration',
        'test.text': 'Test the vibration pattern directly on the receiver to verify the settings.',
        'test.btn': 'Test Vibration Pattern on Receiver',
        'conn.title': 'Connection Info',
        'conn.status': 'Status:',
        'conn.battery': 'Battery Level:',
        'conn.connected': 'Connected',
        'conn.disconnected': 'Disconnected',

        'modal.title': 'Configure Color',
        'modal.name': 'Color Name:',
        'modal.placeholder': 'e.g. Red',
        'modal.choose': 'Choose Color:',
        'modal.save': 'Save',

        'fs.tapReset': 'Tap to Reset',
        'fs.tapClose': 'Tap to close',
        'fs.moved': 'Moved, not rolled',

        'toast.allPotsUnlocked': 'All pots unlocked!',
        'toast.channelSaved': 'Settings for channel {n} saved.',
        'toast.lockOn': 'Lock active after trigger.',
        'toast.lockOff': 'Multiple triggers allowed.',
        'toast.writeError': 'Write error: ',
        'toast.notSupported': 'Not connected or configuration not supported.',
        'toast.allChannelsUnlocked': 'All channels unlocked!',
        'toast.unlockError': 'Unlock error: ',
        'toast.notConnected': 'Not connected to the board.',
        'toast.powerOffSent': 'Power-off command sent.',
        'toast.powerOffError': 'Power-off error: ',
        'toast.standbySet': 'Standby timeout set to {label}',
        'toast.thresholdSet': 'Threshold changed to {val}.',
        'toast.connectedDirect': 'Connected directly to: ',
        'toast.directDiceLost': 'Direct GoDice disconnected!',
        'toast.connectedPalette': 'Connected to Davinci Color!',
        'toast.connectionError': 'Connection error: ',
        'toast.senderLost': 'Connection to sender lost!',
        'toast.connectedReceiver': 'Connected to Davinci Receiver!',
        'toast.receiverLost': 'Connection to receiver lost!',
        'toast.vibroOnSet': 'Vibration ON duration changed to {val} ms.',
        'toast.vibroOffSet': 'Pause duration changed to {val} ms.',
        'toast.testSent': 'Test vibration sent to receiver.',
        'toast.sendFailed': 'Failed to send command: ',
        'toast.receiverNotConnected': 'Receiver not connected!',
        'toast.dieTypeAuto': 'Die type: detect automatically',
        'toast.dieType': 'Die type: D{val}',
        'toast.dieRemembered': 'Die remembered.',
        'toast.dieForgotten': 'Die forgotten.',
        'toast.dieBlinking': 'The connected die is blinking.',

        'speech.moved': 'moved',
    },
    de: {
        'tab.palette': 'Palette',
        'tab.receiver': 'Empfänger',
        'btn.connect': 'Verbinden',
        'btn.connectRx': 'Rx verbinden',
        'btn.connecting': 'Verbinde...',
        'btn.connected': 'Verbunden',

        'tooltip.paletteBatteryUnknown': 'Batterie der Palette unbekannt',
        'tooltip.receiverBatteryUnknown': 'Batterie des Empfängers unbekannt',
        'tooltip.batteryLevel': 'Batteriestand: {level}%',

        'section.sensorStatus': 'Sensorstatus',
        'pot.ready': 'Bereit',
        'pot.used': 'Benutzt',
        'pot.channel': 'Kanal {n}',

        'card.feedback': 'Rückmeldung',
        'audio.label': 'Sprachausgabe',
        'audio.off': 'Aus',
        'audio.numbers': 'Stimme: Nummern',
        'audio.names': 'Stimme: Farbnamen',
        'audio.voice': 'Stimme',
        'fullscreen.label': 'Vollbild-Anzeige',

        'card.paletteSettings': 'Palette-Einstellungen',
        'lock.label': 'Nach Auslösung sperren',
        'btn.resetLocks': 'Sperren aufheben',
        'btn.deepSleep': 'Ausschalten (Deep Sleep)',
        'standby.label': 'Auto-Standby',
        'standby.sub': 'Standby',
        'threshold.label': 'Empfindlichkeit (Schwelle)',

        'log.title': 'Aktivitäten',
        'log.clear': 'Leeren',
        'log.empty': 'Noch keine Ereignisse. Verbinde die Palette, um Sensorwerte zu sehen.',
        'log.cleared': 'Protokoll geleert.',
        'log.used': '<strong>{name}</strong> ist jetzt benutzt 🟢',
        'log.ready': '<strong>{name}</strong> ist wieder bereit ⚪',

        'dice.moved': 'Bewegt',
        'dice.blink': 'Verbundenen Würfel blinken lassen',
        'dice.patternAria': 'Vibrationsmuster',
        'dice.historyAria': 'Letzte Würfe',
        'dice.state.offline.pill': 'Empfänger getrennt',
        'dice.state.offline.status': 'Verbinde den Empfänger, um Würfe zu sehen.',
        'dice.state.searching.pill': 'Suche',
        'dice.state.searching.status': 'Suche einen GoDice in der Nähe...',
        'dice.state.palette.pill': 'Palette aktiv',
        'dice.state.palette.status': 'Die Palette hat Vorrang. Schalte sie aus, um den Würfel zu nutzen.',
        'dice.state.connected.pill': 'Verbunden',
        'dice.state.connected.status': 'Würfle.',
        'dice.state.rolling.pill': 'Rollt',
        'dice.state.rolling.status': 'Würfel rollt...',
        'dice.rolled': '{value} gewürfelt (D{type}).',
        'dice.movedStatus': 'Bewegt, nicht gewürfelt. Oben liegt jetzt {value}.',
        'dice.typeAuto': 'D{type} · auto',
        'dice.battery': 'Akku {level}%',
        'dice.pattern.long': '{n} lang',
        'dice.pattern.longShort': '{tens} lang + {ones} kurz',
        'dice.pattern.short': '{n} kurz',
        'dice.pattern.fast': ' + {n} schnell',
        'dice.historyMoved': ' · bewegt',

        'color.0': 'Schwarz',
        'color.1': 'Rot',
        'color.2': 'Grün',
        'color.3': 'Blau',
        'color.4': 'Gelb',
        'color.5': 'Orange',

        'diceSettings.title': 'GoDice-Einstellungen',
        'diceSettings.dieType': 'Würfeltyp',
        'diceSettings.dieTypeAria': 'Würfeltyp',
        'diceSettings.d20Pattern': 'D20-Muster',
        'diceSettings.d20PatternAria': 'Vibrationsmuster für den D20',
        'diceSettings.tensOnes': 'Zehner + Einer',
        'diceSettings.count': 'Zählen',
        'diceSettings.proximity': 'Nähe',
        'diceSettings.far': 'weit',
        'diceSettings.veryClose': 'nur ganz nah',
        'diceSettings.moved': 'D6 bewegt statt gewürfelt',
        'diceSettings.movedAria': 'Was passiert, wenn der D6 bewegt statt gewürfelt wird',
        'diceSettings.ignore': 'Ignorieren',
        'diceSettings.signal': 'Signal',
        'diceSettings.pulses': 'Signal-Impulse',
        'diceSettings.speed': 'Signal-Tempo',
        'diceSettings.veryFast': 'sehr schnell',
        'diceSettings.slower': 'langsamer',
        'diceSettings.onlyThis': 'Nur dieser Würfel',
        'move.hint.0': 'Ignorieren: Nur echte Würfe zählen.',
        'move.hint.1': 'Zählen: Bewegen zählt wie ein Wurf.',
        'move.hint.2': 'Signal: Der Empfänger vibriert die Zahl und danach schnelle Impulse, damit du weißt, dass der Würfel bewegt wurde.',
        'bind.hint.noReceiver': 'Verbinde den Empfänger, um die GoDice-Einstellungen zu ändern.',
        'bind.hint.bound': 'Der Empfänger verbindet sich nur mit dem gemerkten Würfel.',
        'bind.hint.canBind': 'Einschalten merkt sich den verbundenen Würfel und ignoriert alle anderen.',
        'bind.hint.noDie': 'Verbinde einen GoDice, um ihn zu merken.',

        'vib.title': 'Vibrationsprofil',
        'vib.on': 'Vibrationsdauer (AN)',
        'vib.off': 'Pausendauer (AUS)',
        'test.title': 'Vibration testen',
        'test.text': 'Teste das Vibrationsmuster direkt am Empfänger, um die Einstellungen zu prüfen.',
        'test.btn': 'Muster am Empfänger testen',
        'conn.title': 'Verbindung',
        'conn.status': 'Status:',
        'conn.battery': 'Batteriestand:',
        'conn.connected': 'Verbunden',
        'conn.disconnected': 'Getrennt',

        'modal.title': 'Farbe einstellen',
        'modal.name': 'Farbname:',
        'modal.placeholder': 'z. B. Rot',
        'modal.choose': 'Farbe wählen:',
        'modal.save': 'Speichern',

        'fs.tapReset': 'Tippen zum Zurücksetzen',
        'fs.tapClose': 'Tippen zum Schließen',
        'fs.moved': 'Bewegt, nicht gewürfelt',

        'toast.allPotsUnlocked': 'Alle Töpfe freigegeben!',
        'toast.channelSaved': 'Einstellungen für Kanal {n} gespeichert.',
        'toast.lockOn': 'Sperre nach Auslösung ist aktiv.',
        'toast.lockOff': 'Mehrfache Auslösung erlaubt.',
        'toast.writeError': 'Schreibfehler: ',
        'toast.notSupported': 'Nicht verbunden oder Einstellung nicht unterstützt.',
        'toast.allChannelsUnlocked': 'Alle Kanäle freigegeben!',
        'toast.unlockError': 'Fehler beim Freigeben: ',
        'toast.notConnected': 'Nicht mit der Palette verbunden.',
        'toast.powerOffSent': 'Ausschaltbefehl gesendet.',
        'toast.powerOffError': 'Fehler beim Ausschalten: ',
        'toast.standbySet': 'Auto-Standby auf {label} gestellt',
        'toast.thresholdSet': 'Schwelle auf {val} geändert.',
        'toast.connectedDirect': 'Direkt verbunden mit: ',
        'toast.directDiceLost': 'Direkte GoDice-Verbindung getrennt!',
        'toast.connectedPalette': 'Mit Davinci Color verbunden!',
        'toast.connectionError': 'Verbindungsfehler: ',
        'toast.senderLost': 'Verbindung zur Palette verloren!',
        'toast.connectedReceiver': 'Mit dem Davinci-Empfänger verbunden!',
        'toast.receiverLost': 'Verbindung zum Empfänger verloren!',
        'toast.vibroOnSet': 'Vibrationsdauer auf {val} ms geändert.',
        'toast.vibroOffSet': 'Pausendauer auf {val} ms geändert.',
        'toast.testSent': 'Test-Vibration an den Empfänger gesendet.',
        'toast.sendFailed': 'Befehl konnte nicht gesendet werden: ',
        'toast.receiverNotConnected': 'Empfänger nicht verbunden!',
        'toast.dieTypeAuto': 'Würfeltyp: automatisch erkennen',
        'toast.dieType': 'Würfeltyp: D{val}',
        'toast.dieRemembered': 'Würfel gemerkt.',
        'toast.dieForgotten': 'Würfel vergessen.',
        'toast.dieBlinking': 'Der verbundene Würfel blinkt.',

        'speech.moved': 'bewegt',
    },
};

function detectUiLanguage() {
    try {
        const saved = localStorage.getItem('davinci_manual_lang');
        if (saved === 'de' || saved === 'en') return saved;
    } catch (e) { /* Speicher nicht verfügbar */ }
    const browserLang = (navigator.language || 'en').toLowerCase();
    return browserLang.startsWith('de') ? 'de' : 'en';
}

let uiLang = detectUiLanguage();

function t(key, vars) {
    const table = I18N[uiLang] || I18N.en;
    let text = table[key] !== undefined ? table[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
    if (vars) {
        for (const name in vars) {
            text = text.split('{' + name + '}').join(String(vars[name]));
        }
    }
    return text;
}

function applyStaticTranslations() {
    document.documentElement.lang = uiLang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => { el.setAttribute('data-tooltip', t(el.dataset.i18nTooltip)); });
    document.querySelectorAll('.lang-switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === uiLang);
    });
}

// Wechselt die Sprache; app.js hört auf 'davinci-lang-changed' und aktualisiert die Laufzeit-Texte
function setUiLanguage(lang) {
    if (lang !== 'de' && lang !== 'en') return;
    uiLang = lang;
    try { localStorage.setItem('davinci_manual_lang', lang); } catch (e) { /* Speicher nicht verfügbar */ }
    applyStaticTranslations();
    window.dispatchEvent(new CustomEvent('davinci-lang-changed', { detail: lang }));
}
