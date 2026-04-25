# 🖨️ Peripage P21 Banner Drucker

Eine Web-App zum Drucken von **Kursivschrift-Bannern** auf dem **Peripage P21 Thermodrucker** via Bluetooth – mit Spracherkennung und Wake-Word-Unterstützung.

## Funktionen

- **Web Bluetooth** – Direkte BLE-Verbindung zum Peripage P21
- **Kursivschrift-Renderer** – 4 elegante Handschrift-Fonts (Dancing Script, Caveat, Pacifico, Great Vibes)
- **Live-Vorschau** – Canvas-Rendering in Echtzeit (384px Druckerbreite)
- **Spracherkennung** – Web Speech API mit konfigurierbarem Wake-Word
  - Standard: "drucke [Text]"
  - Automatischer Druck nach Spracherkennung
- **Anpassbare Parameter**: Schriftgröße, Kontrast/Schwärze, Zeilenabstand, Ausrichtung
- **Druckverlauf** – Letzte 20 Drucke, wiederverwendbar

## Technische Details

### Drucker-Protokoll (BLE / AE30)

- **Service UUID**: `0000ae30-0000-1000-8000-00805f9b34fb`
- **Write Characteristic**: `0000ae01-0000-1000-8000-00805f9b34fb`
- **Notify Characteristic**: `0000ae02-0000-1000-8000-00805f9b34fb`
- **Paketformat**: `[0x51, 0x78] [CMD] [0x00] [LenLo] [LenHi] [Data...] [CRC8] [0xFF]`
- **Druckbreite**: 384 Pixel
- **Bittiefe**: 1-Bit monochrom (schwarz/weiß)

### Browser-Anforderungen

- **Chrome 85+** oder **Edge 85+** mit Web Bluetooth Support
- HTTPS oder `localhost` (Web Bluetooth funktioniert nicht auf plain `http://`)
- Auf **Windows** auch per `file://` mit Chrome-Flag möglich: `--enable-experimental-web-platform-features`

## Nutzung

1. **index.html** in Chrome/Edge öffnen (am besten via lokalem Server oder Live Server VSCode-Extension)
2. Drucker einschalten (Peripage P21)
3. **"Verbinden"** klicken → Browser zeigt Bluetooth-Geräteauswahl
4. Drucker in der Liste auswählen
5. Text eingeben oder Sprachbefehl sprechen
6. **"Drucken"** klicken oder `Ctrl+Enter`

## Spracherkennung

Standard Wake-Words (immer erkannt):
- `drucke [text]`
- `print [text]`
- `schreib [text]`
- `papier vor` – Papiervorschub
- `verbinden` – Drucker verbinden
- `löschen` – Text löschen

Eigenes Wake-Word im Feld "Wake-Word / Muster" eintragen.

**Beispiel**: "drucke Herzlichen Glückwunsch!" → Drucker verbunden? Dann wird sofort gedruckt.

## Lokaler Server starten (empfohlen)

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

Dann: http://localhost:8080

## Dateien

```
├── index.html   – Haupt-HTML, UI-Struktur
├── style.css    – Dark Mode Design, Glassmorphism
├── printer.js   – BLE Protokoll-Implementierung (PeripagePrinter Klasse)
├── app.js       – App-Logik, Canvas-Renderer, Spracherkennung
└── README.md    – Diese Datei
```

## Bekannte Einschränkungen

- Web Bluetooth funktioniert **nur in Chrome/Edge** (nicht Firefox, Safari)
- Auf **Windows** muss der Drucker zuerst im System-Bluetooth **gekoppelt** sein
- Das P21 BLE-Protokoll wurde durch Reverse Engineering der A6-Familie ermittelt; bei neueren Firmware-Versionen können Kommando-Bytes abweichen
- Sehr lange Texte können den Drucker-Buffer überlasten → kleines `sleep` zwischen Chunks ist bereits eingebaut

## Quellen & Referenzen

- [eliasweingaertner/peripage-A6-bluetooth](https://github.com/eliasweingaertner/peripage-A6-bluetooth) – Original Protokoll-Rekonstruktion
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
